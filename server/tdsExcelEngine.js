/**
 * Statutory TDS Reconciliation Excel Exporter
 * Generates an ICAI & Income Tax Act, 1961 compliant audit workbook with:
 * 1. "Summary": Executive overview, Books vs 26AS reconciliation, Defaults matrix, Section 201(1A) & 234E exposures, and CA certification block.
 * 2. "Section-wise Reconciliation": One row per TAN + Section combination with book amount, 26AS amount, variance, and default type.
 * 3. "Exceptions Detail": Consolidated register of all unmatched and short-deducted items sorted by exposure descending with computed 234E/201(1A) penalties.
 */

import ExcelJS from 'exceljs';
import { STATUTORY_TDS_RATES, quantizeToPaise } from './tdsReconEngine.js';
import { normalizeTan, normalizeTdsSection } from './tdsIngestionEngine.js';

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
 * Main function: Generates ExcelJS Workbook for TDS Reconciliation
 * 
 * @param {Object} reconResult - Output of runTdsReconciliation
 * @param {Object} [metadata] - Statement and entity metadata
 * @returns {Promise<ExcelJS.Workbook>}
 */
export async function createTdsReconciliationWorkbook(reconResult, metadata = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Local AI Financial Bot - TDS Statutory Reconciliation Engine';
  workbook.created = new Date();

  const {
    summary = {},
    matched = [],
    sectionMismatches = [],
    unmatchedIn26AS = [],
    unmatchedInBooks = [],
    shortDeductions = [],
    discrepancyReport = []
  } = reconResult;

  const entityName = metadata.companyName || metadata.entityName || '[Entity Not Specified - Needs Input]';
  const pan = metadata.pan || '[PAN Not Specified]';
  const tan = metadata.tan || '[TAN Not Specified]';
  const assessmentYear = metadata.assessmentYear || '[AY Not Specified]';
  const asOnDate = metadata.asOnDate || summary.asOnDate || new Date().toISOString().split('T')[0];

  // Calculated totals for summary sheet
  const booksTdsTotal = roundTo2((summary.totalTdsMatched || 0) + (summary.totalUnmatchedBooksTds || 0));
  const sourceTdsTotal = roundTo2((summary.totalTdsMatched || 0) + (summary.totalUnmatchedSourceTds || 0));
  const netTdsVariance = roundTo2(booksTdsTotal - sourceTdsTotal);
  const isBalanced = Math.abs(netTdsVariance) < 0.01 && (summary.shortDeductionCount || 0) === 0;

  // =========================================================================
  // SHEET 1: SUMMARY (Executive Overview & Statutory Penalty Schedule)
  // =========================================================================
  const wsSummary = workbook.addWorksheet('Summary', { views: [{ showGridLines: true }] });
  wsSummary.columns = [
    { width: 4 },   // A: Margin
    { width: 46 },  // B: Metric / Particulars
    { width: 22 },  // C: Books of Accounts (₹)
    { width: 22 },  // D: Form 26AS / AIS (₹)
    { width: 36 }   // E: Variance / Audit Advisory
  ];

  // Report Title Block
  wsSummary.mergeCells('B2:E2');
  const titleCell = wsSummary.getCell('B2');
  titleCell.value = 'TDS / TCS RECONCILIATION & STATUTORY AUDIT REPORT';
  titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY_NAVY } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsSummary.getRow(2).height = 36;

  // Subtitle
  wsSummary.mergeCells('B3:E3');
  const subCell = wsSummary.getCell('B3');
  subCell.value = `${entityName} | PAN: ${pan} | TAN: ${tan} | ${assessmentYear} | As on: ${asOnDate}`;
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsSummary.getRow(3).height = 20;

  let curRow = 5;

  // Section 1 Header: Books vs 26AS Position
  const rSec1 = wsSummary.getRow(curRow);
  wsSummary.mergeCells(`B${curRow}:E${curRow}`);
  rSec1.getCell('B').value = '1. RECONCILED TDS POSITION: BOOKS OF ACCOUNTS vs FORM 26AS / AIS';
  rSec1.getCell('B').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rSec1.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
  rSec1.height = 24;
  curRow++;

  // Column Headers
  const rH1 = wsSummary.getRow(curRow);
  rH1.height = 22;
  ['Metric / Description', 'Books TDS (₹)', 'Form 26AS TDS (₹)', 'Audit Status / Variance'].forEach((h, i) => {
    const col = ['B', 'C', 'D', 'E'][i];
    const cell = rH1.getCell(col);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECONDARY_SLATE } };
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : (i === 3 ? 'left' : 'right') };
  });
  curRow++;

  const reconRows = [
    {
      desc: 'Total TDS Claimed / Deducted per Source',
      books: booksTdsTotal,
      source: sourceTdsTotal,
      status: isBalanced ? '✅ 100% BALANCED' : `⚠️ Variance: ₹${Math.abs(netTdsVariance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      bold: true,
      color: isBalanced ? EMERALD_GREEN : ROSE_RED
    },
    {
      desc: '100% Matched TDS Credits (Exact TAN + Section + Amount)',
      books: summary.totalTdsMatched || 0,
      source: summary.totalTdsMatched || 0,
      status: `✅ ${summary.matchedCount || 0} Entries Verified`,
      bold: false,
      color: EMERALD_GREEN
    },
    {
      desc: 'Section Mismatches (Same TAN & Amount, Section Differs)',
      books: sectionMismatches.reduce((sum, m) => sum + (m.amount || 0), 0),
      source: sectionMismatches.reduce((sum, m) => sum + (m.amount || 0), 0),
      status: `⚠️ ${summary.sectionMismatchCount || 0} Entries (Rectification Required)`,
      bold: false,
      color: AMBER_YELLOW
    },
    {
      desc: 'Deducted per Books but Missing in 26AS (Unreflected)',
      books: summary.totalUnmatchedBooksTds || 0,
      source: 0,
      status: `⛔ HIGH RISK: ${summary.unmatchedIn26ASCount || 0} Missing Credits / Unremitted`,
      bold: false,
      color: ROSE_RED
    },
    {
      desc: 'Appearing in 26AS but Missing in Books (Unclaimed Credit)',
      books: 0,
      source: summary.totalUnmatchedSourceTds || 0,
      status: `💡 TAX OPPORTUNITY: ${summary.unmatchedInBooksCount || 0} Unclaimed Entries`,
      bold: false,
      color: EMERALD_GREEN
    },
    {
      desc: 'Short Deduction of TDS (Rate Under-mandated)',
      books: summary.totalShortDeductionAmount || 0,
      source: 0,
      status: `⛔ DEFAULT: ${summary.shortDeductionCount || 0} Invoices Under-deducted`,
      bold: false,
      color: ROSE_RED
    }
  ];

  reconRows.forEach(item => {
    const row = wsSummary.getRow(curRow);
    row.height = 20;
    row.getCell('B').value = item.desc;
    row.getCell('B').font = { bold: item.bold };
    row.getCell('C').value = item.books;
    row.getCell('C').numFmt = '₹#,##0.00';
    row.getCell('D').value = item.source;
    row.getCell('D').numFmt = '₹#,##0.00';
    row.getCell('E').value = item.status;
    row.getCell('E').font = { bold: true, color: { argb: item.color } };
    applyBorders(row, ['B', 'C', 'D', 'E']);
    curRow++;
  });

  // Net Variance Summary Row with Double Underline
  const rNet = wsSummary.getRow(curRow);
  rNet.height = 24;
  rNet.getCell('B').value = 'Net TDS Reconciliation Discrepancy';
  rNet.getCell('B').font = { bold: true };
  rNet.getCell('C').value = booksTdsTotal;
  rNet.getCell('C').numFmt = '₹#,##0.00';
  rNet.getCell('D').value = sourceTdsTotal;
  rNet.getCell('D').numFmt = '₹#,##0.00';
  rNet.getCell('E').value = `Net Diff: ₹${netTdsVariance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  rNet.getCell('E').font = { bold: true, color: { argb: isBalanced ? EMERALD_GREEN : ROSE_RED } };
  applyTotalBorders(rNet, ['B', 'C', 'D', 'E']);
  curRow += 2;

  // Section 2 Header: Statutory Penalties & Interest Schedule
  const rSec2 = wsSummary.getRow(curRow);
  wsSummary.mergeCells(`B${curRow}:E${curRow}`);
  rSec2.getCell('B').value = '2. STATUTORY PENALTY & INTEREST EXPOSURE (Sec 201(1A), Sec 234E & Sec 40(a)(ia))';
  rSec2.getCell('B').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rSec2.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSE_RED } };
  rSec2.height = 24;
  curRow++;

  const rH2 = wsSummary.getRow(curRow);
  rH2.height = 22;
  ['Statutory Default Head', 'Legal Section & Basis', 'Computed Exposure (₹)', 'Statutory Impact'].forEach((h, i) => {
    const col = ['B', 'C', 'D', 'E'][i];
    const cell = rH2.getCell(col);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECONDARY_SLATE } };
    cell.alignment = { vertical: 'middle', horizontal: i === 2 ? 'right' : 'left' };
  });
  curRow++;

  const penaltyRows = [
    {
      head: 'Late Filing Fee on Quarterly TDS Return',
      section: 'Section 234E (₹200/day capped at TDS amount)',
      amount: summary.total234EFees || 0,
      impact: 'Mandatory fee payable before filing quarterly Form 24Q/26Q'
    },
    {
      head: 'Interest on Non-Deduction / Late Deposit',
      section: 'Section 201(1A) (1.0% / 1.5% per month or part of month)',
      amount: summary.total201_1AInterest || 0,
      impact: 'Mandatory non-waivable interest on unpaid TDS liabilities'
    },
    {
      head: 'Total Statutory Interest & Late Fees',
      section: 'Sec 201(1A) Interest + Sec 234E Fees',
      amount: summary.totalPenaltiesPayable || 0,
      impact: 'Immediate statutory cash outflow required',
      bold: true
    },
    {
      head: 'Principal Short Deduction Tax Shortfall',
      section: 'Sec 192 - 194Q Statutory Shortfall',
      amount: summary.totalShortDeductionAmount || 0,
      impact: 'Direct tax demand recoverable from payees / self-remitted',
      bold: true
    },
    {
      head: 'TOTAL POTENTIAL STATUTORY TAX EXPOSURE',
      section: 'Principal Tax Shortfall + Penalties + Interest',
      amount: summary.netTaxExposure || 0,
      impact: 'Total statutory liability subject to notice / assessment',
      bold: true,
      highlight: true
    }
  ];

  penaltyRows.forEach(item => {
    const row = wsSummary.getRow(curRow);
    row.height = 22;
    row.getCell('B').value = item.head;
    row.getCell('B').font = { bold: item.bold };
    row.getCell('C').value = item.section;
    row.getCell('D').value = item.amount;
    row.getCell('D').numFmt = '₹#,##0.00';
    row.getCell('D').font = { bold: item.bold, color: { argb: item.amount > 0 ? ROSE_RED : EMERALD_GREEN } };
    row.getCell('E').value = item.impact;
    row.getCell('E').font = { italic: !item.bold };

    if (item.highlight) {
      applyTotalBorders(row, ['B', 'C', 'D', 'E']);
      row.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      row.getCell('C').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      row.getCell('D').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
      row.getCell('E').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    } else {
      applyBorders(row, ['B', 'C', 'D', 'E']);
    }
    curRow++;
  });
  curRow += 2;

  // Section 3: Statutory Observations & Certification Block
  const rSec3 = wsSummary.getRow(curRow);
  wsSummary.mergeCells(`B${curRow}:E${curRow}`);
  rSec3.getCell('B').value = '3. CHARTERED ACCOUNTANT STATUTORY OBSERVATIONS & AUDIT CERTIFICATION';
  rSec3.getCell('B').font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rSec3.getCell('B').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECONDARY_SLATE } };
  rSec3.height = 24;
  curRow++;

  const statutoryNotes = [
    '• Section 40(a)(ia) Disallowance: 30% of any sum payable to a resident on which TDS is deductible but not deducted or not deposited before the due date u/s 139(1) shall be disallowed in computing Business Income.',
    '• Section 199 & Rule 37BA: Credit for TDS is allowable in the assessment year in which corresponding income is assessable. Unmatched 26AS credits must be examined for unrecorded turnover.',
    '• Section 201(1A) Mandatory Interest: Interest @ 1% per month for non-deduction and 1.5% per month for late deposit is compensatory and strictly mandatory without discretion.',
    '• Section 234E Late Fee: Capped at the amount of TDS deductible. Fee must be deposited via Challan 281 prior to filing correction/original return.',
    '• Reconciliation Status: ' + (isBalanced ? 'Fully reconciled with Form 26AS. No material statutory defaults identified.' : 'Material exceptions detected. Immediate corrective Challan 281 deposits and 26AS correction statements recommended.')
  ];

  statutoryNotes.forEach(note => {
    const row = wsSummary.getRow(curRow);
    wsSummary.mergeCells(`B${curRow}:E${curRow}`);
    row.getCell('B').value = note;
    row.getCell('B').font = { name: 'Calibri', size: 9, italic: true };
    row.getCell('B').alignment = { vertical: 'middle', horizontal: 'left' };
    applyBorders(row, ['B', 'C', 'D', 'E']);
    curRow++;
  });
  curRow++;

  // Sign-off signature table
  const rSign = wsSummary.getRow(curRow);
  wsSummary.mergeCells(`B${curRow}:C${curRow}`);
  wsSummary.mergeCells(`D${curRow}:E${curRow}`);
  rSign.getCell('B').value = 'Prepared by: Local CA Financial Bot (Statutory TDS Module)';
  rSign.getCell('D').value = 'Verified & Certified by Chartered Accountant: ____________________';
  rSign.getCell('B').font = { size: 9, italic: true, color: { argb: 'FF4B5563' } };
  rSign.getCell('D').font = { size: 9, italic: true, color: { argb: 'FF4B5563' } };
  curRow++;

  const rSign2 = wsSummary.getRow(curRow);
  wsSummary.mergeCells(`B${curRow}:C${curRow}`);
  wsSummary.mergeCells(`D${curRow}:E${curRow}`);
  rSign2.getCell('B').value = `Generated on: ${new Date().toLocaleString('en-IN')}`;
  rSign2.getCell('D').value = 'Membership No: ____________ | UDIN: ___________________________';
  rSign2.getCell('B').font = { size: 9, italic: true, color: { argb: 'FF4B5563' } };
  rSign2.getCell('D').font = { size: 9, italic: true, color: { argb: 'FF4B5563' } };


  // =========================================================================
  // SHEET 2: SECTION-WISE RECONCILIATION
  // One row per TAN + Section combination
  // =========================================================================
  const wsSection = workbook.addWorksheet('Section-wise Reconciliation', { views: [{ showGridLines: true }] });
  wsSection.columns = [
    { width: 8 },   // A: Sl No
    { width: 16 },  // B: Deductor TAN
    { width: 34 },  // C: Deductor / Party Name
    { width: 14 },  // D: Section
    { width: 30 },  // E: Nature of Payment
    { width: 20 },  // F: TDS per Books (₹)
    { width: 20 },  // G: TDS per 26AS (₹)
    { width: 20 },  // H: Variance (₹)
    { width: 24 },  // I: Default / Match Type
    { width: 44 }   // J: Statutory Recommendation
  ];

  // Header Title
  wsSection.mergeCells('A2:J2');
  const secTitle = wsSection.getCell('A2');
  secTitle.value = 'TDS RECONCILIATION - SECTION-WISE SCHEDULE (TAN + SECTION)';
  secTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  secTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY_NAVY } };
  secTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  wsSection.getRow(2).height = 32;

  // Subtitle
  wsSection.mergeCells('A3:J3');
  const secSub = wsSection.getCell('A3');
  secSub.value = 'Aggregated reconciliation position by TAN and Statutory TDS Section comparing Books of Accounts with Form 26AS / AIS / TRACES.';
  secSub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };
  secSub.alignment = { vertical: 'middle', horizontal: 'center' };

  // Table Column Headers
  const secHeaders = [
    'Sl No', 'Deductor TAN', 'Deductor / Party Name', 'Section', 
    'Nature of Payment', 'TDS per Books (₹)', 'TDS per 26AS (₹)', 
    'Variance (₹)', 'Default / Match Type', 'Statutory Recommendation'
  ];
  const rSecHead = wsSection.getRow(5);
  rSecHead.height = 26;
  secHeaders.forEach((h, i) => {
    const col = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'][i];
    const cell = rSecHead.getCell(col);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
    cell.alignment = { vertical: 'middle', horizontal: ['A', 'D'].includes(col) ? 'center' : (['F', 'G', 'H'].includes(col) ? 'right' : 'left') };
  });

  // Aggregate by TAN + Section
  const tanSectionMap = new Map();

  function getOrCreateTanSec(tanVal, secVal, nameVal) {
    const normTan = normalizeTan(tanVal) || 'UNKNOWN_TAN';
    const normSec = normalizeTdsSection(secVal) || 'OTHER';
    const key = `${normTan}_${normSec}`;
    if (!tanSectionMap.has(key)) {
      tanSectionMap.set(key, {
        tan: normTan,
        section: normSec,
        partyName: nameVal || normTan,
        bookTds: 0,
        sourceTds: 0,
        hasShortDeduction: false,
        hasSectionMismatch: false,
        mismatchNote: ''
      });
    }
    const item = tanSectionMap.get(key);
    if ((!item.partyName || item.partyName === normTan) && nameVal) {
      item.partyName = nameVal;
    }
    return item;
  }

  // 1. Ingest Matched
  matched.forEach(m => {
    const sec = m.section || m.sourceEntry?.section || m.bookEntry?.section;
    const tanVal = m.deductorTAN || m.sourceEntry?.deductorTAN || m.bookEntry?.tan;
    const nameVal = m.deductorName || m.sourceEntry?.deductorName || m.bookEntry?.partyName;
    const item = getOrCreateTanSec(tanVal, sec, nameVal);
    item.bookTds += (m.bookEntry?.amount || m.amount || 0);
    item.sourceTds += (m.sourceEntry?.tdsDeducted || m.amount || 0);
  });

  // 2. Ingest Section Mismatches
  sectionMismatches.forEach(sm => {
    // Contribute to book section
    const bookItem = getOrCreateTanSec(sm.deductorTAN, sm.bookSection, sm.deductorName);
    bookItem.bookTds += (sm.amount || 0);
    bookItem.hasSectionMismatch = true;
    bookItem.mismatchNote = `Filed under ${sm.sourceSection} in 26AS`;

    // Contribute to source section
    const sourceItem = getOrCreateTanSec(sm.deductorTAN, sm.sourceSection, sm.deductorName);
    sourceItem.sourceTds += (sm.amount || 0);
    sourceItem.hasSectionMismatch = true;
  });

  // 3. Ingest Unmatched in 26AS (Books only)
  unmatchedIn26AS.forEach(ub => {
    const tanVal = ub.deductorTAN || ub.tan;
    const item = getOrCreateTanSec(tanVal, ub.section, ub.partyName || ub.accountHead);
    item.bookTds += (ub.amount || 0);
  });

  // 4. Ingest Unmatched in Books (26AS only)
  unmatchedInBooks.forEach(us => {
    const item = getOrCreateTanSec(us.deductorTAN, us.section, us.deductorName);
    item.sourceTds += (us.tdsDeducted || 0);
  });

  // 5. Ingest Short Deductions
  shortDeductions.forEach(sd => {
    const item = getOrCreateTanSec(sd.deductorTAN || sd.tan, sd.section, sd.partyName || sd.label);
    item.hasShortDeduction = true;
  });

  // Convert aggregated entries into array
  const sectionAggregations = Array.from(tanSectionMap.values()).map(row => {
    const variance = roundTo2(row.bookTds - row.sourceTds);
    let defaultType = 'MATCHED';
    let recommendation = 'TDS credits reconcile with Form 26AS. Claim credit in ITR.';

    if (row.hasSectionMismatch) {
      defaultType = 'SECTION_MISMATCH';
      recommendation = `Section mismatch detected (${row.mismatchNote || 'Books vs 26AS'}). Request deductor correction statement.`;
    } else if (row.hasShortDeduction) {
      defaultType = 'SHORT_DEDUCTION';
      recommendation = 'Statutory deduction rate shortfall. Recover differential TDS and remit with Sec 201(1A) interest.';
    } else if (Math.abs(variance) < 0.01 && row.bookTds > 0) {
      defaultType = 'MATCHED';
      recommendation = 'Fully matched. Claim credit in Income Tax Return.';
    } else if (row.bookTds > 0 && row.sourceTds === 0) {
      defaultType = 'MISSING_IN_26AS';
      recommendation = 'Credit missing in 26AS. Follow up with deductor to file Form 24Q/26Q or quote correct PAN.';
    } else if (row.bookTds === 0 && row.sourceTds > 0) {
      defaultType = 'UNCLAIMED_IN_BOOKS';
      recommendation = 'TDS credit available in 26AS not in books. Verify unrecorded income and claim credit.';
    } else {
      defaultType = 'AMOUNT_VARIANCE';
      recommendation = `Variance of ₹${Math.abs(variance).toLocaleString('en-IN')}. Verify billing records and certificates.`;
    }

    const secRule = STATUTORY_TDS_RATES[row.section];
    const nature = secRule ? `${secRule.name} (${secRule.defaultRate}%)` : 'TDS Head';

    return {
      ...row,
      variance,
      defaultType,
      nature,
      recommendation
    };
  });

  // Sort by variance absolute descending
  sectionAggregations.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  let secRowIdx = 6;
  let totalBookTdsSec = 0;
  let totalSourceTdsSec = 0;

  sectionAggregations.forEach((item, idx) => {
    const row = wsSection.getRow(secRowIdx);
    row.height = 22;

    row.getCell('A').value = idx + 1;
    row.getCell('A').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('B').value = item.tan;
    row.getCell('B').alignment = { vertical: 'middle', horizontal: 'left' };
    row.getCell('B').font = { name: 'Calibri', size: 10, bold: true };
    row.getCell('C').value = item.partyName;
    row.getCell('D').value = item.section;
    row.getCell('D').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('D').font = { bold: true };
    row.getCell('E').value = item.nature;

    row.getCell('F').value = roundTo2(item.bookTds);
    row.getCell('F').numFmt = '₹#,##0.00';
    totalBookTdsSec += item.bookTds;

    row.getCell('G').value = roundTo2(item.sourceTds);
    row.getCell('G').numFmt = '₹#,##0.00';
    totalSourceTdsSec += item.sourceTds;

    row.getCell('H').value = item.variance;
    row.getCell('H').numFmt = '₹#,##0.00';
    row.getCell('H').font = { bold: true, color: { argb: Math.abs(item.variance) < 0.01 ? EMERALD_GREEN : ROSE_RED } };

    row.getCell('I').value = item.defaultType;
    row.getCell('I').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('I').font = { 
      bold: true, 
      color: { 
        argb: item.defaultType === 'MATCHED' ? EMERALD_GREEN : 
              item.defaultType === 'SECTION_MISMATCH' ? AMBER_YELLOW : ROSE_RED 
      } 
    };

    row.getCell('J').value = item.recommendation;
    row.getCell('J').font = { size: 9, italic: true };

    applyBorders(row, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
    secRowIdx++;
  });

  // Section-wise Total Row
  const rSecTotal = wsSection.getRow(secRowIdx);
  rSecTotal.height = 25;
  rSecTotal.getCell('B').value = 'TOTAL';
  rSecTotal.getCell('B').font = { bold: true };
  rSecTotal.getCell('F').value = roundTo2(totalBookTdsSec);
  rSecTotal.getCell('F').numFmt = '₹#,##0.00';
  rSecTotal.getCell('F').font = { bold: true };
  rSecTotal.getCell('G').value = roundTo2(totalSourceTdsSec);
  rSecTotal.getCell('G').numFmt = '₹#,##0.00';
  rSecTotal.getCell('G').font = { bold: true };
  rSecTotal.getCell('H').value = roundTo2(totalBookTdsSec - totalSourceTdsSec);
  rSecTotal.getCell('H').numFmt = '₹#,##0.00';
  rSecTotal.getCell('H').font = { bold: true, color: { argb: Math.abs(totalBookTdsSec - totalSourceTdsSec) < 0.01 ? EMERALD_GREEN : ROSE_RED } };
  applyTotalBorders(rSecTotal, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);


  // =========================================================================
  // SHEET 3: EXCEPTIONS DETAIL
  // Every unmatched / short-deducted entry sorted by exposure descending
  // =========================================================================
  const wsExceptions = workbook.addWorksheet('Exceptions Detail', { views: [{ showGridLines: true }] });
  wsExceptions.columns = [
    { width: 6 },   // A: Sl No
    { width: 28 },  // B: Default Category
    { width: 14 },  // C: Deductor TAN
    { width: 30 },  // D: Deductor / Party Name
    { width: 12 },  // E: Section
    { width: 18 },  // F: Book TDS (₹)
    { width: 18 },  // G: 26AS TDS (₹)
    { width: 18 },  // H: Discrepancy / Shortfall (₹)
    { width: 14 },  // I: Deduction Date
    { width: 14 },  // J: Statutory Due Date
    { width: 14 },  // K: Delay (Days/Mos)
    { width: 18 },  // L: Sec 234E Fee (₹)
    { width: 18 },  // M: Sec 201(1A) Interest (₹)
    { width: 22 },  // N: Total Exposure (₹)
    { width: 44 }   // O: Auditor Remediation Action
  ];

  // Header Title
  wsExceptions.mergeCells('A2:O2');
  const exTitle = wsExceptions.getCell('A2');
  exTitle.value = 'TDS EXCEPTIONS DETAIL & STATUTORY PENALTY COMPUTATION REGISTER';
  exTitle.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  exTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROSE_RED } };
  exTitle.alignment = { vertical: 'middle', horizontal: 'center' };
  wsExceptions.getRow(2).height = 32;

  // Subtitle
  wsExceptions.mergeCells('A3:O3');
  const exSub = wsExceptions.getCell('A3');
  exSub.value = 'Consolidated register of all unmatched and short-deducted entries sorted descending by financial exposure (Largest tax & penalty risk first).';
  exSub.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };
  exSub.alignment = { vertical: 'middle', horizontal: 'center' };

  // Table Column Headers
  const exHeaders = [
    'Sl No', 'Default Category', 'Deductor TAN', 'Party Name / Head', 
    'Section', 'Book TDS (₹)', '26AS TDS (₹)', 'Shortfall / Diff (₹)', 
    'Deduction Date', 'Due Date', 'Delay', 'Sec 234E Fee (₹)', 
    'Sec 201(1A) Int (₹)', 'Total Exposure (₹)', 'Auditor Remediation Action'
  ];
  const rExHead = wsExceptions.getRow(5);
  rExHead.height = 26;
  exHeaders.forEach((h, i) => {
    const col = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'][i];
    const cell = rExHead.getCell(col);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_DARK } };
    cell.alignment = { 
      vertical: 'middle', 
      horizontal: ['A', 'C', 'E', 'I', 'J', 'K'].includes(col) ? 'center' : 
                  (['F', 'G', 'H', 'L', 'M', 'N'].includes(col) ? 'right' : 'left') 
    };
  });

  // Assemble all exceptions
  const exceptionItems = [];

  // 1. Unmatched in 26AS (Deducted in books, missing in 26AS)
  unmatchedIn26AS.forEach(ub => {
    const fee234E = ub.penalties?.fee234E || 0;
    const interest201_1A = ub.penalties?.interest201_1A || 0;
    const isPayable = ub.type === 'PAYABLE';
    // For payable: exposure includes the unpaid tax + fees + interest
    // For receivable: exposure includes the missing tax credit at risk
    const totalExposure = isPayable ? (ub.amount + fee234E + interest201_1A) : (ub.amount);

    exceptionItems.push({
      category: isPayable ? 'TDS Payable Not Deposited' : 'TDS Credit Missing in 26AS',
      tan: ub.deductorTAN || ub.tan || 'N/A',
      partyName: ub.partyName || ub.accountHead || 'N/A',
      section: ub.section || 'N/A',
      bookTds: ub.amount || 0,
      sourceTds: 0,
      shortfall: ub.amount || 0,
      deductionDate: ub.deductionDate || ub.date || 'N/A',
      dueDate: ub.dueDate || 'N/A',
      delay: ub.penalties?.delayDays ? `${ub.penalties.delayDays}d (${ub.penalties.delayMonths || 1}m)` : '-',
      fee234E,
      interest201_1A,
      totalExposure,
      action: ub.auditorAction || (isPayable 
        ? 'Remit TDS liability via Challan 281 along with Sec 201(1A) interest to avoid Sec 40(a)(ia) 30% disallowance.' 
        : 'Request deductor to deposit TDS and file quarterly correction statement quoting valid PAN.')
    });
  });

  // 2. Short Deductions
  shortDeductions.forEach(sd => {
    const shortfall = sd.shortfallAmount || 0;
    const interest201_1A = sd.interest201_1A || 0;
    const totalExposure = shortfall + interest201_1A;

    exceptionItems.push({
      category: `Short Deduction (${sd.section})`,
      tan: sd.deductorTAN || sd.tan || 'N/A',
      partyName: sd.partyName || sd.label || 'N/A',
      section: sd.section || 'N/A',
      bookTds: sd.actualTds || 0,
      sourceTds: sd.mandatedTds || 0,
      shortfall,
      deductionDate: sd.deductionDate || sd.date || 'N/A',
      dueDate: sd.dueDate || 'N/A',
      delay: `${sd.delayMonths || 0} mos`,
      fee234E: 0,
      interest201_1A,
      totalExposure,
      action: sd.auditorAction || `Under-deducted u/s ${sd.section}. Recover differential ₹${shortfall.toLocaleString('en-IN')} and remit with Sec 201(1A) interest.`
    });
  });

  // 3. Unmatched in Books (In 26AS, missing in books)
  unmatchedInBooks.forEach(us => {
    exceptionItems.push({
      category: 'Unclaimed 26AS Credit',
      tan: us.deductorTAN || 'N/A',
      partyName: us.deductorName || 'N/A',
      section: us.section || 'N/A',
      bookTds: 0,
      sourceTds: us.tdsDeducted || 0,
      shortfall: us.tdsDeducted || 0,
      deductionDate: us.dateOfDeduction || us.dateOfBooking || 'N/A',
      dueDate: '-',
      delay: '-',
      fee234E: 0,
      interest201_1A: 0,
      totalExposure: us.tdsDeducted || 0,
      action: us.auditorAction || 'Verify corresponding turnover in Books of Accounts and claim TDS credit in ITR.'
    });
  });

  // 4. Section Mismatches
  sectionMismatches.forEach(sm => {
    exceptionItems.push({
      category: 'Section Mismatch',
      tan: sm.deductorTAN || 'N/A',
      partyName: sm.deductorName || 'N/A',
      section: `Books: ${sm.bookSection} | 26AS: ${sm.sourceSection}`,
      bookTds: sm.amount || 0,
      sourceTds: sm.amount || 0,
      shortfall: 0,
      deductionDate: sm.date || 'N/A',
      dueDate: '-',
      delay: '-',
      fee234E: 0,
      interest201_1A: 0,
      totalExposure: sm.amount || 0,
      action: `Section classification discrepancy. Reclassify account head in books or obtain correction statement from deductor.`
    });
  });

  // Sort descending by total exposure (largest discrepancies first)
  exceptionItems.sort((a, b) => b.totalExposure - a.totalExposure);

  let exRowIdx = 6;
  let totalBookTdsEx = 0;
  let totalSourceTdsEx = 0;
  let totalShortfallEx = 0;
  let totalFee234EEx = 0;
  let totalInterest201_1AEx = 0;
  let totalExposureEx = 0;

  exceptionItems.forEach((item, idx) => {
    const row = wsExceptions.getRow(exRowIdx);
    row.height = 22;

    row.getCell('A').value = idx + 1;
    row.getCell('A').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('B').value = item.category;
    row.getCell('B').font = { 
      bold: true, 
      color: { 
        argb: item.category.includes('Payable') || item.category.includes('Short') ? ROSE_RED : 
              item.category.includes('Section') ? AMBER_YELLOW : EMERALD_GREEN 
      } 
    };

    row.getCell('C').value = item.tan;
    row.getCell('C').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('D').value = item.partyName;
    row.getCell('E').value = item.section;
    row.getCell('E').alignment = { vertical: 'middle', horizontal: 'center' };

    row.getCell('F').value = roundTo2(item.bookTds);
    row.getCell('F').numFmt = '₹#,##0.00';
    totalBookTdsEx += item.bookTds;

    row.getCell('G').value = roundTo2(item.sourceTds);
    row.getCell('G').numFmt = '₹#,##0.00';
    totalSourceTdsEx += item.sourceTds;

    row.getCell('H').value = roundTo2(item.shortfall);
    row.getCell('H').numFmt = '₹#,##0.00';
    row.getCell('H').font = { bold: true };
    totalShortfallEx += item.shortfall;

    row.getCell('I').value = item.deductionDate;
    row.getCell('I').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('J').value = item.dueDate;
    row.getCell('J').alignment = { vertical: 'middle', horizontal: 'center' };
    row.getCell('K').value = item.delay;
    row.getCell('K').alignment = { vertical: 'middle', horizontal: 'center' };

    row.getCell('L').value = roundTo2(item.fee234E);
    row.getCell('L').numFmt = '₹#,##0.00';
    if (item.fee234E > 0) row.getCell('L').font = { color: { argb: ROSE_RED } };
    totalFee234EEx += item.fee234E;

    row.getCell('M').value = roundTo2(item.interest201_1A);
    row.getCell('M').numFmt = '₹#,##0.00';
    if (item.interest201_1A > 0) row.getCell('M').font = { color: { argb: ROSE_RED } };
    totalInterest201_1AEx += item.interest201_1A;

    row.getCell('N').value = roundTo2(item.totalExposure);
    row.getCell('N').numFmt = '₹#,##0.00';
    row.getCell('N').font = { bold: true, color: { argb: ROSE_RED } };
    totalExposureEx += item.totalExposure;

    row.getCell('O').value = item.action;
    row.getCell('O').font = { size: 9, italic: true };

    applyBorders(row, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']);
    exRowIdx++;
  });

  // Exceptions Total Row
  const rExTotal = wsExceptions.getRow(exRowIdx);
  rExTotal.height = 25;
  rExTotal.getCell('B').value = 'TOTAL EXCEPTIONS & LIABILITIES';
  rExTotal.getCell('B').font = { bold: true };
  rExTotal.getCell('F').value = roundTo2(totalBookTdsEx);
  rExTotal.getCell('F').numFmt = '₹#,##0.00';
  rExTotal.getCell('F').font = { bold: true };
  rExTotal.getCell('G').value = roundTo2(totalSourceTdsEx);
  rExTotal.getCell('G').numFmt = '₹#,##0.00';
  rExTotal.getCell('G').font = { bold: true };
  rExTotal.getCell('H').value = roundTo2(totalShortfallEx);
  rExTotal.getCell('H').numFmt = '₹#,##0.00';
  rExTotal.getCell('H').font = { bold: true };
  rExTotal.getCell('L').value = roundTo2(totalFee234EEx);
  rExTotal.getCell('L').numFmt = '₹#,##0.00';
  rExTotal.getCell('L').font = { bold: true, color: { argb: ROSE_RED } };
  rExTotal.getCell('M').value = roundTo2(totalInterest201_1AEx);
  rExTotal.getCell('M').numFmt = '₹#,##0.00';
  rExTotal.getCell('M').font = { bold: true, color: { argb: ROSE_RED } };
  rExTotal.getCell('N').value = roundTo2(totalExposureEx);
  rExTotal.getCell('N').numFmt = '₹#,##0.00';
  rExTotal.getCell('N').font = { bold: true, color: { argb: ROSE_RED } };
  applyTotalBorders(rExTotal, ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']);

  return workbook;
}
