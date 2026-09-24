import { createRequire } from 'module';
import * as XLSX from 'xlsx';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

/**
 * Bank Statement Ingestion & Normalization Engine
 * 
 * Supports:
 * - PDF Bank Statements (Digital text streams + Scanned OCR fallback via Tesseract)
 * - Excel Spreadsheets (.xlsx, .xls)
 * - CSV and Delimited Exports (.csv, .tsv)
 * - Plain Text Exports (.txt)
 * 
 * Target Schema:
 * {
 *   bankName: string | null,
 *   accountNumber: string | null,
 *   ifsc: string | null,
 *   accountType: string | null,
 *   statementPeriod: { from: string | null, to: string | null },
 *   openingBalance: number | null,
 *   closingBalance: number | null,
 *   summary: { transactionCount, totalDebit, totalCredit, netChange },
 *   transactions: [
 *     { date: 'YYYY-MM-DD', narration: string, debit: number, credit: number, runningBalance: number | null, refNo: string | null }
 *   ],
 *   warnings: string[]
 * }
 * 
 * ZERO-FABRICATION RULE:
 * Never hardcode bank name, account number, or dates as defaults. If not detected, leave null.
 */

const KNOWN_INDIAN_BANKS = [
  { name: 'HDFC Bank', pattern: /\bHDFC\s*(?:BANK|LIMITED|LTD)?\b/i },
  { name: 'ICICI Bank', pattern: /\bICICI\s*(?:BANK|LIMITED|LTD)?\b/i },
  { name: 'State Bank of India', pattern: /\b(?:STATE\s+BANK\s+OF\s+INDIA|SBI)\b/i },
  { name: 'Axis Bank', pattern: /\bAXIS\s*(?:BANK|LIMITED|LTD)?\b/i },
  { name: 'Kotak Mahindra Bank', pattern: /\bKOTAK\s*(?:MAHINDRA)?\s*(?:BANK)?\b/i },
  { name: 'Punjab National Bank', pattern: /\bPUNJAB\s+NATIONAL\s+BANK|\bPNB\b/i },
  { name: 'Bank of Baroda', pattern: /\bBANK\s+OF\s+BARODA|\bBOB\b/i },
  { name: 'Canara Bank', pattern: /\bCANARA\s+BANK\b/i },
  { name: 'Union Bank of India', pattern: /\bUNION\s+BANK\s+(?:OF\s+INDIA)?\b/i },
  { name: 'IndusInd Bank', pattern: /\bINDUSIND\s+BANK\b/i },
  { name: 'Yes Bank', pattern: /\bYES\s+BANK\b/i },
  { name: 'IDFC FIRST Bank', pattern: /\bIDFC\s*(?:FIRST)?\s*(?:BANK)?\b/i },
  { name: 'Federal Bank', pattern: /\bFEDERAL\s+BANK\b/i },
  { name: 'Indian Bank', pattern: /\bINDIAN\s+BANK\b/i },
  { name: 'Central Bank of India', pattern: /\bCENTRAL\s+BANK\s+(?:OF\s+INDIA)?\b/i },
  { name: 'Standard Chartered Bank', pattern: /\bSTANDARD\s+CHARTERED\b/i },
  { name: 'Citibank', pattern: /\bCITIBANK\b/i },
  { name: 'HSBC', pattern: /\bHSBC\s*(?:BANK)?\b/i },
  { name: 'RBL Bank', pattern: /\bRBL\s+BANK\b/i },
  { name: 'Bandhan Bank', pattern: /\bBANDHAN\s+BANK\b/i }
];

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * Main Entry Point: Parse Bank Statement File
 */
export async function parseBankStatement(fileBuffer, originalFilename = 'statement', mimeType = '') {
  const extension = (originalFilename.split('.').pop() || '').toLowerCase();
  const warnings = [];

  let rawData = null;

  try {
    if (extension === 'pdf' || mimeType === 'application/pdf') {
      rawData = await parsePDFBankStatement(fileBuffer, originalFilename, warnings);
    } else if (['xlsx', 'xls', 'xlsm'].includes(extension) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
      rawData = parseExcelBankStatement(fileBuffer, originalFilename, warnings);
    } else if (['csv', 'tsv'].includes(extension) || mimeType.includes('csv')) {
      rawData = parseCSVBankStatement(fileBuffer, originalFilename, warnings);
    } else if (extension === 'txt' || mimeType.includes('text/plain') || typeof fileBuffer === 'string') {
      rawData = parseTextBankStatement(typeof fileBuffer === 'string' ? fileBuffer : fileBuffer.toString('utf-8'), originalFilename, warnings);
    } else {
      throw new Error(`Unsupported file type (.${extension}). Please upload a PDF, Excel (.xlsx/.xls), CSV, or TXT bank statement.`);
    }

    // Normalize and assemble final response
    return assembleStatementResult(rawData, originalFilename, warnings);
  } catch (err) {
    console.error(`Error in parseBankStatement for ${originalFilename}:`, err);
    throw new Error(`Failed to parse bank statement "${originalFilename}": ${err.message}`);
  }
}

/**
 * Parse Bank Statement from Plain Text
 */
export function parseBankStatementText(rawText, sourceHint = 'pasted_statement.txt') {
  const warnings = [];
  const rawData = parseTextBankStatement(rawText, sourceHint, warnings);
  return assembleStatementResult(rawData, sourceHint, warnings);
}

/**
 * Assembles and standardizes the final statement result
 */
function assembleStatementResult(rawData, filename, warnings) {
  const {
    headerText = '',
    rows = [],
    bankName: detectedBank = null,
    accountNumber: detectedAccount = null,
    ifsc: detectedIfsc = null,
    accountType: detectedType = null,
    statementPeriod: detectedPeriod = null,
    openingBalance: detectedOpening = null,
    closingBalance: detectedClosing = null
  } = rawData;

  // 1. Extract metadata from header if not already extracted
  const bankName = detectedBank || extractBankName(headerText);
  const accountNumber = detectedAccount || extractAccountNumber(headerText);
  const ifsc = detectedIfsc || extractIFSC(headerText);
  const accountType = detectedType || extractAccountType(headerText);

  if (!bankName) {
    warnings.push('Bank identity was not detected in statement headers. Bank name left as null (no default fabricated).');
  }
  if (!accountNumber) {
    warnings.push('Account number was not detected in statement headers. Account number left as null.');
  }

  // 2. Parse and normalize transaction rows
  const parsedTransactions = parseTransactionRows(rows, warnings);

  // 3. Calculate summary metrics
  let totalDebit = 0;
  let totalCredit = 0;

  for (const t of parsedTransactions) {
    totalDebit += t.debit || 0;
    totalCredit += t.credit || 0;
  }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  const netChange = Math.round((totalCredit - totalDebit) * 100) / 100;

  // 4. Derive period and balances
  let statementPeriod = detectedPeriod || { from: null, to: null };
  if (!statementPeriod.from && parsedTransactions.length > 0) {
    const dates = parsedTransactions.map(t => t.date).filter(Boolean).sort();
    if (dates.length > 0) {
      statementPeriod = {
        from: dates[0],
        to: dates[dates.length - 1]
      };
    }
  }

  const openingBalance = detectedOpening !== null 
    ? detectedOpening 
    : (parsedTransactions.length > 0 && parsedTransactions[0].runningBalance !== null
        ? Math.round((parsedTransactions[0].runningBalance + (parsedTransactions[0].debit || 0) - (parsedTransactions[0].credit || 0)) * 100) / 100
        : null);

  const closingBalance = detectedClosing !== null
    ? detectedClosing
    : (parsedTransactions.length > 0 && parsedTransactions[parsedTransactions.length - 1].runningBalance !== null
        ? parsedTransactions[parsedTransactions.length - 1].runningBalance
        : null);

  // 5. Verify running balance continuity
  validateRunningBalanceContinuity(parsedTransactions, openingBalance, warnings);

  return {
    success: true,
    filename,
    bankName,
    accountNumber,
    ifsc,
    accountType,
    statementPeriod,
    openingBalance,
    closingBalance,
    summary: {
      transactionCount: parsedTransactions.length,
      totalDebit,
      totalCredit,
      netChange
    },
    transactions: parsedTransactions,
    warnings
  };
}

/**
 * Parse Excel Bank Statement (.xlsx, .xls)
 */
function parseExcelBankStatement(buffer, filename, warnings) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames || [];

  if (sheetNames.length === 0) {
    throw new Error('Excel workbook contains no readable sheets.');
  }

  // Use the primary sheet with the most rows
  let targetSheet = null;
  let maxRows = -1;
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (jsonRows.length > maxRows) {
      maxRows = jsonRows.length;
      targetSheet = sheet;
    }
  }

  if (!targetSheet) {
    throw new Error('No valid sheet found in Excel workbook.');
  }

  const allRows = XLSX.utils.sheet_to_json(targetSheet, { header: 1, defval: '' });

  // Separate header block from transaction table
  let headerLines = [];
  let tableRows = [];
  let headerRowIndex = -1;

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;
    
    // Check if this row looks like the table header
    const rowStr = row.map(c => String(c || '').trim()).join(' ').toLowerCase();
    if (isTableHeaderRow(rowStr)) {
      headerRowIndex = i;
      break;
    } else {
      headerLines.push(row.map(c => String(c || '').trim()).filter(Boolean).join(' '));
    }
  }

  if (headerRowIndex !== -1) {
    // Process rows starting from header
    const columnHeaders = allRows[headerRowIndex].map(c => String(c || '').trim());
    const dataRows = allRows.slice(headerRowIndex + 1);
    tableRows = convertGridToNormalizedRows(columnHeaders, dataRows, warnings);
  } else {
    // Fallback: search for first row that starts with a date
    let startIdx = 0;
    for (let i = 0; i < allRows.length; i++) {
      const firstCell = String(allRows[i][0] || '').trim();
      if (parseFlexibleDate(firstCell)) {
        startIdx = i;
        break;
      } else {
        headerLines.push(allRows[i].map(c => String(c || '').trim()).filter(Boolean).join(' '));
      }
    }
    const guessedHeaders = ['Date', 'Narration', 'ChqNo', 'Withdrawal', 'Deposit', 'Balance'];
    tableRows = convertGridToNormalizedRows(guessedHeaders, allRows.slice(startIdx), warnings);
  }

  const headerText = headerLines.join('\n');

  return {
    headerText,
    rows: tableRows,
    bankName: extractBankName(headerText),
    accountNumber: extractAccountNumber(headerText),
    ifsc: extractIFSC(headerText),
    accountType: extractAccountType(headerText),
    openingBalance: extractLabeledBalance(headerText, /opening\s*balance/i),
    closingBalance: extractLabeledBalance(headerText, /closing\s*balance/i)
  };
}

/**
 * Parse CSV / Delimited Bank Statement
 */
function parseCSVBankStatement(buffer, filename, warnings) {
  const text = buffer.toString('utf-8');
  return parseTextBankStatement(text, filename, warnings);
}

/**
 * Parse Plain Text or Delimited Bank Statement
 */
function parseTextBankStatement(rawText, filename, warnings) {
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  let headerLines = [];
  let tableLines = [];
  let headerFound = false;
  let delimiter = detectDelimiter(lines);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!headerFound) {
      if (isTableHeaderRow(line.toLowerCase())) {
        headerFound = true;
        tableLines.push(line);
      } else {
        headerLines.push(line);
      }
    } else {
      tableLines.push(line);
    }
  }

  let tableRows = [];
  if (tableLines.length > 0) {
    const headerRow = splitDelimitedLine(tableLines[0], delimiter);
    const dataRows = tableLines.slice(1).map(l => splitDelimitedLine(l, delimiter));
    tableRows = convertGridToNormalizedRows(headerRow, dataRows, warnings);
  } else {
    // If no header found, parse unstructured text line-by-line
    tableRows = parseUnstructuredTextLines(lines, warnings);
  }

  const headerText = headerLines.join('\n');

  return {
    headerText,
    rows: tableRows,
    bankName: extractBankName(headerText),
    accountNumber: extractAccountNumber(headerText),
    ifsc: extractIFSC(headerText),
    accountType: extractAccountType(headerText),
    openingBalance: extractLabeledBalance(headerText, /opening\s*balance/i),
    closingBalance: extractLabeledBalance(headerText, /closing\s*balance/i)
  };
}

/**
 * Parse PDF Bank Statement (Digital text + Embedded OCR fallback)
 */
async function parsePDFBankStatement(buffer, filename, warnings) {
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

  // Check if PDF is a scanned image or lacks text
  if (!combinedPdfText || combinedPdfText.replace(/\s+/g, '').length < 50) {
    warnings.push('PDF contains sparse selectable text. Falling back to local OCR engine for scanned statement...');
    const ocrText = await performOcrOnPdfBuffer(buffer, filename, warnings);
    if (ocrText && ocrText.length > 30) {
      return parseTextBankStatement(ocrText, filename, warnings);
    }
  }

  return parseTextBankStatement(combinedPdfText, filename, warnings);
}

/**
 * OCR Fallback for Scanned PDF Statements via Tesseract.js
 */
async function performOcrOnPdfBuffer(buffer, filename, warnings) {
  try {
    const images = extractEmbeddedImagesFromPdf(buffer);
    if (images.length === 0) {
      warnings.push('No embedded images found in PDF to perform OCR.');
      return '';
    }

    // Sort by largest buffer first (primary page scan)
    images.sort((a, b) => b.buffer.length - a.buffer.length);
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_pageseg_mode: '6',
      preserve_interword_spaces: '1'
    });

    const ocrPages = [];
    const maxPages = Math.min(images.length, 5); // Process up to 5 pages
    for (let i = 0; i < maxPages; i++) {
      const ret = await worker.recognize(images[i].buffer);
      if (ret.data && ret.data.text) {
        ocrPages.push(ret.data.text);
      }
    }
    await worker.terminate();

    return ocrPages.join('\n\n');
  } catch (ocrErr) {
    warnings.push(`Local OCR failed on scanned PDF: ${ocrErr.message}`);
    return '';
  }
}

/**
 * Extract Embedded JPEG/PNG/BMP images from PDF Buffer
 */
function extractEmbeddedImagesFromPdf(pdfBuffer) {
  const images = [];
  const minImageSize = 1000;

  // Direct JPEG extraction (0xFF 0xD8 ... 0xFF 0xD9)
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

  // Direct PNG extraction
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

  return images;
}

/**
 * Helper: Detect whether a line represents the table header row
 */
function isTableHeaderRow(line) {
  const lower = line.toLowerCase();
  const dateFound = /\b(date|txn\s*date|trans\s*date|value\s*date)\b/.test(lower);
  const narrationFound = /\b(narration|particulars|description|remarks)\b/.test(lower);
  const amountFound = /\b(debit|credit|withdrawal|deposit|balance|amount|dr|cr)\b/.test(lower);

  return (dateFound && (narrationFound || amountFound)) || (narrationFound && amountFound);
}

/**
 * Detect delimiter in text lines
 */
function detectDelimiter(lines) {
  let commaCount = 0;
  let tabCount = 0;
  let pipeCount = 0;
  let semiCount = 0;

  for (const l of lines.slice(0, 10)) {
    commaCount += (l.match(/,/g) || []).length;
    tabCount += (l.match(/\t/g) || []).length;
    pipeCount += (l.match(/\|/g) || []).length;
    semiCount += (l.match(/;/g) || []).length;
  }

  if (tabCount > commaCount && tabCount > pipeCount) return '\t';
  if (pipeCount > commaCount && pipeCount > tabCount) return '|';
  if (semiCount > commaCount) return ';';
  return ',';
}

/**
 * Split delimited line handling quotes
 */
function splitDelimitedLine(line, delimiter) {
  if (delimiter === '\t' || delimiter === '|') {
    return line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));
  }

  // Regex-based CSV parser that respects quotes
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim().replace(/^["']|["']$/g, ''));
  return cells;
}

/**
 * Map Grid Columns (Headers + 2D Rows) to Normalized Candidate Rows
 */
function convertGridToNormalizedRows(headers, rows, warnings) {
  const colMap = mapHeadersToRoles(headers);

  // If headers only resulted in 1 column or failed to find debit/credit columns,
  // fallback to robust spatial regex line parsing on all rows
  if (headers.length <= 1 || (colMap.debitIdx === -1 && colMap.creditIdx === -1 && colMap.amountIdx === -1)) {
    const textLines = rows.map(r => Array.isArray(r) ? r.join(' ') : String(r));
    return parseUnstructuredTextLines(textLines, warnings);
  }

  const normalizedRows = [];

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Filter empty rows
    const nonBlank = row.filter(c => c !== null && c !== undefined && String(c).trim().length > 0);
    if (nonBlank.length === 0) continue;

    // Check if row is a footer, closing summary, or repeated header
    const rowStr = row.map(c => String(c || '').trim()).join(' ');
    if (isTableHeaderRow(rowStr.toLowerCase())) continue;
    if (/^(total|statement\s+summary|opening\s+balance|closing\s+balance|page\s+\d)/i.test(rowStr)) continue;

    // Extract Date
    const rawDate = colMap.dateIdx !== -1 ? row[colMap.dateIdx] : row[0];
    const parsedDate = parseFlexibleDate(rawDate);

    // If no date found on this row, check if it's a multi-line narration continuation or split amount line
    if (!parsedDate) {
      if (normalizedRows.length > 0) {
        const prevTxn = normalizedRows[normalizedRows.length - 1];

        // Case 1: If current row has monetary values and prevTxn has no amounts yet (amounts printed on subsequent line)
        if (hasMonetaryValues(row) && prevTxn.debit === 0 && prevTxn.credit === 0 && prevTxn.runningBalance === null) {
          if (colMap.refNoIdx !== -1 && row[colMap.refNoIdx] && !prevTxn.refNo) {
            const rawRef = String(row[colMap.refNoIdx]).trim();
            if (rawRef && rawRef !== '-' && rawRef !== '0') prevTxn.refNo = rawRef;
          }

          if (colMap.debitIdx !== -1 && colMap.creditIdx !== -1) {
            prevTxn.debit = Math.abs(parseIndianAmount(row[colMap.debitIdx]) || 0);
            prevTxn.credit = Math.abs(parseIndianAmount(row[colMap.creditIdx]) || 0);
          } else {
            const nums = extractRowNumbers(row, [colMap.dateIdx, colMap.refNoIdx]);
            if (nums.length >= 2) {
              prevTxn.debit = Math.abs(nums[0] || 0);
              prevTxn.credit = Math.abs(nums[1] || 0);
            } else if (nums.length === 1) {
              prevTxn.credit = Math.abs(nums[0] || 0);
            }
          }

          if (colMap.balanceIdx !== -1 && row[colMap.balanceIdx] !== undefined && row[colMap.balanceIdx] !== '') {
            prevTxn.runningBalance = parseIndianAmount(row[colMap.balanceIdx]);
          } else {
            const nums = extractRowNumbers(row, [colMap.dateIdx]);
            if (nums.length >= 3) {
              prevTxn.runningBalance = nums[nums.length - 1];
            }
          }

          const textTokens = nonBlank.filter(c => {
            const clean = String(c).replace(/[,\s₹RsINR]/gi, '');
            return isNaN(parseFloat(clean)) || clean === '';
          });
          if (textTokens.length > 0) {
            prevTxn.narration += ' ' + textTokens.join(' ');
          }
        } else if (!hasMonetaryValues(row)) {
          // Case 2: Pure text continuation of previous narration
          prevTxn.narration += ' ' + nonBlank.join(' ');
        }
      }
      continue;
    }

    // Extract Narration
    let narration = '';
    if (colMap.narrationIdx !== -1 && row[colMap.narrationIdx]) {
      narration = String(row[colMap.narrationIdx]).trim();
    } else {
      // Fallback: pick the longest string cell
      let maxLen = 0;
      for (let i = 0; i < row.length; i++) {
        if (i === colMap.dateIdx || i === colMap.refNoIdx || i === colMap.debitIdx || i === colMap.creditIdx || i === colMap.balanceIdx) continue;
        const s = String(row[i] || '').trim();
        if (s.length > maxLen && isNaN(parseFloat(s.replace(/[,\s]/g, '')))) {
          maxLen = s.length;
          narration = s;
        }
      }
    }

    // Extract Ref/Cheque No
    let refNo = null;
    if (colMap.refNoIdx !== -1 && row[colMap.refNoIdx]) {
      const rawRef = String(row[colMap.refNoIdx]).trim();
      if (rawRef && rawRef !== '-' && rawRef !== '0') {
        refNo = rawRef;
      }
    }

    // Extract Debit & Credit
    let debit = 0;
    let credit = 0;

    if (colMap.debitIdx !== -1 && colMap.creditIdx !== -1) {
      // Separate debit and credit columns
      debit = parseIndianAmount(row[colMap.debitIdx]);
      credit = parseIndianAmount(row[colMap.creditIdx]);
    } else if (colMap.amountIdx !== -1) {
      // Single amount column with Type (Dr/Cr) column or signed value
      const rawAmt = parseIndianAmount(row[colMap.amountIdx]);
      const rawType = colMap.typeIdx !== -1 ? String(row[colMap.typeIdx] || '').trim().toUpperCase() : '';

      if (rawType.includes('CR') || rawType === 'CREDIT' || rawType === 'C' || rawType === '+') {
        credit = Math.abs(rawAmt);
      } else if (rawType.includes('DR') || rawType === 'DEBIT' || rawType === 'D' || rawType === '-') {
        debit = Math.abs(rawAmt);
      } else {
        // Sign-based: positive is credit, negative is debit
        if (rawAmt > 0) credit = rawAmt;
        else if (rawAmt < 0) debit = Math.abs(rawAmt);
      }
    } else {
      // Fallback: find numerical columns
      const nums = extractRowNumbers(row, [colMap.dateIdx, colMap.refNoIdx]);
      if (nums.length >= 2) {
        debit = nums[0];
        credit = nums[1];
      } else if (nums.length === 1) {
        credit = nums[0];
      }
    }

    // Extract Running Balance
    let runningBalance = null;
    if (colMap.balanceIdx !== -1 && row[colMap.balanceIdx] !== undefined && row[colMap.balanceIdx] !== '') {
      runningBalance = parseIndianAmount(row[colMap.balanceIdx]);
    } else {
      // Balance is often the last numerical column in the row
      const nums = extractRowNumbers(row, [colMap.dateIdx]);
      if (nums.length >= 3) {
        runningBalance = nums[nums.length - 1];
      }
    }

    normalizedRows.push({
      date: parsedDate,
      narration: narration || 'TRANSACTION',
      debit: Math.abs(debit || 0),
      credit: Math.abs(credit || 0),
      runningBalance: runningBalance !== null && !isNaN(runningBalance) ? runningBalance : null,
      refNo: refNo || null
    });
  }

  return normalizedRows;
}

/**
 * Identify Column Indices from Headers
 */
function mapHeadersToRoles(headers) {
  const map = {
    dateIdx: -1,
    valueDateIdx: -1,
    narrationIdx: -1,
    refNoIdx: -1,
    debitIdx: -1,
    creditIdx: -1,
    balanceIdx: -1,
    amountIdx: -1,
    typeIdx: -1
  };

  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || '').trim().toLowerCase();
    if (!h) continue;

    // Date
    if (map.dateIdx === -1 && /\b(txn\s*date|trans(?:action)?\s*date|posting\s*date)\b/i.test(h)) {
      map.dateIdx = i;
    } else if (map.valueDateIdx === -1 && /\bvalue\s*(?:date|dt)\b/i.test(h)) {
      map.valueDateIdx = i;
    } else if (map.dateIdx === -1 && /\bdate\b/i.test(h) && !/\bvalue\b/i.test(h)) {
      map.dateIdx = i;
    }
    // Narration / Particulars
    else if (map.narrationIdx === -1 && /\b(narration|particulars|description|remarks|transaction\s*details|details)\b/i.test(h)) {
      map.narrationIdx = i;
    }
    // Ref / Cheque No
    else if (map.refNoIdx === -1 && (/\b(chq|cheque|utr|instrument)\b/i.test(h) || /chq[./\s]*ref/i.test(h) || /\bref(?:\.|\s*no)?\b/i.test(h) || /\btran(?:\s*id)?\b/i.test(h))) {
      map.refNoIdx = i;
    }
    // Debit / Withdrawal
    else if (map.debitIdx === -1 && /\b(withdrawal|debit|dr(?:\.|\s*amt)?)\b/i.test(h)) {
      map.debitIdx = i;
    }
    // Credit / Deposit
    else if (map.creditIdx === -1 && /\b(deposit|credit|cr(?:\.|\s*amt)?)\b/i.test(h)) {
      map.creditIdx = i;
    }
    // Balance
    else if (map.balanceIdx === -1 && /\b(balance|closing\s*balance|running\s*balance|bal(?:\.|\s*amount)?)\b/i.test(h)) {
      map.balanceIdx = i;
    }
    // Single Amount
    else if (map.amountIdx === -1 && /\b(amount|txn\s*amount|trans\s*amt)\b/i.test(h)) {
      map.amountIdx = i;
    }
    // Type (Cr/Dr)
    else if (map.typeIdx === -1 && /\b(type|cr\/dr|dr\/cr|indicator|d\/c)\b/i.test(h)) {
      map.typeIdx = i;
    }
  }

  // If dateIdx was not matched strictly, try partial match
  if (map.dateIdx === -1) {
    map.dateIdx = headers.findIndex(h => /date/i.test(h));
  }

  return map;
}

/**
 * Fallback parser for plain unstructured text lines
 */
function parseUnstructuredTextLines(lines, warnings) {
  const transactions = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check if line starts with a date
    const dateMatch = line.match(/^(\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,}\s+\d{2,4}|\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) {
      // Continuation of previous narration if line has no financial numbers
      if (transactions.length > 0 && !/\b\d{1,3}(?:,\d{2,3})*\.\d{2}\b/.test(line)) {
        transactions[transactions.length - 1].narration += ' ' + line;
      }
      continue;
    }

    const parsedDate = parseFlexibleDate(dateMatch[1]);
    const remainder = line.substring(dateMatch[0].length).trim();

    // Extract monetary tokens at the end of the line (avoid matching inside alphanumeric codes)
    const numRegex = /(?<![a-zA-Z0-9])(?:[₹$€£])?\s*\(?-?\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?\)?\s*(?:Cr|Dr)?(?![a-zA-Z0-9])/gi;
    const matches = Array.from(remainder.matchAll(numRegex));

    if (matches.length === 0) {
      warnings.push(`Row dated ${parsedDate} had no recognizable monetary amounts: "${remainder.slice(0, 40)}..."`);
      continue;
    }

    // Narration is the text preceding the numbers
    const firstNumIdx = matches[0].index;
    const narration = remainder.substring(0, firstNumIdx).trim();

    const parsedNums = matches.map(m => parseIndianAmount(m[0]));

    let debit = 0;
    let credit = 0;
    let balance = null;
    let refNo = null;

    if (matches.length >= 4) {
      // Pattern: [chqNo, withdrawal, deposit, balance]
      const firstStr = matches[0][0].trim();
      if (/^\d{1,8}$/.test(firstStr)) {
        if (firstStr !== '0') refNo = firstStr;
        debit = parsedNums[1];
        credit = parsedNums[2];
        balance = parsedNums[3];
      } else {
        debit = parsedNums[0];
        credit = parsedNums[1];
        balance = parsedNums[2];
      }
    } else if (matches.length === 3) {
      // withdrawal, deposit, balance
      debit = parsedNums[0];
      credit = parsedNums[1];
      balance = parsedNums[2];
    } else if (matches.length === 2) {
      // amount, balance
      const rawText = matches[0][0].toUpperCase();
      if (rawText.includes('DR')) debit = Math.abs(parsedNums[0]);
      else if (rawText.includes('CR')) credit = Math.abs(parsedNums[0]);
      else credit = parsedNums[0];
      balance = parsedNums[1];
    } else if (matches.length === 1) {
      credit = parsedNums[0];
    }

    transactions.push({
      date: parsedDate,
      narration: narration || 'TRANSACTION',
      debit: Math.abs(debit || 0),
      credit: Math.abs(credit || 0),
      runningBalance: balance !== null && !isNaN(balance) ? balance : null,
      refNo
    });
  }

  return transactions;
}

/**
 * Filter, validate, and clean parsed transaction objects
 */
function parseTransactionRows(rows, warnings) {
  const result = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.date) {
      warnings.push(`Transaction row ${i + 1} skipped: missing valid transaction date.`);
      continue;
    }

    const debit = Math.round((Number(r.debit) || 0) * 100) / 100;
    const credit = Math.round((Number(r.credit) || 0) * 100) / 100;

    if (debit === 0 && credit === 0) {
      warnings.push(`Transaction on ${r.date} ("${r.narration.slice(0, 30)}") has ₹0 for both debit and credit.`);
    }

    result.push({
      date: r.date,
      narration: cleanNarration(r.narration),
      debit,
      credit,
      runningBalance: r.runningBalance !== null && !isNaN(r.runningBalance) ? Math.round(Number(r.runningBalance) * 100) / 100 : null,
      refNo: r.refNo ? String(r.refNo).trim() : null
    });
  }

  return result;
}

/**
 * Clean and compact narration strings
 */
function cleanNarration(text) {
  if (!text) return 'TRANSACTION';
  return String(text)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Validate running balance math and log warnings for discrepancy
 */
function validateRunningBalanceContinuity(transactions, openingBalance, warnings) {
  if (transactions.length < 2) return;

  let prevBal = openingBalance;

  for (let i = 0; i < transactions.length; i++) {
    const t = transactions[i];
    if (t.runningBalance === null) continue;

    if (prevBal !== null && !isNaN(prevBal)) {
      const expectedBal = Math.round((prevBal + t.credit - t.debit) * 100) / 100;
      const actualBal = Math.round(t.runningBalance * 100) / 100;
      const diff = Math.abs(expectedBal - actualBal);

      if (diff > 0.05) {
        warnings.push(`Balance mismatch on ${t.date} ("${t.narration.slice(0, 25)}..."): Expected ₹${expectedBal.toLocaleString('en-IN')}, found ₹${actualBal.toLocaleString('en-IN')} (Variance: ₹${diff.toFixed(2)}).`);
      }
    }
    prevBal = t.runningBalance;
  }
}

/**
 * Check if a row has any numbers
 */
function hasMonetaryValues(row) {
  for (const cell of row) {
    if (cell === null || cell === undefined) continue;
    const str = String(cell).trim();
    if (/\b\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?\b/.test(str)) return true;
  }
  return false;
}

/**
 * Extract numbers from row excluding specified indices
 */
function extractRowNumbers(row, excludeIndices = []) {
  const nums = [];
  for (let i = 0; i < row.length; i++) {
    if (excludeIndices.includes(i)) continue;
    const cell = row[i];
    if (cell === null || cell === undefined || cell === '') continue;
    const val = parseIndianAmount(cell);
    if (!isNaN(val) && val !== 0) {
      nums.push(val);
    }
  }
  return nums;
}

/**
 * Robust Indian Currency & Float Parser
 * Handles: '1,23,456.78', '123456.78', '(5,000.00)', '1,000.00 Dr', '₹ 50,000.00'
 */
export function parseIndianAmount(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = String(val).trim();

  // 1. Detect parentheses negative: (1,234.50)
  const isParenNegative = /^\(.*\)$/.test(str);

  // 2. Detect Dr/Cr suffix before stripping letters
  const isDr = /\bdr\.?$/i.test(str) || /dr\.?$/i.test(str);
  const isCr = /\bcr\.?$/i.test(str) || /cr\.?$/i.test(str);

  // 3. Strip currency symbols, letters, commas, parentheses, and spaces
  str = str.replace(/[₹$€£()]/g, '').replace(/[a-zA-Z\s,]/g, '').trim();

  const num = parseFloat(str);
  if (isNaN(num)) return 0;

  if (isParenNegative || isDr) {
    return -Math.abs(num);
  }
  if (isCr) {
    return Math.abs(num);
  }

  return num;
}

/**
 * Flexible Indian Date Parser
 * Handles:
 * - DD/MM/YYYY, DD/MM/YY
 * - DD-MM-YYYY, DD-MM-YY
 * - DD-MMM-YYYY, DD MMM YYYY (e.g. 01-Apr-2024, 15 Jan 2024)
 * - YYYY-MM-DD
 * - Excel Date Objects and Serial Numbers
 */
export function parseFlexibleDate(val) {
  if (!val) return null;

  // Handle JS Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().slice(0, 10);
  }

  // Handle Excel serial date (e.g. 45383 -> 2024-04-01)
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const targetDate = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(targetDate.getTime())) {
      return targetDate.toISOString().slice(0, 10);
    }
  }

  let str = String(val).trim();

  // 1. ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // 2. DD-MMM-YYYY or DD MMM YYYY (e.g. 01-Apr-2024, 15 Jan 2024, 3-Nov-23)
  const dMmmYMatch = str.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[-\s/](\d{2,4})$/);
  if (dMmmYMatch) {
    const day = dMmmYMatch[1].padStart(2, '0');
    const month = MONTH_MAP[dMmmYMatch[2].toLowerCase()];
    let year = dMmmYMatch[3];
    if (year.length === 2) {
      year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    }
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  // 3. DD/MM/YYYY or DD-MM-YYYY (Indian Standard)
  const dmyMatch = str.match(/^(\d{1,2})[-\/. ](\d{1,2})[-\/. ](\d{2,4})/);
  if (dmyMatch) {
    let p1 = parseInt(dmyMatch[1], 10);
    let p2 = parseInt(dmyMatch[2], 10);
    let year = dmyMatch[3];
    if (year.length === 2) {
      year = (parseInt(year, 10) > 50 ? '19' : '20') + year;
    }

    // Disambiguation: In India, first token is almost always Day
    let day = p1;
    let month = p2;

    // If month > 12 but day <= 12, swap
    if (month > 12 && day <= 12) {
      const temp = day;
      day = month;
      month = temp;
    }

    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

/**
 * Extract Bank Name from text (Zero-Fabrication Guarantee)
 */
function extractBankName(text) {
  if (!text) return null;
  for (const b of KNOWN_INDIAN_BANKS) {
    if (b.pattern.test(text)) {
      return b.name;
    }
  }
  return null;
}

/**
 * Extract Account Number from header
 */
function extractAccountNumber(text) {
  if (!text) return null;
  const match = text.match(/(?:Account|A\/c|Acct)\s*(?:No\.?|Number|#)?\s*[:\-]?\s*([X\*\d]{8,20})/i);
  if (match) {
    return match[1].trim();
  }
  return null;
}

/**
 * Extract IFSC Code
 */
function extractIFSC(text) {
  if (!text) return null;
  const match = text.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}

/**
 * Extract Account Type (Current, Savings, Overdraft, Cash Credit)
 */
function extractAccountType(text) {
  if (!text) return null;
  if (/\bCURRENT\s*(?:ACCOUNT|A\/C)?\b/i.test(text)) return 'CURRENT';
  if (/\bSAVINGS\s*(?:ACCOUNT|A\/C|BANK)?\b/i.test(text)) return 'SAVINGS';
  if (/\b(?:OVERDRAFT|OD\s*A\/C)\b/i.test(text)) return 'OVERDRAFT';
  if (/\bCASH\s*CREDIT\b/i.test(text)) return 'CASH_CREDIT';
  return null;
}

/**
 * Extract labeled balance (e.g. Opening Balance: 15,000.00)
 */
function extractLabeledBalance(text, pattern) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (pattern.test(line)) {
      const numMatch = line.match(/(?:[₹$€£RsINR\s])?\(?-?\d{1,3}(?:,\d{2,3})*(?:\.\d{2})?\)?/gi);
      if (numMatch) {
        for (const m of numMatch) {
          const val = parseIndianAmount(m);
          if (val !== 0) return val;
        }
      }
    }
  }
  return null;
}
