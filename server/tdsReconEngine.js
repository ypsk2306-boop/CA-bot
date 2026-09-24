import { normalizeTdsSection, normalizeTan } from './tdsIngestionEngine.js';

/**
 * Statutory TDS Reconciliation Matching & Default Penalty Engine
 * 
 * Reuses the two-pass matching paradigm of gstReconEngine.js and bankReconEngine.js:
 * - Pass 1: Exact match on deductorTAN + section + exact amount (within tolerance).
 * - Pass 2: Fuzzy match on TAN + amount within tolerance, detecting and flagging
 *           Section Mismatches separately (e.g. booked in books under 194C, but filed under 194J in 26AS).
 * - Pass 2B: Fuzzy party name similarity + section match + amount match (when TAN is absent in books).
 * 
 * Detects & Flags Specific Statutory Default Categories:
 * 1. UNMATCHED_IN_26AS (Deducted per books but missing in 26AS/TRACES):
 *    - For TDS Receivable: Client deducted tax but failed to deposit or report our PAN.
 *    - For TDS Payable: Business deducted tax but failed to deposit to Govt (Non-deposit default).
 * 2. UNMATCHED_IN_BOOKS (Appearing in 26AS but missing in books):
 *    - Unclaimed TDS credit / unrecorded revenue opportunity.
 * 3. SHORT_DEDUCTION (Books show lower TDS % or amount than section mandates):
 *    - Under-deduction of tax requiring differential recovery.
 * 
 * Computes Statutory Penalties & Interest:
 * - Section 234E Late Filing Fee: ₹200/day, capped at total TDS amount.
 * - Section 201(1A) Interest:
 *   - 1.0% per month (or part of month) for failure/delay in deduction.
 *   - 1.5% per month (or part of month) for failure/delay in deposit.
 * - Section 40(a)(ia) Audit Warning: 30% statutory expense disallowance for business expenses.
 */

// Statutory TDS Benchmark Rates under Income Tax Act, 1961
export const STATUTORY_TDS_RATES = {
  '192': { name: 'Salaries', defaultRate: 10.0, minRate: 5.0, description: 'Slab-wise average income tax rate' },
  '194A': { name: 'Interest other than securities', defaultRate: 10.0, minRate: 10.0, description: '10% on interest paid' },
  '194C': { name: 'Payments to Contractors', defaultRate: 2.0, minRate: 1.0, description: '1% for Ind/HUF, 2% for Companies/Firms' },
  '194H': { name: 'Commission or Brokerage', defaultRate: 5.0, minRate: 2.0, description: '5% (2% from Budget 2024)' },
  '194I': { name: 'Rent', defaultRate: 10.0, minRate: 2.0, description: '2% for Plant & Machinery, 10% for Land & Building' },
  '194IA': { name: 'Transfer of Immovable Property', defaultRate: 1.0, minRate: 1.0, description: '1% on consideration' },
  '194IB': { name: 'Rent by Individual / HUF', defaultRate: 5.0, minRate: 5.0, description: '5% on monthly rent > ₹50,000' },
  '194J': { name: 'Professional / Technical Services', defaultRate: 10.0, minRate: 2.0, description: '2% for FTS/Call Center, 10% for Professional' },
  '194Q': { name: 'Purchase of Goods', defaultRate: 0.1, minRate: 0.1, description: '0.1% on purchase value exceeding ₹50 Lakhs' },
  '195': { name: 'Non-Resident Payments', defaultRate: 20.0, minRate: 10.0, description: 'Rates as per DTAA or statutory rate' },
  '206C': { name: 'Tax Collection at Source (TCS)', defaultRate: 1.0, minRate: 0.1, description: '0.1% to 5% depending on goods/LRS' }
};

/**
 * Quantize amount into integer paise (cents) to avoid IEEE floating point drift
 */
export function quantizeToPaise(val) {
  if (val === undefined || val === null || val === '') return 0;
  let num = typeof val === 'number' ? val : parseFloat(String(val).replace(/[₹Rs\.,\s]/g, m => m === '.' ? '.' : ''));
  return isNaN(num) ? 0 : Math.round(num * 100);
}

/**
 * Calculate calendar day difference between two dates
 */
export function calculateDateDiffDays(date1Str, date2Str) {
  if (!date1Str || !date2Str) return 999;
  const d1 = new Date(date1Str);
  const d2 = new Date(date2Str);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 999;
  return Math.round(Math.abs(d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
}

export function normalizeEntityTokens(str = '') {
  const STOP_WORDS = new Set([
    'pvt', 'private', 'ltd', 'limited', 'llp', 'co', 'company', 'and', 'the', 
    'sons', 'corp', 'corporation', 'inc', 'incorporated', 'enterprises', 'india', 
    'jewellers', 'jewels', 'jewellery', 'gold', 'diamonds', 'diamond'
  ]);
  const tokens = String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .split(/\s+/)
    .map(t => t.replace(/s$/, ''))
    .filter(t => t.length >= 3);

  const coreTokens = tokens.filter(t => !STOP_WORDS.has(t));
  return { all: tokens, core: coreTokens.length > 0 ? coreTokens : tokens };
}

export function calculateSmartSimilarity(str1 = '', str2 = '') {
  const t1 = normalizeEntityTokens(str1);
  const t2 = normalizeEntityTokens(str2);

  if (t1.core.length === 0 || t2.core.length === 0) return 0.0;

  let coreMatch = 0;
  for (const a of t1.core) {
    for (const b of t2.core) {
      if (a === b || (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a)))) {
        coreMatch++;
        break;
      }
    }
  }

  return coreMatch / Math.min(t1.core.length, t2.core.length);
}

/**
 * Simple Token Overlap Similarity (0.0 to 1.0)
 */
export function calculateTokenSimilarity(str1 = '', str2 = '') {
  const smart = calculateSmartSimilarity(str1, str2);
  if (smart > 0) return smart;

  const tokenize = s => new Set(
    String(s).toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(t => t.length >= 3)
  );
  const t1 = tokenize(str1);
  const t2 = tokenize(str2);
  if (t1.size === 0 || t2.size === 0) return 0.0;

  let intersection = 0;
  for (const t of t1) {
    if (t2.has(t)) intersection++;
  }
  const union = t1.size + t2.size - intersection;
  return union <= 0 ? 0.0 : intersection / union;
}

/**
 * Calculate Section 201(1A) number of months (every month or part of a month)
 */
export function calculate201_1AMonths(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return 1;
  const d1 = new Date(startDateStr);
  const d2 = new Date(endDateStr);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime()) || d2 <= d1) return 0;

  const yearDiff = d2.getFullYear() - d1.getFullYear();
  const monthDiff = d2.getMonth() - d1.getMonth();
  const months = yearDiff * 12 + monthDiff;
  // Part of a month counts as a full month
  const hasPartMonth = d2.getDate() > d1.getDate();
  return Math.max(1, months + (hasPartMonth ? 1 : 0));
}

/**
 * Determine statutory deposit due date for a given deduction date
 * (7th of following month; 30th April for March)
 */
export function getDepositDueDate(deductionDateStr) {
  if (!deductionDateStr) return null;
  const d = new Date(deductionDateStr);
  if (isNaN(d.getTime())) return null;

  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed: 0 = Jan, 2 = Mar

  if (month === 2) {
    // March deduction => Due date is 30th April
    return `${year}-04-30`;
  }

  // Next month 7th
  const nextMonthDate = new Date(year, month + 1, 7);
  const yyyy = nextMonthDate.getFullYear();
  const mm = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-07`;
}

/**
 * Determine statutory quarterly return due date (Section 234E)
 */
export function getQuarterlyReturnDueDate(deductionDateStr) {
  if (!deductionDateStr) return null;
  const d = new Date(deductionDateStr);
  if (isNaN(d.getTime())) return null;

  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1 to 12

  if (month >= 4 && month <= 6) {
    // Q1: Apr - Jun => Due 31st July
    return `${year}-07-31`;
  } else if (month >= 7 && month <= 9) {
    // Q2: Jul - Sep => Due 31st October
    return `${year}-10-31`;
  } else if (month >= 10 && month <= 12) {
    // Q3: Oct - Dec => Due 31st January of following year
    return `${year + 1}-01-31`;
  } else {
    // Q4: Jan - Mar => Due 31st May
    return `${year}-05-31`;
  }
}

/**
 * Main TDS Reconciliation Matching Engine
 */
export function runTdsReconciliation({
  sourceEntries = [], // 26AS / AIS entries
  bookEntries = [],   // Extracted book TDS entries
  options = {}
}) {
  const toleranceAmount = typeof options.toleranceAmount === 'number' ? options.toleranceAmount : 1.00;
  const tolerancePaise = Math.round(toleranceAmount * 100);
  const asOnDate = options.asOnDate || new Date().toISOString().split('T')[0];

  // Clone and index source items
  const sourceList = (Array.isArray(sourceEntries) ? sourceEntries : []).map((s, idx) => ({
    ...s,
    _id: `26AS_${idx + 1}`,
    _tan: normalizeTan(s.deductorTAN),
    _sec: normalizeTdsSection(s.section),
    _amountPaise: quantizeToPaise(s.tdsDeducted || s.amount),
    _amountPaidPaise: quantizeToPaise(s.amountPaid),
    _matched: false
  }));

  // Clone and index book items
  const bookList = (Array.isArray(bookEntries) ? bookEntries : []).map((b, idx) => ({
    ...b,
    _id: b.id || `BOOK_${idx + 1}`,
    _tan: normalizeTan(b.tan || b.deductorTAN || b.partyTAN),
    _sec: normalizeTdsSection(b.section),
    _amountPaise: quantizeToPaise(b.amount),
    _baseAmountPaise: quantizeToPaise(b.baseAmount),
    _matched: false
  }));

  const matched = [];
  const sectionMismatches = [];
  const unmatchedBooks = [];
  const unmatchedSource = [];
  const shortDeductions = [];

  // -------------------------------------------------------------
  // PASS 1: Exact Match (TAN + Section + Amount down to the paise)
  // -------------------------------------------------------------
  for (const book of bookList) {
    if (book._matched) continue;

    let candidateIdx = -1;

    for (let i = 0; i < sourceList.length; i++) {
      const src = sourceList[i];
      if (src._matched) continue;

      // Condition 1: TAN matches (if TAN exists in book) or Smart Party Name Similarity
      const tanAgrees = (book._tan && src._tan && book._tan === src._tan) ||
        (!book._tan && book.partyName && src.deductorName && calculateSmartSimilarity(book.partyName, src.deductorName) >= 0.45);

      // Condition 2: Section matches (or book has no specific section declared in general ledger)
      const secAgrees = !book._sec || !src._sec || (book._sec === src._sec);

      // Condition 3: Amount matches within tolerance
      const amountDiffPaise = Math.abs(book._amountPaise - src._amountPaise);
      const amountAgrees = amountDiffPaise <= tolerancePaise;

      if (tanAgrees && secAgrees && amountAgrees) {
        candidateIdx = i;
        break;
      }
    }

    if (candidateIdx !== -1) {
      const src = sourceList[candidateIdx];
      book._matched = true;
      src._matched = true;

      matched.push({
        matchType: 'EXACT_MATCH',
        matchTier: 'Pass 1: Exact Match',
        confidence: 1.0,
        statusBadge: 'MATCHED',
        deductorTAN: src.deductorTAN || book._tan,
        deductorName: src.deductorName || book.partyName || '[Deductor Not Specified]',
        section: src.section || book._sec,
        amount: Math.round(src._amountPaise / 100 * 100) / 100,
        bookItem: book,
        sourceItem: src,
        variance: Math.round((book._amountPaise - src._amountPaise) / 100 * 100) / 100,
        remarks: `100% Exact Match on TAN ${src.deductorTAN || ''}, Section ${src.section || book._sec || ''}, and Amount ₹${(src._amountPaise / 100).toLocaleString('en-IN')}.`
      });
    }
  }

  // -------------------------------------------------------------
  // PASS 2: Fuzzy Match & Section Mismatch Detection
  // -------------------------------------------------------------
  for (const book of bookList) {
    if (book._matched) continue;

    let candidateIdx = -1;
    let mismatchType = null;

    for (let i = 0; i < sourceList.length; i++) {
      const src = sourceList[i];
      if (src._matched) continue;

      const tanAgrees = (book._tan && src._tan && book._tan === src._tan) ||
        (!book._tan && book.partyName && src.deductorName && calculateSmartSimilarity(book.partyName, src.deductorName) >= 0.4);

      const amountDiffPaise = Math.abs(book._amountPaise - src._amountPaise);
      const amountAgrees = amountDiffPaise <= tolerancePaise;

      // Case 2A: Section Mismatch (Only when BOTH books AND 26AS explicitly specify differing sections)
      if (tanAgrees && amountAgrees && book._sec && src._sec && book._sec !== src._sec) {
        candidateIdx = i;
        mismatchType = 'SECTION_MISMATCH';
        break;
      }

      // Case 2B: Token similarity on party name + section agrees/compatible + amount agrees
      if (!tanAgrees && book.partyName && src.deductorName) {
        const sim = calculateSmartSimilarity(book.partyName, src.deductorName);
        if (sim >= 0.35 && (!book._sec || !src._sec || book._sec === src._sec) && amountAgrees) {
          candidateIdx = i;
          mismatchType = 'FUZZY_NAME_MATCH';
          break;
        }
      }

      // Case 2C: Same TAN + Section agrees, but small amount variance (within ₹50)
      if (tanAgrees && (!book._sec || !src._sec || book._sec === src._sec) && amountDiffPaise <= 5000) {
        candidateIdx = i;
        mismatchType = 'AMOUNT_VARIANCE';
        break;
      }
    }

    if (candidateIdx !== -1) {
      const src = sourceList[candidateIdx];
      book._matched = true;
      src._matched = true;

      const diff = Math.round((book._amountPaise - src._amountPaise) / 100 * 100) / 100;

      if (mismatchType === 'SECTION_MISMATCH') {
        sectionMismatches.push({
          matchType: 'SECTION_MISMATCH',
          matchTier: 'Pass 2: Section Discrepancy',
          confidence: 0.85,
          statusBadge: 'SECTION_MISMATCH',
          deductorTAN: src.deductorTAN || book._tan,
          deductorName: src.deductorName || book.partyName || '[Deductor Not Specified]',
          bookSection: book._sec,
          sourceSection: src._sec,
          amount: Math.round(src._amountPaise / 100 * 100) / 100,
          bookItem: book,
          sourceItem: src,
          variance: diff,
          remarks: `Section Mismatch: Books recorded under Sec ${book._sec || 'N/A'}, but 26AS/TRACES reflects Sec ${src._sec || 'N/A'}. Amount ₹${(src._amountPaise / 100).toLocaleString('en-IN')} agrees.`
        });
      } else {
        matched.push({
          matchType: mismatchType,
          matchTier: 'Pass 2: Fuzzy Match',
          confidence: 0.75,
          statusBadge: 'PROBABLE',
          deductorTAN: src.deductorTAN || book._tan,
          deductorName: src.deductorName || book.partyName || '[Deductor Not Specified]',
          section: src.section || book._sec,
          amount: Math.round(src._amountPaise / 100 * 100) / 100,
          bookItem: book,
          sourceItem: src,
          variance: diff,
          remarks: mismatchType === 'AMOUNT_VARIANCE'
            ? `Amount Variance of ₹${diff.toLocaleString('en-IN')} between Books (₹${(book._amountPaise / 100).toLocaleString('en-IN')}) and 26AS (₹${(src._amountPaise / 100).toLocaleString('en-IN')}).`
            : `Fuzzy Name Match: Deductor "${src.deductorName}" matched with Book Ledger "${book.partyName}".`
        });
      }
    }
  }

  // -------------------------------------------------------------
  // PASS 2C: Multi-Voucher Aggregation Matching
  // Multiple vouchers in books (monthly/quarterly) for same deductor matching single 26AS return entry
  // -------------------------------------------------------------
  for (let i = 0; i < sourceList.length; i++) {
    const src = sourceList[i];
    if (src._matched) continue;

    const candIndices = [];
    for (let j = 0; j < bookList.length; j++) {
      const book = bookList[j];
      if (book._matched) continue;

      const tanMatches = book._tan && src._tan && book._tan === src._tan;
      const nameMatches = book.partyName && src.deductorName && calculateSmartSimilarity(book.partyName, src.deductorName) >= 0.45;

      if (tanMatches || nameMatches) {
        candIndices.push(j);
      }
    }

    if (candIndices.length > 1) {
      // Check total sum of candidate vouchers
      const candSum = candIndices.reduce((s, idx) => s + bookList[idx]._amountPaise, 0);
      if (Math.abs(candSum - src._amountPaise) <= tolerancePaise * 2) {
        src._matched = true;
        candIndices.forEach(idx => { bookList[idx]._matched = true; });

        matched.push({
          matchType: 'AGGREGATED_MATCH',
          matchTier: 'Pass 2C: Multi-Voucher Aggregation',
          confidence: 0.90,
          statusBadge: 'MATCHED',
          deductorTAN: src.deductorTAN || bookList[candIndices[0]]._tan,
          deductorName: src.deductorName || bookList[candIndices[0]].partyName,
          section: src.section || bookList[candIndices[0]]._sec,
          amount: Math.round(src._amountPaise / 100 * 100) / 100,
          bookItem: bookList[candIndices[0]],
          sourceItem: src,
          aggregatedVouchersCount: candIndices.length,
          bookVoucherDetails: candIndices.map(idx => ({
            refNo: bookList[idx].refNo,
            date: bookList[idx].date,
            amount: bookList[idx].amount
          })),
          variance: Math.round((candSum - src._amountPaise) / 100 * 100) / 100,
          remarks: `Multi-Voucher Match: ${candIndices.length} book vouchers totaling ₹${(candSum / 100).toLocaleString('en-IN')} reconciled to 26AS return (₹${(src._amountPaise / 100).toLocaleString('en-IN')}).`
        });
        continue;
      }

      // Check pairs of vouchers
      for (let a = 0; a < candIndices.length; a++) {
        for (let b = a + 1; b < candIndices.length; b++) {
          const pairSum = bookList[candIndices[a]]._amountPaise + bookList[candIndices[b]]._amountPaise;
          if (Math.abs(pairSum - src._amountPaise) <= tolerancePaise * 2) {
            src._matched = true;
            bookList[candIndices[a]]._matched = true;
            bookList[candIndices[b]]._matched = true;

            matched.push({
              matchType: 'AGGREGATED_MATCH',
              matchTier: 'Pass 2C: Multi-Voucher Aggregation',
              confidence: 0.90,
              statusBadge: 'MATCHED',
              deductorTAN: src.deductorTAN || bookList[candIndices[a]]._tan,
              deductorName: src.deductorName || bookList[candIndices[a]].partyName,
              section: src.section || bookList[candIndices[a]]._sec,
              amount: Math.round(src._amountPaise / 100 * 100) / 100,
              bookItem: bookList[candIndices[a]],
              sourceItem: src,
              aggregatedVouchersCount: 2,
              bookVoucherDetails: [
                { refNo: bookList[candIndices[a]].refNo, date: bookList[candIndices[a]].date, amount: bookList[candIndices[a]].amount },
                { refNo: bookList[candIndices[b]].refNo, date: bookList[candIndices[b]].date, amount: bookList[candIndices[b]].amount }
              ],
              variance: Math.round((pairSum - src._amountPaise) / 100 * 100) / 100,
              remarks: `2-Voucher Match: Vouchers totaling ₹${(pairSum / 100).toLocaleString('en-IN')} reconciled to 26AS return.`
            });
            break;
          }
        }
        if (src._matched) break;
      }
    }
  }

  // -------------------------------------------------------------
  // PASS 3: Short Deduction Detection
  // Check matched & unmatched items for lower TDS deduction than statutory mandate
  // -------------------------------------------------------------
  for (const book of bookList) {
    const sec = book._sec;
    const statRule = STATUTORY_TDS_RATES[sec];
    if (!statRule || !book._baseAmountPaise || book._baseAmountPaise <= 0) continue;

    const baseAmount = book._baseAmountPaise / 100;
    const actualTds = book._amountPaise / 100;
    const mandatedRate = statRule.minRate;
    const expectedTds = Math.round(baseAmount * mandatedRate) / 100;

    // If actual deduction is less than 90% of statutory minimum
    if (actualTds < expectedTds * 0.90) {
      const shortAmount = Math.round((expectedTds - actualTds) * 100) / 100;
      const deductionDate = book.date || null;
      const delayMonths = deductionDate ? calculate201_1AMonths(deductionDate, asOnDate) : 0;
      const interest201_1A = deductionDate ? Math.round(shortAmount * 0.01 * delayMonths * 100) / 100 : 0;

      shortDeductions.push({
        defaultCategory: 'SHORT_DEDUCTION',
        statusBadge: 'SHORT_DEDUCTED',
        id: `SHORT_${book._id}`,
        deductorTAN: book._tan || book.tan || null,
        tan: book._tan || book.tan || null,
        label: book.label,
        section: sec,
        partyName: book.partyName,
        baseAmount,
        actualTdsDeducted: actualTds,
        mandatedRate: `${mandatedRate}%`,
        expectedTds,
        shortfallAmount: shortAmount,
        effectiveRate: `${(actualTds / baseAmount * 100).toFixed(2)}%`,
        delayMonths,
        interest201_1A,
        statutoryRisk: deductionDate
          ? `Short deduction of ₹${shortAmount.toLocaleString('en-IN')} u/s ${sec}. Mandated minimum rate is ${mandatedRate}%. Sec 201(1A) interest of ₹${interest201_1A.toLocaleString('en-IN')} (1%/mo) applies.`
          : `Short deduction of ₹${shortAmount.toLocaleString('en-IN')} u/s ${sec}. Mandated minimum rate is ${mandatedRate}%. Sec 201(1A) interest computation requires voucher deduction date [Date Not Specified in Ledger Head].`,
        auditorAction: `Raise recovery debit note / supplementary payment for ₹${shortAmount.toLocaleString('en-IN')} and pay interest under Challan 281.`
      });
    }
  }

  // -------------------------------------------------------------
  // PASS 4: Audit & Penalties on Unmatched Items
  // -------------------------------------------------------------

  // 4A. Unmatched in 26AS (In Books, but NOT in 26AS)
  for (const book of bookList) {
    if (book._matched) continue;

    const isReceivable = book.type === 'RECEIVABLE';
    const amount = book._amountPaise / 100;
    const deductionDate = book.date || null;
    const depositDueDate = deductionDate ? getDepositDueDate(deductionDate) : null;
    const returnDueDate = deductionDate ? getQuarterlyReturnDueDate(deductionDate) : null;

    let fee234E = 0;
    let interest201_1A = 0;
    let delayDays = 0;
    let delayMonths = 0;

    if (!isReceivable && deductionDate) {
      // TDS Payable default (Business withheld tax, but did not deposit or file)
      // 1. Calculate Sec 234E late fee
      if (returnDueDate && asOnDate > returnDueDate) {
        delayDays = calculateDateDiffDays(returnDueDate, asOnDate);
        fee234E = Math.min(delayDays * 200, amount);
      }

      // 2. Calculate Sec 201(1A) interest (1.5%/month for non-deposit from deduction date)
      if (depositDueDate && asOnDate > depositDueDate) {
        delayMonths = calculate201_1AMonths(deductionDate, asOnDate);
        interest201_1A = Math.round(amount * 0.015 * delayMonths * 100) / 100;
      }
    }

    unmatchedBooks.push({
      defaultCategory: isReceivable ? 'TDS_RECEIVABLE_MISSING_IN_26AS' : 'TDS_PAYABLE_NOT_DEPOSITED',
      statusBadge: isReceivable ? 'CREDIT_MISSING' : 'NON_DEPOSITED',
      id: book._id,
      deductorTAN: book._tan || book.tan || null,
      tan: book._tan || book.tan || null,
      voucherNo: book.voucherNo || book.refNo || null,
      refNo: book.refNo || null,
      baseAmount: book.baseAmount || (book._baseAmountPaise ? book._baseAmountPaise / 100 : null),
      label: book.label,
      accountHead: book.accountHead,
      type: book.type,
      section: book._sec,
      partyName: book.partyName,
      amount,
      deductionDate,
      depositDueDate,
      returnDueDate,
      penalties: {
        fee234E,
        interest201_1A,
        delayDays,
        delayMonths,
        disallowance40a: isReceivable ? 0 : Math.round(amount * 10 * 0.30), // estimated 30% of gross
        dateSpecified: Boolean(deductionDate)
      },
      auditObservations: isReceivable
        ? `TDS Receivable of ₹${amount.toLocaleString('en-IN')} claimed in books is NOT reflecting in Form 26AS. Client/debtor "${book.partyName || '[Customer Not Specified]'}" may not have deposited tax or filed Form 26Q with your PAN.`
        : `TDS Payable of ₹${amount.toLocaleString('en-IN')} deducted from vendor/staff u/s ${book._sec || 'TDS'} has NOT been deposited to the Central Government. Assessee-in-default u/s 201(1).`,
      auditorAction: isReceivable
        ? 'Do not claim credit in ITR Schedule TDS yet; send Form 26Q correction notice to debtor.'
        : deductionDate
          ? `Deposit ₹${amount.toLocaleString('en-IN')} immediately under Challan 281 along with ₹${interest201_1A.toLocaleString('en-IN')} interest and ₹${fee234E.toLocaleString('en-IN')} late fee to avoid 30% expense disallowance u/s 40(a)(ia).`
          : `Deposit ₹${amount.toLocaleString('en-IN')} immediately under Challan 281 along with statutory interest and late fees (computed from voucher transaction date) to avoid 30% expense disallowance u/s 40(a)(ia).`
    });
  }

  // 4B. Unmatched in Books (In 26AS, but NOT in Books)
  for (const src of sourceList) {
    if (src._matched) continue;

    const tdsAmount = src._amountPaise / 100;
    const grossAmount = src._amountPaidPaise / 100;

    unmatchedSource.push({
      defaultCategory: 'UNCLAIMED_TDS_CREDIT_UNRECORDED_REVENUE',
      statusBadge: 'UNRECORDED_IN_BOOKS',
      id: src._id,
      deductorTAN: src.deductorTAN,
      deductorName: src.deductorName,
      section: src._sec,
      amountPaid: grossAmount,
      tdsDeducted: tdsAmount,
      dateOfDeduction: src.dateOfDeduction,
      dateOfBooking: src.dateOfBooking,
      status: src.status,
      auditObservations: `TDS Credit of ₹${tdsAmount.toLocaleString('en-IN')} against gross income of ₹${grossAmount.toLocaleString('en-IN')} is present in Form 26AS/AIS but NOT recorded in accounting books.`,
      auditorAction: 'Inspect revenue ledgers and record income in books. Claim credit in Schedule TDS of ITR to prevent Section 143(1)(a) income discrepancy notices.'
    });
  }

  // -------------------------------------------------------------
  // Executive Summary Totals
  // -------------------------------------------------------------
  let totalTdsMatched = 0;
  for (const m of matched) totalTdsMatched += m.amount;
  for (const sm of sectionMismatches) totalTdsMatched += sm.amount;

  let totalUnmatchedBooksTds = 0;
  let total234EFees = 0;
  let total201_1AInterest = 0;
  for (const ub of unmatchedBooks) {
    totalUnmatchedBooksTds += ub.amount;
    total234EFees += ub.penalties.fee234E || 0;
    total201_1AInterest += ub.penalties.interest201_1A || 0;
  }

  let totalUnmatchedSourceTds = 0;
  let totalUnmatchedSourceIncome = 0;
  for (const us of unmatchedSource) {
    totalUnmatchedSourceTds += us.tdsDeducted;
    totalUnmatchedSourceIncome += us.amountPaid;
  }

  let totalShortDeductionAmount = 0;
  for (const sd of shortDeductions) {
    totalShortDeductionAmount += sd.shortfallAmount;
    total201_1AInterest += sd.interest201_1A || 0;
  }

  totalTdsMatched = Math.round(totalTdsMatched * 100) / 100;
  totalUnmatchedBooksTds = Math.round(totalUnmatchedBooksTds * 100) / 100;
  totalUnmatchedSourceTds = Math.round(totalUnmatchedSourceTds * 100) / 100;
  totalUnmatchedSourceIncome = Math.round(totalUnmatchedSourceIncome * 100) / 100;
  totalShortDeductionAmount = Math.round(totalShortDeductionAmount * 100) / 100;
  total234EFees = Math.round(total234EFees * 100) / 100;
  total201_1AInterest = Math.round(total201_1AInterest * 100) / 100;

  const totalPenaltiesPayable = Math.round((total234EFees + total201_1AInterest) * 100) / 100;
  const netTaxExposure = Math.round((totalUnmatchedBooksTds + totalShortDeductionAmount + totalPenaltiesPayable) * 100) / 100;

  return {
    success: true,
    summary: {
      total26ASEntries: sourceList.length,
      totalBookEntries: bookList.length,
      matchedCount: matched.length,
      sectionMismatchCount: sectionMismatches.length,
      unmatchedInBooksCount: unmatchedSource.length, // in 26AS but not in books
      unmatchedIn26ASCount: unmatchedBooks.length,   // in books but not in 26AS
      shortDeductionCount: shortDeductions.length,
      totalTdsMatched,
      totalUnmatchedBooksTds,
      totalUnmatchedSourceTds,
      totalUnmatchedSourceIncome,
      totalShortDeductionAmount,
      total234EFees,
      total201_1AInterest,
      totalPenaltiesPayable,
      netTaxExposure,
      reconciliationStatus: (unmatchedBooks.length === 0 && unmatchedSource.length === 0 && sectionMismatches.length === 0 && shortDeductions.length === 0)
        ? 'FULLY_RECONCILED'
        : 'EXCEPTIONS_DETECTED'
    },
    matched,
    sectionMismatches,
    unmatchedIn26AS: unmatchedBooks,
    unmatchedInBooks: unmatchedSource,
    shortDeductions,
    discrepancyReport: [
      ...sectionMismatches.map(sm => ({
        category: 'SECTION_MISMATCH',
        severity: 'MEDIUM',
        title: `Section Mismatch: Books (${sm.bookSection}) vs 26AS (${sm.sourceSection})`,
        party: sm.deductorName,
        tan: sm.deductorTAN,
        amount: sm.amount,
        action: `Rectify TDS category in books or request correction statement from deductor.`
      })),
      ...unmatchedBooks.map(ub => ({
        category: ub.defaultCategory,
        severity: ub.type === 'RECEIVABLE' ? 'HIGH' : 'CRITICAL',
        title: ub.type === 'RECEIVABLE' ? 'TDS Credit Missing in Form 26AS' : 'TDS Deducted but Not Deposited in Govt Account',
        party: ub.partyName || ub.accountHead,
        tan: ub.tan,
        amount: ub.amount,
        penalty: ub.penalties.fee234E + ub.penalties.interest201_1A,
        action: ub.auditorAction
      })),
      ...unmatchedSource.map(us => ({
        category: 'UNRECORDED_INCOME_CREDIT',
        severity: 'HIGH',
        title: 'Unclaimed 26AS TDS Credit / Unrecorded Turnover',
        party: us.deductorName,
        tan: us.deductorTAN,
        amount: us.tdsDeducted,
        grossIncome: us.amountPaid,
        action: us.auditorAction
      })),
      ...shortDeductions.map(sd => ({
        category: 'SHORT_DEDUCTION',
        severity: 'HIGH',
        title: `Short Deduction u/s ${sd.section}: Shortfall ₹${sd.shortfallAmount.toLocaleString('en-IN')}`,
        party: sd.partyName || sd.label,
        amount: sd.shortfallAmount,
        penalty: sd.interest201_1A,
        action: sd.auditorAction
      }))
    ]
  };
}
