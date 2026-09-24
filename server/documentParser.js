import { createRequire } from 'module';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';
import { parseTallyTrialBalanceXML } from './tallyService.js';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

/**
 * Multi-Format Document & Image Ingestion Engine
 * Extracts text and financial ledgers from:
 * - PDF documents (.pdf) via Mozilla pdfjs-dist + Embedded image extraction
 * - Images (.png, .jpg, .jpeg, .webp) via Local Vision AI (moondream) & OCR
 * - Excel spreadsheets (.xlsx, .xls)
 * - Tally XML export files (.xml)
 * - CSV and Plain Text (.csv, .txt)
 */
export async function parseUploadedDocument(fileBuffer, originalFilename, mimeType) {
  const extension = (originalFilename.split('.').pop() || '').toLowerCase();
  const allowedExtensions = ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif', 'xlsx', 'xls', 'xlsm', 'xml', 'csv', 'txt'];

  if (!allowedExtensions.includes(extension) && !mimeType.startsWith('image/') && !mimeType.includes('pdf') && !mimeType.includes('spreadsheet') && !mimeType.includes('xml') && !mimeType.includes('text')) {
    throw new Error(`Unsupported file type (.${extension || 'unknown'}). Please upload PDF, Excel (.xlsx/.xls), CSV, Tally XML, Plain Text (.txt), or Scanned Images (.png/.jpg).`);
  }

  try {
    if (extension === 'pdf' || mimeType === 'application/pdf') {
      return await parsePDFDocument(fileBuffer, originalFilename);
    } else if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff', 'tif'].includes(extension) || mimeType.startsWith('image/')) {
      return await parseImageDocument(fileBuffer, originalFilename);
    } else if (['xlsx', 'xls', 'xlsm'].includes(extension) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      return await parseExcelDocument(fileBuffer, originalFilename);
    } else if (extension === 'xml' || mimeType.includes('xml') || fileBuffer.toString('utf-8', 0, 100).includes('<ENVELOPE>') || fileBuffer.toString('utf-8', 0, 100).includes('<TALLYMESSAGE>')) {
      const xmlText = fileBuffer.toString('utf-8');
      const parsedTally = parseTallyTrialBalanceXML(xmlText, originalFilename.replace(/\.xml$/i, ''));
      return {
        fileType: 'TALLY_XML',
        filename: originalFilename,
        extractedText: parsedTally.extractedText,
        summary: `Extracted ${parsedTally.itemCount || 0} ledger(s) from Tally XML export file.`
      };
    } else if (extension === 'csv' || mimeType.includes('csv')) {
      return await parseCSVDocument(fileBuffer, originalFilename);
    } else if (extension === 'txt' || mimeType.includes('text/plain')) {
      const text = fileBuffer.toString('utf-8');
      return {
        fileType: 'TXT',
        filename: originalFilename,
        extractedText: text,
        summary: `Extracted ${text.length} characters from plain text file.`
      };
    } else {
      throw new Error(`Unsupported file format (.${extension}). Please upload PDF, Excel, CSV, XML, TXT, or Image.`);
    }
  } catch (error) {
    console.error(`Error parsing document ${originalFilename}:`, error);
    throw new Error(`Failed to parse ${originalFilename}: ${error.message}`);
  }
}

import zlib from 'zlib';

/**
 * Bulletproof Full-Spectrum Embedded Image Extractor for Scanned PDFs
 * Decodes:
 * 1. Direct and unreferenced JPEG streams (0xFF 0xD8 0xFF ... 0xFF 0xD9)
 * 2. Direct and unreferenced PNG streams (\x89PNG ... IEND)
 * 3. /FlateDecode compressed streams & inner JPEGs/PNGs
 * 4. Raw XObject pixel streams (24-bit RGB, 8-bit Grayscale, 1-bit Monochrome ImageMasks)
 */
function extractEmbeddedImagesFromPdf(pdfBuffer) {
  const images = [];
  const minImageSize = 300; // Skip tiny icons

  // 1. Direct JPEG byte-stream extraction across entire PDF
  let startIdx = 0;
  while (startIdx < pdfBuffer.length - 4) {
    const jpgStart = pdfBuffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), startIdx);
    if (jpgStart === -1) break;

    const jpgEnd = pdfBuffer.indexOf(Buffer.from([0xff, 0xd9]), jpgStart + 3);
    if (jpgEnd === -1) {
      startIdx = jpgStart + 3;
      continue;
    }

    const imageBytes = pdfBuffer.subarray(jpgStart, jpgEnd + 2);
    if (imageBytes.length > minImageSize) {
      images.push({ type: 'image/jpeg', buffer: imageBytes });
    }
    startIdx = jpgEnd + 2;
  }

  // 2. Direct PNG byte-stream extraction across entire PDF
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pngEndMarker = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
  let pngStartIdx = 0;
  while (pngStartIdx < pdfBuffer.length - 16) {
    const pngStart = pdfBuffer.indexOf(pngHeader, pngStartIdx);
    if (pngStart === -1) break;

    const pngEnd = pdfBuffer.indexOf(pngEndMarker, pngStart + 8);
    if (pngEnd === -1) {
      pngStartIdx = pngStart + 8;
      continue;
    }

    const imageBytes = pdfBuffer.subarray(pngStart, pngEnd + 8);
    if (imageBytes.length > minImageSize) {
      images.push({ type: 'image/png', buffer: imageBytes });
    }
    pngStartIdx = pngEnd + 8;
  }

  // 3. Object-level Stream Parser for /FlateDecode and Raw Pixel XObjects
  try {
    const pdfStr = pdfBuffer.toString('binary');
    let searchPos = 0;

    while (searchPos < pdfStr.length) {
      const streamIdx = pdfStr.indexOf('stream', searchPos);
      if (streamIdx === -1) break;

      const charBefore = streamIdx > 0 ? pdfStr.charCodeAt(streamIdx - 1) : 32;
      if (charBefore !== 10 && charBefore !== 13 && charBefore !== 32 && charBefore !== 62) {
        searchPos = streamIdx + 6;
        continue;
      }

      let dataStart = streamIdx + 6;
      if (pdfBuffer[dataStart] === 0x0d && pdfBuffer[dataStart + 1] === 0x0a) {
        dataStart += 2;
      } else if (pdfBuffer[dataStart] === 0x0a || pdfBuffer[dataStart] === 0x0d) {
        dataStart += 1;
      }

      const endstreamIdx = pdfStr.indexOf('endstream', dataStart);
      if (endstreamIdx === -1) break;

      let dataEnd = endstreamIdx;
      while (dataEnd > dataStart && (pdfBuffer[dataEnd - 1] === 0x0a || pdfBuffer[dataEnd - 1] === 0x0d || pdfBuffer[dataEnd - 1] === 0x20)) {
        dataEnd--;
      }

      const streamData = pdfBuffer.subarray(dataStart, dataEnd);
      const dictStart = Math.max(0, streamIdx - 1200);
      const dictText = pdfStr.substring(dictStart, streamIdx);

      if (dictText.includes('/FlateDecode')) {
        try {
          let decompressed;
          try {
            decompressed = zlib.inflateSync(streamData);
          } catch {
            decompressed = zlib.inflateRawSync(streamData);
          }

          if (decompressed && decompressed.length > minImageSize) {
            // Check for inner JPEG/PNG
            if (decompressed[0] === 0xff && decompressed[1] === 0xd8 && decompressed[2] === 0xff) {
              images.push({ type: 'image/jpeg', buffer: decompressed });
            } else if (decompressed.length >= 8 && decompressed.subarray(0, 8).equals(pngHeader)) {
              images.push({ type: 'image/png', buffer: decompressed });
            } else if (dictText.includes('/Subtype') && (dictText.includes('/Image') || dictText.includes('/Form'))) {
              const wMatch = dictText.match(/\/Width\s+(\d+)/);
              const hMatch = dictText.match(/\/Height\s+(\d+)/);
              if (wMatch && hMatch) {
                const width = parseInt(wMatch[1], 10);
                const height = parseInt(hMatch[1], 10);
                const is1Bit = dictText.includes('/BitsPerComponent 1') || dictText.includes('/ImageMask true') || dictText.includes('/BPC 1');
                const isGray = dictText.includes('/DeviceGray') || dictText.includes('/G ') || dictText.includes('/CalGray');
                const channels = isGray ? 1 : 3;

                if (is1Bit && width > 40 && height > 40) {
                  // Decode 1-bit monochrome mask to 8-bit grayscale BMP
                  const rowSize = Math.floor((width * 8 + 31) / 32) * 4;
                  const bmpSize = 54 + 1024 + rowSize * height;
                  const bmpBuf = Buffer.alloc(bmpSize);

                  bmpBuf.write('BM', 0);
                  bmpBuf.writeUInt32LE(bmpSize, 2);
                  bmpBuf.writeUInt32LE(54 + 1024, 10);
                  bmpBuf.writeUInt32LE(40, 14);
                  bmpBuf.writeInt32LE(width, 18);
                  bmpBuf.writeInt32LE(-height, 22);
                  bmpBuf.writeUInt16LE(1, 26);
                  bmpBuf.writeUInt16LE(8, 28);
                  bmpBuf.writeUInt32LE(rowSize * height, 34);

                  for (let i = 0; i < 256; i++) {
                    const p = 54 + i * 4;
                    bmpBuf[p] = i; bmpBuf[p + 1] = i; bmpBuf[p + 2] = i; bmpBuf[p + 3] = 0;
                  }

                  const srcRowBytes = Math.ceil(width / 8);
                  for (let y = 0; y < height; y++) {
                    const srcRow = y * srcRowBytes;
                    const dstRow = 54 + 1024 + y * rowSize;
                    for (let x = 0; x < width; x++) {
                      const byteIdx = srcRow + Math.floor(x / 8);
                      const bitIdx = 7 - (x % 8);
                      const bit = byteIdx < decompressed.length ? ((decompressed[byteIdx] >> bitIdx) & 1) : 0;
                      bmpBuf[dstRow + x] = bit ? 0 : 255;
                    }
                  }
                  images.push({ type: 'image/bmp', buffer: bmpBuf });
                } else if (width > 40 && height > 40 && decompressed.length >= width * height * channels) {
                  // Decode raw 8-bit or 24-bit pixel stream to BMP
                  const rowSize = Math.floor((channels * width * 8 + 31) / 32) * 4;
                  const bmpSize = 54 + (isGray ? 1024 : 0) + rowSize * height;
                  const bmpBuf = Buffer.alloc(bmpSize);

                  bmpBuf.write('BM', 0);
                  bmpBuf.writeUInt32LE(bmpSize, 2);
                  bmpBuf.writeUInt32LE(54 + (isGray ? 1024 : 0), 10);
                  bmpBuf.writeUInt32LE(40, 14);
                  bmpBuf.writeInt32LE(width, 18);
                  bmpBuf.writeInt32LE(-height, 22);
                  bmpBuf.writeUInt16LE(1, 26);
                  bmpBuf.writeUInt16LE(channels * 8, 28);
                  bmpBuf.writeUInt32LE(rowSize * height, 34);

                  let offset = 54;
                  if (isGray) {
                    for (let c = 0; c < 256; c++) {
                      bmpBuf[offset++] = c;
                      bmpBuf[offset++] = c;
                      bmpBuf[offset++] = c;
                      bmpBuf[offset++] = 0;
                    }
                  }

                  for (let y = 0; y < height; y++) {
                    const srcOffset = y * width * channels;
                    const dstOffset = offset + y * rowSize;
                    for (let x = 0; x < width; x++) {
                      const sp = srcOffset + x * channels;
                      const dp = dstOffset + x * channels;
                      if (channels === 3) {
                        bmpBuf[dp] = decompressed[sp + 2] || 0;
                        bmpBuf[dp + 1] = decompressed[sp + 1] || 0;
                        bmpBuf[dp + 2] = decompressed[sp] || 0;
                      } else {
                        bmpBuf[dp] = decompressed[sp] || 0;
                      }
                    }
                  }
                  images.push({ type: 'image/bmp', buffer: bmpBuf });
                }
              }
            }
          }
        } catch {
          // Ignore invalid flate stream
        }
      }

      searchPos = endstreamIdx + 9;
    }
  } catch (err) {
    console.warn('PDF stream parser warning:', err.message);
  }

  // De-duplicate any identical buffers
  const uniqueImages = [];
  const seenSizes = new Set();
  for (const img of images) {
    const key = `${img.type}_${img.buffer.length}_${img.buffer[0]}_${img.buffer[img.buffer.length - 1]}`;
    if (!seenSizes.has(key)) {
      seenSizes.add(key);
      uniqueImages.push(img);
    }
  }

  return uniqueImages;
}

/**
 * Robust Mozilla pdfjs-dist PDF Parser (Bank Statements, AIS, TIS, Invoices, Form 26AS)
 * With automatic OCR fallback for Scanned PDFs, WhatsApp image PDFs, and Camera photos
 */
async function parsePDFDocument(buffer, filename) {
  let numPages = 1;
  let fullTextParts = [];

  try {
    const uint8 = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({
      data: uint8,
      useSystemFonts: true,
      disableFontFace: true
    });

    const doc = await loadingTask.promise;
    numPages = doc.numPages || 1;

    for (let i = 1; i <= numPages; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      
      let lastY = null;
      let currentLine = [];
      let pageLines = [];

      for (const item of textContent.items) {
        if (!item.str) continue;
        
        const itemY = Math.round(item.transform ? item.transform[5] : 0);
        if (lastY !== null && Math.abs(itemY - lastY) > 5) {
          if (currentLine.length > 0) {
            pageLines.push(currentLine.join(' '));
            currentLine = [];
          }
        }
        currentLine.push(item.str);
        lastY = itemY;
      }

      if (currentLine.length > 0) {
        pageLines.push(currentLine.join(' '));
      }

      if (pageLines.length > 0) {
        fullTextParts.push(pageLines.join('\n'));
      }
    }
  } catch (pdfErr) {
    console.warn(`PDF text stream extraction warning for "${filename}":`, pdfErr.message);
  }

  let cleanedLines = fullTextParts
    .join('\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');

  // If PDF has sparse or no selectable text, check for embedded images (scanned invoice / WhatsApp PDF)
  if (!cleanedLines || cleanedLines.length < 15) {
    console.log(`PDF "${filename}" has sparse text (${cleanedLines.length} chars). Extracting embedded scanned images for OCR...`);
    const embeddedImages = extractEmbeddedImagesFromPdf(buffer);
    
    if (embeddedImages.length > 0) {
      // 1. Sort images by buffer size descending so the primary high-res document scan is processed first!
      embeddedImages.sort((a, b) => b.buffer.length - a.buffer.length);

      // 2. Filter out tiny thumbnails (< 15KB) if larger full-page images exist
      const largestSize = embeddedImages[0].buffer.length;
      const validImages = largestSize > 25000 
        ? embeddedImages.filter(img => img.buffer.length > 15000) 
        : embeddedImages;

      console.log(`Processing ${validImages.length} primary scanned image(s) with Local OCR Engine...`);
      const extractedOcrParts = [];

      for (let idx = 0; idx < validImages.length; idx++) {
        const img = validImages[idx];
        try {
          const imgResult = await parseImageDocument(img.buffer, `${filename}_page_${idx + 1}`);
          if (imgResult && imgResult.extractedText && imgResult.extractedText.length > 10) {
            // Verify that the extracted text is not garbled single-letter noise
            const cleanText = cleanOcrGarbage(imgResult.extractedText);
            if (cleanText.length > 10) {
              extractedOcrParts.push(cleanText);
            }
          }
        } catch (imgErr) {
          console.warn(`Embedded image ${idx + 1} OCR warning:`, imgErr.message);
        }
      }

      if (extractedOcrParts.length > 0) {
        const combinedOcrText = extractedOcrParts.join('\n\n');
        return {
          fileType: 'PDF_SCAN_IMAGE',
          filename,
          pages: numPages,
          extractedText: combinedOcrText,
          summary: `Extracted ${extractedOcrParts.length} scanned page(s) via Local OCR (${combinedOcrText.length} characters).`
        };
      }
    }
  }

  if (!cleanedLines || cleanedLines.length === 0) {
    return {
      fileType: 'PDF',
      filename,
      pages: numPages,
      extractedText: '',
      summary: 'PDF was parsed but contained no readable text layer or embedded images (may be password protected or empty).'
    };
  }

  return {
    fileType: 'PDF',
    filename,
    pages: numPages,
    extractedText: cleanedLines,
    summary: `Extracted ${numPages} page(s) from PDF (${cleanedLines.length} characters).`
  };
}

/**
 * Filter out isolated single-letter noise lines and OCR garbage
 */
function cleanOcrGarbage(rawText) {
  if (!rawText) return '';
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const cleanLines = [];

  for (const line of lines) {
    // Drop single-letter or purely repetitive nonsense lines
    if (/^[a-zA-Z]{1,2}$/.test(line)) continue;
    if (/^(a\s+)+a?$/i.test(line)) continue;
    if (/^[:;.,_~-]+\s*[a-zA-Z]?$/.test(line)) continue;
    if (line.replace(/[\s\d.,;:-]/g, '').length === 0 && !/\d{3,}/.test(line)) continue;

    cleanLines.push(line);
  }

  return cleanLines.join('\n');
}

/**
 * Parse Image / Photo Invoices / Scanned Receipts (.png, .jpg, .jpeg, .webp) via Dedicated Local OCR
 * Includes Robust Multi-Column Table & Line Reconstruction
 */
async function parseImageDocument(buffer, filename) {
  try {
    // 1. Initialize High-Performance Local OCR Worker
    const worker = await createWorker('eng');
    
    // Configure OCR with PSM 6 (Uniform Block of Text / Tabular Grid)
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1'
    });

    const ret = await worker.recognize(buffer);
    await worker.terminate();

    const rawText = ret.data.text || '';
    const tabularFormattedText = formatAsCleanTabularText(rawText);

    return {
      fileType: 'IMAGE_TABULAR_OCR',
      filename,
      extractedText: tabularFormattedText,
      summary: `2D Spatial Table OCR extracted and formatted ${tabularFormattedText.split('\n').length} aligned rows.`
    };
  } catch (err) {
    console.error(`Local OCR processing error for ${filename}:`, err.message);
    return {
      fileType: 'IMAGE_OCR_FALLBACK',
      filename,
      extractedText: '',
      summary: `OCR could not process image: ${err.message}`
    };
  }
}

/**
 * Format raw extracted OCR lines into perfectly aligned multi-column tabular text
 */
function formatAsCleanTabularText(rawOcrText) {
  if (!rawOcrText) return '';
  const lines = rawOcrText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const formatted = [];

  for (let line of lines) {
    // Clean noise characters from OCR artifacts
    let cleanLine = line
      .replace(/\bhed:\s*/gi, '')
      .replace(/\bRe\.\s*/gi, '')
      .replace(/\bRs\.?\s*/gi, '')
      .replace(/[¢©®|]/g, '')
      .replace(/\biA\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Match numbers in line (including comma-separated Indian currency formats)
    const numRegex = /(?:[₹$€£])?\s*\(?-?\d[\d,.]*\)?(?![a-zA-Z])/g;
    const nums = [];
    let m;
    while ((m = numRegex.exec(cleanLine)) !== null) {
      const val = m[0].trim().replace(/^[₹$€£]\s*/, '');
      if (/\d/.test(val)) nums.push(val);
    }

    // If line has a valid label and one or more numbers, align nicely
    if (nums.length > 0) {
      let label = cleanLine;
      for (const n of nums) {
        label = label.replace(n, '');
      }
      label = label.replace(/[-–=:]+$/, '').trim();

      // Drop meaningless single-letter labels
      if (label.length >= 2) {
        const paddedLabel = label.padEnd(28, ' ');
        const paddedNums = nums.map(n => n.padStart(10, ' ')).join('\t');
        formatted.push(paddedLabel + '\t' + paddedNums);
        continue;
      }
    }

    // Keep header or structural lines if meaningful
    if (cleanLine.length > 2 && !/^[a-zA-Z]{1,2}$/.test(cleanLine) && !/^[:;.,_~-]+$/.test(cleanLine)) {
      formatted.push(cleanLine);
    }
  }

  return formatted.join('\n');
}

/**
 * Parse Excel Spreadsheets (.xlsx, .xls) (Tally, Busy, Trial Balances, GST utilities)
 */
async function parseExcelDocument(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames || [];

  let extractedLines = [];

  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (rows.length === 0) continue;

    extractedLines.push(`--- Sheet: ${sheetName} ---`);

    for (const row of rows) {
      if (!Array.isArray(row) || row.length === 0) continue;

      const cells = row.map(c => String(c).trim()).filter(c => c.length > 0);
      if (cells.length === 0) continue;

      if (cells.length >= 2) {
        let numVal = null;
        let labelParts = [];

        for (let i = cells.length - 1; i >= 0; i--) {
          const valClean = cells[i].replace(/[^\d.-]/g, '');
          if (numVal === null && !isNaN(parseFloat(valClean)) && valClean !== '') {
            numVal = cells[i];
          } else {
            labelParts.unshift(cells[i]);
          }
        }

        if (numVal !== null && labelParts.length > 0) {
          extractedLines.push(`${labelParts.join(' - ')}: ${numVal}`);
        } else {
          extractedLines.push(cells.join(' | '));
        }
      } else {
        extractedLines.push(cells.join(' | '));
      }
    }
  }

  const resultText = extractedLines.join('\n');

  return {
    fileType: 'EXCEL',
    filename,
    sheets: sheetNames,
    extractedText: resultText,
    summary: `Extracted ${sheetNames.length} sheet(s) [${sheetNames.join(', ')}] from Excel spreadsheet.`
  };
}

/**
 * Parse CSV Document
 */
async function parseCSVDocument(buffer, filename) {
  const text = buffer.toString('utf-8');
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let formatted = [];
  for (const line of lines) {
    const parts = line.split(/,|\t/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length >= 2) {
      formatted.push(`${parts[0]}: ${parts[parts.length - 1]}`);
    } else {
      formatted.push(line);
    }
  }

  const resultText = formatted.join('\n');
  return {
    fileType: 'CSV',
    filename,
    extractedText: resultText,
    summary: `Extracted ${lines.length} lines from CSV file.`
  };
}

/**
 * Detect whether input document is a structured tabular grid, a multi-block column layout, or free-form text
 */
export function detectDocumentLayout(rawText = '') {
  if (!rawText) return { layout: 'FREE_FORM', isTabular: false, columnCount: 1 };

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return { layout: 'FREE_FORM', isTabular: false, columnCount: 1 };

  // Check 1: Multi-column tabular headers (Sr. No., Particulars, Note No, Year columns, Debit, Credit)
  const headerPatterns = [
    /\b(sr\.?\s*no|particulars|note\s*(?:no\.?)?|amount|debit|credit|20\d{2}[-–]\d{2,4})\b/i,
    /\b(description|qty|rate|taxable|cgst|sgst|igst|total)\b/i
  ];
  let headerMatchCount = 0;
  for (const line of lines.slice(0, 10)) {
    if (headerPatterns[0].test(line)) headerMatchCount++;
    if (line.includes('|') || line.includes('\t')) headerMatchCount += 2;
  }

  // Check 2: Spatial multiple number tokens per line across lines
  let multiNumLineCount = 0;
  let singleNumLineCount = 0;
  let keyValLineCount = 0;

  for (const line of lines) {
    if (line.includes('=') || (line.includes(':') && !line.includes('http') && !line.includes('CIN'))) {
      keyValLineCount++;
    }
    const numRegex = /(?:\bRs\.?|\bINR|[₹$€£])?\s*\(?-?\d[\d,.]*(?:\s*(?:lakhs?|crores?|cr|k|m|b))?\)?(?![a-zA-Z])/gi;
    const matches = line.match(numRegex) || [];
    const validNums = matches.filter(m => /\d/.test(m) && !m.match(/^(19|20)\d{2}$/)); // ignore standalone 4-digit years
    if (validNums.length >= 2) {
      multiNumLineCount++;
    } else if (validNums.length === 1) {
      singleNumLineCount++;
    }
  }

  // Check 3: Multi-block layout (blank line delimited blocks of equal row lengths)
  const rawBlocks = rawText.split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(b => b.length > 0);
  if (rawBlocks.length >= 2) {
    const block0 = rawBlocks[0].split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const block1 = rawBlocks[1].split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (block0.length >= 2 && Math.abs(block0.length - block1.length) <= 3) {
      return { layout: 'MULTI_BLOCK', isTabular: true, columnCount: rawBlocks.length };
    }
  }

  if (headerMatchCount >= 2 || multiNumLineCount >= 2 || (multiNumLineCount >= 1 && singleNumLineCount >= 1)) {
    return { layout: 'TABULAR_GRID', isTabular: true, columnCount: multiNumLineCount > 0 ? 3 : 2 };
  }

  return {
    layout: keyValLineCount >= 1 || singleNumLineCount >= 1 ? 'FREE_FORM' : 'UNSTRUCTURED',
    isTabular: false,
    columnCount: 1
  };
}
