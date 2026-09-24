import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { parseTdsDocument } from './tdsIngestionEngine.js';
import { extractTdsBookEntries } from './tdsBookEntryExtractor.js';

// Search directories for TDS documents (standard project directories, configurable via TDS_DATA_DIR)
const SEARCH_DIRS = [
  ...(process.env.TDS_DATA_DIR ? [path.resolve(process.env.TDS_DATA_DIR)] : []),
  path.resolve(process.cwd(), 'data'),
  path.resolve(process.cwd(), 'uploads'),
  process.cwd()
].filter(Boolean);

/**
 * Automatically locate and ingest Form 26AS and Book Ledger files for a given TAN or entity
 */
export async function findAndLoadTdsDocumentsForTan(tanInput) {
  const cleanTan = String(tanInput || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

  let portalFile = null;
  let bookFile = null;
  let detectedEntityName = null;

  const portalCandidates = [];
  const bookCandidates = [];

  // Traverse directories to find TDS candidate files
  function scan(dir, depth = 0) {
    if (depth > 4 || !fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const ent of entries) {
        const fullPath = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          if (!/node_modules|\.git|dist|build/i.test(ent.name)) {
            scan(fullPath, depth + 1);
          }
        } else if (/\.(xlsx|xls|xlsm|csv|pdf)$/i.test(ent.name)) {
          const lower = ent.name.toLowerCase();
          const dirLower = dir.toLowerCase();

          // Exclude generated reports, test mocks, and non-TDS registers
          if (
            dirLower.includes('generated_files') ||
            ent.name.startsWith('test_') ||
            ent.name.startsWith('sample_') ||
            lower.startsWith('tds_reconciliation_') ||
            lower.includes('purchase as per books') ||
            lower.includes('gstr2b') ||
            lower.includes('gstr1')
          ) {
            continue;
          }

          // If filename explicitly declares a 10-character TAN that contradicts requested TAN, reject it
          const candidateTanMatch = ent.name.match(/\b([A-Z]{4}[0-9]{5}[A-Z])\b/i);
          if (candidateTanMatch && cleanTan.length === 10 && candidateTanMatch[1].toUpperCase() !== cleanTan) {
            continue;
          }

          const hasTanInName = cleanTan.length >= 4 && lower.includes(cleanTan.toLowerCase());
          const isTds = lower.includes('tds') || lower.includes('26as') || lower.includes('traces') || lower.includes('ais') || lower.includes('16a');
          const isBook = lower.includes('receivable') || lower.includes('payable') || lower.includes('ledger');

          // Portal Scoring
          let pScore = 0;
          if (hasTanInName) pScore += 100;
          if (lower.includes('26as') || lower.includes('traces') || lower.includes('ais')) pScore += 50;
          if (lower.endsWith('.xlsm') && isTds) pScore += 55; // Winman CA-ERP TDS export
          if (isTds && !isBook && !lower.includes('receivable')) pScore += 30;
          if (dirLower.includes('tds')) pScore += 25;
          if (isBook || lower.includes('receivable') || lower.includes('payable')) pScore -= 80;

          if (pScore > 10) {
            portalCandidates.push({ filename: ent.name, fullPath, score: pScore });
          }

          // Book Scoring
          let bScore = 0;
          if (hasTanInName && isBook) bScore += 100;
          if (lower.includes('tds receivables') || lower.includes('tds receivable')) bScore += 70;
          if (isTds && (isBook || lower.includes('ledger'))) bScore += 50;
          if (dirLower.includes('tds') && lower.includes('receivable')) bScore += 40;
          if (dirLower.includes('tds') && isBook) bScore += 30;
          if (lower.includes('26as') || lower.includes('traces') || lower.endsWith('.xlsm')) bScore -= 50;

          if (bScore > 10) {
            bookCandidates.push({ filename: ent.name, fullPath, score: bScore });
          }
        }
      }
    } catch (err) {
      // Ignore read errors
    }
  }

  for (const baseDir of SEARCH_DIRS) {
    scan(baseDir);
  }

  portalCandidates.sort((a, b) => b.score - a.score);
  bookCandidates.sort((a, b) => b.score - a.score);

  portalFile = portalCandidates[0] || null;
  bookFile = bookCandidates[0] || null;

  if (!portalFile && !bookFile) {
    return {
      success: false,
      found: false,
      message: `No TDS statement or ledger files found in data repository for TAN ${cleanTan || '[empty]'}.`
    };
  }

  let sourceResult = null;
  let booksResult = null;

  // 1. Parse Portal File if found
  if (portalFile) {
    const buf = fs.readFileSync(portalFile.fullPath);
    const mime = portalFile.filename.endsWith('.xlsm') 
      ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
      : (portalFile.filename.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    sourceResult = await parseTdsDocument(buf, portalFile.filename, mime);
  }

  // 2. Parse Books File if found
  if (bookFile) {
    const buf = fs.readFileSync(bookFile.fullPath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    // Multi-sheet scoring to find transaction ledger
    let bestSheet = wb.SheetNames[0];
    let maxScore = -1;
    let bestRows = [];
    let bestHeaderIdx = -1;

    for (const sName of wb.SheetNames) {
      if (/^(?:help|instructions|enable\s*macros|read\s*me|inter)$/i.test(sName)) continue;
      const s = wb.Sheets[sName];
      const rList = XLSX.utils.sheet_to_json(s, { header: 1, defval: '' });
      if (rList.length < 2) continue;

      let score = 0;
      let hIdx = -1;
      for (let r = 0; r < Math.min(15, rList.length); r++) {
        const row = rList[r].map(c => String(c).trim().toLowerCase());
        const nonBlank = row.filter(Boolean).length;
        if (nonBlank < 2) continue;
        if (row.some(c => /^account\s*:/i.test(c) || /^report\s*(?:from|to)/i.test(c))) continue;

        const hasDate = row.some(c => c.includes('date'));
        const hasParty = row.some(c => c.includes('particular') || c.includes('narration') || c.includes('ledger') || c.includes('party') || c.includes('row labels') || c.includes('name'));
        const hasDebitCredit = row.some(c => c.includes('debit') || c.includes('credit') || c.includes('sum of debit') || c === 'amount' || c.includes('tds'));

        if (hasParty && hasDebitCredit) {
          hIdx = r;
          score = 10 + nonBlank * 2 + (hasDate ? 25 : 0) + (rList.length > 50 ? 20 : 0);
          break;
        }
      }

      if (score > maxScore) {
        maxScore = score;
        bestSheet = sName;
        bestRows = rList;
        bestHeaderIdx = hIdx;
      }
    }

    if (bestHeaderIdx === -1 && wb.SheetNames.length > 0) {
      bestSheet = wb.SheetNames[0];
      bestRows = XLSX.utils.sheet_to_json(wb.Sheets[bestSheet], { header: 1, defval: '' });
      bestHeaderIdx = 0;
    }

    const headers = bestRows[bestHeaderIdx].map(h => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
    const dateCol = headers.findIndex(h => h.includes('date'));
    const docNoCol = headers.findIndex(h => h.includes('docno') || h.includes('vchno') || h.includes('refno') || h.includes('ref'));
    const vchTypeCol = headers.findIndex(h => h.includes('vchtype') || h.includes('type'));
    const partyCol = headers.findIndex(h => h.includes('narration') || h.includes('particular') || h.includes('ledger') || h.includes('party') || h.includes('rowlabels') || h.includes('name'));
    const debitCol = headers.findIndex(h => h === 'debit' || h.includes('debit') || h.includes('dr'));
    const creditCol = headers.findIndex(h => h === 'credit' || h.includes('credit') || h.includes('cr'));
    const amountCol = headers.findIndex(h => h === 'amount' || h.includes('amount') || h.includes('tds'));
    const tanCol = headers.findIndex(h => h.includes('tan') || h.includes('pan'));
    const secCol = headers.findIndex(h => h.includes('sec'));

    const rawItems = [];
    for (let r = bestHeaderIdx + 1; r < bestRows.length; r++) {
      const row = bestRows[r];
      if (!row || row.length === 0) continue;

      const rawLabel = partyCol !== -1 ? String(row[partyCol] || '').trim() : String(row[0] || '').trim();
      if (!rawLabel || /^(?:total|grand total|opening balance|closing balance)/i.test(rawLabel)) continue;

      const debitVal = debitCol !== -1 ? (parseFloat(String(row[debitCol]).replace(/[^0-9\.-]/g, '')) || 0) : 0;
      const creditVal = creditCol !== -1 ? (parseFloat(String(row[creditCol]).replace(/[^0-9\.-]/g, '')) || 0) : 0;
      const amountVal = amountCol !== -1 ? (parseFloat(String(row[amountCol]).replace(/[^0-9\.-]/g, '')) || 0) : (debitVal || creditVal);

      if (debitVal === 0 && creditVal === 0 && amountVal === 0) continue;

      const cleanParty = rawLabel
        .replace(/\s*TDS\s*TDS.*$/i, '')
        .replace(/\s*TDS\s*-\s*ACT.*$/i, '')
        .replace(/\s*-\s*ACT\.\s*RECD.*$/i, '')
        .replace(/\s*TDS.*$/i, '')
        .trim();

      rawItems.push({
        label: rawLabel,
        partyName: cleanParty || rawLabel,
        accountHead: rawLabel,
        date: dateCol !== -1 ? String(row[dateCol] || '').trim() : null,
        refNo: docNoCol !== -1 ? String(row[docNoCol] || '').trim() : null,
        voucherType: vchTypeCol !== -1 ? String(row[vchTypeCol] || '').trim() : null,
        debit: debitVal,
        credit: creditVal,
        amount: amountVal,
        type: debitVal > 0 ? 'RECEIVABLE' : (creditVal > 0 ? 'PAYABLE' : 'RECEIVABLE'),
        tan: tanCol !== -1 ? String(row[tanCol] || '').replace(/\s+/g, '').toUpperCase() : null,
        section: secCol !== -1 ? String(row[secCol] || '').trim().toUpperCase() : null
      });
    }

    // Extract genuine entity name from metadata rows preceding the transaction header
    if (!detectedEntityName) {
      for (let r = 0; r < Math.min(bestHeaderIdx > 0 ? bestHeaderIdx : 5, bestRows.length); r++) {
        const row = bestRows[r];
        if (!row || !Array.isArray(row)) continue;
        const firstCol = String(row[0] || '').trim();
        if (/^(?:company|client|entity|assessee)\s*:\s*(.+)/i.test(firstCol)) {
          const m = firstCol.match(/^(?:company|client|entity|assessee)\s*:\s*(.+)/i);
          if (m && m[1]) {
            detectedEntityName = m[1].trim();
            break;
          }
        } else if (
          r === 0 &&
          firstCol.length > 3 &&
          firstCol.length < 100 &&
          !/report|ledger|account|date|balance|period|sheet/i.test(firstCol) &&
          /(?:pvt|ltd|limited|llp|inc|corp|co|associates|jewel|systems|enterprises|solutions|technologies|industries)/i.test(firstCol)
        ) {
          detectedEntityName = firstCol;
          break;
        }
      }
    }

    const bookExtraction = extractTdsBookEntries(rawItems);
    booksResult = {
      filename: bookFile.filename,
      entries: bookExtraction.entries,
      summary: bookExtraction.summary
    };
  }

  // Fallback to portal file hints if ledger metadata did not provide entity name
  if (!detectedEntityName && portalFile?.filename) {
    const nameMatch = portalFile.filename.match(/^([^_]+)_(?:TDS|26AS|AIS)/i);
    if (nameMatch && nameMatch[1] && nameMatch[1].length > 3) {
      detectedEntityName = nameMatch[1].replace(/[\._]/g, ' ').trim();
    }
  }

  // If no entity name could be detected from actual files, set honest fallback
  if (!detectedEntityName) {
    detectedEntityName = 'Entity Name Not Detected — Please Verify';
  }

  // Post-selection content-level TAN verification
  let tanVerified = false;
  let tanVerificationWarning = null;

  if (cleanTan && cleanTan.length === 10) {
    const inPortalDeductors = sourceResult?.deductorTANs?.includes(cleanTan);
    const inBookEntries = booksResult?.entries?.some(e => e.tan === cleanTan);
    const inPortalFile = portalFile?.filename?.toUpperCase().includes(cleanTan);
    const inBookFile = bookFile?.filename?.toUpperCase().includes(cleanTan);

    if (inPortalDeductors || inBookEntries || inPortalFile || inBookFile) {
      tanVerified = true;
    } else {
      tanVerified = false;
      tanVerificationWarning = `Warning: Requested TAN "${cleanTan}" was not directly referenced in deductor returns or book transactions. Please verify that loaded files (${portalFile?.filename || 'None'}, ${bookFile?.filename || 'None'}) correspond to this entity.`;
    }
  } else {
    tanVerified = true;
  }

  return {
    success: true,
    found: true,
    tan: cleanTan,
    tanVerified,
    tanVerificationWarning,
    entityName: detectedEntityName,
    portalFile: portalFile?.filename,
    bookFile: bookFile?.filename,
    source: sourceResult ? {
      filename: portalFile.filename,
      sourceType: sourceResult.sourceType,
      entries: sourceResult.entries,
      summary: sourceResult.summary
    } : null,
    books: booksResult
  };
}
