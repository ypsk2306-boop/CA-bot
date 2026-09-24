import ExcelJS from 'exceljs';
import { 
  SCHEDULE_III_ORDER, 
  SCHEDULE_III_BS_ORDER, 
  SCHEDULE_III_LIABILITY_CATEGORIES,
  SCHEDULE_III_ASSET_CATEGORIES,
  SCHEDULE_III_PNL_EXPENSE_CATEGORIES,
  calculateScheduleIIIRatios, 
  computeITRRecasting, 
  analyzeSection43BhMSME 
} from './indianAccountingKnowledge.js';

export async function createFinancialWorkbook(schema) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Local AI Financial Bot';
  workbook.created = new Date();

  const regime = schema.regime || (schema.docType === 'BALANCE_SHEET' ? 'COMPANIES_ACT_SCHEDULE_III_BS' : 'COMPANIES_ACT_SCHEDULE_III_PL');

  if (regime === 'GST_GSTR3B') {
    return createGSTR3BExcel(schema, workbook);
  } else if (regime === 'INCOME_TAX_44ADA') {
    return createPresumptiveTaxExcel(schema, workbook);
  } else if (regime === 'PARTNERSHIP_CAPITAL') {
    return createPartnershipExcel(schema, workbook);
  } else if (regime === 'TRIAL_BALANCE') {
    return createTrialBalanceExcel(schema, workbook);
  } else if (regime === 'NON_CORPORATE_ENTITY') {
    createNonCorporateFinancialsExcel(workbook, schema);
    createITRRecastingExcel(workbook, schema);
    createSection43BhMSMEExcel(workbook, schema);
    return workbook;
  } else if (regime === 'ITR_RECASTING') {
    createITRRecastingExcel(workbook, schema);
    const sheetPL = workbook.addWorksheet('Profit and Loss', { views: [{ showGridLines: true }] });
    createPLExcel(sheetPL, schema, true, workbook);
    return workbook;
  } else if (regime === 'SECTION_43B_H') {
    createSection43BhMSMEExcel(workbook, schema);
    return workbook;
  } else if (regime === 'SCHEDULE_III_RATIOS') {
    createScheduleIIIRatiosExcel(workbook, schema);
    return workbook;
  } else if (regime === 'COMPANIES_ACT_SCHEDULE_III_BS' || schema.docType === 'BALANCE_SHEET') {
    const hasComparative = (schema.lineItems || []).some(i => i.previousAmount !== undefined && i.previousAmount !== null);
    const sheet = workbook.addWorksheet('Balance Sheet', { views: [{ showGridLines: true }] });
    createBalanceSheetExcel(sheet, schema, hasComparative, workbook);
    createScheduleIIIRatiosExcel(workbook, schema);
    createITRRecastingExcel(workbook, schema);
    createSection43BhMSMEExcel(workbook, schema);
    return workbook;
  } else {
    const hasComparative = (schema.lineItems || []).some(i => i.previousAmount !== undefined && i.previousAmount !== null);
    const sheet = workbook.addWorksheet('Profit and Loss', { views: [{ showGridLines: true }] });
    createPLExcel(sheet, schema, hasComparative, workbook);
    createScheduleIIIRatiosExcel(workbook, schema);
    createITRRecastingExcel(workbook, schema);
    createSection43BhMSMEExcel(workbook, schema);
    return workbook;
  }
}

// ----------------------------------------------------
// 1. STATUTORY SCHEDULE III BALANCE SHEET EXCEL (PART I)
// ----------------------------------------------------
function createBalanceSheetExcel(sheet, schema, hasComparative, workbook) {
  const lastColLetter = hasComparative ? 'D' : 'C';
  const cyColLetter = hasComparative ? 'D' : 'C';
  const pyColLetter = 'C';

  sheet.columns = [
    { header: 'Particulars (Schedule III Part I)', key: 'particulars', width: 46 },
    { header: 'Note No.', key: 'noteNo', width: 12 },
    ...(hasComparative ? [{ header: 'Previous Year (₹)', key: 'pyAmount', width: 22 }] : []),
    { header: 'Current Year (INR ₹)', key: 'cyAmount', width: 24 }
  ];

  // Header Title Banner
  sheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = schema.title || 'Balance Sheet (As per Schedule III of Companies Act 2013)';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  sheet.mergeCells(`A2:${lastColLetter}2`);
  const subCell = sheet.getCell('A2');
  subCell.value = `Statutory Compliance: Section 129 & Schedule III Part I of Companies Act 2013 & Ind AS`;
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF94A3B8' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 22;

  const colHeaderRow = sheet.getRow(4);
  colHeaderRow.values = [
    'Particulars (Schedule III Part I)',
    'Note No.',
    ...(hasComparative ? ['Previous Year (₹)'] : []),
    'Current Year (₹)'
  ];
  colHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  colHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  sheet.getRow(4).height = 24;

  let currentRow = 5;
  let noteCounter = 1;
  const items = schema.lineItems || [];
  const liabilityCategories = SCHEDULE_III_LIABILITY_CATEGORIES;
  const liabItems = items.filter(i => liabilityCategories.includes(i.category));
  const assetItems = items.filter(i => !liabilityCategories.includes(i.category) && !i.category.includes('REVENUE') && !i.category.includes('OTHER INCOME'));

  // I. EQUITY AND LIABILITIES
  const liabHeaderRow = sheet.getRow(currentRow++);
  liabHeaderRow.values = ['I. EQUITY AND LIABILITIES', '', ...(hasComparative ? [''] : []), ''];
  liabHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  liabHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

  const liabRows = [];
  liabItems.forEach(item => {
    const row = sheet.getRow(currentRow);
    row.values = [
      `   ${item.label} [${item.category}]`,
      noteCounter++,
      ...(hasComparative ? [item.previousAmount || 0] : []),
      item.amount || 0
    ];
    if (hasComparative) row.getCell(3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    row.getCell(hasComparative ? 4 : 3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    liabRows.push(currentRow);
    currentRow++;
  });

  const totalLiabRow = sheet.getRow(currentRow++);
  const liabCYFormula = liabRows.length > 0 ? `SUM(${liabRows.map(r => `${cyColLetter}${r}`).join(',')})` : '0';
  const liabPYFormula = liabRows.length > 0 && hasComparative ? `SUM(${liabRows.map(r => `${pyColLetter}${r}`).join(',')})` : '0';
  totalLiabRow.values = [
    'TOTAL EQUITY AND LIABILITIES',
    '',
    ...(hasComparative ? [{ formula: liabPYFormula }] : []),
    { formula: liabCYFormula }
  ];
  totalLiabRow.font = { bold: true, color: { argb: 'FF1E3A8A' } };
  totalLiabRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
  if (hasComparative) totalLiabRow.getCell(3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
  totalLiabRow.getCell(hasComparative ? 4 : 3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';

  currentRow++; // Gap

  // II. ASSETS
  const assetHeaderRow = sheet.getRow(currentRow++);
  assetHeaderRow.values = ['II. ASSETS', '', ...(hasComparative ? [''] : []), ''];
  assetHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  assetHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } };

  const assetRows = [];
  assetItems.forEach(item => {
    const row = sheet.getRow(currentRow);
    row.values = [
      `   ${item.label} [${item.category}]`,
      noteCounter++,
      ...(hasComparative ? [item.previousAmount || 0] : []),
      item.amount || 0
    ];
    if (hasComparative) row.getCell(3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    row.getCell(hasComparative ? 4 : 3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    assetRows.push(currentRow);
    currentRow++;
  });

  const totalAssetRow = sheet.getRow(currentRow++);
  const assetCYFormula = assetRows.length > 0 ? `SUM(${assetRows.map(r => `${cyColLetter}${r}`).join(',')})` : '0';
  const assetPYFormula = assetRows.length > 0 && hasComparative ? `SUM(${assetRows.map(r => `${pyColLetter}${r}`).join(',')})` : '0';
  totalAssetRow.values = [
    'TOTAL ASSETS',
    '',
    ...(hasComparative ? [{ formula: assetPYFormula }] : []),
    { formula: assetCYFormula }
  ];
  totalAssetRow.font = { bold: true, color: { argb: 'FF065F46' } };
  totalAssetRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  if (hasComparative) totalAssetRow.getCell(3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
  totalAssetRow.getCell(hasComparative ? 4 : 3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';

  return workbook;
}

// ----------------------------------------------------
// 2. STATUTORY SCHEDULE III PROFIT & LOSS EXCEL (PART II)
// ----------------------------------------------------
function createPLExcel(sheet, schema, hasComparative, workbook) {
  const lastColLetter = 'E';
  const cyColLetter = 'D';
  const pyColLetter = 'E';

  const cyLabel = schema.currentYearLabel || '2024-25\n(Rs.)';
  const pyLabel = schema.previousYearLabel || '2023-24\n(Rs.)';

  sheet.columns = [
    { header: 'Sr. No.', key: 'srNo', width: 10 },
    { header: 'Particulars', key: 'particulars', width: 50 },
    { header: 'Note No.', key: 'noteNo', width: 12 },
    { header: cyLabel, key: 'cyAmount', width: 22 },
    { header: pyLabel, key: 'pyAmount', width: 22 }
  ];

  // Header Title Banners matching statutory company format
  sheet.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = sheet.getCell('A1');
  titleCell.value = (schema.companyName || schema.title || '[Company Name Not Detected — Please Verify]').toUpperCase();
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF000000' } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(1).height = 24;

  sheet.mergeCells(`A2:${lastColLetter}2`);
  const cinCell = sheet.getCell('A2');
  cinCell.value = schema.cin ? `CIN - ${schema.cin}` : 'CIN - [Not Detected / Unregistered]';
  cinCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF000000' } };
  cinCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(2).height = 20;

  sheet.mergeCells(`A3:${lastColLetter}3`);
  const stmtCell = sheet.getCell('A3');
  stmtCell.value = 'STATEMENT OF PROFIT AND LOSS';
  stmtCell.font = { name: 'Calibri', size: 11, bold: true, underline: true, color: { argb: 'FF000000' } };
  stmtCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(3).height = 20;

  sheet.mergeCells(`A4:${lastColLetter}4`);
  const periodCell = sheet.getCell('A4');
  periodCell.value = `For the year ended on ${schema.period || '31-03-2025'}`;
  periodCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
  periodCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sheet.getRow(4).height = 20;

  const colHeaderRow = sheet.getRow(5);
  colHeaderRow.values = [
    'Sr. No.',
    'Particulars',
    'Note No.',
    cyLabel,
    pyLabel
  ];
  colHeaderRow.font = { bold: true, color: { argb: 'FF000000' } };
  colHeaderRow.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(5).height = 28;

  let currentRow = 6;
  const items = schema.lineItems || [];

  const revOps = items.filter(i => i.category === 'REVENUE FROM OPERATIONS');
  const otherInc = items.filter(i => i.category === 'OTHER INCOME');
  const cogs = items.filter(i => i.category === 'COST OF MATERIALS CONSUMED');
  const stockPurch = items.filter(i => i.category === 'PURCHASES OF STOCK-IN-TRADE');
  const invChange = items.filter(i => i.category === 'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE');
  const empBenefits = items.filter(i => i.category === 'EMPLOYEE BENEFITS EXPENSE');
  const financeCosts = items.filter(i => i.category === 'FINANCE COSTS');
  const depAmort = items.filter(i => i.category === 'DEPRECIATION AND AMORTISATION EXPENSE');
  const otherExp = items.filter(i => i.category === 'OTHER EXPENSES' || (!SCHEDULE_III_ORDER.includes(i.category) && !i.category.includes('REVENUE')));

  const totalRevOpsCY = revOps.reduce((s, i) => s + (i.amount || 0), 0);
  const totalRevOpsPY = revOps.reduce((s, i) => s + (i.previousAmount || 0), 0);
  const totalOtherIncCY = otherInc.reduce((s, i) => s + (i.amount || 0), 0);
  const totalOtherIncPY = otherInc.reduce((s, i) => s + (i.previousAmount || 0), 0);

  // I. Grants & Donations / Revenue
  const rowI = sheet.getRow(currentRow++);
  const revLabel = revOps.length > 0 ? revOps[0].label : 'Grants & Donations received';
  const revNote = revOps[0]?.noteNo || '';
  rowI.values = ['I.', revLabel, revNote, totalRevOpsCY, totalRevOpsPY];
  rowI.getCell(1).alignment = { horizontal: 'center' };
  rowI.getCell(3).alignment = { horizontal: 'center' };
  rowI.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  rowI.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';

  // II. Other income
  const rowII = sheet.getRow(currentRow++);
  const otherLabel = otherInc.length > 0 ? otherInc[0].label : 'Other Income';
  const otherNote = otherInc[0]?.noteNo || '';
  rowII.values = ['II.', otherLabel, otherNote, totalOtherIncCY, totalOtherIncPY];
  rowII.getCell(1).alignment = { horizontal: 'center' };
  rowII.getCell(3).alignment = { horizontal: 'center' };
  rowII.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  rowII.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';

  // III. GROSS REVENUE (I + II)
  const rowIII = sheet.getRow(currentRow++);
  const revRowIIdx = currentRow - 2;
  const revRowIIIdx = currentRow - 1;
  rowIII.values = [
    'III.',
    'GROSS REVENUE (I + II)',
    '',
    { formula: `SUM(D${revRowIIdx}:D${revRowIIIdx})` },
    { formula: `SUM(E${revRowIIdx}:E${revRowIIIdx})` }
  ];
  rowIII.font = { bold: true };
  rowIII.getCell(1).alignment = { horizontal: 'center' };
  rowIII.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  rowIII.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  const totalRevRowIdx = currentRow - 1;

  // IV. EXPENSES Header
  const rowIVHeader = sheet.getRow(currentRow++);
  rowIVHeader.values = ['IV.', 'EXPENSES:', '', '', ''];
  rowIVHeader.font = { bold: true };
  rowIVHeader.getCell(1).alignment = { horizontal: 'center' };

  const startExpIdx = currentRow;

  const renderExpItem = (sr, label, note, itemsList) => {
    const cyVal = itemsList.reduce((s, i) => s + (i.amount || 0), 0);
    const pyVal = itemsList.reduce((s, i) => s + (i.previousAmount || 0), 0);
    const row = sheet.getRow(currentRow++);
    row.values = [sr, `   ${label}`, note, cyVal, pyVal];
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
    row.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  };

  renderExpItem('', 'Changes in Inventories', 8, invChange);
  renderExpItem('', 'Other Expenses', 9, otherExp);
  renderExpItem('', 'Depreciation', '', depAmort);

  const endExpIdx = currentRow - 1;

  // TOTAL EXPENSES (IV)
  const rowTotalExp = sheet.getRow(currentRow++);
  rowTotalExp.values = [
    '',
    'TOTAL EXPENSES (IV)',
    '',
    { formula: `SUM(D${startExpIdx}:D${endExpIdx})` },
    { formula: `SUM(E${startExpIdx}:E${endExpIdx})` }
  ];
  rowTotalExp.font = { bold: true };
  rowTotalExp.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  rowTotalExp.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  const totalExpRowIdx = currentRow - 1;

  // V. PROFIT/(LOSS) BEFORE TAX (III - IV)
  const rowV = sheet.getRow(currentRow++);
  rowV.values = [
    'V.',
    'PROFIT/(LOSS) BEFORE TAX (III - IV)',
    '',
    { formula: `D${totalRevRowIdx}-D${totalExpRowIdx}` },
    { formula: `E${totalRevRowIdx}-E${totalExpRowIdx}` }
  ];
  rowV.font = { bold: true };
  rowV.getCell(1).alignment = { horizontal: 'center' };
  rowV.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  rowV.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  const pbtRowIdx = currentRow - 1;

  // VI. Tax Expense Header
  const rowVIHeader = sheet.getRow(currentRow++);
  rowVIHeader.values = ['VI.', 'Tax Expense:', '', '', ''];
  rowVIHeader.font = { bold: true };
  rowVIHeader.getCell(1).alignment = { horizontal: 'center' };

  const startTaxIdx = currentRow;

  const rowTax1 = sheet.getRow(currentRow++);
  rowTax1.values = ['', '   - Current Tax', '', 0, 0];
  rowTax1.getCell(1).alignment = { horizontal: 'center' };
  rowTax1.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  rowTax1.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';

  const rowTax2 = sheet.getRow(currentRow++);
  rowTax2.values = ['', '   - Deferred Tax', '', 0, 0];
  rowTax2.getCell(1).alignment = { horizontal: 'center' };
  rowTax2.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  rowTax2.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';

  const endTaxIdx = currentRow - 1;

  // VII. PROFIT/(LOSS) FOR THE YEAR
  const rowVII = sheet.getRow(currentRow++);
  rowVII.values = [
    'VII.',
    'PROFIT/(LOSS) FOR THE YEAR (V - VI)',
    '',
    { formula: `D${pbtRowIdx}-SUM(D${startTaxIdx}:D${endTaxIdx})` },
    { formula: `E${pbtRowIdx}-SUM(E${startTaxIdx}:E${endTaxIdx})` }
  ];
  rowVII.font = { bold: true };
  rowVII.getCell(1).alignment = { horizontal: 'center' };
  rowVII.getCell(4).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  rowVII.getCell(5).numFmt = '₹#,##,##0.00;[Red](₹#,##,##0.00);"-"';
  sheet.views = [{ showGridLines: true }];
  return workbook;
}

// ----------------------------------------------------
// 3. STATUTORY GST GSTR-3B RETURN EXCEL
// ----------------------------------------------------
function createGSTR3BExcel(schema, workbook) {
  const sheet = workbook.addWorksheet('GSTR-3B Return', { views: [{ showGridLines: true }] });
  sheet.columns = [
    { header: 'Nature of Supplies / Table Reference', key: 'nature', width: 44 },
    { header: 'Supply Type', key: 'type', width: 18 },
    { header: 'Total Taxable Value (₹)', key: 'taxable', width: 24 },
    { header: 'Integrated Tax IGST (₹)', key: 'igst', width: 22 },
    { header: 'Central Tax CGST (₹)', key: 'cgst', width: 22 },
    { header: 'State Tax SGST (₹)', key: 'sgst', width: 22 }
  ];

  sheet.mergeCells('A1:F1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = schema.title || 'Form GSTR-3B: Monthly Summary Return (GST Act 2017)';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:F2');
  const subCell = sheet.getCell('A2');
  subCell.value = 'Statutory Return under Section 39 of CGST Act 2017 & Rule 61(5) | Note: Outward supplies default to Intra-State unless labelled Inter-State / Export';
  subCell.font = { italic: true, size: 10, color: { argb: 'FF94A3B8' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // Table 3.1
  const t31Header = sheet.getRow(4);
  t31Header.values = ['3.1 Details of Outward Supplies & Inward Supplies liable to Reverse Charge', '', '', '', '', ''];
  t31Header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  t31Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };

  sheet.getRow(5).values = ['Nature of Supply', 'Supply Type', 'Taxable Value (₹)', 'IGST (Inter-State)', 'CGST (Intra-State)', 'SGST (Intra-State)'];
  sheet.getRow(5).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

  let currentRow = 6;
  const items = schema.lineItems || [];
  const defaultGstRate = schema.gstRate != null ? schema.gstRate : 0.18; // 18% default statutory rate
  const halfDefaultGst = defaultGstRate / 2;

  items.forEach(item => {
    const row = sheet.getRow(currentRow);
    const taxable = item.amount || 0;
    const labelLower = (item.label || '').toLowerCase();
    const isInterstate = item.isInterstate != null ? item.isInterstate : (labelLower.includes('inter-state') || labelLower.includes('interstate') || labelLower.includes('export') || labelLower.includes('igst') || labelLower.includes('outside state'));
    const itemGstRate = item.gstRate != null ? item.gstRate : defaultGstRate;
    const itemHalfGst = itemGstRate / 2;

    row.values = [
      `   ${item.label}`,
      isInterstate ? 'Inter-State' : 'Intra-State',
      taxable,
      isInterstate ? { formula: `C${currentRow}*${itemGstRate}` } : 0,
      !isInterstate ? { formula: `C${currentRow}*${itemHalfGst}` } : 0,
      !isInterstate ? { formula: `C${currentRow}*${itemHalfGst}` } : 0
    ];
    row.getCell(3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    row.getCell(4).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    row.getCell(5).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    row.getCell(6).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    currentRow++;
  });

  const lastItemRow = currentRow - 1;
  const totalRow = sheet.getRow(currentRow++);
  const hasItems = lastItemRow >= 6;
  totalRow.values = [
    'TOTAL OUTWARD TAX LIABILITY (Table 3.1)',
    '',
    hasItems ? { formula: `SUM(C6:C${lastItemRow})` } : 0,
    hasItems ? { formula: `SUM(D6:D${lastItemRow})` } : 0,
    hasItems ? { formula: `SUM(E6:E${lastItemRow})` } : 0,
    hasItems ? { formula: `SUM(F6:F${lastItemRow})` } : 0
  ];
  totalRow.font = { bold: true, color: { argb: 'FF065F46' } };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  totalRow.getCell(3).numFmt = '₹#,##,##0';
  totalRow.getCell(4).numFmt = '₹#,##,##0';
  totalRow.getCell(5).numFmt = '₹#,##,##0';
  totalRow.getCell(6).numFmt = '₹#,##,##0';

  return workbook;
}

// ----------------------------------------------------
// 4. STATUTORY PRESUMPTIVE TAXATION EXCEL (44AD/44ADA)
// ----------------------------------------------------
function createPresumptiveTaxExcel(schema, workbook) {
  const sheet = workbook.addWorksheet('Section 44AD_44ADA', { views: [{ showGridLines: true }] });
  sheet.columns = [
    { header: 'Particulars under Income Tax Act 1961', key: 'particulars', width: 48 },
    { header: 'Computation Rate / Section Reference', key: 'rate', width: 30 },
    { header: 'Amount (INR ₹)', key: 'amount', width: 24 }
  ];

  sheet.mergeCells('A1:C1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = schema.title || 'Presumptive Income Statement (Section 44AD / 44ADA)';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:C2');
  const subCell = sheet.getCell('A2');
  subCell.value = 'Presumptive Taxation Regime under Income Tax Act 1961 & Section 115BAC';
  subCell.font = { italic: true, size: 10, color: { argb: 'FF94A3B8' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.getRow(4).values = ['Particulars', 'Rate / Statutory Basis', 'Amount (₹)'];
  sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

  let currentRow = 5;
  const items = schema.lineItems || [];
  const grossReceipts = items.reduce((sum, i) => sum + (i.amount || 0), 0);
  const section = schema.section || (schema.presumptiveSection || '44ADA');
  const is44AD = section === '44AD';
  const rate = schema.rate != null ? schema.rate : (is44AD ? 0.06 : 0.50);
  const rateLabel = is44AD 
    ? `${Math.round(rate * 100)}% under Sec 44AD (${rate === 0.06 ? 'Digital/Bank Mode' : 'Cash Mode'})` 
    : `${Math.round(rate * 100)}% under Sec 44ADA (Specified Professionals)`;

  const rowGross = sheet.getRow(currentRow++);
  rowGross.values = ['1. Gross Professional / Business Receipts', is44AD ? 'Eligible Business Turnover' : 'Gross Professional Receipts', grossReceipts];
  rowGross.getCell(3).numFmt = '₹#,##,##0';

  const rowDeemed = sheet.getRow(currentRow++);
  rowDeemed.values = ['2. Deemed Presumptive Net Profit', rateLabel, { formula: `C5*${rate}` }];
  rowDeemed.font = { bold: true, color: { argb: 'FF059669' } };
  rowDeemed.getCell(3).numFmt = '₹#,##,##0';

  const rowDeduct = sheet.getRow(currentRow++);
  rowDeduct.values = ['3. Deductions under Chapter VI-A (80C, 80D)', 'Statutory Limit (₹1,50,000)', 150000];
  rowDeduct.font = { italic: true, color: { argb: 'FFDC2626' } };
  rowDeduct.getCell(3).numFmt = '₹#,##,##0';

  const rowNet = sheet.getRow(currentRow++);
  rowNet.values = ['4. NET TAXABLE BUSINESS INCOME', 'Deemed Profit (2) - Deductions (3)', { formula: `MAX(0, C6-C7)` }];
  rowNet.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
  rowNet.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  rowNet.getCell(3).numFmt = '₹#,##,##0';

  // Part B: Step-by-Step Progressive Slabs (Sec 115BAC) & Section 87A Rebate
  const rowHeaderB = sheet.getRow(currentRow++);
  rowHeaderB.values = ['Part B: Progressive Tax Slabs (Sec 115BAC)', 'New Tax Regime Multi-Bracket Slabs', ''];
  rowHeaderB.font = { bold: true, color: { argb: 'FF1E293B' } };
  rowHeaderB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

  const rowSlab1 = sheet.getRow(currentRow++); // Row 10
  rowSlab1.values = ['• Slab 1: Up to ₹3,00,000', 'Nil Rate (0%)', 0];
  rowSlab1.getCell(3).numFmt = '₹#,##,##0';

  const rowSlab2 = sheet.getRow(currentRow++); // Row 11
  rowSlab2.values = ['• Slab 2: ₹3,00,001 to ₹6,00,000', '5% on Income in Bracket', { formula: 'MAX(0, MIN(C8-300000, 300000)*0.05)' }];
  rowSlab2.getCell(3).numFmt = '₹#,##,##0';

  const rowSlab3 = sheet.getRow(currentRow++); // Row 12
  rowSlab3.values = ['• Slab 3: ₹6,00,001 to ₹9,00,000', '10% on Income in Bracket', { formula: 'MAX(0, MIN(MAX(0, C8-600000), 300000)*0.10)' }];
  rowSlab3.getCell(3).numFmt = '₹#,##,##0';

  const rowSlab4 = sheet.getRow(currentRow++); // Row 13
  rowSlab4.values = ['• Slab 4: ₹9,00,001 to ₹12,00,000', '15% on Income in Bracket', { formula: 'MAX(0, MIN(MAX(0, C8-900000), 300000)*0.15)' }];
  rowSlab4.getCell(3).numFmt = '₹#,##,##0';

  const rowSlab5 = sheet.getRow(currentRow++); // Row 14
  rowSlab5.values = ['• Slab 5: ₹12,00,001 to ₹15,00,000', '20% on Income in Bracket', { formula: 'MAX(0, MIN(MAX(0, C8-1200000), 300000)*0.20)' }];
  rowSlab5.getCell(3).numFmt = '₹#,##,##0';

  const rowSlab6 = sheet.getRow(currentRow++); // Row 15
  rowSlab6.values = ['• Slab 6: Above ₹15,00,000', '30% on Income exceeding ₹15,00,000', { formula: 'MAX(0, (C8-1500000)*0.30)' }];
  rowSlab6.getCell(3).numFmt = '₹#,##,##0';

  const rowGrossTax = sheet.getRow(currentRow++); // Row 16
  rowGrossTax.values = ['5. Gross Income Tax (Sum of Slabs)', 'Total Slab Tax before Rebate', { formula: 'SUM(C10:C15)' }];
  rowGrossTax.font = { bold: true };
  rowGrossTax.getCell(3).numFmt = '₹#,##,##0';

  const rowRebate = sheet.getRow(currentRow++); // Row 17
  rowRebate.values = ['6. Less: Section 87A Tax Rebate', '100% Tax Rebate if Net Income <= ₹7,00,000 (Max ₹25,000)', { formula: 'IF(C8<=700000, MIN(C16, 25000), 0)' }];
  rowRebate.font = { italic: true, color: { argb: 'FF059669' } };
  rowRebate.getCell(3).numFmt = '₹#,##,##0';

  const rowTaxAfterRebate = sheet.getRow(currentRow++); // Row 18
  rowTaxAfterRebate.values = ['7. Net Tax Payable after Sec 87A Rebate', 'Gross Tax (5) - Rebate (6)', { formula: 'MAX(0, C16-C17)' }];
  rowTaxAfterRebate.font = { bold: true };
  rowTaxAfterRebate.getCell(3).numFmt = '₹#,##,##0';

  const rowCess = sheet.getRow(currentRow++); // Row 19
  rowCess.values = ['8. Health & Education Cess (4%)', '4% on Net Tax Payable', { formula: 'C18*0.04' }];
  rowCess.getCell(3).numFmt = '₹#,##,##0';

  const rowTotalTax = sheet.getRow(currentRow++); // Row 20
  rowTotalTax.values = ['9. TOTAL TAX PAYABLE', 'Net Tax (7) + Cess (8)', { formula: 'C18+C19' }];
  rowTotalTax.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  rowTotalTax.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  rowTotalTax.getCell(3).numFmt = '₹#,##,##0';

  return workbook;
}

// ----------------------------------------------------
// 5. STATUTORY PARTNERSHIP CAPITAL ACCOUNTS EXCEL
// ----------------------------------------------------
function createPartnershipExcel(schema, workbook) {
  const sheet = workbook.addWorksheet('Partner Capital Accounts', { views: [{ showGridLines: true }] });
  sheet.columns = [
    { header: 'Particulars (Partnership Act 1932)', key: 'particulars', width: 44 },
    { header: 'Schedule Head', key: 'head', width: 22 },
    { header: 'Amount (INR ₹)', key: 'amount', width: 24 }
  ];

  sheet.mergeCells('A1:C1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = schema.title || 'Statement of Affairs & Partner Capital Accounts';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:C2');
  const subCell = sheet.getCell('A2');
  subCell.value = 'Statutory Accounts under Partnership Act 1932 & Section 40(b) of Income Tax Act';
  subCell.font = { italic: true, size: 10, color: { argb: 'FF94A3B8' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.getRow(4).values = ['Particulars', 'Category / Head', 'Amount (₹)'];
  sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

  let currentRow = 5;
  const items = schema.lineItems || [];
  const rows = [];

  items.forEach(item => {
    const row = sheet.getRow(currentRow);
    row.values = [item.label, item.category, item.amount];
    row.getCell(3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    rows.push(currentRow);
    currentRow++;
  });

  const totalRow = sheet.getRow(currentRow);
  const sumFormula = rows.length > 0 ? `SUM(${rows.map(r => `C${r}`).join(',')})` : '0';
  totalRow.values = ['NET PARTNERS CAPITAL / EQUITY', 'TOTAL', { formula: sumFormula }];
  totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
  totalRow.getCell(3).numFmt = '₹#,##,##0';

  return workbook;
}

// ----------------------------------------------------
// 6. STATUTORY DOUBLE-ENTRY TRIAL BALANCE EXCEL
// ----------------------------------------------------
function createTrialBalanceExcel(schema, workbook) {
  const sheet = workbook.addWorksheet('Trial Balance', { views: [{ showGridLines: true }] });
  sheet.columns = [
    { header: 'Account Head / Ledger', key: 'ledger', width: 44 },
    { header: 'Classification Group', key: 'group', width: 28 },
    { header: 'Debit Amount (₹)', key: 'debit', width: 22 },
    { header: 'Credit Amount (₹)', key: 'credit', width: 22 }
  ];

  sheet.mergeCells('A1:D1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = schema.title || 'Double-Entry Trial Balance';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells('A2:D2');
  const subCell = sheet.getCell('A2');
  subCell.value = 'Double-Entry Ledger Balancing Verification (ICAI Accounting Standards)';
  subCell.font = { italic: true, size: 10, color: { argb: 'FF94A3B8' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.getRow(4).values = ['Particulars / Ledger Head', 'Classification Group', 'Debit (₹)', 'Credit (₹)'];
  sheet.getRow(4).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

  let currentRow = 5;
  const items = schema.lineItems || [];
  const debitRows = [];
  const creditRows = [];

  items.forEach(item => {
    const row = sheet.getRow(currentRow);
    const isDebit = ['PROPERTY, PLANT AND EQUIPMENT', 'INVENTORIES', 'TRADE RECEIVABLES', 'CASH AND CASH EQUIVALENTS', 'OTHER EXPENSES', 'COST OF MATERIALS CONSUMED', 'EMPLOYEE BENEFITS EXPENSE', 'FINANCE COSTS', 'DEPRECIATION AND AMORTISATION EXPENSE'].includes(item.category);
    if (isDebit) {
      row.values = [`   ${item.label}`, item.category, item.amount, ''];
      debitRows.push(currentRow);
    } else {
      row.values = [`   ${item.label}`, item.category, '', item.amount];
      creditRows.push(currentRow);
    }
    row.getCell(3).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    row.getCell(4).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    currentRow++;
  });

  const totalRow = sheet.getRow(currentRow++);
  const debFormula = debitRows.length > 0 ? `SUM(${debitRows.map(r => `C${r}`).join(',')})` : '0';
  const credFormula = creditRows.length > 0 ? `SUM(${creditRows.map(r => `D${r}`).join(',')})` : '0';
  totalRow.values = [
    'TOTAL TRIAL BALANCE',
    'TALLY CHECK',
    { formula: debFormula },
    { formula: credFormula }
  ];
  totalRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  totalRow.getCell(3).numFmt = '₹#,##,##0';
  totalRow.getCell(4).numFmt = '₹#,##,##0';

  const diffRow = sheet.getRow(currentRow);
  diffRow.values = [
    'VARIANCE / SUSPENSE ACCOUNT',
    'DEBIT - CREDIT',
    { formula: `C${currentRow - 1}-D${currentRow - 1}` },
    ''
  ];
  diffRow.font = { italic: true, bold: true, color: { argb: 'FF059669' } };
  diffRow.getCell(3).numFmt = '₹#,##,##0';

  return workbook;
}

// ----------------------------------------------------
// 6. STATEMENT OF AFFAIRS / SINGLE-ENTRY PROFIT EXCEL
// ----------------------------------------------------
function createStatementOfProfitExcel(sheet, schema, workbook) {
  sheet.columns = [
    { header: 'Particulars (Statement of Profit / Affairs Method)', key: 'particulars', width: 50 },
    { header: 'Amount (₹)', key: 'amount', width: 24 }
  ];

  // Header Title Banner
  sheet.mergeCells('A1:B1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = 'Statement of Profit / Loss (Statement of Affairs Method)';
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  sheet.mergeCells('A2:B2');
  const subCell = sheet.getCell('A2');
  subCell.value = 'Single-Entry & Comparative Balance Sheet Conversion (Net Worth Method)';
  subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF94A3B8' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  subCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 22;

  const colHeaderRow = sheet.getRow(4);
  colHeaderRow.values = ['Particulars', 'Amount (₹)'];
  colHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  colHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  sheet.getRow(4).height = 24;

  const items = schema.lineItems || [];
  const liabItems = items.filter(i => SCHEDULE_III_LIABILITY_CATEGORIES.includes(i.category));
  const assetItems = items.filter(i => !SCHEDULE_III_LIABILITY_CATEGORIES.includes(i.category) && !i.category.includes('REVENUE') && !i.category.includes('OTHER INCOME'));

  const totalAssetsCY = assetItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalAssetsPY = assetItems.reduce((sum, i) => sum + (i.previousAmount || 0), 0);
  const totalLiabCY = liabItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalLiabPY = liabItems.reduce((sum, i) => sum + (i.previousAmount || 0), 0);

  const closingCapital = totalAssetsCY - totalLiabCY;
  const openingCapital = totalAssetsPY - totalLiabPY;

  // Row 5: Closing Capital
  const r5 = sheet.getRow(5);
  r5.values = ['Capital at the End of the Period (Closing Net Worth)', closingCapital];
  r5.getCell(2).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
  r5.font = { bold: true };

  // Row 6: Add: Drawings
  const r6 = sheet.getRow(6);
  r6.values = ['Add: Drawings / Personal Withdrawals during the year', 0];
  r6.getCell(2).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';

  // Row 7: Less: Fresh Capital
  const r7 = sheet.getRow(7);
  r7.values = ['Less: Additional Capital Introduced during the year', 0];
  r7.getCell(2).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';

  // Row 8: Adjusted Closing Capital
  const r8 = sheet.getRow(8);
  r8.values = ['Adjusted Closing Capital [Closing + Drawings - Fresh Capital]', { formula: 'B5+B6-B7' }];
  r8.getCell(2).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
  r8.font = { bold: true };
  r8.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };

  // Row 9: Less: Opening Capital
  const r9 = sheet.getRow(9);
  r9.values = ['Less: Capital at the Beginning of the Period (Opening Net Worth)', openingCapital];
  r9.getCell(2).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';

  // Row 10: Derived Net Profit
  const r10 = sheet.getRow(10);
  r10.values = ['NET PROFIT / (LOSS) FOR THE YEAR [Adjusted Closing - Opening Capital]', { formula: 'B8-B9' }];
  r10.getCell(2).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
  r10.font = { bold: true, size: 11, color: { argb: 'FF065F46' } };
  r10.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  r10.height = 28;

  return workbook;
}

// ----------------------------------------------------
// 7. SCHEDULE III 11 STATUTORY RATIOS EXCEL SHEET
// ----------------------------------------------------
function createScheduleIIIRatiosExcel(workbook, schema) {
  const sheet = workbook.addWorksheet('Schedule III Ratios', { views: [{ showGridLines: true }] });
  sheet.columns = [
    { header: 'Sr. No.', key: 'srNo', width: 8 },
    { header: 'Analytical Ratio Name', key: 'name', width: 34 },
    { header: 'Numerator / Formula Basis', key: 'formula', width: 42 },
    { header: 'Current Period', key: 'valCY', width: 18 },
    { header: 'Previous Period', key: 'valPY', width: 18 },
    { header: 'Variance (%)', key: 'variance', width: 16 },
    { header: 'Statutory Benchmark / Remarks', key: 'benchmark', width: 36 }
  ];

  // Header Title
  sheet.mergeCells('A1:G1');
  sheet.getCell('A1').value = `${schema.companyName || 'COMPANY NAME'} - SCHEDULE III MANDATORY RATIOS`;
  sheet.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FF1E293B' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 30;

  // Table Headers
  const headerRow = sheet.getRow(3);
  headerRow.values = ['Sr.', 'Ratio Name', 'Formula Basis', `${schema.currentYearLabel || '2024-25'}`, `${schema.previousYearLabel || '2023-24'}`, 'Variance %', 'MCA Benchmark / Status'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  headerRow.height = 25;

  const ratios = calculateScheduleIIIRatios(schema.lineItems || []);
  let rowIdx = 4;

  ratios.forEach(r => {
    const row = sheet.getRow(rowIdx);
    const formattedCY = r.valCY !== null ? (r.unit === '%' ? `${r.valCY.toFixed(2)}%` : `${r.valCY.toFixed(2)} ${r.unit}`) : 'N/A';
    const formattedPY = r.valPY !== null ? (r.unit === '%' ? `${r.valPY.toFixed(2)}%` : `${r.valPY.toFixed(2)} ${r.unit}`) : 'N/A';
    const formattedVar = r.variancePct !== null ? `${r.variancePct > 0 ? '+' : ''}${r.variancePct.toFixed(1)}%` : '—';
    const statusRemark = r.valCY === null ? 'Insufficient Data' : (r.reasonRequired ? `⚠️ Variance > 25% (Explanation Required)` : `✓ Within Range (${r.benchmark})`);

    row.values = [
      r.srNo,
      r.name,
      r.formula,
      formattedCY,
      formattedPY,
      formattedVar,
      statusRemark
    ];

    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(5).alignment = { horizontal: 'right' };
    row.getCell(6).alignment = { horizontal: 'right' };
    if (r.reasonRequired) {
      row.getCell(6).font = { color: { argb: 'FFDC2626' }, bold: true };
      row.getCell(7).font = { color: { argb: 'FFDC2626' }, bold: true };
    }
    rowIdx++;
  });

  return sheet;
}

// ----------------------------------------------------
// 8. ITR RECASTING (SCHEDULE BP) EXCEL SHEET
// ----------------------------------------------------
function createITRRecastingExcel(workbook, schema) {
  const sheet = workbook.addWorksheet('ITR Recasting (Schedule BP)', { views: [{ showGridLines: true }] });
  sheet.columns = [
    { header: 'Particulars (Schedule BP - Income Tax Act)', key: 'particulars', width: 60 },
    { header: 'Amount (₹)', key: 'amount', width: 22 }
  ];

  // Header Title
  sheet.mergeCells('A1:B1');
  sheet.getCell('A1').value = `RECASTING OF FINANCIAL STATEMENTS FOR ITR (SCHEDULE BP)`;
  sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 28;

  const revSum = (schema.lineItems || []).filter(i => i.category.includes('REVENUE') || i.category.includes('OTHER INCOME')).reduce((s, i) => s + (i.amount || 0), 0);
  const expSum = (schema.lineItems || []).filter(i => !i.category.includes('REVENUE') && !i.category.includes('OTHER INCOME') && !i.category.includes('TAX')).reduce((s, i) => s + (i.amount || 0), 0);
  const pbt = revSum - expSum;

  const recasting = computeITRRecasting(pbt, schema.lineItems || []);

  const rows = [
    ['1. Net Profit before Tax as per Books of Account (P&L)', recasting.bookPbt],
    ['2. Add: Inadmissible Expenses & Statutory Additions (Part A):', null],
    ['   - Book Depreciation (added back for separate Sec 32 claim)', recasting.additions.bookDepreciation],
    ['   - Disallowance u/s 43B(h) (MSME Delayed Overdue Payments)', recasting.additions.disallowance43Bh],
    ['   - Disallowance u/s 40(a)(ia) (30% on TDS Defaults)', recasting.additions.disallowance40a_ia],
    ['   - Disallowance u/s 40A(3) (Cash Payments > ₹10,000)', recasting.additions.disallowance40A_3],
    ['   - Excess Remuneration to Partners u/s 40(b)', recasting.additions.excessPartnerRemun],
    ['   - Personal & Inadmissible Business Expenses', recasting.additions.personalInadmissible],
    ['   TOTAL ADDITIONS', recasting.additions.total],
    ['3. Less: Allowable Deductions & Other Heads (Part B):', null],
    ['   - Depreciation allowable u/s 32 (as per Income Tax Rules)', recasting.deductions.taxDepreciationSec32],
    ['   - Income credited to P&L taxable under other heads (House Prop/Capital Gains/FD)', recasting.deductions.otherHeadIncome],
    ['   - Deductions under Chapter VI-A / Section 80JJAA', recasting.deductions.chapterVIA_80JJAA],
    ['   TOTAL DEDUCTIONS', recasting.deductions.total],
    ['4. TAXABLE PROFITS AND GAINS OF BUSINESS OR PROFESSION (1 + 2 - 3)', recasting.taxableBusinessIncome]
  ];

  let rIdx = 3;
  rows.forEach(([label, val]) => {
    const row = sheet.getRow(rIdx);
    row.values = [label, val !== null ? val : ''];
    if (val !== null) {
      row.getCell(2).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    }
    if (label.startsWith('1.') || label.startsWith('4.') || label.includes('TOTAL')) {
      row.font = { bold: true };
      if (label.startsWith('4.')) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        row.font = { bold: true, color: { argb: 'FF065F46' } };
        row.height = 25;
      }
    }
    rIdx++;
  });

  return sheet;
}

// ----------------------------------------------------
// 9. SECTION 43B(h) MSME COMPLIANCE EXCEL SHEET
// ----------------------------------------------------
function createSection43BhMSMEExcel(workbook, schema) {
  const sheet = workbook.addWorksheet('Sec 43B(h) MSME Compliance', { views: [{ showGridLines: true }] });
  sheet.columns = [
    { header: 'Vendor / Creditor Name', key: 'name', width: 32 },
    { header: 'Enterprise Category', key: 'type', width: 20 },
    { header: 'Agreement Status', key: 'agreement', width: 18 },
    { header: 'Allowed Days Limit', key: 'allowed', width: 18 },
    { header: 'Actual Days Outstanding', key: 'actual', width: 22 },
    { header: 'Closing Balance (₹)', key: 'amount', width: 20 },
    { header: 'Disallowance u/s 43B(h) (₹)', key: 'disallowance', width: 24 },
    { header: 'Compound Interest @ 3x RBI (₹)', key: 'interest', width: 26 }
  ];

  // Title
  sheet.mergeCells('A1:H1');
  sheet.getCell('A1').value = `SECTION 43B(h) MSME DELAYED PAYMENT AUDIT REPORT (MSMED ACT 2006)`;
  sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 28;

  const headerRow = sheet.getRow(3);
  headerRow.values = ['Vendor / Creditor Name', 'Category', 'Agreement Status', 'Allowed Terms', 'Actual Days Overdue', 'Balance (₹)', 'Disallowed u/s 43B(h)', 'MSME Interest (3x RBI)'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9A3412' } };
  headerRow.height = 25;

  const msmeData = analyzeSection43BhMSME(schema.lineItems || []);
  let rIdx = 4;

  if (msmeData.vendors.length === 0) {
    const emptyRow = sheet.getRow(rIdx++);
    emptyRow.values = ['No Trade Payables / MSME Creditors Detected', '—', '—', '—', '—', 0, 0, 0];
    emptyRow.font = { italic: true, color: { argb: 'FF64748B' } };
    emptyRow.getCell(6).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    emptyRow.getCell(7).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    emptyRow.getCell(8).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
  } else {
    msmeData.vendors.forEach(v => {
      const row = sheet.getRow(rIdx);
      row.values = [
        v.vendorName,
        v.msmeType,
        v.hasAgreement ? 'Written (45 Days)' : 'No Agreement (15 Days)',
        `${v.allowedDays} Days`,
        `${v.actualDays} Days ${v.isDelayed ? '⚠️ Overdue' : '✓ Prompt'}`,
        v.amount,
        v.disallowedAmount43Bh,
        v.msmeInterest3xRBI
      ];
      row.getCell(6).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
      row.getCell(7).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
      row.getCell(8).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
      if (v.isDelayed) {
        row.getCell(7).font = { bold: true, color: { argb: 'FFDC2626' } };
        row.getCell(8).font = { bold: true, color: { argb: 'FFDC2626' } };
      }
      rIdx++;
    });
  }

  // Summary Row
  const sumRow = sheet.getRow(rIdx);
  sumRow.values = ['TOTAL AUDIT DISCLOSURES', '', '', '', '', msmeData.totalPayables, msmeData.totalDisallowed43Bh, msmeData.totalMSMEInterest];
  sumRow.font = { bold: true };
  sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
  sumRow.getCell(6).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
  sumRow.getCell(7).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
  sumRow.getCell(8).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';

  return sheet;
}

// ----------------------------------------------------
// 10. NON-CORPORATE FINANCIALS EXCEL SHEET (ICAI)
// ----------------------------------------------------
function createNonCorporateFinancialsExcel(workbook, schema) {
  const sheet = workbook.addWorksheet('Non-Corporate Financials', { views: [{ showGridLines: true }] });
  sheet.columns = [
    { header: 'Liabilities & Capital', key: 'liab', width: 38 },
    { header: 'Amount (₹)', key: 'liabAmt', width: 18 },
    { header: 'Assets & Properties', key: 'assets', width: 38 },
    { header: 'Amount (₹)', key: 'assetAmt', width: 18 }
  ];

  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = `${schema.companyName || 'NON-CORPORATE ENTITY'} - BALANCE SHEET (ICAI FORMAT)`;
  sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getRow(1).height = 28;

  const headerRow = sheet.getRow(3);
  headerRow.values = ['Capital & Liabilities', 'Amount (₹)', 'Properties & Assets', 'Amount (₹)'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  headerRow.height = 25;

  const liabs = (schema.lineItems || []).filter(i => SCHEDULE_III_LIABILITY_CATEGORIES.includes(i.category));
  const assets = (schema.lineItems || []).filter(i => !liabs.includes(i) && !i.category.includes('REVENUE') && !i.category.includes('OTHER INCOME'));

  const maxLen = Math.max(liabs.length, assets.length, 1);
  let rIdx = 4;

  for (let i = 0; i < maxLen; i++) {
    const l = liabs[i] || {};
    const a = assets[i] || {};
    const row = sheet.getRow(rIdx);
    row.values = [l.label || '', l.amount || '', a.label || '', a.amount || ''];
    if (l.amount) row.getCell(2).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    if (a.amount) row.getCell(4).numFmt = '₹#,##,##0;[Red](₹#,##,##0);"-"';
    rIdx++;
  }

  return sheet;
}
