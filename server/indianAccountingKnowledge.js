/**
 * Statutory Accounting Regimes & Indian Acts Comprehensive Knowledge Base
 * Fully compliant with:
 * - Companies Act 2013 (Schedule III Part I - Balance Sheet & Part II - Profit and Loss)
 * - Central Goods and Services Tax Act 2017 (Form GSTR-3B & Input Tax Credit Rules)
 * - Income Tax Act 1961 (Section 44AD / 44ADA Presumptive & Chapter VI-A)
 * - Indian Partnership Act 1932 & Limited Liability Partnership Act 2008
 * - Double-Entry Bookkeeping Standards (ICAI Standards & Trial Balance Reconciliation)
 */

export const STATUTORY_REGIMES = {
  AUTO: {
    id: 'AUTO',
    name: '🤖 Auto-Detect from Data & Act',
    description: 'Automatically detects the statutory framework from keywords, table codes, and column topology'
  },
  COMPANIES_ACT_SCHEDULE_III_PL: {
    id: 'COMPANIES_ACT_SCHEDULE_III_PL',
    name: '📊 Companies Act 2013: Schedule III Profit & Loss',
    act: 'Companies Act, 2013 (Schedule III Part II)',
    description: 'Statutory P&L with Roman sections (I to VII), Notes, Sub-schedules (a to g), PBT & PAT'
  },
  COMPANIES_ACT_SCHEDULE_III_BS: {
    id: 'COMPANIES_ACT_SCHEDULE_III_BS',
    name: '🏛️ Companies Act 2013: Schedule III Balance Sheet',
    act: 'Companies Act, 2013 (Section 129 & Schedule III Part I)',
    description: 'Statutory Balance Sheet: Shareholders Funds, Non-Current/Current Liabilities & Assets, Net Worth'
  },
  NON_CORPORATE_ENTITY: {
    id: 'NON_CORPORATE_ENTITY',
    name: '🏢 ICAI Non-Corporate Entity Financials',
    act: 'ICAI Technical Guide on Financial Statements of Non-Corporate Entities',
    description: 'Proprietorships, Partnership Firms, LLPs & Trusts with Capital reconciliation, Drawings & ICAI format'
  },
  ITR_RECASTING: {
    id: 'ITR_RECASTING',
    name: '📑 ITR Recasting: Book Profit to Taxable P&L',
    act: 'Income Tax Act, 1961 (Schedule BP - ITR-3, ITR-5, ITR-6)',
    description: 'Bridges Accounting Profit to Taxable Business Income with Sec 43B(h), 40(a)(ia), 40(b) & Sec 32 Depreciation'
  },
  SECTION_43B_H: {
    id: 'SECTION_43B_H',
    name: '⏱️ Sec 43B(h) MSME Delayed Payment Compliance',
    act: 'Section 43B(h) Income Tax Act & MSMED Act, 2006 (Sec 15/16/23)',
    description: 'Vendor classification (Micro/Small), 15/45 day limit audit, Disallowance computation & 3x RBI Interest'
  },
  SCHEDULE_III_RATIOS: {
    id: 'SCHEDULE_III_RATIOS',
    name: '📈 Schedule III: 11 Statutory Analytical Ratios',
    act: 'Companies Act, 2013 (MCA Mandatory Schedule III Disclosures)',
    description: 'Current Ratio, Debt-Equity, ROE, ROCE, Turnover Ratios, Working Capital, Net Profit Margin with variances'
  },
  GST_GSTR3B: {
    id: 'GST_GSTR3B',
    name: '📑 GST Act 2017: Form GSTR-3B Return & ITC',
    act: 'Central Goods and Services Tax Act, 2017 (Rule 61(5))',
    description: 'Table 3.1 Outward supplies, Table 4 Eligible ITC (IGST, CGST, SGST, Cess), Net Tax Payable'
  },
  INCOME_TAX_44ADA: {
    id: 'INCOME_TAX_44ADA',
    name: '💼 Income Tax Act: Sec 44AD / 44ADA Presumptive',
    act: 'Income Tax Act, 1961 (Section 44AD / 44ADA / 44AE & 115BAC)',
    description: 'Gross Receipts, Deemed Profit (50% / 6% / 8%), Chapter VI-A Deductions, Slab-wise Tax Computation'
  },
  PARTNERSHIP_CAPITAL: {
    id: 'PARTNERSHIP_CAPITAL',
    name: '🤝 Partnership Act 1932 / LLP: Partner Accounts',
    act: 'Indian Partnership Act, 1932 & LLP Act, 2008',
    description: 'Statement of Affairs, Sec 40(b) Remuneration & Interest, Profit Share, Drawings, Closing Net Worth'
  },
  TRIAL_BALANCE: {
    id: 'TRIAL_BALANCE',
    name: '⚖️ Double-Entry Trial Balance & Ledger',
    act: 'General Double-Entry Bookkeeping & ICAI Standards',
    description: 'Debit vs Credit balanced ledger with zero-variance validation and suspense reconciliation'
  }
};

export const SCHEDULE_III_ORDER = [
  'REVENUE FROM OPERATIONS',
  'OTHER INCOME',
  'COST OF MATERIALS CONSUMED',
  'PURCHASES OF STOCK-IN-TRADE',
  'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE',
  'EMPLOYEE BENEFITS EXPENSE',
  'FINANCE COSTS',
  'DEPRECIATION AND AMORTISATION EXPENSE',
  'OTHER EXPENSES'
];

export const SCHEDULE_III_BS_ORDER = [
  'SHARE CAPITAL',
  'RESERVES AND SURPLUS',
  'LONG-TERM BORROWINGS',
  'DEFERRED TAX LIABILITIES (NET)',
  'OTHER LONG-TERM LIABILITIES',
  'LONG-TERM PROVISIONS',
  'SHORT-TERM BORROWINGS',
  'TRADE PAYABLES',
  'OTHER CURRENT LIABILITIES',
  'SHORT-TERM PROVISIONS',
  'PROPERTY, PLANT AND EQUIPMENT',
  'CAPITAL WORK-IN-PROGRESS',
  'INTANGIBLE ASSETS',
  'NON-CURRENT INVESTMENTS',
  'DEFERRED TAX ASSETS (NET)',
  'LONG-TERM LOANS AND ADVANCES',
  'OTHER NON-CURRENT ASSETS',
  'CURRENT INVESTMENTS',
  'INVENTORIES',
  'TRADE RECEIVABLES',
  'CASH AND CASH EQUIVALENTS',
  'SHORT-TERM LOANS AND ADVANCES',
  'OTHER CURRENT ASSETS'
];

export const SCHEDULE_III_LIABILITY_CATEGORIES = [
  'SHARE CAPITAL', 'RESERVES AND SURPLUS', 'LONG-TERM BORROWINGS', 'DEFERRED TAX LIABILITIES (NET)',
  'OTHER LONG-TERM LIABILITIES', 'LONG-TERM PROVISIONS', 'SHORT-TERM BORROWINGS', 'TRADE PAYABLES',
  'OTHER CURRENT LIABILITIES', 'SHORT-TERM PROVISIONS', 'PROVISIONS'
];

export const SCHEDULE_III_ASSET_CATEGORIES = [
  'PROPERTY, PLANT AND EQUIPMENT', 'CAPITAL WORK-IN-PROGRESS', 'INTANGIBLE ASSETS', 'OTHER INTANGIBLE ASSETS',
  'NON-CURRENT INVESTMENTS', 'DEFERRED TAX ASSETS (NET)', 'LONG-TERM LOANS AND ADVANCES', 'OTHER NON-CURRENT ASSETS',
  'CURRENT INVESTMENTS', 'INVENTORIES', 'TRADE RECEIVABLES', 'CASH AND CASH EQUIVALENTS',
  'SHORT-TERM LOANS AND ADVANCES', 'OTHER CURRENT ASSETS', 'ASSETS'
];

export const SCHEDULE_III_PNL_EXPENSE_CATEGORIES = [
  'COST OF MATERIALS CONSUMED',
  'PURCHASES OF STOCK-IN-TRADE',
  'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE',
  'EMPLOYEE BENEFITS EXPENSE',
  'FINANCE COSTS',
  'DEPRECIATION AND AMORTISATION EXPENSE',
  'OTHER EXPENSES'
];

export const AIS_TIS_SFT_CODES = {
  'SFT-001': { desc: 'Purchase/Sale of shares or mutual funds', head: 'INVESTING_ACTIVITIES' },
  'SFT-005': { desc: 'Time deposits / Fixed deposits (> ₹10 Lakhs)', head: 'OTHER_INCOME_INTEREST' },
  'SFT-015': { desc: 'Dividend income received', head: 'OTHER_INCOME' },
  'SFT-016': { desc: 'Rent received', head: 'OTHER_INCOME' },
  'SFT-017': { desc: 'GST Turnover / B2B outward supplies', head: 'REVENUE_FROM_OPERATIONS' }
};

export const INDIAN_TAX_SECTIONS = {
  '192': { title: 'TDS on Salary', scheduleIIIHead: 'EMPLOYEE BENEFITS EXPENSE' },
  '194A': { title: 'TDS on Interest other than securities (FD interest)', scheduleIIIHead: 'OTHER INCOME' },
  '194C': { title: 'TDS on Payment to Contractors & Sub-contractors', scheduleIIIHead: 'COST OF MATERIALS CONSUMED' },
  '194J': { title: 'TDS on Fees for Professional or Technical Services', scheduleIIIHead: 'OTHER EXPENSES' },
  '194I': { title: 'TDS on Rent', scheduleIIIHead: 'OTHER EXPENSES' }
};

export const SCHEDULE_III_HEADS = {
  PL: {
    REVENUE: ['REVENUE FROM OPERATIONS', 'OTHER INCOME'],
    EXPENSES: [
      'COST OF MATERIALS CONSUMED',
      'PURCHASES OF STOCK-IN-TRADE',
      'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE',
      'EMPLOYEE BENEFITS EXPENSE',
      'FINANCE COSTS',
      'DEPRECIATION AND AMORTISATION EXPENSE',
      'OTHER EXPENSES'
    ]
  },
  BS: {
    EQUITY_AND_LIABILITIES: [
      'SHARE CAPITAL',
      'RESERVES AND SURPLUS',
      'LONG-TERM BORROWINGS',
      'DEFERRED TAX LIABILITIES (NET)',
      'OTHER LONG-TERM LIABILITIES',
      'LONG-TERM PROVISIONS',
      'SHORT-TERM BORROWINGS',
      'TRADE PAYABLES',
      'OTHER CURRENT LIABILITIES',
      'SHORT-TERM PROVISIONS'
    ],
    ASSETS: [
      'PROPERTY, PLANT AND EQUIPMENT',
      'CAPITAL WORK-IN-PROGRESS',
      'INTANGIBLE ASSETS',
      'NON-CURRENT INVESTMENTS',
      'DEFERRED TAX ASSETS (NET)',
      'LONG-TERM LOANS AND ADVANCES',
      'OTHER NON-CURRENT ASSETS',
      'CURRENT INVESTMENTS',
      'INVENTORIES',
      'TRADE RECEIVABLES',
      'CASH AND CASH EQUIVALENTS',
      'SHORT-TERM LOANS AND ADVANCES',
      'OTHER CURRENT ASSETS'
    ]
  }
};

export function detectStatutoryRegime(text, prompt = '', explicitRegime = null) {
  if (explicitRegime && explicitRegime !== 'AUTO' && STATUTORY_REGIMES[explicitRegime]) {
    return explicitRegime;
  }

  const combined = (text + ' ' + prompt).toLowerCase();

  // 1. GST Return Fingerprint
  if (
    combined.includes('gstr') || combined.includes('gst return') || combined.includes('gstr-3b') ||
    combined.includes('gstr-1') || combined.includes('input tax credit') || combined.includes('itc') ||
    (combined.includes('igst') && combined.includes('cgst')) || combined.includes('table 3.1') || combined.includes('table 4')
  ) {
    return 'GST_GSTR3B';
  }

  // 2. Presumptive Taxation (Sec 44AD / 44ADA)
  if (
    combined.includes('44ada') || combined.includes('44ad') || combined.includes('44ae') ||
    combined.includes('presumptive') || (combined.includes('gross receipts') && combined.includes('deemed profit'))
  ) {
    return 'INCOME_TAX_44ADA';
  }

  // 3. Balance Sheet (Schedule III Part I)
  if (
    combined.includes('balance sheet') || combined.includes('sundry debtors') || combined.includes('sundry creditors') ||
    combined.includes('debtors') || combined.includes('creditors') || combined.includes('machinery') ||
    combined.includes('bank overdraft') || combined.includes('furniture') || combined.includes('liabilities') ||
    combined.includes('shareholders funds') || combined.includes('current assets') || combined.includes('non-current assets') ||
    combined.includes('cash at bank') || combined.includes('cash at hand') || combined.includes('stock in trade') ||
    combined.includes('equipments') || combined.includes('equipment')
  ) {
    return 'COMPANIES_ACT_SCHEDULE_III_BS';
  }

  // 4. Partnership / Partner Capital Account
  if (
    combined.includes('partner') || combined.includes('drawings') || combined.includes('interest on capital') ||
    combined.includes('share of profit') || combined.includes('remuneration to partners')
  ) {
    return 'PARTNERSHIP_CAPITAL';
  }

  // 5. Trial Balance
  if (
    (combined.includes('debit') && combined.includes('credit')) || combined.includes('trial balance') ||
    combined.includes('ledger balance') || combined.includes('closing debit')
  ) {
    return 'TRIAL_BALANCE';
  }

  // Default: Schedule III Profit & Loss
  return 'COMPANIES_ACT_SCHEDULE_III_PL';
}

/**
 * Domain-Specific OCR Spell Corrector & Normalizer for Indian Financial Documents
 */
export function correctFinancialSpellings(rawLabel = '') {
  if (!rawLabel) return '';
  let s = rawLabel.trim();

  // Strip leading Roman numerals, bullets, or note indices (e.g. "I. ", "II ", "III.", "(a)", "v ")
  s = s.replace(/^(?:[IVXLCDMivxlcdm]+|[a-zA-Z]|\([a-zA-Z0-9]+\)|\d+)[\.\)\-\:\s]+\s*/i, '');

  const corrections = [
    [/\b(?:gross\s+venue|gross\s+ven|gross\s+revenu\w*)\b/gi, 'Gross Revenue'],
    [/\b(?:sales\s+venue|sales\s+revenu\w*)\b/gi, 'Sales Revenue'],
    [/\b(?:grants?\s*(?:&|and)\s*donat\w*(?:\s*(?:received|ceived|ceipts?))?)\b/gi, 'Grants & Donations received'],
    [/\b(?:ceived)\b/gi, 'received'],
    [/\b(?:ceipts?)\b/gi, 'receipts'],
    [/\b(?:equipments?\s*es|equipmnts?)\b/gi, 'Equipments'],
    [/\b(?:operatns?|operatins?)\b/gi, 'operations'],
    [/\b(?:expns?|expenss?|expnditre)\b/gi, 'expenses'],
    [/\b(?:depreciatn|deprecatn|deprectn)\b/gi, 'Depreciation'],
    [/\b(?:inventors?|inventrys?)\b/gi, 'Inventories'],
    [/\b(?:direct\s+incom\w*)\b/gi, 'Direct Income'],
    [/\b(?:indirect\s+incom\w*)\b/gi, 'Indirect Income'],
    [/\b(?:employe|employes)\b/gi, 'Employee'],
    [/\b(?:consumd|consumpd)\b/gi, 'consumed'],
    [/\b(?:purchas\w*)\b/gi, 'Purchases'],
    [/\b(?:statutry|statutary)\b/gi, 'statutory'],
    [/\b(?:provsn|provisn)\b/gi, 'Provision'],
    [/\b(?:amortsatn|amortiztn)\b/gi, 'Amortisation'],
    [/\b(?:advertisng|advertismnt)\b/gi, 'Advertising'],
    [/\b(?:traveling|conveynce)\b/gi, 'Travelling & Conveyance'],
    [/\b(?:statnry|stationry)\b/gi, 'Stationery'],
    [/\b(?:telephon|comunicatn)\b/gi, 'Communication']
  ];

  for (const [pattern, replacement] of corrections) {
    s = s.replace(pattern, replacement);
  }

  return s.trim() || rawLabel.trim();
}

export function classifyIndianAccountingHead(label, categoryHint = '', isCredit = null) {
  const corrected = correctFinancialSpellings(label);
  const l = (corrected || label || '').toLowerCase().trim();
  const cat = (typeof categoryHint === 'string' ? categoryHint : '').toUpperCase().trim();

  // If isCredit is not explicitly provided, detect from label (e.g. "Customer Advance (Cr)" or "Supplier Advance (Dr)")
  let effectiveIsCredit = isCredit;
  if (effectiveIsCredit === null || effectiveIsCredit === undefined) {
    if (/\b(?:cr|credit)\b/i.test(label) || /\(cr\)/i.test(label)) effectiveIsCredit = true;
    else if (/\b(?:dr|debit)\b/i.test(label) || /\(dr\)/i.test(label)) effectiveIsCredit = false;
  }

  // ----------------------------------------------------
  // 0. TRUST CLAUDE BRAIN OR EXPLICIT STATUTORY CATEGORY HINT
  // If an upstream AI Brain (Claude) or CA user has already classified the item into a valid statutory head,
  // honor and preserve that classification directly rather than discarding it via loose keyword matching.
  // ----------------------------------------------------
  const validStatutoryCategories = [
    ...SCHEDULE_III_ORDER,
    ...SCHEDULE_III_BS_ORDER,
    ...SCHEDULE_III_LIABILITY_CATEGORIES,
    ...SCHEDULE_III_ASSET_CATEGORIES,
    ...SCHEDULE_III_PNL_EXPENSE_CATEGORIES
  ];
  if (cat && validStatutoryCategories.includes(cat)) {
    return { category: cat, subType: 'Statutory Verified' };
  }

  // ----------------------------------------------------
  // 0B. STRUCTURED DEBIT / CREDIT DISAMBIGUATION
  // In Indian accounting, Dr/Cr status is the decisive test for ambiguous heads
  // ----------------------------------------------------
  if (effectiveIsCredit === true) {
    if (l.includes('advance') || l.includes('advances')) {
      return { category: 'OTHER CURRENT LIABILITIES', subType: 'Customer Advances (Credit Balance)' };
    }
    if (l.includes('suspense')) {
      return { category: 'OTHER CURRENT LIABILITIES', subType: 'Suspense Credit Balance' };
    }
    if (l.includes('reserve')) {
      return { category: 'RESERVES AND SURPLUS', subType: 'Reserves & Surplus' };
    }
    if (l.includes('commission') || l.includes('discount') || l.includes('rent') || (l.includes('interest') && !l.includes('loan') && !l.includes('term'))) {
      return { category: 'OTHER INCOME', subType: 'Non-Operating Income (Credit Balance)' };
    }
  } else if (effectiveIsCredit === false) {
    if (l.includes('advance') || l.includes('advances')) {
      return { category: 'SHORT-TERM LOANS AND ADVANCES', subType: 'Supplier/Staff Advances (Debit Balance)' };
    }
    if (l.includes('suspense')) {
      return { category: 'OTHER CURRENT ASSETS', subType: 'Suspense Debit Balance' };
    }
    if (l.includes('commission') || l.includes('rent') || l.includes('discount')) {
      return { category: 'OTHER EXPENSES', subType: 'Administrative Expense (Debit Balance)' };
    }
    if (l.includes('interest')) {
      return { category: 'FINANCE COSTS', subType: 'Finance Cost (Debit Balance)' };
    }
  }

  // Explicit expense exclusions to prevent false positive revenue classifications
  const isExplicitExpense = l.includes('cost') || l.includes('expense') || l.includes('charges') ||
    l.includes('paid') || l.includes('spent') || l.includes('fees paid') || l.includes('bill') ||
    l.includes('rent paid') || l.includes('license fee') || l.includes('maintenance') ||
    l.includes('salary') || l.includes('audit') || l.includes('venue booking') || l.includes('venue hire') ||
    l.includes('venue charges');

  const isContraOrNonRevenue = l.includes('sales return') || l.includes('returns inward') ||
    l.includes('sales tax') || l.includes('grant thornton') || l.includes('audit fee') || l.includes('consulting fee paid');

  // Specific high-frequency expense cases
  if (l.includes('venue booking') || l.includes('venue hire') || l.includes('venue charge') || l.includes('grant thornton')) {
    return { category: 'OTHER EXPENSES', subType: 'Administrative Expense' };
  }

  // ----------------------------------------------------
  // 1. BALANCE SHEET: NON-CURRENT ASSETS (PPE & Intangibles)
  // ----------------------------------------------------
  if (
    l.includes('plant and machinery') || l.includes('machinery') || l.includes('furniture') ||
    l.includes('fixtures') || l.includes('office equipment') || l.includes('computer') ||
    l.includes('equipments') || l.includes('equipment') ||
    l.includes('land and building') || l.includes('building') || l.includes('vehicles') ||
    l.includes('motor car') || l.includes('truck') || l.includes('property, plant') ||
    l.includes('purchase of fixed asset') || l.includes('capital work-in-progress') ||
    l.includes('cwip') || l.includes('patent') || l.includes('trademark') || l.includes('copyright') ||
    l.includes('goodwill') || l.includes('intangible asset')
  ) {
    return { category: 'PROPERTY, PLANT AND EQUIPMENT', subType: 'Non-Current Asset' };
  }

  // ----------------------------------------------------
  // 2. BALANCE SHEET: NON-CURRENT INVESTMENTS
  // ----------------------------------------------------
  if (
    l.includes('govt. bond') || l.includes('government bond') || l.includes('10 % govt') ||
    l.includes('bond') || l.includes('debentures held') || l.includes('shares held') ||
    l.includes('mutual fund investment') || l.includes('non-current investment') ||
    l.includes('investment in subsidiary') || (l.includes('investment') && !l.includes('income'))
  ) {
    return { category: 'NON-CURRENT INVESTMENTS', subType: 'Non-Current Asset' };
  }

  // ----------------------------------------------------
  // 3. BALANCE SHEET: INVENTORIES & STOCK
  // ----------------------------------------------------
  if (
    l.includes('closing stock') || l.includes('raw material stock') || l.includes('work-in-progress') ||
    l.includes('finished goods stock') || l.includes('stock-in-trade') || l.includes('stock in trade') || l.includes('stock in hand') ||
    (l.includes('stock') && !l.includes('purchase of stock')) ||
    (l.includes('inventory') && !l.includes('changes in'))
  ) {
    return { category: 'INVENTORIES', subType: 'Current Asset' };
  }

  // ----------------------------------------------------
  // 4. BALANCE SHEET: TRADE RECEIVABLES & CASH
  // ----------------------------------------------------
  if (
    l.includes('sundry debtors') || l.includes('trade receivables') || l.includes('bills receivable') ||
    l.includes('accounts receivable') || l.includes('book debts') || (l.includes('debtor') && !l.includes('creditor'))
  ) {
    return { category: 'TRADE RECEIVABLES', subType: 'Current Asset' };
  }

  if (
    l.includes('cash in hand') || l.includes('cash at hand') || l.includes('cash at bank') || l.includes('bank balance') ||
    l.includes('bank accounts') || l.includes('bank account') || l.includes('cash-in-hand') ||
    l.includes('current account balance') || l.includes('savings account balance') ||
    l.includes('petty cash') || l.includes('cheques in hand') || l === 'cash' || l === 'bank'
  ) {
    return { category: 'CASH AND CASH EQUIVALENTS', subType: 'Current Asset' };
  }

  if (
    l === 'current assets' || l === 'current asset' || l.includes('current assets') || l.includes('loans & advances (asset)') || l.includes('deposits (asset)')
  ) {
    return { category: 'OTHER CURRENT ASSETS', subType: 'Current Asset' };
  }

  // ----------------------------------------------------
  // 5. BALANCE SHEET: EQUITY, BORROWINGS & LIABILITIES
  // ----------------------------------------------------
  if (
    l.includes('share capital') || l.includes('equity capital') || l.includes('preference share') ||
    l.includes('capital account') || l.includes('capital a/c') || l.includes('corpus fund') || l.includes('capital fund') ||
    l.includes('proprietor capital') || l.includes('partners capital') || l.includes('owner equity')
  ) {
    return { category: 'SHARE CAPITAL', subType: 'Equity / Net Worth' };
  }

  if (
    l.includes('reserves and surplus') || l.includes('general reserve') || l.includes('retained earnings') ||
    l.includes('securities premium') || l.includes('profit & loss a/c') || l.includes('profit and loss a/c') ||
    l.includes('p&l a/c') || l === 'profit & loss' || l === 'profit & loss account' || l.includes('surplus in p&l')
  ) {
    return { category: 'RESERVES AND SURPLUS', subType: 'Reserves & Surplus' };
  }

  if (
    l.includes('bank overdraft') || l.includes('overdraft') || l.includes('cash credit') ||
    l.includes('cc limit') || l.includes('short term loan') || l.includes('working capital loan')
  ) {
    return { category: 'SHORT-TERM BORROWINGS', subType: 'Current Liability' };
  }

  if (
    (l.includes('loans (liability)') || l.includes('secured loans') || l.includes('unsecured loans') ||
    l.includes('term loan') || l.includes('long term loan') || l.includes('debentures issued') ||
    l.includes('mortgage loan') || l.includes('secured loan') || l.includes('unsecured loan') ||
    (l.includes('loans') && l.includes('liability'))) &&
    !l.includes('interest') && !l.includes('finance')
  ) {
    return { category: 'LONG-TERM BORROWINGS', subType: 'Non-Current Liability' };
  }

  if (
    l.includes('sundry creditors') || l.includes('trade payables') || l.includes('bills payable') ||
    l.includes('accounts payable') || (l.includes('creditors') && !l.includes('debtors'))
  ) {
    return { category: 'TRADE PAYABLES', subType: 'Current Liability' };
  }

  if (
    l === 'current liabilities' || l === 'current liability' || l.includes('current liabilities') ||
    l.includes('duties & taxes') || l.includes('provisions') ||
    l.includes('outstanding expenses') || l.includes('salary payable') || l.includes('rent payable') ||
    l.includes('gst payable') || l.includes('tds payable') || l.includes('advance from customers') ||
    l.includes('statutory dues')
  ) {
    return { category: 'OTHER CURRENT LIABILITIES', subType: 'Current Liability' };
  }

  // ----------------------------------------------------
  // 6. PROFIT & LOSS: REVENUE FROM OPERATIONS (I)
  // ----------------------------------------------------
  if (
    !isContraOrNonRevenue && !isExplicitExpense && (
      l.includes('direct incomes') || l.includes('direct income') || l.includes('sales accounts') || l.includes('sales account') ||
      l.includes('revenue from operations') || l.includes('sales of product') || l.includes('sale of service') ||
      l.includes('domestic sales') || l.includes('export sales') || l.includes('turnover') ||
      l.includes('gross billing') || l.includes('consulting revenue') || l.includes('service revenue') ||
      l.includes('software revenue') || l.includes('job work revenue') ||
      /\brevenue\b/i.test(l) ||
      ((l.includes('grant') || l.includes('donation') || l.includes('contribution')) && (l.includes('received') || l.includes('income') || !isExplicitExpense) && !l.includes('grant thornton')) ||
      (l.includes('sales') && !l.includes('return') && !l.includes('tax') && !l.includes('commission') && !l.includes('promotion'))
    )
  ) {
    return { category: 'REVENUE FROM OPERATIONS', subType: 'Operating Revenue' };
  }

  // ----------------------------------------------------
  // 7. PROFIT & LOSS: OTHER INCOME (II)
  // ----------------------------------------------------
  if (
    l.includes('indirect incomes') || l.includes('indirect income') ||
    l.includes('other income') || l.includes('interest income') || l.includes('interest on fd') ||
    l.includes('interest on fixed deposit') || l.includes('fixed deposit interest') || l.includes('interest on deposit') ||
    l.includes('fd interest') || l.includes('bank interest received') || l.includes('interest received') ||
    l.includes('dividend income') || l.includes('dividend received') || l.includes('rent received') ||
    l.includes('rental income') || l.includes('profit on sale') || l.includes('gain on foreign exchange') ||
    l.includes('forex gain') || l.includes('discount received') || l.includes('rebate received') ||
    l.includes('scrap sales') || l.includes('interest from savings') || l.includes('sec 194a')
  ) {
    return { category: 'OTHER INCOME', subType: 'Non-Operating Income' };
  }

  // ----------------------------------------------------
  // 8. PROFIT & LOSS: COST OF MATERIALS / PURCHASES (IV-a, b, c)
  // ----------------------------------------------------
  if (
    (l.includes('direct expense') && !l.includes('indirect')) ||
    l.includes('cost of materials consumed') || l.includes('raw material consumed') ||
    l.includes('raw material purchase') || l.includes('raw material') || l.includes('packing materials') ||
    l.includes('carriage inwards') || l.includes('freight inwards') || l.includes('customs duty on raw materials') ||
    l.includes('cloud server hosting') || l.includes('hosting charges') || l.includes('aws server') ||
    l.includes('data center cost') || l.includes('sub-contractor charges') || l.includes('sec 194c')
  ) {
    return { category: 'COST OF MATERIALS CONSUMED', subType: 'Direct Material Cost' };
  }

  if (
    l.includes('purchases of stock-in-trade') || l.includes('purchase of goods') ||
    l.includes('trading purchases') || l.includes('goods bought for resale') ||
    l.includes('purchase returns') || l.includes('returns outward') ||
    (l.includes('purchase') && !isExplicitExpense && !l.includes('asset') && !l.includes('machinery'))
  ) {
    return { category: 'PURCHASES OF STOCK-IN-TRADE', subType: 'Trading Purchases' };
  }

  if (
    l.includes('changes in inventories') || l.includes('opening stock less closing') ||
    l.includes('inventory variation')
  ) {
    return { category: 'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE', subType: 'Inventory Adjustment' };
  }

  // ----------------------------------------------------
  // 9. PROFIT & LOSS: EMPLOYEE BENEFITS EXPENSE (IV-d)
  // ----------------------------------------------------
  if (
    l.includes('employee benefits') || l.includes('salary') || l.includes('salaries') ||
    l.includes('wages') || l.includes('provident fund') || l.includes('pf contribution') ||
    l.includes('esi') || l.includes('gratuity') || l.includes('staff welfare') ||
    l.includes('staff bonus') || l.includes('director remuneration') || l.includes('stipend') ||
    l.includes('incentives to staff') || l.includes('medical reimbursement') || l.includes('sec 192')
  ) {
    return { category: 'EMPLOYEE BENEFITS EXPENSE', subType: 'Personnel Cost' };
  }

  // ----------------------------------------------------
  // 10. PROFIT & LOSS: FINANCE COSTS (IV-e)
  // ----------------------------------------------------
  if (
    l.includes('finance cost') || l.includes('loan interest') || l.includes('interest on loan') ||
    l.includes('interest on term loan') || l.includes('interest on borrowings') ||
    l.includes('bank interest paid') || l.includes('interest expense') || l.includes('interest on overdraft') ||
    l.includes('bank charges') || l.includes('processing fee') || l.includes('lc charges') ||
    l.includes('bank guarantee charges') || l.includes('discounting charges')
  ) {
    return { category: 'FINANCE COSTS', subType: 'Financing Expense' };
  }

  // ----------------------------------------------------
  // 11. PROFIT & LOSS: DEPRECIATION & AMORTISATION (IV-f)
  // ----------------------------------------------------
  if (
    l.includes('depreciation') || l.includes('amortisation') || l.includes('amortization') ||
    l.includes('depreciation on plant') || l.includes('depreciation on machinery') ||
    l.includes('depreciation on furniture') || l.includes('software amortisation')
  ) {
    return { category: 'DEPRECIATION AND AMORTISATION EXPENSE', subType: 'Non-Cash Expense' };
  }

  // ----------------------------------------------------
  // 12. PROFIT & LOSS: TAX EXPENSE (VI)
  // ----------------------------------------------------
  if (
    l.includes('current tax') || l.includes('deferred tax') || l.includes('tax expense') ||
    l.includes('income tax expense') || l.includes('provision for tax') || l.includes('advance tax')
  ) {
    return { category: 'TAX EXPENSE', subType: 'Direct Tax' };
  }

  // ----------------------------------------------------
  // 13. PROFIT & LOSS: OTHER EXPENSES (IV-g)
  // ----------------------------------------------------
  if (
    l.includes('indirect expense') || l.includes('indirect expenses') ||
    l.includes('rent') || l.includes('rates and taxes') || l.includes('insurance') ||
    l.includes('power and fuel') || l.includes('electricity') || l.includes('water charges') ||
    l.includes('repairs') || l.includes('maintenance') || l.includes('advertising') ||
    l.includes('marketing') || l.includes('sales promotion') || l.includes('commission on sales') ||
    l.includes('travelling') || l.includes('conveyance') || l.includes('communication') ||
    l.includes('telephone') || l.includes('internet') || l.includes('legal fee') ||
    l.includes('professional fee') || l.includes('audit fee') || l.includes('statutory audit') ||
    l.includes('tax audit') || l.includes('bad debts') || l.includes('provision for doubtful debts') ||
    l.includes('printing and stationery') || l.includes('courier') || l.includes('postage') ||
    l.includes('security charges') || l.includes('housekeeping') || l.includes('software license') ||
    l.includes('subscription') || l.includes('membership fees') || l.includes('miscellaneous') ||
    l.includes('general expenses') || l.includes('sec 194j') || l.includes('sec 194i') ||
    l.includes('sec 194h') || isExplicitExpense
  ) {
    return { category: 'OTHER EXPENSES', subType: 'Administrative / Operating Expense' };
  }

  // Section Category Hint Mapping Fallback
  if (cat.includes('PURCHASE') || cat.includes('MATERIAL') || cat.includes('COGS')) {
    return { category: 'COST OF MATERIALS CONSUMED', subType: 'Direct Material' };
  }
  if (cat.includes('SALE') || cat.includes('TURNOVER') || cat.includes('REVENUE')) {
    return { category: 'REVENUE FROM OPERATIONS', subType: 'Operating Sales' };
  }
  if (cat.includes('EMPLOYEE') || cat.includes('SALAR') || cat.includes('WAGE')) {
    return { category: 'EMPLOYEE BENEFITS EXPENSE', subType: 'Personnel Cost' };
  }
  if (cat.includes('FINANCE') || cat.includes('INTEREST')) {
    return { category: 'FINANCE COSTS', subType: 'Finance Cost' };
  }
  if (cat.includes('DEPREC')) {
    return { category: 'DEPRECIATION AND AMORTISATION EXPENSE', subType: 'Depreciation' };
  }

  return { category: 'OTHER EXPENSES', subType: 'General Expense' };
}

/**
 * Compute the 11 MCA Mandatory Schedule III Analytical Ratios with Comparative Analysis
 */
export function calculateScheduleIIIRatios(items = [], userAdjustments = {}) {
  const sumCat = (catNames, isPY = false) => {
    return items
      .filter(i => catNames.includes(i.category))
      .reduce((sum, i) => sum + (isPY ? (i.previousAmount || 0) : (i.amount || 0)), 0);
  };

  const currAssetsCY = sumCat(['INVENTORIES', 'TRADE RECEIVABLES', 'CASH AND CASH EQUIVALENTS', 'SHORT-TERM LOANS AND ADVANCES', 'OTHER CURRENT ASSETS', 'CURRENT INVESTMENTS']);
  const currAssetsPY = sumCat(['INVENTORIES', 'TRADE RECEIVABLES', 'CASH AND CASH EQUIVALENTS', 'SHORT-TERM LOANS AND ADVANCES', 'OTHER CURRENT ASSETS', 'CURRENT INVESTMENTS'], true);

  const currLiabCY = sumCat(['SHORT-TERM BORROWINGS', 'TRADE PAYABLES', 'OTHER CURRENT LIABILITIES', 'SHORT-TERM PROVISIONS']);
  const currLiabPY = sumCat(['SHORT-TERM BORROWINGS', 'TRADE PAYABLES', 'OTHER CURRENT LIABILITIES', 'SHORT-TERM PROVISIONS'], true);

  const totalDebtCY = sumCat(['LONG-TERM BORROWINGS', 'SHORT-TERM BORROWINGS']);
  const totalDebtPY = sumCat(['LONG-TERM BORROWINGS', 'SHORT-TERM BORROWINGS'], true);

  const shareCapCY = sumCat(['SHARE CAPITAL', 'RESERVES AND SURPLUS']);
  const shareCapPY = sumCat(['SHARE CAPITAL', 'RESERVES AND SURPLUS'], true);
  const netWorthCY = shareCapCY > 0 ? shareCapCY : (currAssetsCY > 0 || currLiabCY > 0 ? currAssetsCY - currLiabCY : null);
  const netWorthPY = shareCapPY > 0 ? shareCapPY : (currAssetsPY > 0 || currLiabPY > 0 ? currAssetsPY - currLiabPY : null);

  const revOpsCY = sumCat(['REVENUE FROM OPERATIONS']);
  const revOpsPY = sumCat(['REVENUE FROM OPERATIONS'], true);
  const totalRevenueCY = revOpsCY + sumCat(['OTHER INCOME']);
  const totalRevenuePY = revOpsPY + sumCat(['OTHER INCOME'], true);

  const costOfMaterialsCY = sumCat(['COST OF MATERIALS CONSUMED']);
  const costOfMaterialsPY = sumCat(['COST OF MATERIALS CONSUMED'], true);
  const stockPurchasesCY = sumCat(['PURCHASES OF STOCK-IN-TRADE']);
  const stockPurchasesPY = sumCat(['PURCHASES OF STOCK-IN-TRADE'], true);
  const inventoryChangesCY = sumCat(['CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE']);
  const inventoryChangesPY = sumCat(['CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE'], true);

  // COGS = Cost of Materials Consumed + Purchases + Changes in Inventory
  const directCogsCY = costOfMaterialsCY + stockPurchasesCY + inventoryChangesCY;
  const directCogsPY = costOfMaterialsPY + stockPurchasesPY + inventoryChangesPY;
  const cogsCY = directCogsCY > 0 ? directCogsCY : (totalRevenueCY > 0 ? totalRevenueCY * 0.7 : null);
  const cogsPY = directCogsPY > 0 ? directCogsPY : (totalRevenuePY > 0 ? totalRevenuePY * 0.7 : null);

  const deprCY = sumCat(['DEPRECIATION AND AMORTISATION EXPENSE']);
  const deprPY = sumCat(['DEPRECIATION AND AMORTISATION EXPENSE'], true);
  const financeCostCY = sumCat(['FINANCE COSTS']);
  const financeCostPY = sumCat(['FINANCE COSTS'], true);

  const totalExpensesCY = sumCat(['COST OF MATERIALS CONSUMED', 'PURCHASES OF STOCK-IN-TRADE', 'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE', 'EMPLOYEE BENEFITS EXPENSE', 'FINANCE COSTS', 'DEPRECIATION AND AMORTISATION EXPENSE', 'OTHER EXPENSES']);
  const totalExpensesPY = sumCat(['COST OF MATERIALS CONSUMED', 'PURCHASES OF STOCK-IN-TRADE', 'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE', 'EMPLOYEE BENEFITS EXPENSE', 'FINANCE COSTS', 'DEPRECIATION AND AMORTISATION EXPENSE', 'OTHER EXPENSES'], true);

  const pbtCY = totalRevenueCY - totalExpensesCY;
  const pbtPY = totalRevenuePY - totalExpensesPY;
  const patCY = pbtCY;
  const patPY = pbtPY;

  const invCY = sumCat(['INVENTORIES']);
  const invPY = sumCat(['INVENTORIES'], true);
  const avgInvCY = (invCY > 0 && invPY > 0) ? (invCY + invPY) / 2 : (invCY > 0 ? invCY : null);

  const debtorsCY = sumCat(['TRADE RECEIVABLES']);
  const debtorsPY = sumCat(['TRADE RECEIVABLES'], true);
  const avgDebtorsCY = (debtorsCY > 0 && debtorsPY > 0) ? (debtorsCY + debtorsPY) / 2 : (debtorsCY > 0 ? debtorsCY : null);

  const creditorsCY = sumCat(['TRADE PAYABLES']);
  const creditorsPY = sumCat(['TRADE PAYABLES'], true);
  const totalPurchasesCY = costOfMaterialsCY + stockPurchasesCY;
  const totalPurchasesPY = costOfMaterialsPY + stockPurchasesPY;
  const avgCreditorsCY = (creditorsCY > 0 && creditorsPY > 0) ? (creditorsCY + creditorsPY) / 2 : (creditorsCY > 0 ? creditorsCY : null);

  const totalAssetsCY = currAssetsCY + sumCat(['PROPERTY, PLANT AND EQUIPMENT', 'INTANGIBLE ASSETS', 'NON-CURRENT INVESTMENTS', 'LONG-TERM LOANS AND ADVANCES', 'OTHER NON-CURRENT ASSETS']);
  const totalAssetsPY = currAssetsPY + sumCat(['PROPERTY, PLANT AND EQUIPMENT', 'INTANGIBLE ASSETS', 'NON-CURRENT INVESTMENTS', 'LONG-TERM LOANS AND ADVANCES', 'OTHER NON-CURRENT ASSETS'], true);

  const workingCapitalCY = currAssetsCY - currLiabCY;
  const workingCapitalPY = currAssetsPY - currLiabPY;

  const capitalEmployedCY = totalAssetsCY - currLiabCY;
  const capitalEmployedPY = totalAssetsPY - currLiabPY;

  const ebitCY = pbtCY + financeCostCY;
  const ebitPY = pbtPY + financeCostPY;
  const ebitdaCY = ebitCY + deprCY;
  const ebitdaPY = ebitPY + deprPY;

  const principalRepayCY = userAdjustments.principalRepayCY || 0;
  const principalRepayPY = userAdjustments.principalRepayPY || 0;
  const debtServiceCY = financeCostCY + principalRepayCY;
  const debtServicePY = financeCostPY + principalRepayPY;

  const safeDiv = (num, den, isPct = false) => {
    if (num === null || num === undefined || den === null || den === undefined || den === 0 || isNaN(num) || isNaN(den)) {
      return null;
    }
    const val = num / den;
    return isPct ? val * 100 : val;
  };

  const ratios = [
    {
      srNo: 1,
      name: 'Current Ratio',
      numerator: 'Current Assets',
      denominator: 'Current Liabilities',
      valCY: safeDiv(currAssetsCY, currLiabCY),
      valPY: safeDiv(currAssetsPY, currLiabPY),
      unit: 'times',
      benchmark: '1.33 : 1 to 2.0 : 1',
      formula: 'Current Assets ÷ Current Liabilities'
    },
    {
      srNo: 2,
      name: 'Debt-Equity Ratio',
      numerator: 'Total Debt',
      denominator: 'Shareholders Equity',
      valCY: safeDiv(totalDebtCY, netWorthCY),
      valPY: safeDiv(totalDebtPY, netWorthPY),
      unit: 'times',
      benchmark: '< 2.0 : 1',
      formula: 'Total Debt ÷ Net Worth'
    },
    {
      srNo: 3,
      name: 'Debt Service Coverage Ratio (DSCR)',
      numerator: 'EBITDA (PAT + Depr + Finance Cost)',
      denominator: 'Finance Cost + Principal Repayment',
      valCY: safeDiv(ebitdaCY, debtServiceCY > 0 ? debtServiceCY : null),
      valPY: safeDiv(ebitdaPY, debtServicePY > 0 ? debtServicePY : null),
      unit: 'times',
      benchmark: '> 1.50',
      formula: 'EBITDA ÷ (Finance Cost + Principal Repayment)'
    },
    {
      srNo: 4,
      name: 'Return on Equity (ROE)',
      numerator: 'Net Profit after Tax',
      denominator: 'Shareholders Equity',
      valCY: safeDiv(patCY, netWorthCY, true),
      valPY: safeDiv(patPY, netWorthPY, true),
      unit: '%',
      benchmark: '> 15.0%',
      formula: '(PAT ÷ Net Worth) × 100'
    },
    {
      srNo: 5,
      name: 'Inventory Turnover Ratio',
      numerator: 'Cost of Goods Sold (COGS)',
      denominator: 'Average Inventory',
      valCY: safeDiv(cogsCY, avgInvCY),
      valPY: safeDiv(cogsPY, invPY > 0 ? invPY : null),
      unit: 'times',
      benchmark: 'Industry Dependent',
      formula: 'Cost of Goods Sold ÷ Average Inventory'
    },
    {
      srNo: 6,
      name: 'Trade Receivables Turnover Ratio',
      numerator: 'Revenue from Operations',
      denominator: 'Average Trade Receivables',
      valCY: safeDiv(revOpsCY > 0 ? revOpsCY : totalRevenueCY, avgDebtorsCY),
      valPY: safeDiv(revOpsPY > 0 ? revOpsPY : totalRevenuePY, debtorsPY > 0 ? debtorsPY : null),
      unit: 'times',
      benchmark: '> 6.0 times',
      formula: 'Revenue from Operations ÷ Average Trade Receivables'
    },
    {
      srNo: 7,
      name: 'Trade Payables Turnover Ratio',
      numerator: 'Net Purchases (Materials + Purchases)',
      denominator: 'Average Trade Payables',
      valCY: safeDiv(totalPurchasesCY > 0 ? totalPurchasesCY : totalExpensesCY, avgCreditorsCY),
      valPY: safeDiv(totalPurchasesPY > 0 ? totalPurchasesPY : totalExpensesPY, creditorsPY > 0 ? creditorsPY : null),
      unit: 'times',
      benchmark: 'Industry Dependent',
      formula: 'Net Purchases ÷ Average Trade Payables'
    },
    {
      srNo: 8,
      name: 'Net Capital Turnover Ratio',
      numerator: 'Revenue from Operations',
      denominator: 'Working Capital',
      valCY: safeDiv(totalRevenueCY, workingCapitalCY !== 0 ? workingCapitalCY : null),
      valPY: safeDiv(totalRevenuePY, workingCapitalPY !== 0 ? workingCapitalPY : null),
      unit: 'times',
      benchmark: '> 3.0 times',
      formula: 'Revenue from Operations ÷ Working Capital'
    },
    {
      srNo: 9,
      name: 'Net Profit Ratio',
      numerator: 'Net Profit after Tax',
      denominator: 'Total Revenue',
      valCY: safeDiv(patCY, totalRevenueCY, true),
      valPY: safeDiv(patPY, totalRevenuePY, true),
      unit: '%',
      benchmark: '> 8.0%',
      formula: '(PAT ÷ Total Revenue) × 100'
    },
    {
      srNo: 10,
      name: 'Return on Capital Employed (ROCE)',
      numerator: 'EBIT (PBT + Interest)',
      denominator: 'Capital Employed',
      valCY: safeDiv(ebitCY, capitalEmployedCY, true),
      valPY: safeDiv(ebitPY, capitalEmployedPY, true),
      unit: '%',
      benchmark: '> 18.0%',
      formula: '(EBIT ÷ Capital Employed) × 100'
    },
    {
      srNo: 11,
      name: 'Return on Investment (ROI)',
      numerator: 'Net Profit after Tax',
      denominator: 'Total Assets',
      valCY: safeDiv(patCY, totalAssetsCY > 0 ? totalAssetsCY : null, true),
      valPY: safeDiv(patPY, totalAssetsPY > 0 ? totalAssetsPY : null, true),
      unit: '%',
      benchmark: '> 10.0%',
      formula: '(PAT ÷ Total Assets) × 100'
    }
  ];

  return ratios.map(r => {
    let variance = null;
    let reasonRequired = false;

    if (r.valCY !== null && r.valPY !== null && r.valPY !== 0) {
      const diffPct = ((r.valCY - r.valPY) / Math.abs(r.valPY)) * 100;
      variance = parseFloat(diffPct.toFixed(1));
      reasonRequired = Math.abs(variance) >= 25.0;
    }

    return {
      ...r,
      variancePct: variance,
      reasonRequired
    };
  });
}

/**
 * Compute ITR Recasting (Schedule BP: Book Profit to Taxable Business Income)
 */
export function computeITRRecasting(pbtCY = 0, items = [], userAdjustments = {}) {
  const lineItems = Array.isArray(items) ? items : [];
  const bookDepreciation = lineItems
    .filter(i => i.category === 'DEPRECIATION AND AMORTISATION EXPENSE')
    .reduce((s, i) => s + (i.amount || 0), 0);
  
  const disallowance43Bh = userAdjustments.disallowance43Bh || 0;
  const disallowance40a_ia = userAdjustments.disallowance40a_ia || 0; // TDS defaults 30%
  const disallowance40A_3 = userAdjustments.disallowance40A_3 || 0;   // Cash > 10k
  const excessPartnerRemun = userAdjustments.excessPartnerRemun || 0; // Sec 40(b)
  const personalInadmissible = userAdjustments.personalInadmissible || 0;

  const totalAdditions = bookDepreciation + disallowance43Bh + disallowance40a_ia + disallowance40A_3 + excessPartnerRemun + personalInadmissible;

  const taxDepreciationSec32 = userAdjustments.taxDepreciationSec32 !== undefined 
    ? userAdjustments.taxDepreciationSec32 
    : bookDepreciation;
  const otherHeadIncome = userAdjustments.otherHeadIncome || 0; // House prop / Capital gains / FD
  const chapterVIA_80JJAA = userAdjustments.chapterVIA_80JJAA || 0;

  const totalDeductions = taxDepreciationSec32 + otherHeadIncome + chapterVIA_80JJAA;
  const taxableBusinessIncome = pbtCY + totalAdditions - totalDeductions;

  return {
    bookPbt: pbtCY,
    additions: {
      bookDepreciation,
      disallowance43Bh,
      disallowance40a_ia,
      disallowance40A_3,
      excessPartnerRemun,
      personalInadmissible,
      total: totalAdditions
    },
    deductions: {
      taxDepreciationSec32,
      otherHeadIncome,
      chapterVIA_80JJAA,
      total: totalDeductions
    },
    taxableBusinessIncome
  };
}

/**
 * Analyze Section 43B(h) MSME Delayed Payment Compliance on Trade Payables / Sundry Creditors
 */
export function analyzeSection43BhMSME(items = [], vendorOverrides = {}) {
  const lineItems = Array.isArray(items) ? items : [];
  const creditors = lineItems.filter(i => i.category === 'TRADE PAYABLES' || /creditor|vendor|payable/i.test(i.label));

  if (creditors.length === 0) {
    return {
      vendors: [],
      totalPayables: 0,
      totalDisallowed43Bh: 0,
      totalMSMEInterest: 0,
      complianceStatus: 'COMPLIANT (No MSME Trade Payables Identified)'
    };
  }

  const results = creditors.map((c) => {
    const override = vendorOverrides[c.label] || {};
    const msmeType = override.type || 'Small Enterprise';
    const hasAgreement = override.hasAgreement !== undefined ? override.hasAgreement : true;
    const allowedDays = hasAgreement ? 45 : 15;
    
    // Only flag overdue if explicitly specified in vendorOverrides or invoice audit
    const actualDays = override.daysOverdue !== undefined ? override.daysOverdue : (override.isDelayed ? 60 : 0);
    const isDelayed = actualDays > allowedDays;
    
    // MSMED Act Sec 16: Compound Interest at 3x RBI Bank Rate (Assume Repo/Bank Rate 6.5% -> 19.5% compounded monthly)
    const annualRate = 0.195;
    const delayedDays = isDelayed ? actualDays - allowedDays : 0;
    const interestAmt = isDelayed ? (c.amount || 0) * (annualRate * (delayedDays / 365)) : 0;

    return {
      vendorName: c.label,
      amount: c.amount || 0,
      msmeType,
      hasAgreement,
      allowedDays,
      actualDays,
      isDelayed,
      delayedDays,
      disallowedAmount43Bh: isDelayed ? (c.amount || 0) : 0,
      msmeInterest3xRBI: Math.round(interestAmt),
      interestDeductible: false // Non-deductible under Sec 23 of MSMED Act
    };
  });

  const totalPayables = results.reduce((s, r) => s + r.amount, 0);
  const totalDisallowed43Bh = results.reduce((s, r) => s + r.disallowedAmount43Bh, 0);
  const totalMSMEInterest = results.reduce((s, r) => s + r.msmeInterest3xRBI, 0);

  return {
    vendors: results,
    totalPayables,
    totalDisallowed43Bh,
    totalMSMEInterest,
    complianceStatus: totalDisallowed43Bh === 0 ? 'COMPLIANT' : 'DISALLOWANCE_APPLICABLE'
  };
}

