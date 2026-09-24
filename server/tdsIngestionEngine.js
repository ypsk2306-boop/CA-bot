import { createRequire } from 'module';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

/**
 * Statutory TDS Ingestion & Normalization Engine
 * 
 * Supports:
 * - Form 26AS / TRACES CSV and Text exports
 * - AIS / TIS (Annual Information Statement) CSV & Text exports
 * - Form 26AS PDF (Digital text streams + Scanned OCR fallback via Tesseract)
 * 
 * Target Normalized Schema:
 * {
 *   deductorTAN: string | null,     // 10-char Indian TAN e.g. MUMB12345E
 *   deductorName: string | null,    // Name of Deductor / Tax Collector / Employer
 *   section: string | null,         // e.g. "194C", "194J", "194I", "194A", "192", "206C"
 *   amountPaid: number,             // Gross transaction / payment / credit amount
 *   tdsDeducted: number,           // TDS deducted / collected amount
 *   dateOfDeduction: string | null, // Date of payment / deduction (YYYY-MM-DD)
 *   dateOfBooking: string | null,   // Date on which TDS was booked / credited (YYYY-MM-DD)
 *   tdsDeposited?: number,          // TDS deposited amount
 *   status?: string | null          // e.g. "F" (Final / Matched), "U" (Unmatched), "O" (Overbooked)
 * }
 * 
 * ZERO-FABRICATION RULE:
 * If deductor name, TAN, or dates are not explicitly present, leave as null.
 * Record audit warnings for unparsed or missing fields.
 */

const TAN_REGEX = /\b([A-Z]{4}\s*[0-9]{5}\s*[A-Z])\b/i;
const PAN_REGEX = /\b([A-Z]{5}\s*[0-9]{4}\s*[A-Z])\b/i;

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * Main Entry Point: Parse Form 26AS / AIS / TRACES Document
 */
export async function parseTdsDocument(fileBuffer, originalFilename = 'tds_statement', mimeType = '') {
  const extension = (originalFilename.split('.').pop() || '').toLowerCase();
  const warnings = [];

  let rawResult = null;

  try {
    if (extension === 'pdf' || mimeType === 'application/pdf') {
      rawResult = await parsePDFTdsDocument(fileBuffer, originalFilename, warnings);
    } else if (['xlsx', 'xls', 'xlsm'].includes(extension) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      rawResult = parseExcelTdsDocument(fileBuffer, originalFilename, warnings);
    } else if (['csv', 'tsv', 'txt'].includes(extension) || mimeType.includes('csv') || mimeType.includes('text') || typeof fileBuffer === 'string') {
      const textContent = typeof fileBuffer === 'string' ? fileBuffer : fileBuffer.toString('utf-8');
      rawResult = parseTextTdsDocument(textContent, originalFilename, warnings);
    } else {
      throw new Error(`Unsupported file type (.${extension}). Please upload a Form 26AS, AIS, or TRACES export in PDF, Excel (.xlsx/.xls), CSV, or TXT format.`);
    }

    return assembleTdsResult(rawResult, originalFilename, warnings);
  } catch (err) {
    console.error(`Error in parseTdsDocument for ${originalFilename}:`, err);
    throw new Error(`Failed to parse TDS document "${originalFilename}": ${err.message}`);
  }
}

/**
 * Parse TDS Document from Plain Text / Pasted String
 */
export function parseTdsDocumentText(rawText, sourceHint = 'pasted_tds.txt') {
  const warnings = [];
  const rawResult = parseTextTdsDocument(rawText, sourceHint, warnings);
  return assembleTdsResult(rawResult, sourceHint, warnings);
}

/**
 * Assembles and standardizes the final TDS result
 */
function assembleTdsResult(rawResult, filename, warnings) {
  const {
    sourceType = '26AS',
    entries = []
  } = rawResult || {};

  const normalizedEntries = [];
  const deductorSet = new Set();
  const deductorTanSet = new Set();

  let totalAmountPaid = 0;
  let totalTdsDeducted = 0;

  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i];
    const tan = normalizeTan(raw.deductorTAN);
    const name = cleanString(raw.deductorName);
    const sec = normalizeTdsSection(raw.section);
    const amountPaid = normalizeAmount(raw.amountPaid);
    const tdsDeducted = normalizeAmount(raw.tdsDeducted);
    const dateOfDeduction = normalizeDate(raw.dateOfDeduction);
    const dateOfBooking = normalizeDate(raw.dateOfBooking);
    const tdsDeposited = raw.tdsDeposited !== undefined ? normalizeAmount(raw.tdsDeposited) : tdsDeducted;
    const status = cleanString(raw.status) || null;

    if (!tan) {
      warnings.push(`Entry #${i + 1} (${name || 'Unknown Deductor'}): TAN not found or invalid format.`);
    }
    if (amountPaid === 0 && tdsDeducted === 0) {
      // Skip empty or purely blank lines
      continue;
    }

    if (tan) deductorTanSet.add(tan);
    if (name) deductorSet.add(name);

    totalAmountPaid += amountPaid;
    totalTdsDeducted += tdsDeducted;

    normalizedEntries.push({
      deductorTAN: tan,
      deductorName: name,
      section: sec,
      amountPaid: Math.round(amountPaid * 100) / 100,
      tdsDeducted: Math.round(tdsDeducted * 100) / 100,
      dateOfDeduction,
      dateOfBooking,
      tdsDeposited: Math.round(tdsDeposited * 100) / 100,
      status
    });
  }

  totalAmountPaid = Math.round(totalAmountPaid * 100) / 100;
  totalTdsDeducted = Math.round(totalTdsDeducted * 100) / 100;

  return {
    success: true,
    filename,
    sourceType,
    summary: {
      totalEntries: normalizedEntries.length,
      totalAmountPaid,
      totalTdsDeducted,
      uniqueDeductors: deductorTanSet.size || deductorSet.size
    },
    deductorTANs: Array.from(deductorTanSet),
    entries: normalizedEntries,
    warnings
  };
}

/**
 * Parse Plain Text / CSV Form 26AS or AIS Document
 */
function parseTextTdsDocument(rawText, filename, warnings) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { sourceType: 'UNKNOWN', entries: [] };
  }

  const firstFew = lines.slice(0, 30).join(' ').toUpperCase();
  const isAis = firstFew.includes('ANNUAL INFORMATION STATEMENT') || firstFew.includes('AIS') || firstFew.includes('TIS');
  const sourceType = isAis ? 'AIS' : '26AS';

  const delimiter = detectDelimiter(lines);
  const entries = [];

  // Check if it is a TRACES block format:
  // "Name of Deductor: XYZ", "TAN of Deductor: ABCDE1234F"
  // followed by a table of transactions
  let currentDeductorName = null;
  let currentDeductorTAN = null;
  let inTransactionTable = false;
  let tableHeaders = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect Deductor Header in TRACES / 26AS format
    const nameMatch = line.match(/(?:Name of (?:the )?Deductor|Deductor Name|Collector Name|Name of Collector)\s*[:,\t]\s*([^\r\n,]+)/i);
    if (nameMatch) {
      currentDeductorName = cleanString(nameMatch[1]);
    }

    const tanMatch = line.match(/(?:TAN of (?:the )?Deductor|Deductor TAN|Collector TAN|TAN of Collector|TAN)\s*[:,\t]\s*([A-Z]{4}[0-9]{5}[A-Z])/i);
    if (tanMatch) {
      currentDeductorTAN = tanMatch[1].toUpperCase();
    }

    // Direct standalone line containing TAN and Name: e.g. "MUMB12345E, INFOSYS LTD"
    if (!currentDeductorTAN) {
      const inlineTan = line.match(TAN_REGEX);
      if (inlineTan) {
        currentDeductorTAN = inlineTan[1].toUpperCase();
        // Extract rest of line as name if reasonable
        const cleanLine = line.replace(inlineTan[0], '').replace(/[,\t:;]/g, ' ').trim();
        if (cleanLine.length > 2 && !/total|summary|amount|section/i.test(cleanLine)) {
          currentDeductorName = cleanLine;
        }
      }
    }

    // Check if line is a table header
    const lowerLine = line.toLowerCase();
    if (isTdsHeaderRow(lowerLine)) {
      inTransactionTable = true;
      tableHeaders = splitDelimitedLine(line, delimiter).map(h => h.trim().toLowerCase());
      continue;
    }

    // Check if exiting transaction table (new section header or total line)
    if (inTransactionTable && (/^part\s+[a-z0-9]/i.test(line) || /^total/i.test(line) || /^grand total/i.test(line))) {
      if (/^part\s+[a-z0-9]/i.test(line)) {
        currentDeductorName = null;
        currentDeductorTAN = null;
        inTransactionTable = false;
        tableHeaders = null;
      }
    }

    // Parse data row inside transaction table
    if (inTransactionTable && tableHeaders) {
      const cells = splitDelimitedLine(line, delimiter);
      if (cells.length >= 4) {
        const rowObj = mapTdsRow(tableHeaders, cells, currentDeductorTAN, currentDeductorName);
        if (rowObj && (rowObj.amountPaid > 0 || rowObj.tdsDeducted > 0)) {
          entries.push(rowObj);
          continue;
        }
      }
    }

    // Fallback: Check if line is a flat CSV row with TAN / Section / Amounts directly
    if (line.includes(delimiter) || line.includes(',') || line.includes('\t')) {
      const cells = splitDelimitedLine(line, delimiter);
      if (cells.length >= 4) {
        const flatRow = parseFlatTdsRow(cells);
        if (flatRow && (flatRow.amountPaid > 0 || flatRow.tdsDeducted > 0)) {
          entries.push(flatRow);
        }
      }
    }
  }

  return { sourceType, entries };
}

/**
 * Parse Excel Form 26AS / AIS / TRACES / Winman Document (.xlsx, .xls, .xlsm)
 */
function parseExcelTdsDocument(buffer, filename, warnings) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames || [];

  if (sheetNames.length === 0) {
    throw new Error('Excel workbook contains no readable sheets.');
  }

  const entries = [];
  let isAis = false;

  for (const sheetName of sheetNames) {
    // Skip help, macros, or system instructions
    if (/^(?:help|instructions|enable\s*macros|read\s*me|inter)$/i.test(sheetName)) continue;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rows.length < 2) continue;

    if (/ais|tis|annual\s*information/i.test(sheetName)) isAis = true;

    // 1. Check for Winman CA-ERP layout (e.g. TDS - Form 16A, TCS, TDS 16A BF, etc.)
    let isWinman = false;
    let winmanHeaderRow = -1;
    for (let r = 0; r < Math.min(6, rows.length); r++) {
      const rowStr = rows[r].map(c => String(c).toLowerCase()).join(' ');
      if (
        rowStr.includes('deductorname') || 
        rowStr.includes('collectorname') || 
        rowStr.includes('tdsown') || 
        rowStr.includes('tcscollected') ||
        rowStr.includes('grossreceiptsasper26as')
      ) {
        isWinman = true;
        winmanHeaderRow = r;
        break;
      }
    }

    if (isWinman) {
      const headers = rows[winmanHeaderRow].map(h => String(h).toLowerCase().replace(/[^a-z0-9]/g, ''));
      const nameCol = headers.findIndex(h => h.includes('deductorname') || h.includes('collectorname') || h.includes('name'));
      const tanCol = headers.findIndex(h => h === 'tan' || h.includes('tan') || h === 'pan');
      const tdsCol = headers.findIndex(h => h.includes('tdsown') || h.includes('tcscollected') || h.includes('tdsdeducted'));
      const claimedCol = headers.findIndex(h => h.includes('claimed') || h.includes('tdsclaimedcy'));
      const grossCol = headers.findIndex(h => h.includes('grossreceipt') || h.includes('expenditure26as') || h.includes('amount'));
      const secCol = headers.findIndex(h => h.includes('section') || h === 'sec');

      let startRow = winmanHeaderRow + 1;
      for (let r = winmanHeaderRow + 1; r < Math.min(winmanHeaderRow + 8, rows.length); r++) {
        if (rows[r].some(c => String(c).trim() === '-')) {
          startRow = r + 1;
          break;
        }
      }

      for (let r = startRow; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const name = String(row[nameCol] || '').trim();
        if (!name || name === '-' || /^(?:total|grand total)/i.test(name)) continue;

        const tan = normalizeTan(row[tanCol]);
        const tds = normalizeAmount(row[tdsCol]) || normalizeAmount(row[claimedCol]);
        const gross = normalizeAmount(row[grossCol]);
        let sec = secCol !== -1 ? normalizeTdsSection(row[secCol]) : null;
        if (!sec) {
          sec = sheetName.toLowerCase().includes('tcs') ? '206C' : '194C';
        }

        if (tds > 0 || gross > 0) {
          entries.push({
            deductorName: name,
            deductorTAN: tan,
            section: sec,
            amountPaid: gross,
            tdsDeducted: tds,
            tdsDeposited: tds,
            dateOfDeduction: null,
            dateOfBooking: null,
            status: 'MATCHED'
          });
        }
      }
      continue;
    }

    // 2. Generic Tabular / TRACES / AIS Sheet
    let headerRow = -1;
    let headers = [];
    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r].map(c => String(c).trim().toLowerCase());
      const hasName = row.some(c => c.includes('deductor') || c.includes('collector') || c.includes('party') || c.includes('name'));
      const hasTaxOrAmount = row.some(c => c.includes('tds') || c.includes('tax') || c.includes('amount') || c.includes('paid') || c.includes('credited'));
      if (hasName && hasTaxOrAmount) {
        headerRow = r;
        headers = row.map(h => h.replace(/[^a-z0-9]/g, ''));
        break;
      }
    }

    if (headerRow !== -1) {
      const nameCol = headers.findIndex(h => h.includes('deductor') || h.includes('collector') || h.includes('party') || h.includes('name'));
      const tanCol = headers.findIndex(h => h.includes('tan') || h.includes('pan'));
      const secCol = headers.findIndex(h => h.includes('sec'));
      const grossCol = headers.findIndex(h => h.includes('gross') || h.includes('paid') || h.includes('credited') || h.includes('amount') || h.includes('income'));
      const tdsCol = headers.findIndex(h => h.includes('tds') || h.includes('tax') || h.includes('deducted') || h.includes('collected'));
      const dateCol = headers.findIndex(h => h.includes('date'));

      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.length === 0) continue;
        const name = String(row[nameCol] || '').trim();
        if (!name || /^(?:total|grand total)/i.test(name)) continue;

        const tan = tanCol !== -1 ? normalizeTan(row[tanCol]) : null;
        const tds = tdsCol !== -1 ? normalizeAmount(row[tdsCol]) : 0;
        const gross = grossCol !== -1 ? normalizeAmount(row[grossCol]) : 0;
        const sec = secCol !== -1 ? normalizeTdsSection(row[secCol]) : null;

        if (tds > 0 || gross > 0) {
          entries.push({
            deductorName: name,
            deductorTAN: tan,
            section: sec || '194C',
            amountPaid: gross,
            tdsDeducted: tds,
            tdsDeposited: tds,
            dateOfDeduction: dateCol !== -1 ? normalizeDate(row[dateCol]) : null,
            dateOfBooking: null,
            status: null
          });
        }
      }
    }
  }

  if (entries.length > 0) {
    return {
      sourceType: isAis ? 'AIS' : '26AS',
      entries
    };
  }

  // Fallback to text lines parsing if direct extraction produced no rows
  const textLines = [];
  const allRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetNames[0]], { header: 1, defval: '' });
  for (const row of allRows) {
    if (Array.isArray(row)) {
      textLines.push(row.map(c => String(c !== null && c !== undefined ? c : '').trim()).join('\t'));
    }
  }
  return parseTextTdsDocument(textLines.join('\n'), filename, warnings);
}

/**
 * Parse PDF Form 26AS Document (Digital Text + Tesseract OCR Fallback)
 */
async function parsePDFTdsDocument(buffer, filename, warnings) {
  let fullTextParts = [];
  let numPages = 1;

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
        if (lastY !== null && Math.abs(itemY - lastY) > 4) {
          if (currentLine.length > 0) {
            pageLines.push(currentLine.join('\t'));
            currentLine = [];
          }
        }
        currentLine.push(item.str.trim());
        lastY = itemY;
      }

      if (currentLine.length > 0) {
        pageLines.push(currentLine.join('\t'));
      }

      if (pageLines.length > 0) {
        fullTextParts.push(pageLines.join('\n'));
      }
    }
  } catch (pdfErr) {
    warnings.push(`PDF text extraction warning: ${pdfErr.message}`);
  }

  const combinedPdfText = fullTextParts.join('\n');

  // If PDF lacks selectable text (scanned document), invoke Tesseract OCR fallback
  if (!combinedPdfText || combinedPdfText.replace(/\s+/g, '').length < 60) {
    warnings.push('PDF contains sparse selectable text. Falling back to local OCR engine for scanned Form 26AS...');
    const ocrText = await performOcrOnTdsPdf(buffer, filename, warnings);
    if (ocrText && ocrText.length > 30) {
      return parseTextTdsDocument(ocrText, filename, warnings);
    }
  }

  return parseTextTdsDocument(combinedPdfText, filename, warnings);
}

/**
 * Tesseract OCR Fallback for Scanned Form 26AS PDFs
 */
async function performOcrOnTdsPdf(buffer, filename, warnings) {
  try {
    const images = extractEmbeddedImagesFromPdf(buffer);
    if (images.length === 0) {
      warnings.push('No embedded images found in PDF to perform OCR.');
      return '';
    }

    images.sort((a, b) => b.buffer.length - a.buffer.length);
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1'
    });

    const ocrPages = [];
    const maxPages = Math.min(images.length, 5);
    for (let i = 0; i < maxPages; i++) {
      const ret = await worker.recognize(images[i].buffer);
      if (ret.data && ret.data.text) {
        ocrPages.push(ret.data.text);
      }
    }
    await worker.terminate();

    return ocrPages.join('\n\n');
  } catch (ocrErr) {
    warnings.push(`Local OCR failed on scanned Form 26AS: ${ocrErr.message}`);
    return '';
  }
}

/**
 * Extract Embedded JPEG/PNG/BMP images from PDF Buffer
 */
function extractEmbeddedImagesFromPdf(pdfBuffer) {
  const images = [];
  let startIdx = 0;

  while (startIdx < pdfBuffer.length - 4) {
    const jpgStart = pdfBuffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]), startIdx);
    if (jpgStart === -1) break;

    const jpgEnd = pdfBuffer.indexOf(Buffer.from([0xff, 0xd9]), jpgStart + 3);
    if (jpgEnd === -1) break;

    const imageLen = jpgEnd + 2 - jpgStart;
    if (imageLen > 1000) {
      images.push({
        type: 'jpeg',
        buffer: pdfBuffer.subarray(jpgStart, jpgEnd + 2)
      });
    }
    startIdx = jpgEnd + 2;
  }

  return images;
}

// ----------------------------------------------------
// Normalization & Mapping Utilities
// ----------------------------------------------------

function isTdsHeaderRow(line) {
  const l = line.toLowerCase();
  const hasSec = l.includes('section') || l.includes('sec');
  const hasTax = l.includes('tax deducted') || l.includes('tds') || l.includes('amount paid') || l.includes('tax deposited');
  const hasDate = l.includes('date') || l.includes('transaction date') || l.includes('booking date');
  return (hasSec && hasTax) || (hasTax && hasDate) || (l.includes('sr. no') && hasTax);
}

function mapTdsRow(headers, cells, fallbackTAN, fallbackName) {
  let section = null;
  let amountPaid = 0;
  let tdsDeducted = 0;
  let dateOfDeduction = null;
  let dateOfBooking = null;
  let tdsDeposited = 0;
  let status = null;
  let rowTAN = fallbackTAN;
  let rowName = fallbackName;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const val = (cells[i] || '').trim();

    if (/tan/i.test(h) && TAN_REGEX.test(val)) {
      rowTAN = val.match(TAN_REGEX)[1].toUpperCase();
    } else if (/deductor.*name|collector.*name|name/i.test(h) && val.length > 2 && !/^\d+$/.test(val)) {
      rowName = cleanString(val);
    } else if (/(?:^|\b)sec(?:tion)?\b/i.test(h)) {
      section = normalizeTdsSection(val);
    } else if (/amount\s*(?:paid|credited)|gross/i.test(h)) {
      amountPaid = normalizeAmount(val);
    } else if (/tax\s*deducted|tds\s*deducted/i.test(h)) {
      tdsDeducted = normalizeAmount(val);
    } else if (/tax\s*deposited|total\s*tax\s*deposited|tds\s*deposited/i.test(h)) {
      tdsDeposited = normalizeAmount(val);
    } else if (/transaction\s*date|date\s*of\s*(?:payment|credit|deduction)/i.test(h)) {
      dateOfDeduction = normalizeDate(val);
    } else if (/date\s*of\s*booking|booking\s*date|deposit\s*date|challan\s*date/i.test(h)) {
      dateOfBooking = normalizeDate(val);
    } else if (/status/i.test(h)) {
      status = val;
    }
  }

  // Fallback index-based mapping if header names didn't capture amounts:
  if (amountPaid === 0 && tdsDeducted === 0) {
    for (let c of cells) {
      const parsedNum = normalizeAmount(c);
      if (parsedNum > 0) {
        if (amountPaid === 0) amountPaid = parsedNum;
        else if (tdsDeducted === 0) tdsDeducted = parsedNum;
      }
    }
  }

  return {
    deductorTAN: rowTAN,
    deductorName: rowName,
    section: section || '194C',
    amountPaid,
    tdsDeducted,
    dateOfDeduction,
    dateOfBooking,
    tdsDeposited: tdsDeposited || tdsDeducted,
    status
  };
}

function parseFlatTdsRow(cells) {
  let tan = null;
  let name = null;
  let section = null;
  let amountPaid = 0;
  let tdsDeducted = 0;
  let dateOfDeduction = null;
  let dateOfBooking = null;
  let status = null;

  const numbers = [];
  const dates = [];

  for (const raw of cells) {
    const val = String(raw || '').trim();
    if (!val) continue;

    // Check TAN
    if (!tan && TAN_REGEX.test(val)) {
      tan = val.match(TAN_REGEX)[1].toUpperCase();
      continue;
    }

    // Check Section
    if (!section && isSectionPattern(val)) {
      section = normalizeTdsSection(val);
      continue;
    }

    // Check Date
    const parsedDate = normalizeDate(val);
    if (parsedDate) {
      dates.push(parsedDate);
      continue;
    }

    // Check Status
    if (!status && /^[FUO]$/i.test(val)) {
      status = val.toUpperCase();
      continue;
    }

    // Check Amount
    const parsedNum = normalizeAmount(val);
    if (parsedNum > 0 || (parsedNum === 0 && /^0(?:\.00)?$/.test(val))) {
      numbers.push(parsedNum);
      continue;
    }

    // Potential Name
    if (!name && val.length > 3 && !/^\d+$/.test(val) && !/sr\.?\s*no/i.test(val)) {
      name = cleanString(val);
    }
  }

  if (dates.length >= 2) {
    dateOfDeduction = dates[0];
    dateOfBooking = dates[1];
  } else if (dates.length === 1) {
    dateOfDeduction = dates[0];
  }

  if (numbers.length >= 2) {
    if (numbers[0] >= numbers[1]) {
      amountPaid = numbers[0];
      tdsDeducted = numbers[1];
    } else {
      amountPaid = numbers[1];
      tdsDeducted = numbers[0];
    }
  } else if (numbers.length === 1) {
    tdsDeducted = numbers[0];
  }

  if (!tan && !section && amountPaid === 0 && tdsDeducted === 0) {
    return null;
  }

  return {
    deductorTAN: tan,
    deductorName: name,
    section: section || '194C',
    amountPaid,
    tdsDeducted,
    dateOfDeduction,
    dateOfBooking,
    status
  };
}

function isSectionPattern(val) {
  const v = val.trim().toUpperCase();
  return /^(?:SEC(?:TION)?\s*)?(?:192[A-Z]?|193|194[A-Z]{0,3}|195|196[A-Z]?|206C[A-Z]{0,2})$/i.test(v);
}

export function normalizeTdsSection(rawSec) {
  if (!rawSec) return null;
  let s = String(rawSec).toUpperCase().trim();
  s = s.replace(/^(?:SEC(?:TION)?|U\/S)\s*/i, '').replace(/[\(\)\-\s]/g, '');
  if (!s) return null;
  if (/^194J/i.test(s)) return '194J';
  if (/^194C/i.test(s)) return '194C';
  if (/^194I/i.test(s)) return '194I';
  if (/^194A/i.test(s)) return '194A';
  if (/^194H/i.test(s)) return '194H';
  if (/^194Q/i.test(s)) return '194Q';
  if (/^194IA/i.test(s)) return '194IA';
  if (/^194IB/i.test(s)) return '194IB';
  if (/^194M/i.test(s)) return '194M';
  if (/^194S/i.test(s)) return '194S';
  if (/^192/i.test(s)) return '192';
  if (/^195/i.test(s)) return '195';
  if (/^206C/i.test(s)) return '206C';
  return s;
}

export function normalizeTan(rawTan) {
  if (!rawTan) return null;
  const str = String(rawTan).trim();
  const match = str.match(TAN_REGEX);
  if (match) {
    return match[1].replace(/\s+/g, '').toUpperCase();
  }
  const clean = str.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (/^[A-Z]{4}[0-9]{5}[A-Z]$/.test(clean)) {
    return clean;
  }
  return null;
}

export function normalizeAmount(rawVal) {
  if (rawVal === null || rawVal === undefined) return 0;
  if (typeof rawVal === 'number') return isNaN(rawVal) ? 0 : rawVal;

  let str = String(rawVal).trim();
  // Strip currency prefixes first before dealing with digits/commas/decimals
  str = str.replace(/(?:₹|INR|Rs\.?)/gi, '').trim();
  // Remove commas and spaces
  str = str.replace(/[\,\s]/g, '');
  const val = parseFloat(str);
  return isNaN(val) ? 0 : val;
}

export function normalizeDate(rawVal) {
  if (!rawVal) return null;
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return rawVal.toISOString().split('T')[0];
  }

  const str = String(rawVal).trim();
  // Standard ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // DD-MMM-YYYY or DD MMM YYYY (e.g. 15-May-2023)
  const dMmmYMatch = str.match(/^(\d{1,2})[\/\-\s]([A-Za-z]{3})[\/\-\s](\d{4})$/);
  if (dMmmYMatch) {
    const day = dMmmYMatch[1].padStart(2, '0');
    const monthStr = dMmmYMatch[2].toLowerCase();
    const month = MONTH_MAP[monthStr] || '01';
    const year = dMmmYMatch[3];
    return `${year}-${month}-${day}`;
  }

  return null;
}

function cleanString(str) {
  if (!str) return null;
  const s = String(str).replace(/\s+/g, ' ').trim();
  return s.length > 0 ? s : null;
}

function detectDelimiter(lines) {
  let commaCount = 0;
  let tabCount = 0;
  let pipeCount = 0;

  for (const line of lines.slice(0, 15)) {
    commaCount += (line.match(/,/g) || []).length;
    tabCount += (line.match(/\t/g) || []).length;
    pipeCount += (line.match(/\|/g) || []).length;
  }

  if (tabCount > commaCount && tabCount > pipeCount) return '\t';
  if (pipeCount > commaCount && pipeCount > tabCount) return '|';
  return ',';
}

function splitDelimitedLine(line, delimiter) {
  if (delimiter === '\t') return line.split('\t');
  if (delimiter === '|') return line.split('|');

  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}
