/**
 * Bank Reconciliation Statement (BRS) Excel Exporter
 * Generates an ICAI-compliant audit workbook with:
 * 1. "Bank Reconciliation Statement": Standard BRS format reconciling Book Balance to Bank Statement.
 * 2. "Exceptions": All Unmatched-in-Books and Unmatched-in-Bank items sorted by amount descending.
 * 3. "Matched Transactions": Full audit trail of verified transaction pairs.
 */

import ExcelJS from 'exceljs';

const PRIMARY_NAVY = '1E3A8A';
const SECONDARY_SLATE = '334155';
const HEADER_DARK = '1F2937';
const EMERALD_GREEN = '059669';
const AMBER_YELLOW = 'D97706';
const ROSE_RED = 'DC2626';
const LIGHT_BG = 'F8FAFC';
const BORDER_GRAY = 'D1D5DB';

/**
 * Format a number as Indian currency with 2 decimals
 */
function roundTo2(val) {
  return Math.round((val || 0) * 100) / 100;
}

/**
 * Apply thin borders to a set of column letters in a row
 */
function applyBorders(row, cols = []) {
  cols.forEach(c => {
    row.getCell(c).border = {
      top: { style: 'thin', color: { argb: BORDER_GRAY } },
      left: { style: 'thin', color: { argb: BORDER_GRAY } },
      bottom: { style: 'thin', color: { argb: BORDER_GRAY } },
      right: { style: 'thin', color: { argb: BORDER_GRAY } }
    };
  });
}

/**
 * Apply double-underline accounting total border
 */
function applyTotalBorders(row, cols = []) {
  cols.forEach(c => {
    row.getCell(c).border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'double', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: BORDER_GRAY } },
      right: { style: 'thin', color: { argb: BORDER_GRAY } }
    };
  });
}

/**
 * Main function: Generates ExcelJS Workbook for Bank Reconciliation
 * 
 * @param {Object} reconResult - Output of runBankReconciliation
 * @param {Object} [metadata] - Statement and entity metadata
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function createBankReconciliationWorkbook(reconResult, metadata = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Local AI Financial Bot - Bank Reconciliation Engine';
  workbook.created = new Date();

  const { summary = {}, matched = [], unmatchedInBooks = [], unmatchedInBank = [], auditReport = [] } = reconResult;
  const bankName = metadata.bankName || '[Bank Name Not Specified]';
  const accountNumber = metadata.accountNumber || '';
  const entityName = metadata.companyName || metadata.entityName || '[Entity Not Specified - Needs Input]';
  const asOnDate = metadata.asOnDate || summary.statementPeriod?.to || new Date().toISOString().split('T')[0];

  // =========================================================================
  // SHEET 1: BANK RECONCILIATION STATEMENT (BRS)
  // =========================================================================
  const wsBrs = workbook.addWorksheet('Bank Reconciliation Statement', { views: [{ showGridLines: true }] });
  wsBrs.columns = [
    { width: 4 },   // A: Margin
    { width: 50 },  // B: Particulars / Description
    { width: 18 },  // C: Ref / Notes
    { width: 22 },  // D: Amount (Inner)
    { width: 24 }   // E: Amount (Net / Total)
  ];

  // 1. Report Title Block
  wsBrs.mergeCells('B2:E2');
  const titleCell = wsBrs.getCell('B2');
  titleCell.value = 'BANK RECONCILIATION STATEMENT';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY_NAVY } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsBrs.getRow(2).height = 36;

  // Subtitle
  wsBrs.mergeCells('B3:E3');
  const subCell = wsBrs.getCell('B3');
  subCell.value = `${entityName} | ${bankName}${accountNumber ? ` (A/c No: ${accountNumber})` : ''} | As on: ${asOnDate}`;
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsBrs.getRow(3).height = 20;

  // Table Headers
  const rHeader = wsBrs.getRow(5);
  rHeader.height = 26;
  ['Particulars', 'Audit Head', 'Details (₹)', 'Net Amount (₹)'].forEach((h, i) => {
    const col = ['B', 'C', 'D', 'E'][i];
    const cell = rHeader.getCell(col);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
    cell.alignment = { vertical: 'middle', horizontal: i >= 2 ? 'right' : 'left' };
  });

  let curRow = 6;

  // 1. Starting Balance: Balance as per Books
  const rStart = wsBrs.getRow(curRow);
  rStart.height = 22;
  rStart.getCell('B').value = 'Balance as per Books (Cash / Bank Book)';
  rStart.getCell('B').font = { bold: true };
  rStart.getCell('C').value = 'Opening/Computed';
  rStart.getCell('E').value = summary.bookBalance || 0;
  rStart.getCell('E').numFmt = '₹#,##0.00';
  rStart.getCell('E').font = { bold: true };
  applyBorders(rStart, ['B', 'C', 'D', 'E']);
  curRow++;

  // 2. ADD SECTION
  const rAddHeader = wsBrs.getRow(curRow);
  rAddHeader.height = 22;
  wsBrs.mergeCells(`B${curRow}:E${curRow}`);
  rAddHeader.getCell('B').value = 'ADD: Timing Differences & Direct Adjustments';
  rAddHeader.getCell('B').font = { bold: true, color: { argb: 'FF1E3A8A' } };
  rAddHeader.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
  curRow++;

  // Add Item A: Cheques issued but not presented for payment
  const rAdd1 = wsBrs.getRow(curRow);
  rAdd1.getCell('B').value = '• Cheques issued to suppliers but not yet presented for payment (Unpresented Cheques)';
  rAdd1.getCell('C').value = `${unmatchedInBank.filter(i => i.direction === 'WITHDRAWAL').length} item(s)`;
  rAdd1.getCell('D').value = summary.totals?.unmatchedInBankCredit || 0;
  rAdd1.getCell('D').numFmt = '₹#,##0.00';
  applyBorders(rAdd1, ['B', 'C', 'D', 'E']);
  curRow++;

  // Add Item B: Direct deposits / interest credited by bank not yet in books
  const rAdd2 = wsBrs.getRow(curRow);
  rAdd2.getCell('B').value = '• Direct customer remittances & interest credited by bank not yet recorded in Cash Book';
  rAdd2.getCell('C').value = `${unmatchedInBooks.filter(i => i.direction === 'DEPOSIT').length} item(s)`;
  rAdd2.getCell('D').value = summary.totals?.unmatchedInBooksCredit || 0;
  rAdd2.getCell('D').numFmt = '₹#,##0.00';
  applyBorders(rAdd2, ['B', 'C', 'D', 'E']);
  curRow++;

  // Subtotal Additions
  const totalAdditions = (summary.totals?.unmatchedInBankCredit || 0) + (summary.totals?.unmatchedInBooksCredit || 0);
  const rAddSub = wsBrs.getRow(curRow);
  rAddSub.getCell('B').value = 'Sub-Total Additions';
  rAddSub.getCell('B').font = { bold: true, italic: true };
  rAddSub.getCell('E').value = totalAdditions;
  rAddSub.getCell('E').numFmt = '₹#,##0.00';
  rAddSub.getCell('E').font = { bold: true, color: { argb: EMERALD_GREEN } };
  applyBorders(rAddSub, ['B', 'C', 'D', 'E']);
  curRow++;

  // 3. LESS SECTION
  const rLessHeader = wsBrs.getRow(curRow);
  rLessHeader.height = 22;
  wsBrs.mergeCells(`B${curRow}:E${curRow}`);
  rLessHeader.getCell('B').value = 'LESS: Deductions & In-Transit Deposits';
  rLessHeader.getCell('B').font = { bold: true, color: { argb: 'FF991B1B' } };
  rLessHeader.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
  curRow++;

  // Less Item A: Cheques deposited but not cleared (Deposits in transit)
  const rLess1 = wsBrs.getRow(curRow);
  rLess1.getCell('B').value = '• Cheques deposited into bank but not yet credited / cleared (Deposits in Transit)';
  rLess1.getCell('C').value = `${unmatchedInBank.filter(i => i.direction === 'DEPOSIT').length} item(s)`;
  rLess1.getCell('D').value = summary.totals?.unmatchedInBankDebit || 0;
  rLess1.getCell('D').numFmt = '₹#,##0.00';
  applyBorders(rLess1, ['B', 'C', 'D', 'E']);
  curRow++;

  // Less Item B: Bank charges and direct debits not yet booked
  const rLess2 = wsBrs.getRow(curRow);
  rLess2.getCell('B').value = '• Bank charges, taxes, and auto-debits not yet booked in Cash Book';
  rLess2.getCell('C').value = `${unmatchedInBooks.filter(i => i.direction === 'WITHDRAWAL').length} item(s)`;
  rLess2.getCell('D').value = summary.totals?.unmatchedInBooksDebit || 0;
  rLess2.getCell('D').numFmt = '₹#,##0.00';
  applyBorders(rLess2, ['B', 'C', 'D', 'E']);
  curRow++;

  // Subtotal Deductions
  const totalDeductions = (summary.totals?.unmatchedInBankDebit || 0) + (summary.totals?.unmatchedInBooksDebit || 0);
  const rLessSub = wsBrs.getRow(curRow);
  rLessSub.getCell('B').value = 'Sub-Total Deductions';
  rLessSub.getCell('B').font = { bold: true, italic: true };
  rLessSub.getCell('E').value = -totalDeductions;
  rLessSub.getCell('E').numFmt = '(₹#,##0.00)';
  rLessSub.getCell('E').font = { bold: true, color: { argb: ROSE_RED } };
  applyBorders(rLessSub, ['B', 'C', 'D', 'E']);
  curRow++;

  // 4. RECONCILED BANK BALANCE
  const rReconciled = wsBrs.getRow(curRow);
  rReconciled.height = 24;
  rReconciled.getCell('B').value = 'Reconciled Balance as per Bank Statement';
  rReconciled.getCell('B').font = { bold: true };
  rReconciled.getCell('C').value = 'Reconciled Total';
  rReconciled.getCell('E').value = summary.reconciledBalance || 0;
  rReconciled.getCell('E').numFmt = '₹#,##0.00';
  rReconciled.getCell('E').font = { bold: true, size: 11, color: { argb: PRIMARY_NAVY } };
  applyBorders(rReconciled, ['B', 'C', 'D', 'E']);
  curRow++;

  // 5. ACTUAL BANK BALANCE PER PASSBOOK
  const rActual = wsBrs.getRow(curRow);
  rActual.height = 24;
  rActual.getCell('B').value = 'Balance as per Bank Statement (Passbook)';
  rActual.getCell('B').font = { bold: true };
  rActual.getCell('C').value = 'Passbook Final';
  rActual.getCell('E').value = summary.bankBalance || 0;
  rActual.getCell('E').numFmt = '₹#,##0.00';
  rActual.getCell('E').font = { bold: true, size: 11 };
  applyBorders(rActual, ['B', 'C', 'D', 'E']);
  curRow++;

  // 6. NET VARIANCE (DOUBLE-UNDERLINED)
  const rVariance = wsBrs.getRow(curRow);
  rVariance.height = 26;
  rVariance.getCell('B').value = summary.isReconciled ? 'Net Variance / Discrepancy (100% Reconciled)' : 'Unreconciled Variance (Investigation Required)';
  rVariance.getCell('B').font = { bold: true, color: { argb: summary.isReconciled ? EMERALD_GREEN : ROSE_RED } };
  rVariance.getCell('C').value = summary.isReconciled ? 'BALANCED' : 'VARIANCE';
  rVariance.getCell('C').font = { bold: true, color: { argb: summary.isReconciled ? EMERALD_GREEN : ROSE_RED } };
  rVariance.getCell('E').value = summary.netVariance || 0;
  rVariance.getCell('E').numFmt = '₹#,##0.00';
  rVariance.getCell('E').font = { bold: true, size: 11, color: { argb: summary.isReconciled ? EMERALD_GREEN : ROSE_RED } };
  applyTotalBorders(rVariance, ['B', 'C', 'D', 'E']);
  curRow += 2;

  // 7. STATUTORY CA OBSERVATIONS BLOCK
  const rObsHeader = wsBrs.getRow(curRow);
  wsBrs.mergeCells(`B${curRow}:E${curRow}`);
  rObsHeader.getCell('B').value = 'STATUTORY CHARTERED ACCOUNTANT OBSERVATIONS & AUDIT REPORT';
  rObsHeader.getCell('B').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rObsHeader.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECONDARY_SLATE } };
  curRow++;

  (auditReport.length > 0 ? auditReport : [
    summary.isReconciled ? '✅ Bank statement reconciled with Cash Book with zero variance.' : '⚠️ Variance detected.'
  ]).forEach(note => {
    const rNote = wsBrs.getRow(curRow);
    wsBrs.mergeCells(`B${curRow}:E${curRow}`);
    rNote.getCell('B').value = note;
    rNote.getCell('B').font = { name: 'Calibri', size: 10, italic: true };
    rNote.getCell('B').alignment = { vertical: 'middle', horizontal: 'left' };
    applyBorders(rNote, ['B', 'C', 'D', 'E']);
    curRow++;
  });


  // =========================================================================
  // SHEET 2: EXCEPTIONS (UNMATCHED-IN-BOOKS & UNMATCHED-IN-BANK)
  // Sorted by Amount Descending
  // =========================================================================
  const wsExceptions = workbook.addWorksheet('Exceptions', { views: [{ showGridLines: true }] });
  wsExceptions.columns = [
    { width: 8 },   // A: Sl No
    { width: 28 },  // B: Exception Category / Source
    { width: 14 },  // C: Date
    { width: 18 },  // D: Ref / Cheque No
    { width: 42 },  // E: Narration / Particulars
    { width: 14 },  // F: Direction (Dr/Cr)
    { width: 20 },  // G: Amount (₹)
    { width: 28 },  // H: Statutory Bucket
    { width: 46 }   // I: Audit Observation / Action
  ];

  // Header Title
  wsExceptions.mergeCells('A2:I2');
  const exTitle = wsExceptions.getCell('A2');
  exTitle.value = 'BANK RECONCILIATION - EXCEPTIONS & UNMATCHED ITEMS';
  exTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  exTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSE_RED } };
  exTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  wsExceptions.getRow(2).height = 32;

  // Subtitle
  wsExceptions.mergeCells('A3:I3');
  const exSub = wsExceptions.getCell('A3');
  exSub.value = 'All Unmatched Transactions sorted by Amount Descending (Largest discrepancies first) for statutory audit review.';
  exSub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };
  exSub.alignment = { vertical: 'middle', horizontal: 'center' };

  // Table Column Headers
  const exHeaders = [
    'Sl No', 'Exception Source', 'Date', 'Ref / Cheque', 
    'Narration / Particulars', 'Direction', 'Amount (₹)', 
    'Statutory Category', 'Auditor Recommendation / Action'
  ];
  const rExHeader = wsExceptions.getRow(5);
  rExHeader.height = 24;
  exHeaders.forEach((h, idx) => {
    const colLetter = String.fromCharCode(65 + idx); // A, B, C, ...
    const cell = rExHeader.getCell(colLetter);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
    cell.alignment = { vertical: 'middle', horizontal: idx === 6 ? 'right' : 'center' };
  });

  // Combine Unmatched-in-Books and Unmatched-in-Bank into one consolidated exceptions array
  const consolidatedExceptions = [];

  for (const b of unmatchedInBooks) {
    consolidatedExceptions.push({
      source: 'Unmatched in Books (Bank Statement)',
      date: b.date || '',
      refNo: b.refNo || b.canonicalRef || '—',
      narration: b.narration || '',
      direction: b.direction === 'WITHDRAWAL' ? 'Withdrawal (Dr)' : 'Deposit (Cr)',
      amount: b.amount || (b.amountPaise ? b.amountPaise / 100 : 0),
      category: b.suggestedCategory || 'UNRECORDED_BANK_TX',
      note: b.statutoryNote || 'Appears in Bank Statement but not entered in Cash/Bank Book.'
    });
  }

  for (const bk of unmatchedInBank) {
    consolidatedExceptions.push({
      source: 'Unmatched in Bank (Cash Book)',
      date: bk.date || '',
      refNo: bk.refNo || bk.canonicalRef || '—',
      narration: bk.label || bk.narration || '',
      direction: bk.direction === 'WITHDRAWAL' ? 'Payment (Cr)' : 'Receipt (Dr)',
      amount: bk.amount || (bk.amountPaise ? bk.amountPaise / 100 : 0),
      category: bk.suggestedCategory || (bk.direction === 'WITHDRAWAL' ? 'CHEQUE_ISSUED_NOT_PRESENTED' : 'CHEQUE_DEPOSITED_NOT_CLEARED'),
      note: bk.statutoryNote || (bk.direction === 'WITHDRAWAL' ? 'Cheque issued to party; pending clearance by bank.' : 'Cheque received/deposited; transit credit pending.')
    });
  }

  // CRITICAL REQUIREMENT: Sort by Amount Descending so largest discrepancies are visible first!
  consolidatedExceptions.sort((a, b) => (b.amount || 0) - (a.amount || 0));

  // Write rows
  let exRowIdx = 6;
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];

  consolidatedExceptions.forEach((ex, idx) => {
    const row = wsExceptions.getRow(exRowIdx);
    row.height = 20;

    row.getCell('A').value = idx + 1;
    row.getCell('A').alignment = { horizontal: 'center' };

    row.getCell('B').value = ex.source;
    row.getCell('B').font = { 
      bold: true, 
      color: { argb: ex.source.includes('Bank Statement') ? 'FF2563EB' : 'FF7C3AED' } 
    };

    row.getCell('C').value = ex.date;
    row.getCell('C').alignment = { horizontal: 'center' };

    row.getCell('D').value = ex.refNo;
    row.getCell('D').alignment = { horizontal: 'center' };

    row.getCell('E').value = ex.narration;

    row.getCell('F').value = ex.direction;
    row.getCell('F').alignment = { horizontal: 'center' };

    row.getCell('G').value = ex.amount;
    row.getCell('G').numFmt = '₹#,##0.00';
    row.getCell('G').font = { bold: true };
    row.getCell('G').alignment = { horizontal: 'right' };

    row.getCell('H').value = ex.category;
    row.getCell('H').font = { italic: true };

    row.getCell('I').value = ex.note;

    applyBorders(row, cols);
    exRowIdx++;
  });

  // If no exceptions
  if (consolidatedExceptions.length === 0) {
    const row = wsExceptions.getRow(6);
    wsExceptions.mergeCells('A6:I6');
    row.getCell('A').value = 'No exceptions found. 100% of transactions were successfully matched.';
    row.getCell('A').font = { bold: true, color: { argb: EMERALD_GREEN } };
    row.getCell('A').alignment = { horizontal: 'center' };
    applyBorders(row, cols);
  }

  // Auto-filter
  wsExceptions.autoFilter = `A5:I${Math.max(6, exRowIdx - 1)}`;


  // =========================================================================
  // SHEET 3: MATCHED TRANSACTIONS (AUDIT TRAIL)
  // =========================================================================
  const wsMatched = workbook.addWorksheet('Matched Transactions', { views: [{ showGridLines: true }] });
  wsMatched.columns = [
    { width: 8 },   // A: Sl No
    { width: 14 },  // B: Date
    { width: 38 },  // C: Bank Narration
    { width: 38 },  // D: Book Particulars
    { width: 18 },  // E: Ref / Cheque No
    { width: 20 },  // F: Amount (₹)
    { width: 14 },  // G: Transit (Days)
    { width: 16 },  // H: Match Tier
    { width: 16 },  // I: Confidence
    { width: 44 }   // J: Audit Remarks
  ];

  // Header Title
  wsMatched.mergeCells('A2:J2');
  const mTitle = wsMatched.getCell('A2');
  mTitle.value = 'BANK RECONCILIATION - VERIFIED MATCHED TRANSACTIONS';
  mTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  mTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EMERALD_GREEN } };
  mTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  wsMatched.getRow(2).height = 32;

  // Subtitle
  wsMatched.mergeCells('A3:J3');
  const mSub = wsMatched.getCell('A3');
  mSub.value = `Verified transaction pairs reconciled using Two-Pass Matching with Exact Paise precision.`;
  mSub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };
  mSub.alignment = { vertical: 'middle', horizontal: 'center' };

  // Headers
  const mHeaders = [
    'Sl No', 'Date', 'Bank Narration', 'Book Particulars', 
    'Ref / Cheque', 'Amount (₹)', 'Transit Days', 'Match Tier', 
    'Confidence', 'Audit Remarks'
  ];
  const rMHeader = wsMatched.getRow(5);
  rMHeader.height = 24;
  mHeaders.forEach((h, idx) => {
    const colLetter = String.fromCharCode(65 + idx);
    const cell = rMHeader.getCell(colLetter);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
    cell.alignment = { vertical: 'middle', horizontal: idx === 5 ? 'right' : 'center' };
  });

  let mRowIdx = 6;
  const mCols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  matched.forEach((m, idx) => {
    const row = wsMatched.getRow(mRowIdx);
    row.height = 20;

    row.getCell('A').value = idx + 1;
    row.getCell('A').alignment = { horizontal: 'center' };

    row.getCell('B').value = m.bankTx?.date || m.bookTx?.date || '—';
    row.getCell('B').alignment = { horizontal: 'center' };

    row.getCell('C').value = m.bankTx?.narration || '—';
    row.getCell('D').value = m.bookTx?.label || m.bookTx?.narration || '—';
    row.getCell('E').value = m.bankTx?.refNo || m.bookTx?.refNo || '—';
    row.getCell('E').alignment = { horizontal: 'center' };

    row.getCell('F').value = m.amount || (m.amountPaise ? m.amountPaise / 100 : 0);
    row.getCell('F').numFmt = '₹#,##0.00';
    row.getCell('F').font = { bold: true, color: { argb: EMERALD_GREEN } };
    row.getCell('F').alignment = { horizontal: 'right' };

    row.getCell('G').value = m.dateDiffDays === 0 ? 'Same Day' : `${m.dateDiffDays} day(s)`;
    row.getCell('G').alignment = { horizontal: 'center' };

    row.getCell('H').value = m.matchType || 'EXACT';
    row.getCell('H').alignment = { horizontal: 'center' };

    row.getCell('I').value = `${m.confidence || 100}%`;
    row.getCell('I').alignment = { horizontal: 'center' };

    row.getCell('J').value = m.remarks || 'Reconciled successfully.';

    applyBorders(row, mCols);
    mRowIdx++;
  });

  if (matched.length === 0) {
    const row = wsMatched.getRow(6);
    wsMatched.mergeCells('A6:J6');
    row.getCell('A').value = 'No matched items found.';
    row.getCell('A').alignment = { horizontal: 'center' };
    applyBorders(row, mCols);
  }

  wsMatched.autoFilter = `A5:J${Math.max(6, mRowIdx - 1)}`;

  return workbook;
}
