/**
 * Multi-Tab GST Reconciliation Excel Exporter
 * Generates an ICAI-compliant audit workbook with 8 dedicated worksheets,
 * native formulas, corporate styling, and statutory disclosures.
 */

import ExcelJS from 'exceljs';

const PRIMARY_NAVY = '1E3A8A';
const SECONDARY_BLUE = '3B82F6';
const EMERALD_GREEN = '059669';
const AMBER_YELLOW = 'D97706';
const ROSE_RED = 'DC2626';
const LIGHT_GRAY = 'F3F4F6';
const BORDER_GRAY = 'D1D5DB';

export async function createGstReconciliationWorkbook(reconResult) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Local AI Financial Bot - GST Reconciliation Engine';
  workbook.created = new Date();

  const { summary, statutoryGuards, vendorCompliance, buckets } = reconResult;

  const isOutward = reconResult.reconType === 'OUTWARD' || summary?.reconType === 'OUTWARD';

  // ------------------------------------------------------------------
  // 1. SHEET 1: EXECUTIVE SUMMARY & STATUTORY ADVISORY
  // ------------------------------------------------------------------
  const wsSummary = workbook.addWorksheet('Executive Summary', { views: [{ showGridLines: true }] });
  wsSummary.columns = [
    { width: 5 },
    { width: 38 },
    { width: 22 },
    { width: 22 },
    { width: 35 }
  ];

  // Header Title
  wsSummary.mergeCells('B2:E2');
  const titleCell = wsSummary.getCell('B2');
  titleCell.value = isOutward 
    ? 'GST OUTWARD / SALES RECONCILIATION REPORT (SALES vs GSTR-1)'
    : 'GST INPUT TAX CREDIT (ITC) RECONCILIATION REPORT';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PRIMARY_NAVY } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsSummary.getRow(2).height = 35;

  // Subtitle & Timestamp
  wsSummary.mergeCells('B3:E3');
  const subCell = wsSummary.getCell('B3');
  subCell.value = isOutward
    ? `Generated on ${new Date().toLocaleString('en-IN')} | Rule 88C (DRC-01B), Sec 16(2)(aa) & Sec 50 Audit Review`
    : `Generated on ${new Date().toLocaleString('en-IN')} | Rule 36(4), Sec 16(2)(aa) & Sec 17(5) Audit Review`;
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF4B5563' } };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };

  // Key KPI Matrix
  applySectionHeader(
    wsSummary, 
    5, 
    'B', 
    'E', 
    isOutward 
      ? '1. EXECUTIVE OUTWARD RECONCILIATION SUMMARY (GSTR-1 vs Sales Register)'
      : '1. EXECUTIVE RECONCILIATION SUMMARY (GSTR-3B Table 4)'
  );
  
  const kpiHeaders = [
    'Metric Description', 
    isOutward ? 'Books (Sales Register)' : 'Books (PR)', 
    isOutward ? 'Portal (GSTR-1)' : 'Portal (GSTR-2B)', 
    'Audit Status / Variance'
  ];
  const row6 = wsSummary.getRow(6);
  kpiHeaders.forEach((h, i) => {
    const colLetter = ['B', 'C', 'D', 'E'][i];
    const cell = row6.getCell(colLetter);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' } };
    cell.alignment = { horizontal: i === 0 ? 'left' : 'right' };
  });

  const kpiData = isOutward ? [
    ['Total Invoice Count', summary.totalRecordsPR, summary.totalRecords2B, `Match Rate: ${summary.matchRatePercentage}%`],
    ['Total Taxable Turnover', summary.financialTotals.prTaxable, summary.financialTotals.gstr2bTaxable, `Diff: ₹${roundTo2(summary.financialTotals.prTaxable - summary.financialTotals.gstr2bTaxable)}`],
    ['Total Output Tax (All Heads)', summary.financialTotals.prTax, summary.financialTotals.gstr2bTax, `Variance: ₹${roundTo2(summary.financialTotals.prTax - summary.financialTotals.gstr2bTax)}`],
    ['100% Exact Matched Sales', summary.financialTotals.matchedTax, summary.financialTotals.matchedTax, `${summary.exactMatchCount} Invoices Exact Match`],
    ['Probable / Fuzzy Matched Sales', buckets.probableMatches.reduce((acc, m) => acc + m.prItem.totalTax, 0), buckets.probableMatches.reduce((acc, m) => acc + (m.gstr2bItem?.totalTax || 0), 0), `${summary.probableMatchCount} Invoices with Minor Diff`],
    ['Tax Rate Variances (Different Slabs)', summary.rateVarianceCount || 0, summary.rateVarianceTaxDiff || 0, (summary.rateVarianceCount || 0) > 0 ? `⚠️ ${summary.rateVarianceCount} Invoices (Rule 88C Risk)` : 'All Slabs Agreed'],
    ['Unreported Invoices (Missing in GSTR-1)', summary.financialTotals.missingInPortalTaxRisk, 0, `⚠️ HIGH RISK: ${summary.missingInPortalCount} Invoices Omitted`],
    ['Unrecorded Invoices (Missing in Books)', 0, summary.financialTotals.missingInBooksTaxOpportunity, `⚠️ EXCESS LIABILITY: ${summary.missingInBooksCount} Invoices Portal-Only`],
    ['Rule 88C DRC-01B Notice Risk Status', statutoryGuards?.rule88C_DRC01B?.excessPortalTax || 0, 0, statutoryGuards?.rule88C_DRC01B?.riskLevel || 'COMPLIANT']
  ] : [
    ['Total Invoice Count', summary.totalRecordsPR, summary.totalRecords2B, `Match Rate: ${summary.matchRatePercentage}%`],
    ['Total Taxable Value', summary.financialTotals.prTaxable, summary.financialTotals.gstr2bTaxable, `Diff: ₹${roundTo2(summary.financialTotals.prTaxable - summary.financialTotals.gstr2bTaxable)}`],
    ['Total ITC (All Heads)', summary.financialTotals.prTax, summary.financialTotals.gstr2bTax, `Variance: ₹${roundTo2(summary.financialTotals.prTax - summary.financialTotals.gstr2bTax)}`],
    ['100% Exact Matched ITC', summary.financialTotals.matchedTax, summary.financialTotals.matchedTax, `${summary.exactMatchCount} Invoices Exact Match`],
    ['Probable / Fuzzy Matched ITC', buckets.probableMatches.reduce((acc, m) => acc + m.prItem.totalTax, 0), buckets.probableMatches.reduce((acc, m) => acc + (m.gstr2bItem?.totalTax || 0), 0), `${summary.probableMatchCount} Invoices with Minor Diff`],
    ['Tax Rate Variances (Different Slabs)', summary.rateVarianceCount || 0, summary.rateVarianceTaxDiff || 0, (summary.rateVarianceCount || 0) > 0 ? `⚠️ ${summary.rateVarianceCount} Invoices (Rule 88D Risk)` : 'All Slabs Agreed'],
    ['Unreflected Invoices (Missing in 2B)', summary.financialTotals.missingInPortalTaxRisk, 0, `⚠️ HIGH RISK: ${summary.missingInPortalCount} Invoices Unfiled`],
    ['Unrecorded Invoices (Missing in Books)', 0, summary.financialTotals.missingInBooksTaxOpportunity, `💡 OPPORTUNITY: ${summary.missingInBooksCount} Invoices Unclaimed`],
    ['Section 17(5) Ineligible Blocked ITC', summary.financialTotals.blocked17_5TaxAmount, 0, `⛔ MANDATORY REVERSAL: ${summary.ineligible17_5Count} Items`]
  ];

  kpiData.forEach((rowVals, idx) => {
    const rIdx = 7 + idx;
    const row = wsSummary.getRow(rIdx);
    row.getCell('B').value = rowVals[0];
    row.getCell('C').value = typeof rowVals[1] === 'number' ? rowVals[1] : rowVals[1];
    row.getCell('D').value = typeof rowVals[2] === 'number' ? rowVals[2] : rowVals[2];
    row.getCell('E').value = rowVals[3];

    row.getCell('B').font = { bold: idx >= 3 };
    if (typeof rowVals[1] === 'number') row.getCell('C').numFmt = '₹#,##0.00';
    if (typeof rowVals[2] === 'number') row.getCell('D').numFmt = '₹#,##0.00';

    if (idx === 5) row.getCell('E').font = { bold: true, color: { argb: (summary.rateVarianceCount || 0) > 0 ? 'FF7C3AED' : EMERALD_GREEN } };
    if (idx === 6) row.getCell('E').font = { bold: true, color: { argb: ROSE_RED } };
    if (idx === 7) row.getCell('E').font = { bold: true, color: { argb: isOutward ? ROSE_RED : EMERALD_GREEN } };
    if (idx === 8) row.getCell('E').font = { bold: true, color: { argb: AMBER_YELLOW } };

    applyBorders(row, ['B', 'C', 'D', 'E']);
  });

  // Statutory Guardrails Advisory Box (dynamically placed below KPI table)
  const rStatStart = 7 + kpiData.length + 2;
  applySectionHeader(
    wsSummary, 
    rStatStart, 
    'B', 
    'E', 
    isOutward 
      ? '2. OUTWARD STATUTORY RISK ASSESSMENT & NOTICE SHIELD (Rule 88C DRC-01B)'
      : '2. STATUTORY RISK ASSESSMENT & NOTICE SHIELD'
  );

  const guards = isOutward ? [
    ['Rule 88C (Form DRC-01B) Notice Risk', statutoryGuards?.rule88C_DRC01B?.riskLevel || 'COMPLIANT', `Excess Portal Tax: ₹${statutoryGuards?.rule88C_DRC01B?.excessPortalTax || 0} (${statutoryGuards?.rule88C_DRC01B?.excessPercentage || 0}%)`],
    ['Omitted Turnover (Missing in GSTR-1)', `${statutoryGuards?.omittedTurnoverRisk?.omittedInvoiceCount || 0} Invoices Omitted`, `Tax Omitted: ₹${statutoryGuards?.omittedTurnoverRisk?.omittedTaxAmount || 0} (Sec 50 Int: ₹${statutoryGuards?.omittedTurnoverRisk?.estimatedMonthlyInterest || 0})`],
    ['Unrecorded Portal Invoices', `${statutoryGuards?.unrecordedPortalTurnover?.unrecordedInvoiceCount || 0} Invoices Unrecorded`, `Portal Tax: ₹${statutoryGuards?.unrecordedPortalTurnover?.unrecordedTaxAmount || 0}`]
  ] : [
    ['Rule 88D (Form DRC-01C) Notice Risk', statutoryGuards.rule88D_DRC01C.riskLevel, `Excess Claimed: ₹${statutoryGuards.rule88D_DRC01C.excessClaimed} (${statutoryGuards.rule88D_DRC01C.excessPercentage}%)`],
    ['Section 16(4) Expiration Radar (Nov 30 Cutoff)', `${statutoryGuards.section16_4.expiringInvoicesCount} Prior-FY Invoices Expiring`, `Tax at risk of lapsing: ₹${statutoryGuards.section16_4.expiringTaxRisk}`],
    ['Rule 37 (180-Day Payables Reversal)', `${statutoryGuards.rule37_180Day.mandatoryReversalCount} Invoices Unpaid >180 Days`, `Mandatory Reversal: ₹${statutoryGuards.rule37_180Day.totalTaxAtRisk} (+ 18% Int: ₹${statutoryGuards.rule37_180Day.totalEstimatedInterest})`]
  ];

  if (statutoryGuards?.rateVarianceRisk?.count > 0) {
    guards.push([
      'Tax Rate Variance Risk',
      `${statutoryGuards.rateVarianceRisk.count} Invoices Rate-Mismatched`,
      statutoryGuards.rateVarianceRisk.statutoryAdvisory
    ]);
  }

  guards.forEach((g, idx) => {
    const r = wsSummary.getRow(rStatStart + 1 + idx);
    r.getCell('B').value = g[0];
    r.getCell('C').value = g[1];
    r.getCell('D').value = g[2];
    r.getCell('B').font = { bold: true };
    r.getCell('C').font = { bold: true, color: { argb: String(g[1]).includes('CRITICAL') || String(g[1]).includes('Reversal') || String(g[1]).includes('Mismatched') ? ROSE_RED : EMERALD_GREEN } };
    applyBorders(r, ['B', 'C', 'D', 'E']);
  });

  // ------------------------------------------------------------------
  // 2. SHEET 2: RATE-WISE RECONCILIATION
  // ------------------------------------------------------------------
  if (reconResult.rateWiseReconciliation) {
    createRateWiseSheet(workbook, reconResult.rateWiseReconciliation, isOutward);
  }

  // ------------------------------------------------------------------
  // 3. SHEET 3: EXACT MATCHES
  // ------------------------------------------------------------------
  createLineItemSheet(
    workbook, 
    'Exact Matches', 
    isOutward 
      ? '100% EXACT MATCHED SALES (Party GSTIN, Invoice No, Taxable & Tax Aligned)'
      : '100% EXACT MATCHES (GSTIN, Invoice No, Taxable & Tax Aligned)',
    buckets.exactMatches,
    true,
    isOutward
  );

  // ------------------------------------------------------------------
  // 3. SHEET 3: PROBABLE & VALUE MISMATCHES
  // ------------------------------------------------------------------
  createProbableMatchesSheet(workbook, buckets.probableMatches, isOutward);

  // ------------------------------------------------------------------
  // 4. SHEET 4: MISSING IN PORTAL (UNREFLECTED / UNREPORTED)
  // ------------------------------------------------------------------
  createMissingSheet(
    workbook, 
    isOutward ? 'Unreported in GSTR-1' : 'Missing in 2B (Vendor Risk)', 
    isOutward 
      ? 'INVOICES IN SALES REGISTER BUT NOT IN GSTR-1 (Buyer ITC Blocked u/s 16(2)(aa) & Sec 50 Risk)'
      : 'INVOICES IN BOOKS BUT NOT IN GSTR-2B (Rule 36(4) Blocked / Unfiled by Supplier)',
    buckets.missingInPortal,
    'PR',
    isOutward
  );

  // ------------------------------------------------------------------
  // 5. SHEET 5: MISSING IN BOOKS (PORTAL UNRECORDED)
  // ------------------------------------------------------------------
  createMissingSheet(
    workbook, 
    isOutward ? 'Unrecorded in Books' : 'Missing in Books', 
    isOutward
      ? 'INVOICES IN GSTR-1 BUT NOT IN BOOKS (Excess Liability / Missing ERP Sales Entries)'
      : 'INVOICES IN GSTR-2B BUT NOT IN BOOKS (Unclaimed Credit Opportunities / Missed Entries)',
    buckets.missingInBooks,
    '2B',
    isOutward
  );

  if (!isOutward) {
    // ------------------------------------------------------------------
    // 6. SHEET 6: SECTION 17(5) INELIGIBLE CREDITS (Inward Only)
    // ------------------------------------------------------------------
    createSection17_5Sheet(workbook, buckets.ineligibleSection17_5);

    // ------------------------------------------------------------------
    // 7. SHEET 7: RULE 37 180-DAY PAYABLES AGING (Inward Only)
    // ------------------------------------------------------------------
    createRule37Sheet(workbook, statutoryGuards.rule37_180Day?.items || []);
  }

  // ------------------------------------------------------------------
  // SHEET: VENDOR / CUSTOMER COMPLIANCE & ACTION PLAN
  // ------------------------------------------------------------------
  createVendorComplianceSheet(
    workbook, 
    vendorCompliance, 
    isOutward ? 'Customer Compliance (VRI)' : 'Vendor Action & Hold Summary',
    isOutward
  );

  return workbook;
}

// ------------------------------------------------------------------
// HELPER: Exact Match Line Item Sheet
// ------------------------------------------------------------------
function createLineItemSheet(workbook, sheetName, title, matches = [], isExact = true, isOutward = false) {
  const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 5 },
    { width: 18 }, // GSTIN
    { width: 30 }, // Vendor / Buyer Name
    { width: 18 }, // Invoice No
    { width: 14 }, // Date
    { width: 16 }, // Taxable Value
    { width: 12 }, // IGST
    { width: 12 }, // CGST
    { width: 12 }, // SGST
    { width: 14 }, // Total Tax
    { width: 16 }, // Invoice Total
    { width: 25 }  // Remarks
  ];

  applyBanner(ws, title, PRIMARY_NAVY, 'B', 'L');

  const headers = [
    isOutward ? 'Buyer GSTIN' : 'Supplier GSTIN', 
    isOutward ? 'Buyer / Receiver Name' : 'Supplier Name', 
    'Invoice Number', 
    'Date', 
    'Taxable (₹)', 
    'IGST (₹)', 
    'CGST (₹)', 
    'SGST (₹)', 
    'Total Tax (₹)', 
    'Total Value (₹)', 
    'Audit Remark'
  ];
  applyTableHeader(ws, 4, headers, 'B');

  matches.forEach((m, idx) => {
    const item = m.prItem || m.gstr2bItem;
    const rIdx = 5 + idx;
    const r = ws.getRow(rIdx);
    r.getCell('B').value = item.supplierGstin;
    r.getCell('C').value = item.supplierName;
    r.getCell('D').value = item.invoiceNumber;
    r.getCell('E').value = item.invoiceDate;
    r.getCell('F').value = item.taxableValue;
    r.getCell('G').value = item.igst;
    r.getCell('H').value = item.cgst;
    r.getCell('I').value = item.sgst;
    r.getCell('J').value = item.totalTax;
    r.getCell('K').value = item.totalInvoiceValue;
    r.getCell('L').value = m.remarks;

    ['F', 'G', 'H', 'I', 'J', 'K'].forEach(col => {
      r.getCell(col).numFmt = '₹#,##0.00';
    });
    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  });

  if (matches.length > 0) {
    const totalRowIdx = 5 + matches.length;
    const tr = ws.getRow(totalRowIdx);
    tr.getCell('B').value = 'TOTAL';
    tr.getCell('B').font = { bold: true };
    ['F', 'G', 'H', 'I', 'J', 'K'].forEach(col => {
      tr.getCell(col).value = { formula: `SUM(${col}5:${col}${totalRowIdx - 1})` };
      tr.getCell(col).font = { bold: true };
      tr.getCell(col).numFmt = '₹#,##0.00';
    });
    applyBorders(tr, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
  }
}

// ------------------------------------------------------------------
// HELPER: Probable & Value Mismatches Sheet
// ------------------------------------------------------------------
function createProbableMatchesSheet(workbook, matches = [], isOutward = false) {
  const ws = workbook.addWorksheet('Probable & Mismatched', { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 5 },
    { width: 18 }, // B: GSTIN
    { width: 25 }, // C: Vendor / Buyer
    { width: 16 }, // D: PR / Books Inv
    { width: 16 }, // E: Portal Inv
    { width: 14 }, // F: Books Taxable
    { width: 14 }, // G: Portal Taxable
    { width: 14 }, // H: Taxable Diff
    { width: 14 }, // I: Books Rate (%)
    { width: 14 }, // J: Portal Rate (%)
    { width: 14 }, // K: Books Tax
    { width: 14 }, // L: Portal Tax
    { width: 14 }, // M: Tax Diff
    { width: 12 }, // N: Score
    { width: 45 }  // O: Discrepancy Reason
  ];

  applyBanner(
    ws, 
    isOutward 
      ? 'PROBABLE SALES MATCHES & VALUE/RATE DISCREPANCIES (Review & Rule 88C Actions)'
      : 'PROBABLE MATCHES & VALUE/RATE DISCREPANCIES (Review & Rule 88D Actions)', 
    AMBER_YELLOW, 
    'B', 
    'O'
  );

  const headers = [
    isOutward ? 'Buyer GSTIN' : 'Supplier GSTIN', 
    isOutward ? 'Buyer / Receiver Name' : 'Supplier Name', 
    'Books Inv No', 
    isOutward ? 'GSTR-1 Inv No' : '2B Inv No', 
    'Books Taxable', 
    isOutward ? 'GSTR-1 Taxable' : '2B Taxable', 
    'Taxable Diff', 
    'Books Rate (%)',
    isOutward ? 'GSTR-1 Rate (%)' : '2B Rate (%)',
    'Books Tax', 
    isOutward ? 'GSTR-1 Tax' : '2B Tax', 
    'Tax Diff', 
    'Match Score', 
    'Discrepancy & Statutory Note'
  ];
  applyTableHeader(ws, 4, headers, 'B');

  matches.forEach((m, idx) => {
    const rIdx = 5 + idx;
    const r = ws.getRow(rIdx);
    r.getCell('B').value = m.prItem.supplierGstin;
    r.getCell('C').value = m.prItem.supplierName;
    r.getCell('D').value = m.prItem.invoiceNumber;
    r.getCell('E').value = m.gstr2bItem.invoiceNumber;
    r.getCell('F').value = m.prItem.taxableValue;
    r.getCell('G').value = m.gstr2bItem.taxableValue;
    r.getCell('H').value = m.varianceTaxable;
    r.getCell('I').value = m.booksRate !== undefined ? `${m.booksRate}%` : '-';
    r.getCell('J').value = m.portalRate !== undefined ? `${m.portalRate}%` : '-';
    r.getCell('K').value = m.prItem.totalTax;
    r.getCell('L').value = m.gstr2bItem.totalTax;
    r.getCell('M').value = m.varianceTax;
    r.getCell('N').value = `${m.matchScore}%`;
    r.getCell('O').value = m.remarks;

    ['F', 'G', 'H', 'K', 'L', 'M'].forEach(col => {
      r.getCell(col).numFmt = '₹#,##0.00';
    });
    r.getCell('I').alignment = { horizontal: 'center' };
    r.getCell('J').alignment = { horizontal: 'center' };

    if (m.hasRateMismatch) {
      r.getCell('I').font = { color: { argb: 'FF7C3AED' }, bold: true };
      r.getCell('J').font = { color: { argb: 'FF7C3AED' }, bold: true };
    }
    if (m.varianceTaxable !== 0) r.getCell('H').font = { color: { argb: ROSE_RED }, bold: true };
    if (m.varianceTax !== 0) r.getCell('M').font = { color: { argb: m.hasRateMismatch ? 'FF7C3AED' : ROSE_RED }, bold: true };

    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']);
  });
}

// ------------------------------------------------------------------
// HELPER: Missing Invoices Sheet (PR or 2B / Sales or GSTR-1)
// ------------------------------------------------------------------
function createMissingSheet(workbook, sheetName, title, items = [], source = 'PR', isOutward = false) {
  const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 5 },
    { width: 18 }, // GSTIN
    { width: 30 }, // Vendor / Buyer Name
    { width: 18 }, // Invoice No
    { width: 14 }, // Date
    { width: 8 },  // POS
    { width: 16 }, // Taxable Value
    { width: 12 }, // IGST
    { width: 12 }, // CGST
    { width: 12 }, // SGST
    { width: 14 }, // Total Tax
    { width: 16 }, // Invoice Total
    { width: 35 }  // Risk Remarks
  ];

  applyBanner(ws, title, source === 'PR' ? ROSE_RED : EMERALD_GREEN, 'B', 'M');

  const headers = [
    isOutward ? 'Buyer GSTIN' : 'Supplier GSTIN', 
    isOutward ? 'Buyer / Receiver Name' : 'Supplier Name', 
    'Invoice Number', 
    'Invoice Date', 
    'POS', 
    'Taxable (₹)', 
    'IGST (₹)', 
    'CGST (₹)', 
    'SGST (₹)', 
    'Total Tax (₹)', 
    'Total Value (₹)', 
    isOutward ? 'Statutory Sales Remark' : 'Risk & Audit Remark'
  ];
  applyTableHeader(ws, 4, headers, 'B');

  items.forEach((m, idx) => {
    const item = source === 'PR' ? m.prItem : m.gstr2bItem;
    const rIdx = 5 + idx;
    const r = ws.getRow(rIdx);
    r.getCell('B').value = item.supplierGstin;
    r.getCell('C').value = item.supplierName;
    r.getCell('D').value = item.invoiceNumber;
    r.getCell('E').value = item.invoiceDate;
    r.getCell('F').value = item.pos;
    r.getCell('G').value = item.taxableValue;
    r.getCell('H').value = item.igst;
    r.getCell('I').value = item.cgst;
    r.getCell('J').value = item.sgst;
    r.getCell('K').value = item.totalTax;
    r.getCell('L').value = item.totalInvoiceValue;
    r.getCell('M').value = m.remarks;

    ['G', 'H', 'I', 'J', 'K', 'L'].forEach(col => {
      r.getCell(col).numFmt = '₹#,##0.00';
    });
    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']);
  });

  if (items.length > 0) {
    const totalRowIdx = 5 + items.length;
    const tr = ws.getRow(totalRowIdx);
    tr.getCell('B').value = 'TOTAL';
    tr.getCell('B').font = { bold: true };
    ['G', 'H', 'I', 'J', 'K', 'L'].forEach(col => {
      tr.getCell(col).value = { formula: `SUM(${col}5:${col}${totalRowIdx - 1})` };
      tr.getCell(col).font = { bold: true };
      tr.getCell(col).numFmt = '₹#,##0.00';
    });
    applyBorders(tr, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']);
  }
}

// ------------------------------------------------------------------
// HELPER: Section 17(5) Blocked Credits Sheet
// ------------------------------------------------------------------
function createSection17_5Sheet(workbook, items = []) {
  const ws = workbook.addWorksheet('Sec 17(5) Blocked ITC', { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 5 },
    { width: 18 }, // GSTIN
    { width: 28 }, // Vendor
    { width: 16 }, // Inv No
    { width: 14 }, // Date
    { width: 14 }, // Taxable
    { width: 14 }, // Blocked Tax
    { width: 16 }, // Clause
    { width: 40 }  // Reason
  ];

  applyBanner(ws, 'INELIGIBLE INPUT TAX CREDIT UNDER SECTION 17(5) OF CGST ACT', 'FF4C1D95', 'B', 'I');

  const headers = ['Supplier GSTIN', 'Supplier Name', 'Invoice Number', 'Date', 'Taxable (₹)', 'Blocked Tax (₹)', 'Statutory Clause', 'Reason for Ineligibility'];
  applyTableHeader(ws, 4, headers, 'B');

  items.forEach((m, idx) => {
    const item = m.prItem;
    const rIdx = 5 + idx;
    const r = ws.getRow(rIdx);
    r.getCell('B').value = item.supplierGstin;
    r.getCell('C').value = item.supplierName;
    r.getCell('D').value = item.invoiceNumber;
    r.getCell('E').value = item.invoiceDate;
    r.getCell('F').value = item.taxableValue;
    r.getCell('G').value = item.totalTax;
    r.getCell('H').value = item.blocked17_5Clause || 'Sec 17(5)';
    r.getCell('I').value = item.blocked17_5Reason;

    r.getCell('F').numFmt = '₹#,##0.00';
    r.getCell('G').numFmt = '₹#,##0.00';
    r.getCell('G').font = { bold: true, color: { argb: ROSE_RED } };

    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
  });
}

// ------------------------------------------------------------------
// HELPER: Rule 37 180-Day Payables Sheet
// ------------------------------------------------------------------
function createRule37Sheet(workbook, items = []) {
  const ws = workbook.addWorksheet('Rule 37 180-Day Watchdog', { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 5 },
    { width: 18 }, // GSTIN
    { width: 28 }, // Vendor
    { width: 16 }, // Inv No
    { width: 14 }, // Date
    { width: 14 }, // Tax
    { width: 14 }, // Days Elapsed
    { width: 22 }, // Reversal Status
    { width: 18 }  // Estimated 18% Int
  ];

  applyBanner(ws, 'RULE 37 PAYABLES AGING: MANDATORY ITC REVERSAL ON UNPAID VENDOR INVOICES (>180 DAYS)', ROSE_RED, 'B', 'I');

  const headers = ['Supplier GSTIN', 'Supplier Name', 'Invoice Number', 'Invoice Date', 'ITC Claimed (₹)', 'Days Elapsed', 'Statutory Status', 'Est. Interest @ 18% p.a.'];
  applyTableHeader(ws, 4, headers, 'B');

  items.forEach((item, idx) => {
    const rIdx = 5 + idx;
    const r = ws.getRow(rIdx);
    r.getCell('B').value = item.supplierGstin;
    r.getCell('C').value = item.supplierName;
    r.getCell('D').value = item.invoiceNumber;
    r.getCell('E').value = item.date;
    r.getCell('F').value = item.tax;
    r.getCell('G').value = item.daysElapsed;
    r.getCell('H').value = item.status === 'REVERSAL_REQUIRED' ? '⚠️ REVERSAL REQUIRED' : 'APPROACHING 180 DAYS';
    r.getCell('I').value = item.estimatedInterest;

    r.getCell('F').numFmt = '₹#,##0.00';
    r.getCell('I').numFmt = '₹#,##0.00';
    r.getCell('H').font = { bold: true, color: { argb: item.status === 'REVERSAL_REQUIRED' ? ROSE_RED : AMBER_YELLOW } };

    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
  });
}

// ------------------------------------------------------------------
// HELPER: Vendor Action & Hold Sheet
// ------------------------------------------------------------------
function createVendorComplianceSheet(workbook, vendorScores = [], sheetName = 'Vendor Action & Hold', isOutward = false) {
  const ws = workbook.addWorksheet(sheetName, { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 5 },
    { width: 18 }, // GSTIN
    { width: 30 }, // Vendor / Buyer Name
    { width: 12 }, // VRI Score
    { width: 10 }, // Grade
    { width: 14 }, // Total Invoices
    { width: 14 }, // Missing Invoices
    { width: 16 }, // Total ITC / Tax
    { width: 18 }, // Unfiled Tax (Risk)
    { width: 22 }  // Recommended Action
  ];

  applyBanner(
    ws, 
    isOutward 
      ? 'CUSTOMER COMPLIANCE INDEX (VRI) & GSTR-1 REPORTING SCHEDULE' 
      : 'VENDOR COMPLIANCE INDEX (VRI) & AUTOMATED PAYMENT HOLD SCHEDULE', 
    'FF0F766E', 
    'B', 
    'J'
  );

  const headers = [
    isOutward ? 'Buyer GSTIN' : 'Supplier GSTIN', 
    isOutward ? 'Buyer / Customer Name' : 'Supplier Name', 
    'VRI Score', 
    'Grade', 
    'Total Invoices', 
    isOutward ? 'Unreported Invoices' : 'Unfiled Invoices', 
    isOutward ? 'Total Output Tax (₹)' : 'Total ITC (₹)', 
    isOutward ? 'Unreported Tax Risk (₹)' : 'Unfiled ITC Risk (₹)', 
    isOutward ? 'Omitted Output Tax (Hold)' : 'Recommended Payment Hold'
  ];
  applyTableHeader(ws, 4, headers, 'B');

  vendorScores.forEach((v, idx) => {
    const rIdx = 5 + idx;
    const r = ws.getRow(rIdx);
    r.getCell('B').value = v.gstin;
    r.getCell('C').value = v.vendorName;
    r.getCell('D').value = `${v.vriScore}%`;
    r.getCell('E').value = v.grade;
    r.getCell('F').value = v.totalInvoices;
    r.getCell('G').value = v.missingInvoicesCount;
    r.getCell('H').value = v.totalTax;
    r.getCell('I').value = v.unfiledTaxAmount;
    r.getCell('J').value = v.recommendedPaymentHold;

    r.getCell('H').numFmt = '₹#,##0.00';
    r.getCell('I').numFmt = '₹#,##0.00';
    r.getCell('J').numFmt = '₹#,##0.00';

    r.getCell('E').font = { bold: true, color: { argb: v.grade === 'A' ? EMERALD_GREEN : (v.grade === 'B' ? AMBER_YELLOW : ROSE_RED) } };
    r.getCell('J').font = { bold: true, color: { argb: v.recommendedPaymentHold > 0 ? ROSE_RED : EMERALD_GREEN } };

    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
  });
}

// ------------------------------------------------------------------
// SHARED STYLING UTILITIES
// ------------------------------------------------------------------
function applyBanner(ws, title, bgColor, startCol, endCol) {
  ws.mergeCells(`${startCol}2:${endCol}2`);
  const cell = ws.getCell(`${startCol}2`);
  cell.value = title;
  cell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 30;
}

function applyTableHeader(ws, rowIdx, headers, startColLetter = 'B') {
  const row = ws.getRow(rowIdx);
  row.height = 24;
  headers.forEach((h, idx) => {
    const colCode = startColLetter.charCodeAt(0) + idx;
    const colLetter = String.fromCharCode(colCode);
    const cell = row.getCell(colLetter);
    cell.value = h;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
}

function applySectionHeader(ws, rowIdx, startCol, endCol, text) {
  ws.mergeCells(`${startCol}${rowIdx}:${endCol}${rowIdx}`);
  const cell = ws.getCell(`${startCol}${rowIdx}`);
  cell.value = text;
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(rowIdx).height = 24;
}

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

function roundTo2(val) {
  return Math.round((val || 0) * 100) / 100;
}

// ------------------------------------------------------------------
// HELPER: Rate-Wise Reconciliation Sheet
// ------------------------------------------------------------------
function createRateWiseSheet(workbook, rateWiseData = {}, isOutward = false) {
  const ws = workbook.addWorksheet('Rate-Wise Reconciliation', { views: [{ showGridLines: true }] });
  ws.columns = [
    { width: 4 },
    { width: 28 }, // Rate Slab
    { width: 12 }, // Books Count
    { width: 18 }, // Books Taxable
    { width: 15 }, // Books CGST
    { width: 15 }, // Books SGST
    { width: 15 }, // Books IGST
    { width: 14 }, // Books Cess
    { width: 18 }, // Books Total Tax
    { width: 12 }, // Portal Count
    { width: 18 }, // Portal Taxable
    { width: 15 }, // Portal CGST
    { width: 15 }, // Portal SGST
    { width: 15 }, // Portal IGST
    { width: 14 }, // Portal Cess
    { width: 18 }, // Portal Total Tax
    { width: 18 }, // Taxable Variance
    { width: 18 }, // Tax Variance
    { width: 14 }, // Exact Matches
    { width: 14 }, // Rate Mismatches
    { width: 42 }  // Statutory Audit Advisory
  ];

  applyBanner(
    ws,
    isOutward 
      ? 'GST RATE-WISE RECONCILIATION: SALES REGISTER vs GSTR-1 (RULE 88C DRC-01B AUDIT MATRIX)' 
      : 'GST RATE-WISE RECONCILIATION: PURCHASE REGISTER vs GSTR-2B (RULE 88D DRC-01C AUDIT MATRIX)',
    PRIMARY_NAVY,
    'B',
    'U'
  );

  const headers = [
    'GST Rate Slab',
    isOutward ? 'Sales Invs' : 'Books Invs',
    isOutward ? 'Sales Taxable (₹)' : 'Books Taxable (₹)',
    'Books CGST (₹)',
    'Books SGST (₹)',
    'Books IGST (₹)',
    'Books Cess (₹)',
    isOutward ? 'Sales Output Tax (₹)' : 'Books ITC (₹)',
    'Portal Invs',
    isOutward ? 'GSTR-1 Taxable (₹)' : '2B Taxable (₹)',
    'Portal CGST (₹)',
    'Portal SGST (₹)',
    'Portal IGST (₹)',
    'Portal Cess (₹)',
    isOutward ? 'GSTR-1 Tax (₹)' : '2B ITC (₹)',
    'Taxable Variance (₹)',
    'Tax Variance (₹)',
    'Exact Matches',
    'Rate Mismatches',
    'Statutory Audit Advisory & Risk Status'
  ];
  applyTableHeader(ws, 4, headers, 'B');

  const slabs = rateWiseData.slabs || [];
  slabs.forEach((s, idx) => {
    const rIdx = 5 + idx;
    const r = ws.getRow(rIdx);

    r.getCell('B').value = s.label;
    r.getCell('C').value = s.books.count;
    r.getCell('D').value = s.books.taxable;
    r.getCell('E').value = s.books.cgst;
    r.getCell('F').value = s.books.sgst;
    r.getCell('G').value = s.books.igst;
    r.getCell('H').value = s.books.cess;
    r.getCell('I').value = s.books.totalTax;

    r.getCell('J').value = s.portal.count;
    r.getCell('K').value = s.portal.taxable;
    r.getCell('L').value = s.portal.cgst;
    r.getCell('M').value = s.portal.sgst;
    r.getCell('N').value = s.portal.igst;
    r.getCell('O').value = s.portal.cess;
    r.getCell('P').value = s.portal.totalTax;

    r.getCell('Q').value = s.variance.taxable;
    r.getCell('R').value = s.variance.totalTax;
    r.getCell('S').value = s.exactMatchesCount;
    r.getCell('T').value = s.rateMismatchesCount;
    r.getCell('U').value = s.statutoryRiskMessage || s.statutoryRisk;

    ['D', 'E', 'F', 'G', 'H', 'I', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'].forEach(col => {
      r.getCell(col).numFmt = '₹#,##0.00';
    });

    r.getCell('B').font = { bold: true };
    r.getCell('I').font = { bold: true };
    r.getCell('P').font = { bold: true };
    r.getCell('R').font = { 
      bold: true, 
      color: { argb: Math.abs(s.variance.totalTax) > 1.00 ? ROSE_RED : EMERALD_GREEN } 
    };
    r.getCell('U').font = { 
      bold: Math.abs(s.variance.totalTax) > 1.00, 
      color: { argb: s.statutoryRisk.includes('RISK') ? ROSE_RED : (s.statutoryRisk === 'BALANCED' ? EMERALD_GREEN : AMBER_YELLOW) } 
    };

    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']);
  });

  // Total Summary Row
  if (rateWiseData.summary) {
    const totRowIdx = 5 + slabs.length;
    const rTot = ws.getRow(totRowIdx);
    rTot.getCell('B').value = 'TOTAL (ALL SLABS)';
    rTot.getCell('C').value = slabs.reduce((acc, s) => acc + s.books.count, 0);
    rTot.getCell('D').value = rateWiseData.summary.totalBooksTaxable || 0;
    rTot.getCell('I').value = rateWiseData.summary.totalBooksTax || 0;
    rTot.getCell('J').value = slabs.reduce((acc, s) => acc + s.portal.count, 0);
    rTot.getCell('K').value = rateWiseData.summary.totalPortalTaxable || 0;
    rTot.getCell('P').value = rateWiseData.summary.totalPortalTax || 0;
    rTot.getCell('Q').value = rateWiseData.summary.totalTaxableVariance || 0;
    rTot.getCell('R').value = rateWiseData.summary.totalTaxVariance || 0;
    rTot.getCell('S').value = slabs.reduce((acc, s) => acc + s.exactMatchesCount, 0);
    rTot.getCell('T').value = slabs.reduce((acc, s) => acc + s.rateMismatchesCount, 0);
    rTot.getCell('U').value = Math.abs(rateWiseData.summary.totalTaxVariance || 0) > 1.00
      ? (isOutward ? '⚠️ Cumulative Output Tax Variance - Rule 88C Notice Risk' : '⚠️ Cumulative ITC Variance - Rule 88D Notice Risk')
      : '✅ Overall Rates Balanced & Reconciled';

    ['D', 'I', 'K', 'P', 'Q', 'R'].forEach(col => {
      rTot.getCell(col).numFmt = '₹#,##0.00';
    });

    ['B', 'C', 'D', 'I', 'J', 'K', 'P', 'Q', 'R', 'S', 'T', 'U'].forEach(col => {
      const c = rTot.getCell(col);
      c.font = { bold: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
    });
    rTot.getCell('R').font = { 
      bold: true, 
      color: { argb: Math.abs(rateWiseData.summary.totalTaxVariance || 0) > 1.00 ? ROSE_RED : EMERALD_GREEN } 
    };

    applyBorders(rTot, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']);
  }
}

/**
 * Dedicated Standalone Rate-Wise GST Reconciliation Workbook
 * Creates focused report specifically for GST Rate Slabs & Slab Shift Discrepancies
 */
export async function createRateWiseReconciliationWorkbook(reconResult) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Local AI Financial Bot - GST Rate Recon Engine';
  workbook.created = new Date();

  const isOutward = reconResult.reconType === 'OUTWARD' || reconResult.summary?.reconType === 'OUTWARD';
  const rateData = reconResult.rateWiseReconciliation || { slabs: [], invoices: [], summary: {} };

  // 1. Sheet 1: Rate Slab Summary
  createRateWiseSheet(workbook, rateData, isOutward);

  // 2. Sheet 2: Rate Variance Invoices Drilldown
  const wsVariance = workbook.addWorksheet('Rate Variance Invoices', { views: [{ showGridLines: true }] });
  wsVariance.columns = [
    { width: 4 },
    { width: 18 }, // GSTIN
    { width: 28 }, // Party Name
    { width: 18 }, // Inv No
    { width: 13 }, // Date
    { width: 14 }, // Books Rate
    { width: 14 }, // Portal Rate
    { width: 14 }, // Rate Diff
    { width: 18 }, // Books Taxable
    { width: 18 }, // Portal Taxable
    { width: 16 }, // Taxable Diff
    { width: 18 }, // Books Tax
    { width: 18 }, // Portal Tax
    { width: 16 }, // Tax Diff
    { width: 45 }  // Statutory Advice
  ];

  applyBanner(
    wsVariance,
    isOutward 
      ? 'TAX RATE SLAB VARIANCES: INVOICES BILLED AT DIFFERENT GST RATES (RULE 88C RISK)' 
      : 'TAX RATE SLAB VARIANCES: INVOICES BILLED AT DIFFERENT GST RATES (RULE 88D RISK)',
    'FF7C3AED',
    'B',
    'N'
  );

  const varHeaders = [
    isOutward ? 'Buyer GSTIN' : 'Supplier GSTIN',
    isOutward ? 'Buyer Name' : 'Supplier Name',
    'Invoice Number',
    'Invoice Date',
    'Books Rate (%)',
    'Portal Rate (%)',
    'Rate Shift (%)',
    'Books Taxable (₹)',
    'Portal Taxable (₹)',
    'Taxable Diff (₹)',
    'Books Tax (₹)',
    'Portal Tax (₹)',
    'Tax Diff (₹)',
    'Statutory Audit Advice & Rectification'
  ];
  applyTableHeader(wsVariance, 4, varHeaders, 'B');

  const rateVarInvoices = (rateData.invoices || []).filter(inv => inv.hasRateMismatch || Math.abs(inv.varianceTax || 0) >= 1.00);
  rateVarInvoices.forEach((inv, idx) => {
    const rIdx = 5 + idx;
    const r = wsVariance.getRow(rIdx);
    r.getCell('B').value = inv.supplierGstin;
    r.getCell('C').value = inv.supplierName;
    r.getCell('D').value = inv.invoiceNumber;
    r.getCell('E').value = inv.invoiceDate;
    r.getCell('F').value = `${inv.booksRate}%`;
    r.getCell('G').value = `${inv.portalRate}%`;
    r.getCell('H').value = `${inv.rateDiff}%`;
    r.getCell('I').value = inv.booksTaxable;
    r.getCell('J').value = inv.portalTaxable;
    r.getCell('K').value = inv.varianceTaxable;
    r.getCell('L').value = inv.booksTax;
    r.getCell('M').value = inv.portalTax;
    r.getCell('N').value = inv.varianceTax;
    r.getCell('O').value = inv.remarks;

    ['I', 'J', 'K', 'L', 'M', 'N'].forEach(col => {
      r.getCell(col).numFmt = '₹#,##0.00';
    });

    r.getCell('F').font = { bold: true, color: { argb: 'FF7C3AED' } };
    r.getCell('G').font = { bold: true, color: { argb: AMBER_YELLOW } };
    r.getCell('N').font = { bold: true, color: { argb: ROSE_RED } };

    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']);
  });

  // 3. Sheet 3: Complete Itemized Rate Mapping
  const wsAll = workbook.addWorksheet('Complete Itemized Rate List', { views: [{ showGridLines: true }] });
  wsAll.columns = [
    { width: 4 },
    { width: 18 },
    { width: 28 },
    { width: 18 },
    { width: 13 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 35 }
  ];

  applyBanner(wsAll, 'COMPLETE RECONCILED INVOICES BY GST RATE SLAB', PRIMARY_NAVY, 'B', 'M');
  const allHeaders = [
    isOutward ? 'Buyer GSTIN' : 'Supplier GSTIN',
    isOutward ? 'Buyer Name' : 'Supplier Name',
    'Invoice Number',
    'Date',
    'Books Rate',
    'Portal Rate',
    'Books Taxable (₹)',
    'Portal Taxable (₹)',
    'Books Tax (₹)',
    'Portal Tax (₹)',
    'Tax Diff (₹)',
    'Status',
    'Audit Remarks'
  ];
  applyTableHeader(wsAll, 4, allHeaders, 'B');

  (rateData.invoices || []).forEach((inv, idx) => {
    const rIdx = 5 + idx;
    const r = wsAll.getRow(rIdx);
    r.getCell('B').value = inv.supplierGstin;
    r.getCell('C').value = inv.supplierName;
    r.getCell('D').value = inv.invoiceNumber;
    r.getCell('E').value = inv.invoiceDate;
    r.getCell('F').value = `${inv.booksRate}%`;
    r.getCell('G').value = `${inv.portalRate}%`;
    r.getCell('H').value = inv.booksTaxable;
    r.getCell('I').value = inv.portalTaxable;
    r.getCell('J').value = inv.booksTax;
    r.getCell('K').value = inv.portalTax;
    r.getCell('L').value = inv.varianceTax;
    r.getCell('M').value = inv.statusBadge || inv.matchType;
    r.getCell('N').value = inv.remarks;

    ['H', 'I', 'J', 'K', 'L'].forEach(col => {
      r.getCell(col).numFmt = '₹#,##0.00';
    });

    applyBorders(r, ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N']);
  });

  return workbook;
}
