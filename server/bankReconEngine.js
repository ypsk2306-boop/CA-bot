/**
 * Bank Reconciliation Matching Engine
 * 
 * Reuses the two-pass matching pattern from gstReconEngine.js:
 * - Pass 1: Exact match on amount (paise-exact) + date (same day) + direction (Bank Cr <-> Book Dr, Bank Dr <-> Book Cr).
 * - Pass 1.5: Reference / Cheque number exact match + amount exact + clearing window.
 * - Pass 2: Fuzzy match — amount exact, date within configurable window (default 3 days),
 *           and narration similarity via token-overlap Jaccard scoring.
 * - Bucketing:
 *   - Matched: pairs of { bankTx, bookTx } with confidence & audit notes.
 *   - Unmatched-in-Books: bank items not yet recorded (bank charges, direct credits, interest, auto-debits).
 *   - Unmatched-in-Bank: book items not yet cleared (cheques issued not presented, deposits in transit).
 * - Zero-Drop Invariant: Every transaction is assigned to exactly one bucket. Total counts re-sum cleanly.
 * - Exact paise-based integer math for all comparisons.
 */

// Common banking and corporate stop-words for token overlap analysis
const BANK_STOP_WORDS = new Set([
  'to', 'by', 'from', 'for', 'of', 'the', 'a', 'an', 'and', 'in', 'on', 'at', 'with',
  'neft', 'rtgs', 'imps', 'upi', 'ach', 'nach', 'ecs', 'pos', 'atm', 'inb', 'mb',
  'trf', 'transfer', 'payment', 'pyd', 'chq', 'cheque', 'txn', 'txnid', 'ref', 'utr',
  'dr', 'cr', 'ltd', 'pvt', 'limited', 'private', 'co', 'corp', 'corporation', 'inc',
  'ms', 'm/s', 'shri', 'smt', 'branch', 'acc', 'ac', 'no', 'num', 'csh', 'cash',
  'clg', 'clearing', 'ft', 'ib', 'charges', 'chg', 'rev', 'reversal'
]);

/**
 * Quantize any monetary input into exact integer paise (cents) and float rupees.
 * Prevents IEEE-754 floating point rounding drift.
 */
export function quantizeToPaise(val) {
  if (val === undefined || val === null || val === '') {
    return 0;
  }
  let num;
  if (typeof val === 'number') {
    num = val;
  } else {
    const cleanStr = String(val).replace(/[₹$€£,\s]/g, '').trim();
    num = parseFloat(cleanStr);
  }
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Calculate absolute calendar day difference between two 'YYYY-MM-DD' date strings.
 */
export function calculateDateDiffDays(date1Str, date2Str) {
  if (!date1Str || !date2Str) return 999;
  const d1 = new Date(date1Str);
  const d2 = new Date(date2Str);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 999;
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Clean and tokenize a narration string into unique, meaningful keywords.
 */
export function tokenizeNarration(text = '') {
  if (!text) return new Set();
  const rawTokens = String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !BANK_STOP_WORDS.has(t) && !/^\d+$/.test(t));
  return new Set(rawTokens);
}

/**
 * Compute Jaccard token overlap similarity between two narrations (0.0 to 1.0).
 */
export function calculateTokenSimilarity(str1 = '', str2 = '') {
  const tokens1 = tokenizeNarration(str1);
  const tokens2 = tokenizeNarration(str2);

  if (tokens1.size === 0 && tokens2.size === 0) {
    // If both narrations consist only of numbers/codes or were empty, check direct alphanumeric overlap
    const clean1 = String(str1).toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = String(str2).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean1 && clean2 && (clean1.includes(clean2) || clean2.includes(clean1))) return 0.8;
    return 0.0;
  }

  if (tokens1.size === 0 || tokens2.size === 0) {
    // Check if any non-trivial word from one is contained in the other
    const raw1 = String(str1).toLowerCase();
    const raw2 = String(str2).toLowerCase();
    for (const t of (tokens1.size > 0 ? tokens1 : tokens2)) {
      if (t.length >= 4 && (raw1.includes(t) || raw2.includes(t))) return 0.5;
    }
    return 0.0;
  }

  let intersectionCount = 0;
  for (const t of tokens1) {
    if (tokens2.has(t)) {
      intersectionCount++;
    } else {
      // Partial prefix / substring match for tokens >= 4 chars
      for (const t2 of tokens2) {
        if (t.length >= 4 && t2.length >= 4 && (t.startsWith(t2) || t2.startsWith(t))) {
          intersectionCount += 0.5;
          break;
        }
      }
    }
  }

  const unionCount = tokens1.size + tokens2.size - intersectionCount;
  if (unionCount <= 0) return 0.0;
  return Math.min(1.0, intersectionCount / unionCount);
}

/**
 * Standardize reference or cheque number (strips spaces, dashes, leading zeroes).
 */
export function canonicalizeRefNo(ref = '') {
  if (!ref) return null;
  const clean = String(ref).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return null;
  // Strip leading zeroes for numeric cheque numbers (e.g. "004521" -> "4521")
  const strippedNumeric = clean.replace(/^0+/, '');
  return strippedNumeric.length >= 3 ? strippedNumeric : clean;
}

/**
 * Determine statutory accounting direction:
 * In Accounting:
 * - Bank Deposit = Bank Credit (+) <==> Book Receipt = Book Debit (+)
 * - Bank Withdrawal = Bank Debit (-) <==> Book Payment = Book Credit (-)
 */
export const DIRECTION = {
  DEPOSIT: 'DEPOSIT',       // Money entering bank: Bank Credit / Book Debit
  WITHDRAWAL: 'WITHDRAWAL', // Money leaving bank: Bank Debit / Book Credit
  UNKNOWN: 'UNKNOWN'
};

/**
 * Normalize bank transactions from bankStatementParser or raw array.
 */
export function normalizeBankItems(bankInput = []) {
  const rawList = Array.isArray(bankInput)
    ? bankInput
    : (bankInput && Array.isArray(bankInput.transactions))
      ? bankInput.transactions
      : [];

  return rawList.map((tx, idx) => {
    const debitPaise = quantizeToPaise(tx.debit);
    const creditPaise = quantizeToPaise(tx.credit);

    let direction = DIRECTION.UNKNOWN;
    let amountPaise = 0;

    if (creditPaise > 0 && debitPaise === 0) {
      direction = DIRECTION.DEPOSIT;
      amountPaise = creditPaise;
    } else if (debitPaise > 0 && creditPaise === 0) {
      direction = DIRECTION.WITHDRAWAL;
      amountPaise = debitPaise;
    } else if (creditPaise > debitPaise) {
      direction = DIRECTION.DEPOSIT;
      amountPaise = creditPaise - debitPaise;
    } else if (debitPaise > creditPaise) {
      direction = DIRECTION.WITHDRAWAL;
      amountPaise = debitPaise - creditPaise;
    } else {
      // Zero or equal debit/credit
      amountPaise = creditPaise || debitPaise;
    }

    const canonicalRef = canonicalizeRefNo(tx.refNo || tx.chequeNo || tx.chqNo || tx.utr);

    return {
      _id: `BANK_${idx}_${tx.date || 'NODATE'}`,
      _origIdx: idx,
      _matched: false,
      date: tx.date || null,
      narration: String(tx.narration || tx.description || tx.particulars || '').trim(),
      debit: debitPaise / 100,
      credit: creditPaise / 100,
      debitPaise,
      creditPaise,
      amount: amountPaise / 100,
      amountPaise,
      direction,
      runningBalance: tx.runningBalance !== undefined && tx.runningBalance !== null ? Number(tx.runningBalance) : null,
      refNo: tx.refNo || null,
      canonicalRef
    };
  });
}

/**
 * Normalize book / ledger line items from financial statement extraction, Tally sync, or manual input.
 */
export function normalizeBookItems(bookInput = []) {
  const rawList = Array.isArray(bookInput)
    ? bookInput
    : (bookInput && Array.isArray(bookInput.lineItems))
      ? bookInput.lineItems
      : (bookInput && Array.isArray(bookInput.items))
        ? bookInput.items
        : [];

  return rawList.map((item, idx) => {
    const rawDebitPaise = quantizeToPaise(item.debit);
    const rawCreditPaise = quantizeToPaise(item.credit);
    const rawAmountPaise = quantizeToPaise(item.amount);

    let direction = DIRECTION.UNKNOWN;
    let amountPaise = 0;

    // 1. Explicit debit and credit columns in books
    if (rawDebitPaise > 0 && rawCreditPaise === 0) {
      // Book Debit = Receipt / Deposit
      direction = DIRECTION.DEPOSIT;
      amountPaise = rawDebitPaise;
    } else if (rawCreditPaise > 0 && rawDebitPaise === 0) {
      // Book Credit = Payment / Withdrawal
      direction = DIRECTION.WITHDRAWAL;
      amountPaise = rawCreditPaise;
    } else if (rawDebitPaise > 0 && rawCreditPaise > 0) {
      if (rawDebitPaise > rawCreditPaise) {
        direction = DIRECTION.DEPOSIT;
        amountPaise = rawDebitPaise - rawCreditPaise;
      } else {
        direction = DIRECTION.WITHDRAWAL;
        amountPaise = rawCreditPaise - rawDebitPaise;
      }
    } 
    // 2. Tally isCredit / entryType flags
    else if (item.isCredit === true || item.entryType === 'CR' || item.type === 'PAYMENT') {
      direction = DIRECTION.WITHDRAWAL; // Book Credit = outflow
      amountPaise = rawAmountPaise;
    } else if (item.isCredit === false || item.entryType === 'DR' || item.type === 'RECEIPT') {
      direction = DIRECTION.DEPOSIT; // Book Debit = inflow
      amountPaise = rawAmountPaise;
    } 
    // 3. Category heuristics from financialClassifier / Schedule III heads
    else if (item.category) {
      const cat = String(item.category).toUpperCase();
      if (cat.includes('EXPENSE') || cat.includes('PURCHASE') || cat.includes('PAYABLE') || cat.includes('DRAWINGS')) {
        direction = DIRECTION.WITHDRAWAL;
      } else if (cat.includes('REVENUE') || cat.includes('INCOME') || cat.includes('SALES') || cat.includes('RECEIVABLE')) {
        direction = DIRECTION.DEPOSIT;
      }
      amountPaise = rawAmountPaise;
    } 
    // 4. Fallback amount
    else {
      amountPaise = rawAmountPaise;
    }

    const narration = String(
      item.narration || item.label || item.particulars || item.description || item.itemName || ''
    ).trim();

    // 5. Narration / Label heuristics if direction is still UNKNOWN
    if (direction === DIRECTION.UNKNOWN) {
      const text = narration.toLowerCase();
      if (/\b(?:withdraw(?:al)?s?|wdl|payment|paid|pyd|expense|purchase|payable|charges?|fee|dr|debit)\b/i.test(text)) {
        direction = DIRECTION.WITHDRAWAL;
      } else if (/\b(?:deposit|received|rcvd|receipt|sales|revenue|income|collection|cr|credit)\b/i.test(text)) {
        direction = DIRECTION.DEPOSIT;
      }
    }

    const canonicalRef = canonicalizeRefNo(
      item.refNo || item.chequeNo || item.chqNo || item.voucherNo || item.instrumentNo
    );

    return {
      _id: `BOOK_${idx}_${item.date || 'NODATE'}`,
      _origIdx: idx,
      _matched: false,
      date: item.date || null,
      narration,
      label: item.label || narration,
      debit: direction === DIRECTION.DEPOSIT ? amountPaise / 100 : (rawDebitPaise / 100 || 0),
      credit: direction === DIRECTION.WITHDRAWAL ? amountPaise / 100 : (rawCreditPaise / 100 || 0),
      debitPaise: direction === DIRECTION.DEPOSIT ? amountPaise : rawDebitPaise,
      creditPaise: direction === DIRECTION.WITHDRAWAL ? amountPaise : rawCreditPaise,
      amount: amountPaise / 100,
      amountPaise,
      direction,
      category: item.category || 'General Ledger',
      refNo: item.refNo || item.chequeNo || item.voucherNo || null,
      canonicalRef
    };
  });
}

/**
 * Check if a bank item and book item have compatible transaction directions.
 * Bank Deposit (Cr) matches Book Debit (Dr).
 * Bank Withdrawal (Dr) matches Book Credit (Cr).
 */
export function areDirectionsCompatible(bankDirection, bookDirection) {
  if (bankDirection === DIRECTION.UNKNOWN || bookDirection === DIRECTION.UNKNOWN) {
    return true; // Neutral fallback if one side is unspecified
  }
  return bankDirection === bookDirection;
}

/**
 * Categorize unmatched bank items into actionable CA statutory buckets.
 */
function classifyUnmatchedBankItem(bankTx) {
  const text = (bankTx.narration || '').toLowerCase();
  if (bankTx.direction === DIRECTION.WITHDRAWAL) {
    if (/\b(?:bank\s*chg|charges?|chgs?|srv\s*chg|service\s*chg|sms\s*chg|folio|ledger\s*fee|rtgs\s*chg|neft\s*chg|consolidated|annual\s*fee|card\s*fee)\b/i.test(text)) {
      return {
        category: 'BANK_CHARGES',
        reason: 'Bank charges or service fees debited by bank but not yet recorded in books.'
      };
    }
    if (/tax|tds|gst|cgst|sgst|igst/i.test(text)) {
      return {
        category: 'TAX_DEBIT',
        reason: 'Tax or statutory levy debited directly by bank.'
      };
    }
    if (/emi|loan|insurance|sip|mutual\s*fund|auto\s*debit|nach|mandate/i.test(text)) {
      return {
        category: 'AUTO_DEBIT_DIRECT',
        reason: 'Standing instruction or auto-debit processed by bank not yet posted to ledger.'
      };
    }
    return {
      category: 'UNRECORDED_WITHDRAWAL',
      reason: 'Direct withdrawal or debit in bank statement without corresponding book entry.'
    };
  } else {
    // Inflow / Deposit
    if (/interest|int\.?\s*pd|int\s*credit/i.test(text)) {
      return {
        category: 'INTEREST_INCOME',
        reason: 'Savings / FD / sweep account interest credited by bank not yet recorded in books.'
      };
    }
    if (/dividend|div/i.test(text)) {
      return {
        category: 'DIVIDEND_DIRECT_CREDIT',
        reason: 'Direct dividend credit from investments received in bank.'
      };
    }
    if (/neft|rtgs|imps|upi|by\s*trf|customer|client/i.test(text)) {
      return {
        category: 'DIRECT_CUSTOMER_CREDIT',
        reason: 'Customer direct remittance or electronic receipt in bank without book receipt voucher.'
      };
    }
    return {
      category: 'UNRECORDED_DEPOSIT',
      reason: 'Direct credit in bank statement without corresponding book entry.'
    };
  }
}

/**
 * Categorize unmatched book items into actionable CA statutory buckets.
 */
function classifyUnmatchedBookItem(bookTx) {
  if (bookTx.direction === DIRECTION.WITHDRAWAL) {
    return {
      category: 'CHEQUE_ISSUED_NOT_PRESENTED',
      reason: 'Cheque or payment recorded in books but not yet presented to or cleared by bank.'
    };
  } else {
    return {
      category: 'CHEQUE_DEPOSITED_NOT_CLEARED',
      reason: 'Cheque or remittance recorded in books as received but not yet cleared/credited by bank (deposit in transit).'
    };
  }
}

/**
 * Main Bank Reconciliation Matching Engine
 * 
 * @param {Object} params
 * @param {Array|Object} params.bankInput - Parsed statement from bankStatementParser or array of transactions
 * @param {Array|Object} params.bookInput - Line items from financial statement extraction or array of book rows
 * @param {Object} [params.options] - Matching configuration options
 * @param {number} [params.options.dateToleranceDays=3] - Maximum clearing delay window for fuzzy matching
 * @param {number} [params.options.minTokenScore=0.20] - Minimum narration token overlap score for fuzzy match
 * @param {number} [params.options.bookBalance] - Stated cash/bank book balance
 * @param {number} [params.options.bankBalance] - Stated bank statement closing balance
 * @param {number} [params.options.openingBookBalance] - Opening book balance
 * @param {number} [params.options.openingBankBalance] - Opening bank balance
 * 
 * @returns {Object} Structured reconciliation result
 */
export function runBankReconciliation({
  bankInput = [],
  bookInput = [],
  options = {}
}) {
  const dateToleranceDays = Number.isInteger(options.dateToleranceDays) ? options.dateToleranceDays : 3;
  const minTokenScore = typeof options.minTokenScore === 'number' ? options.minTokenScore : 0.20;

  // Extract statement-level metadata if bankInput is a full parser result
  const bankMetadata = (!Array.isArray(bankInput) && bankInput && typeof bankInput === 'object') ? bankInput : {};

  // Normalize all inputs
  const bankList = normalizeBankItems(bankInput);
  const bookList = normalizeBookItems(bookInput);

  const matched = [];
  const unmatchedInBooks = [];
  const unmatchedInBank = [];

  function resolveMatchedDirection(bank, book) {
    if (book.direction === DIRECTION.UNKNOWN && bank.direction !== DIRECTION.UNKNOWN) {
      book.direction = bank.direction;
      if (bank.direction === DIRECTION.WITHDRAWAL) {
        book.creditPaise = book.amountPaise;
        book.credit = book.amount;
      } else if (bank.direction === DIRECTION.DEPOSIT) {
        book.debitPaise = book.amountPaise;
        book.debit = book.amount;
      }
    }
  }

  // -------------------------------------------------------------------------
  // PASS 1: Exact Match (Paise Exact Amount + Same Day + Compatible Direction)
  // -------------------------------------------------------------------------
  // Build lookup map for book items: key = `${amountPaise}_${date}_${direction}`
  const bookExactMap = new Map();
  for (const book of bookList) {
    if (book.date && book.amountPaise > 0) {
      const key = `${book.amountPaise}|${book.date}|${book.direction}`;
      if (!bookExactMap.has(key)) bookExactMap.set(key, []);
      bookExactMap.get(key).push(book);
    }
  }

  for (const bank of bankList) {
    if (bank._matched || !bank.date || bank.amountPaise <= 0) continue;

    const key = `${bank.amountPaise}|${bank.date}|${bank.direction}`;
    const unknownKey = `${bank.amountPaise}|${bank.date}|${DIRECTION.UNKNOWN}`;
    const candidates = (bookExactMap.get(key) && bookExactMap.get(key).length > 0)
      ? bookExactMap.get(key)
      : bookExactMap.get(unknownKey);

    if (candidates && candidates.length > 0) {
      // Find candidate with best narration similarity if multiple exist
      let bestIdx = 0;
      let maxSim = -1;
      for (let i = 0; i < candidates.length; i++) {
        const sim = calculateTokenSimilarity(bank.narration, candidates[i].narration);
        if (sim > maxSim) {
          maxSim = sim;
          bestIdx = i;
        }
      }

      const matchBook = candidates.splice(bestIdx, 1)[0];
      bank._matched = true;
      matchBook._matched = true;
      resolveMatchedDirection(bank, matchBook);

      matched.push({
        matchType: 'EXACT',
        confidence: 100,
        statusBadge: 'EXACT_MATCH',
        bankTx: bank,
        bookTx: matchBook,
        amount: bank.amount,
        amountPaise: bank.amountPaise,
        dateDiffDays: 0,
        tokenScore: maxSim > 0 ? parseFloat(maxSim.toFixed(2)) : 1.0,
        remarks: '100% Exact Match: Amount, date, and transaction direction match on the same day.'
      });
    }
  }

  // -------------------------------------------------------------------------
  // PASS 1.5: Reference / Cheque Number Exact Match + Amount Exact
  // Handles cheques or UTR numbers clearing within up to 30 days
  // -------------------------------------------------------------------------
  const bookRefMap = new Map();
  for (const book of bookList) {
    if (!book._matched && book.canonicalRef && book.amountPaise > 0) {
      const key = `${book.amountPaise}|${book.canonicalRef}`;
      if (!bookRefMap.has(key)) bookRefMap.set(key, []);
      bookRefMap.get(key).push(book);
    }
  }

  for (const bank of bankList) {
    if (bank._matched || !bank.canonicalRef || bank.amountPaise <= 0) continue;

    const key = `${bank.amountPaise}|${bank.canonicalRef}`;
    const candidates = bookRefMap.get(key);

    if (candidates && candidates.length > 0) {
      // Filter candidates with compatible direction and reasonable clearance delay (<= 30 days)
      const validCandidates = candidates.filter(c => 
        areDirectionsCompatible(bank.direction, c.direction) &&
        calculateDateDiffDays(bank.date, c.date) <= 30
      );

      if (validCandidates.length > 0) {
        // Pick candidate with minimum date difference
        validCandidates.sort((a, b) => calculateDateDiffDays(bank.date, a.date) - calculateDateDiffDays(bank.date, b.date));
        const matchBook = validCandidates[0];

        // Remove from candidate pool
        const idxInList = candidates.indexOf(matchBook);
        if (idxInList !== -1) candidates.splice(idxInList, 1);

        bank._matched = true;
        matchBook._matched = true;
        resolveMatchedDirection(bank, matchBook);

        const dateDiff = calculateDateDiffDays(bank.date, matchBook.date);
        const sim = calculateTokenSimilarity(bank.narration, matchBook.narration);

        matched.push({
          matchType: 'REF_MATCH',
          confidence: 95,
          statusBadge: 'REF_MATCHED',
          bankTx: bank,
          bookTx: matchBook,
          amount: bank.amount,
          amountPaise: bank.amountPaise,
          dateDiffDays: dateDiff,
          tokenScore: parseFloat(sim.toFixed(2)),
          remarks: `Reference Match: Cheque/UTR (${bank.canonicalRef}) and exact amount match with ${dateDiff} day(s) clearance timing.`
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // PASS 2: Fuzzy Match (Amount Exact + Date within Window + Narration Token Similarity)
  // -------------------------------------------------------------------------
  // Group unmatched books by amountPaise for fast lookup
  const bookAmountMap = new Map();
  for (const book of bookList) {
    if (!book._matched && book.amountPaise > 0) {
      if (!bookAmountMap.has(book.amountPaise)) bookAmountMap.set(book.amountPaise, []);
      bookAmountMap.get(book.amountPaise).push(book);
    }
  }

  for (const bank of bankList) {
    if (bank._matched || bank.amountPaise <= 0) continue;

    const candidates = bookAmountMap.get(bank.amountPaise);
    if (!candidates || candidates.length === 0) continue;

    let bestCandidate = null;
    let bestScore = -1;
    let bestDateDiff = 999;
    let bestCandidateIdx = -1;

    for (let i = 0; i < candidates.length; i++) {
      const book = candidates[i];
      if (book._matched) continue;

      if (!areDirectionsCompatible(bank.direction, book.direction)) continue;

      const dateDiff = calculateDateDiffDays(bank.date, book.date);
      if (dateDiff > dateToleranceDays) continue;

      const tokenScore = calculateTokenSimilarity(bank.narration, book.narration);

      // Composite score: heavily favors token overlap, with date closeness as tie-breaker
      // If candidates.length === 1 and dateDiff <= dateToleranceDays, permit match even with lower tokenScore
      const isUniqueAmount = candidates.length === 1;
      const effectiveThreshold = isUniqueAmount ? Math.min(minTokenScore, 0.10) : minTokenScore;

      if (tokenScore >= effectiveThreshold || (isUniqueAmount && dateDiff <= 2)) {
        const compositeScore = (tokenScore * 70) + ((dateToleranceDays - dateDiff + 1) * 10);
        if (compositeScore > bestScore) {
          bestScore = compositeScore;
          bestCandidate = book;
          bestDateDiff = dateDiff;
          bestCandidateIdx = i;
        }
      }
    }

    if (bestCandidate && bestCandidateIdx !== -1) {
      candidates.splice(bestCandidateIdx, 1);
      bank._matched = true;
      bestCandidate._matched = true;
      resolveMatchedDirection(bank, bestCandidate);

      const sim = calculateTokenSimilarity(bank.narration, bestCandidate.narration);
      const confidence = Math.min(92, Math.max(70, Math.round(70 + (sim * 25) - (bestDateDiff * 3))));

      matched.push({
        matchType: 'FUZZY',
        confidence,
        statusBadge: 'FUZZY_MATCH',
        bankTx: bank,
        bookTx: bestCandidate,
        amount: bank.amount,
        amountPaise: bank.amountPaise,
        dateDiffDays: bestDateDiff,
        tokenScore: parseFloat(sim.toFixed(2)),
        remarks: `Fuzzy Match: Exact amount verified with ${bestDateDiff} day(s) clearing gap and ${(sim * 100).toFixed(0)}% narration similarity.`
      });
    }
  }

  // -------------------------------------------------------------------------
  // PASS 3: Unique Amount Near-Date Clearance (Strict 1-to-1 unambiguous fallback)
  // -------------------------------------------------------------------------
  for (const bank of bankList) {
    if (bank._matched || bank.amountPaise <= 0) continue;

    const remainingBooks = bookList.filter(b => 
      !b._matched && 
      b.amountPaise === bank.amountPaise &&
      areDirectionsCompatible(bank.direction, b.direction)
    );

    // If there is strictly ONE remaining book transaction with this exact amount
    if (remainingBooks.length === 1) {
      const singleBook = remainingBooks[0];
      const dateDiff = calculateDateDiffDays(bank.date, singleBook.date);

      if (dateDiff <= dateToleranceDays) {
        bank._matched = true;
        singleBook._matched = true;
        resolveMatchedDirection(bank, singleBook);
        const sim = calculateTokenSimilarity(bank.narration, singleBook.narration);

        matched.push({
          matchType: 'CLEARING_DELAY',
          confidence: 75,
          statusBadge: 'CLEARING_DELAY',
          bankTx: bank,
          bookTx: singleBook,
          amount: bank.amount,
          amountPaise: bank.amountPaise,
          dateDiffDays: dateDiff,
          tokenScore: parseFloat(sim.toFixed(2)),
          remarks: `Clearing Delay: Unique exact amount matched within ${dateDiff} day(s) transit window.`
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // BUCKETING: Zero-Drop Invariant
  // Every bank and book transaction must be accounted for in exactly one bucket
  // -------------------------------------------------------------------------
  for (const bank of bankList) {
    if (!bank._matched) {
      const classification = classifyUnmatchedBankItem(bank);
      unmatchedInBooks.push({
        ...bank,
        suggestedCategory: classification.category,
        statutoryNote: classification.reason,
        statusBadge: 'UNMATCHED_IN_BOOKS'
      });
    }
  }

  for (const book of bookList) {
    if (!book._matched) {
      const classification = classifyUnmatchedBookItem(book);
      unmatchedInBank.push({
        ...book,
        suggestedCategory: classification.category,
        statutoryNote: classification.reason,
        statusBadge: 'UNMATCHED_IN_BANK'
      });
    }
  }

  // -------------------------------------------------------------------------
  // SANITY CHECK VERIFICATION: Re-summability back to total counts
  // -------------------------------------------------------------------------
  const totalBankTxCount = bankList.length;
  const totalBookTxCount = bookList.length;
  const matchedCount = matched.length;
  const unmatchedInBooksCount = unmatchedInBooks.length;
  const unmatchedInBankCount = unmatchedInBank.length;

  const bankSumCheck = matchedCount + unmatchedInBooksCount;
  const bookSumCheck = matchedCount + unmatchedInBankCount;
  const sanityCheckPassed = (bankSumCheck === totalBankTxCount) && (bookSumCheck === totalBookTxCount);

  // -------------------------------------------------------------------------
  // STATUTORY BRS FINANCIAL SUMMARY CALCULATIONS (Paise-accurate integer math)
  // -------------------------------------------------------------------------
  let totalBankDebitPaise = 0;
  let totalBankCreditPaise = 0;
  for (const b of bankList) {
    totalBankDebitPaise += b.debitPaise;
    totalBankCreditPaise += b.creditPaise;
  }

  let totalBookDebitPaise = 0;
  let totalBookCreditPaise = 0;
  for (const bk of bookList) {
    totalBookDebitPaise += bk.debitPaise;
    totalBookCreditPaise += bk.creditPaise;
  }

  // Unmatched totals
  let unmatchedInBooksDebitPaise = 0;  // Debited by bank, not in books (bank charges, auto debits)
  let unmatchedInBooksCreditPaise = 0; // Credited by bank, not in books (interest, direct credits)
  for (const ub of unmatchedInBooks) {
    unmatchedInBooksDebitPaise += ub.debitPaise;
    unmatchedInBooksCreditPaise += ub.creditPaise;
  }

  let unmatchedInBankDebitPaise = 0;   // Debited in books, not in bank (cheques deposited not cleared)
  let unmatchedInBankCreditPaise = 0;  // Credited in books, not in bank (cheques issued not presented)
  for (const ubk of unmatchedInBank) {
    unmatchedInBankDebitPaise += ubk.debitPaise;
    unmatchedInBankCreditPaise += ubk.creditPaise;
  }

  // Stated or derived balances
  // Priority: 1. explicit options, 2. metadata from bank statement parser, 3. transaction running balance
  let bankBalancePaise;
  if (options.bankBalance !== undefined && options.bankBalance !== null) {
    bankBalancePaise = quantizeToPaise(options.bankBalance);
  } else if (bankMetadata.closingBalance !== undefined && bankMetadata.closingBalance !== null) {
    bankBalancePaise = quantizeToPaise(bankMetadata.closingBalance);
  } else if (bankList.length > 0 && bankList[bankList.length - 1].runningBalance !== null) {
    bankBalancePaise = quantizeToPaise(bankList[bankList.length - 1].runningBalance);
  } else {
    // Net bank movement if opening is not known
    const openPaise = quantizeToPaise(options.openingBankBalance || bankMetadata.openingBalance || 0);
    bankBalancePaise = openPaise + totalBankCreditPaise - totalBankDebitPaise;
  }

  let bookBalancePaise;
  if (options.bookBalance !== undefined && options.bookBalance !== null) {
    bookBalancePaise = quantizeToPaise(options.bookBalance);
  } else {
    const openPaise = quantizeToPaise(options.openingBookBalance || 0);
    bookBalancePaise = openPaise + totalBookDebitPaise - totalBookCreditPaise;
  }

  /**
   * Statutory Bank Reconciliation Statement (BRS) Formula:
   * Reconciled Bank Balance = Book Balance
   *   + Cheques issued but not presented (Unmatched Book Credits)
   *   - Cheques deposited but not cleared (Unmatched Book Debits)
   *   + Direct Credits / Interest by bank not in books (Unmatched Bank Credits)
   *   - Bank charges / Direct debits by bank not in books (Unmatched Bank Debits)
   */
  const reconciledBalancePaise = bookBalancePaise
    + unmatchedInBankCreditPaise
    - unmatchedInBankDebitPaise
    + unmatchedInBooksCreditPaise
    - unmatchedInBooksDebitPaise;

  const netVariancePaise = Math.abs(reconciledBalancePaise - bankBalancePaise);
  const isReconciled = netVariancePaise <= 100; // within ₹1.00 tolerance for rounding differences

  const summary = {
    bookBalance: bookBalancePaise / 100,
    bankBalance: bankBalancePaise / 100,
    reconciledBalance: reconciledBalancePaise / 100,
    netVariance: netVariancePaise / 100,
    isReconciled,
    sanityCheckPassed,
    counts: {
      totalBankTxCount,
      totalBookTxCount,
      matchedCount,
      unmatchedInBooksCount,
      unmatchedInBankCount,
      exactMatchCount: matched.filter(m => m.matchType === 'EXACT').length,
      refMatchCount: matched.filter(m => m.matchType === 'REF_MATCH').length,
      fuzzyMatchCount: matched.filter(m => m.matchType === 'FUZZY' || m.matchType === 'CLEARING_DELAY').length
    },
    totals: {
      totalBankDebit: totalBankDebitPaise / 100,
      totalBankCredit: totalBankCreditPaise / 100,
      totalBookDebit: totalBookDebitPaise / 100,
      totalBookCredit: totalBookCreditPaise / 100,
      unmatchedInBooksDebit: unmatchedInBooksDebitPaise / 100,   // Bank charges, auto-debits
      unmatchedInBooksCredit: unmatchedInBooksCreditPaise / 100, // Direct credits, interest
      unmatchedInBankDebit: unmatchedInBankDebitPaise / 100,     // Deposits in transit
      unmatchedInBankCredit: unmatchedInBankCreditPaise / 100    // Unpresented cheques
    }
  };

  // -------------------------------------------------------------------------
  // CA AUDIT OBSERVATIONS / TRAIL
  // -------------------------------------------------------------------------
  const auditReport = [];
  if (isReconciled) {
    auditReport.push('✅ Bank Reconciliation Statement balanced: Reconciled book balance agrees with the bank statement.');
  } else {
    auditReport.push(`⚠️ Unreconciled Variance: Reconciled balance (₹${summary.reconciledBalance.toLocaleString('en-IN')}) differs from Bank balance (₹${summary.bankBalance.toLocaleString('en-IN')}) by ₹${summary.netVariance.toLocaleString('en-IN')}. Further investigation required.`);
  }

  if (unmatchedInBankCreditPaise > 0) {
    auditReport.push(`• Cheques issued but not presented for payment: ₹${(unmatchedInBankCreditPaise / 100).toLocaleString('en-IN')} across ${unmatchedInBank.filter(i => i.direction === DIRECTION.WITHDRAWAL).length} item(s).`);
  }
  if (unmatchedInBankDebitPaise > 0) {
    auditReport.push(`• Cheques deposited but not cleared by bank: ₹${(unmatchedInBankDebitPaise / 100).toLocaleString('en-IN')} across ${unmatchedInBank.filter(i => i.direction === DIRECTION.DEPOSIT).length} item(s).`);
  }
  if (unmatchedInBooksDebitPaise > 0) {
    auditReport.push(`• Bank charges and direct debits not yet booked: ₹${(unmatchedInBooksDebitPaise / 100).toLocaleString('en-IN')} across ${unmatchedInBooks.filter(i => i.direction === DIRECTION.WITHDRAWAL).length} item(s).`);
  }
  if (unmatchedInBooksCreditPaise > 0) {
    auditReport.push(`• Direct remittances and interest credited not yet booked: ₹${(unmatchedInBooksCreditPaise / 100).toLocaleString('en-IN')} across ${unmatchedInBooks.filter(i => i.direction === DIRECTION.DEPOSIT).length} item(s).`);
  }

  return {
    matched,
    unmatchedInBooks,
    unmatchedInBank,
    summary,
    auditReport
  };
}
