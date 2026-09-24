/**
 * Advanced Multi-Pass GST Reconciliation Engine
 * Implements 4-Pass Matching, Fuzzy Scorer, Vendor Compliance Index (VRI),
 * Section 16(4) Expiration Radar, and Rule 37 180-Day Payables Watchdog.
 */

import { canonicalizeInvoiceNumber, quantizeAmount } from './gstNormalizer.js';

/**
 * Normalize invoice number for OCR & Typo matching (e.g. I <-> 1, O <-> 0)
 */
export function normalizeInvoiceTypo(inv) {
  if (!inv) return '';
  return String(inv)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[I]/g, '1')
    .replace(/[O]/g, '0');
}

/**
 * Normalized Levenshtein Distance (0.0 to 1.0 similarity)
 */
export function stringSimilarity(str1, str2) {
  const s1 = String(str1 || '').trim().toUpperCase();
  const s2 = String(str2 || '').trim().toUpperCase();
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;

  const d = [];
  for (let i = 0; i <= len1; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,       // deletion
        d[i][j - 1] + 1,       // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = d[len1][len2];
  return 1.0 - (distance / maxLen);
}

/**
 * Day difference between two normalized dates ('YYYY-MM-DD')
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
 * Detect Effective GST Tax Rate (%)
 * Computes effective rate = (totalTax / taxableValue) * 100 and normalizes
 * to standard Indian GST slabs: 0%, 0.1%, 0.25%, 1.5%, 3%, 5%, 6%, 12%, 18%, 28%.
 */
export function detectTaxRate(tax, taxable) {
  const numTax = Number(tax) || 0;
  const numTaxable = Number(taxable) || 0;
  if (numTaxable <= 0 || numTax < 0) return 0;

  const rawRate = (numTax / numTaxable) * 100;
  const standardRates = [0, 0.1, 0.25, 1.5, 3, 5, 6, 12, 18, 28];

  for (const std of standardRates) {
    if (Math.abs(rawRate - std) <= 0.25) {
      return std;
    }
  }

  return Math.round(rawRate * 10) / 10;
}

/**
 * Multi-Pass Matching Engine
 * Compares Purchase Register (PR) against GSTR-2B (Inward) OR
 * Compares Sales Register (SR) against GSTR-1 (Outward)
 */
export function runGstReconciliation({
  purchaseRegisterItems = [],
  salesRegisterItems = [],
  booksItems = [],
  gstr2bItems = [],
  gstr1Items = [],
  portalItems = [],
  toleranceAmount = 1.00, // +/- Rs 1.00 tolerance for rounding differences
  reconType = 'INWARD',
  branchFilter = 'AUTO' // 'AUTO' | 'ALL' | specific branch code e.g. 'AAS', 'AAV'
}) {
  const isOutward = String(reconType).toUpperCase() === 'OUTWARD';
  const booksRaw = isOutward
    ? (salesRegisterItems.length > 0 ? salesRegisterItems : (booksItems.length > 0 ? booksItems : purchaseRegisterItems))
    : (purchaseRegisterItems.length > 0 ? purchaseRegisterItems : booksItems);
  const portalRaw = isOutward
    ? (gstr1Items.length > 0 ? gstr1Items : (portalItems.length > 0 ? portalItems : gstr2bItems))
    : (gstr2bItems.length > 0 ? gstr2bItems : portalItems);

  const tolerancePaise = Math.round(toleranceAmount * 100);

  const prPrefix = isOutward ? 'SR' : 'PR';
  const portalPrefix = isOutward ? 'G1' : '2B';

  // -------------------------------------------------------------
  // OUTWARD SPECIALIZATION:
  // 1. Detect & segregate non-sales entries (e.g. Purchase voucher recorded in Sales ledger)
  // 2. Aggregate multi-rate lines for same invoice across files (e.g. 9% + 14% on same inv)
  // 3. Segregate B2C Retail/Cash sales (no GSTIN) from B2B registered sales
  // 4. Branch / Series Alignment (e.g. Satara AAS vs Vashi AAV)
  // -------------------------------------------------------------
  const ledgerDiscrepancies = [];
  const b2cInvoices = [];
  let validBooks = [];

  if (isOutward) {
    const salesOnly = [];
    for (const itm of booksRaw) {
      const vType = String(itm.voucherType || itm.invoiceType || '').toUpperCase();
      if (vType === 'PURCHASE' || vType.includes('PURCHASE')) {
        ledgerDiscrepancies.push({
          ...itm,
          discrepancyType: 'PURCHASE_VOUCHER_IN_SALES_REGISTER',
          remarks: `Accounting discrepancy: Voucher type "${itm.voucherType || 'Purchase'}" recorded in Sales Register (Tax: ₹${(itm.totalTax || 0).toLocaleString('en-IN')}). Excluded from outward sales turnover.`
        });
      } else {
        salesOnly.push(itm);
      }
    }

    // Aggregate multi-rate lines across files for same B2B invoice
    const b2bAggMap = new Map();
    for (const itm of salesOnly) {
      const gstin = (itm.supplierGstin || '').trim();
      const isB2b = gstin.length === 15;
      if (!isB2b) {
        b2cInvoices.push(itm);
        continue;
      }
      const canonNo = (itm.canonicalInvoiceNo || itm.invoiceNumber || '').trim().toUpperCase();
      const aggKey = `${gstin.toUpperCase()}#${canonNo}`;
      if (b2bAggMap.has(aggKey)) {
        const ex = b2bAggMap.get(aggKey);
        ex.taxableValue = roundTo2(ex.taxableValue + (itm.taxableValue || 0));
        ex.taxableValuePaise = (ex.taxableValuePaise || 0) + (itm.taxableValuePaise || quantizeAmount(itm.taxableValue).paiseVal);
        ex.cgst = roundTo2(ex.cgst + (itm.cgst || 0));
        ex.cgstPaise = (ex.cgstPaise || 0) + (itm.cgstPaise || quantizeAmount(itm.cgst).paiseVal);
        ex.sgst = roundTo2(ex.sgst + (itm.sgst || 0));
        ex.sgstPaise = (ex.sgstPaise || 0) + (itm.sgstPaise || quantizeAmount(itm.sgst).paiseVal);
        ex.igst = roundTo2(ex.igst + (itm.igst || 0));
        ex.igstPaise = (ex.igstPaise || 0) + (itm.igstPaise || quantizeAmount(itm.igst).paiseVal);
        ex.cess = roundTo2(ex.cess + (itm.cess || 0));
        ex.cessPaise = (ex.cessPaise || 0) + (itm.cessPaise || quantizeAmount(itm.cess).paiseVal);
        ex.totalTax = roundTo2(ex.totalTax + (itm.totalTax || 0));
        ex.totalTaxPaise = (ex.totalTaxPaise || 0) + (itm.totalTaxPaise || quantizeAmount(itm.totalTax).paiseVal);
        ex.totalInvoiceValue = Math.max(ex.totalInvoiceValue || 0, itm.totalInvoiceValue || 0, roundTo2(ex.taxableValue + ex.totalTax));
        ex.totalInvoiceValuePaise = quantizeAmount(ex.totalInvoiceValue).paiseVal;
        if (itm._originFile && ex._originFile && !ex._originFile.includes(itm._originFile)) {
          ex._originFile += ', ' + itm._originFile;
        }
      } else {
        const initial = { ...itm };
        initial.taxableValuePaise = initial.taxableValuePaise || quantizeAmount(initial.taxableValue).paiseVal;
        initial.cgstPaise = initial.cgstPaise || quantizeAmount(initial.cgst).paiseVal;
        initial.sgstPaise = initial.sgstPaise || quantizeAmount(initial.sgst).paiseVal;
        initial.igstPaise = initial.igstPaise || quantizeAmount(initial.igst).paiseVal;
        initial.cessPaise = initial.cessPaise || quantizeAmount(initial.cess).paiseVal;
        initial.totalTaxPaise = initial.totalTaxPaise || quantizeAmount(initial.totalTax).paiseVal;
        initial.totalInvoiceValuePaise = initial.totalInvoiceValuePaise || quantizeAmount(initial.totalInvoiceValue).paiseVal;
        b2bAggMap.set(aggKey, initial);
      }
    }
    validBooks = Array.from(b2bAggMap.values());
  } else {
    // INWARD SPECIALIZATION:
    // Aggregate multi-rate lines across files and item lines for the same purchase invoice
    // E.g. Rate-wise purchase registers (5%, 12%, 18%, 28%) or itemized multi-row vouchers
    const prAggMap = new Map();
    for (const itm of booksRaw) {
      const gstin = (itm.supplierGstin || '').trim().toUpperCase();
      const canonNo = (itm.canonicalInvoiceNo || itm.invoiceNumber || '').trim().toUpperCase();
      const partyName = (itm.supplierName || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      const aggKey = gstin 
        ? `${gstin}#${canonNo}` 
        : (partyName ? `NAME:${partyName}#${canonNo}` : (canonNo ? `INV:${canonNo}` : `ROW:${itm._id || Math.random()}`));

      if (prAggMap.has(aggKey)) {
        const ex = prAggMap.get(aggKey);
        ex.taxableValue = roundTo2(ex.taxableValue + (itm.taxableValue || 0));
        ex.taxableValuePaise = (ex.taxableValuePaise || 0) + (itm.taxableValuePaise || quantizeAmount(itm.taxableValue).paiseVal);
        ex.cgst = roundTo2(ex.cgst + (itm.cgst || 0));
        ex.cgstPaise = (ex.cgstPaise || 0) + (itm.cgstPaise || quantizeAmount(itm.cgst).paiseVal);
        ex.sgst = roundTo2(ex.sgst + (itm.sgst || 0));
        ex.sgstPaise = (ex.sgstPaise || 0) + (itm.sgstPaise || quantizeAmount(itm.sgst).paiseVal);
        ex.igst = roundTo2(ex.igst + (itm.igst || 0));
        ex.igstPaise = (ex.igstPaise || 0) + (itm.igstPaise || quantizeAmount(itm.igst).paiseVal);
        ex.cess = roundTo2(ex.cess + (itm.cess || 0));
        ex.cessPaise = (ex.cessPaise || 0) + (itm.cessPaise || quantizeAmount(itm.cess).paiseVal);
        ex.totalTax = roundTo2(ex.totalTax + (itm.totalTax || 0));
        ex.totalTaxPaise = (ex.totalTaxPaise || 0) + (itm.totalTaxPaise || quantizeAmount(itm.totalTax).paiseVal);
        ex.totalInvoiceValue = Math.max(ex.totalInvoiceValue || 0, itm.totalInvoiceValue || 0, roundTo2(ex.taxableValue + ex.totalTax));
        ex.totalInvoiceValuePaise = quantizeAmount(ex.totalInvoiceValue).paiseVal;
        if (itm.supplierGstin && !ex.supplierGstin) {
          ex.supplierGstin = itm.supplierGstin;
        }
        if (itm._originFile && ex._originFile && !ex._originFile.includes(itm._originFile)) {
          ex._originFile += ', ' + itm._originFile;
        }
      } else {
        const initial = { ...itm };
        initial.taxableValuePaise = initial.taxableValuePaise || quantizeAmount(initial.taxableValue).paiseVal;
        initial.cgstPaise = initial.cgstPaise || quantizeAmount(initial.cgst).paiseVal;
        initial.sgstPaise = initial.sgstPaise || quantizeAmount(initial.sgst).paiseVal;
        initial.igstPaise = initial.igstPaise || quantizeAmount(initial.igst).paiseVal;
        initial.cessPaise = initial.cessPaise || quantizeAmount(initial.cess).paiseVal;
        initial.totalTaxPaise = initial.totalTaxPaise || quantizeAmount(initial.totalTax).paiseVal;
        initial.totalInvoiceValuePaise = initial.totalInvoiceValuePaise || quantizeAmount(initial.totalInvoiceValue).paiseVal;
        prAggMap.set(aggKey, initial);
      }
    }
    validBooks = Array.from(prAggMap.values());
  }

  // Portal Dataset Aggregation (for multi-file GSTR-2B or multi-file GSTR-1, multi-rate portal rows, and amendments)
  const portalAggMap = new Map();
  for (const itm of portalRaw) {
    const gstin = (itm.supplierGstin || '').trim().toUpperCase();
    const canonNo = (itm.canonicalInvoiceNo || itm.invoiceNumber || '').trim().toUpperCase();
    const aggKey = (gstin && canonNo) ? `${gstin}#${canonNo}` : null;

    if (aggKey && portalAggMap.has(aggKey)) {
      const ex = portalAggMap.get(aggKey);
      const isAmendment = (itm.invoiceType || '').toUpperCase().includes('B2BA') || (itm.section || '').toUpperCase().includes('B2BA');
      if (isAmendment) {
        // B2BA Amendment supersedes original values
        ex.taxableValue = itm.taxableValue;
        ex.taxableValuePaise = itm.taxableValuePaise || quantizeAmount(itm.taxableValue).paiseVal;
        ex.cgst = itm.cgst;
        ex.cgstPaise = itm.cgstPaise || quantizeAmount(itm.cgst).paiseVal;
        ex.sgst = itm.sgst;
        ex.sgstPaise = itm.sgstPaise || quantizeAmount(itm.sgst).paiseVal;
        ex.igst = itm.igst;
        ex.igstPaise = itm.igstPaise || quantizeAmount(itm.igst).paiseVal;
        ex.cess = itm.cess;
        ex.cessPaise = itm.cessPaise || quantizeAmount(itm.cess).paiseVal;
        ex.totalTax = itm.totalTax;
        ex.totalTaxPaise = itm.totalTaxPaise || quantizeAmount(itm.totalTax).paiseVal;
        ex.totalInvoiceValue = itm.totalInvoiceValue;
        ex.totalInvoiceValuePaise = quantizeAmount(itm.totalInvoiceValue).paiseVal;
        ex.invoiceType = itm.invoiceType;
      } else {
        // Multi-rate line in portal
        ex.taxableValue = roundTo2(ex.taxableValue + (itm.taxableValue || 0));
        ex.taxableValuePaise = (ex.taxableValuePaise || 0) + (itm.taxableValuePaise || quantizeAmount(itm.taxableValue).paiseVal);
        ex.cgst = roundTo2(ex.cgst + (itm.cgst || 0));
        ex.cgstPaise = (ex.cgstPaise || 0) + (itm.cgstPaise || quantizeAmount(itm.cgst).paiseVal);
        ex.sgst = roundTo2(ex.sgst + (itm.sgst || 0));
        ex.sgstPaise = (ex.sgstPaise || 0) + (itm.sgstPaise || quantizeAmount(itm.sgst).paiseVal);
        ex.igst = roundTo2(ex.igst + (itm.igst || 0));
        ex.igstPaise = (ex.igstPaise || 0) + (itm.igstPaise || quantizeAmount(itm.igst).paiseVal);
        ex.cess = roundTo2(ex.cess + (itm.cess || 0));
        ex.cessPaise = (ex.cessPaise || 0) + (itm.cessPaise || quantizeAmount(itm.cess).paiseVal);
        ex.totalTax = roundTo2(ex.totalTax + (itm.totalTax || 0));
        ex.totalTaxPaise = (ex.totalTaxPaise || 0) + (itm.totalTaxPaise || quantizeAmount(itm.totalTax).paiseVal);
        ex.totalInvoiceValue = Math.max(ex.totalInvoiceValue || 0, itm.totalInvoiceValue || 0, roundTo2(ex.taxableValue + ex.totalTax));
        ex.totalInvoiceValuePaise = quantizeAmount(ex.totalInvoiceValue).paiseVal;
      }
      if (itm._originFile && ex._originFile && !ex._originFile.includes(itm._originFile)) {
        ex._originFile += ', ' + itm._originFile;
      }
    } else if (aggKey) {
      const initial = { ...itm };
      initial.taxableValuePaise = initial.taxableValuePaise || quantizeAmount(initial.taxableValue).paiseVal;
      initial.cgstPaise = initial.cgstPaise || quantizeAmount(initial.cgst).paiseVal;
      initial.sgstPaise = initial.sgstPaise || quantizeAmount(initial.sgst).paiseVal;
      initial.igstPaise = initial.igstPaise || quantizeAmount(initial.igst).paiseVal;
      initial.cessPaise = initial.cessPaise || quantizeAmount(initial.cess).paiseVal;
      initial.totalTaxPaise = initial.totalTaxPaise || quantizeAmount(initial.totalTax).paiseVal;
      initial.totalInvoiceValuePaise = initial.totalInvoiceValuePaise || quantizeAmount(initial.totalInvoiceValue).paiseVal;
      portalAggMap.set(aggKey, initial);
    } else {
      const initial = { ...itm };
      initial.taxableValuePaise = initial.taxableValuePaise || quantizeAmount(initial.taxableValue).paiseVal;
      initial.totalTaxPaise = initial.totalTaxPaise || quantizeAmount(initial.totalTax).paiseVal;
      portalAggMap.set(`RAW_${Math.random()}`, initial);
    }
  }
  const basePortal = Array.from(portalAggMap.values());

  // Branch detection & filtering on Portal dataset (for multi-branch GSTR-1 returns)
  let availableBranches = [];
  let activeBranch = branchFilter || 'AUTO';
  let filteredPortal = basePortal;

  if (isOutward) {
    const branchCounts = new Map();
    for (const itm of portalRaw) {
      const inv = String(itm.invoiceNumber || '');
      const prefix = inv.includes('/') ? inv.split('/')[0].toUpperCase() : (inv.slice(0, 3).toUpperCase());
      if (prefix && prefix.length >= 2 && isNaN(Number(prefix))) {
        branchCounts.set(prefix, (branchCounts.get(prefix) || 0) + 1);
      }
    }

    const booksPrefixCounts = new Map();
    for (const itm of validBooks) {
      const inv = String(itm.invoiceNumber || '');
      const prefix = inv.includes('/') ? inv.split('/')[0].toUpperCase() : (inv.slice(0, 3).toUpperCase());
      if (prefix && prefix.length >= 2 && isNaN(Number(prefix))) {
        booksPrefixCounts.set(prefix, (booksPrefixCounts.get(prefix) || 0) + 1);
      }
    }

    let dominantBookPrefix = null;
    let maxCount = 0;
    for (const [pfx, count] of booksPrefixCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        dominantBookPrefix = pfx;
      }
    }

    availableBranches = Array.from(branchCounts.entries()).map(([pfx, cnt]) => ({
      id: pfx,
      name: pfx === 'AAS' ? 'Satara Branch (AAS)' : (pfx === 'AAV' ? 'Vashi Branch (AAV)' : `${pfx} Series`),
      count: cnt,
      isCurrent: false
    }));
    availableBranches.push({
      id: 'ALL',
      name: `All Branches (${portalRaw.length} Invoices)`,
      count: portalRaw.length,
      isCurrent: false
    });

    if (activeBranch === 'AUTO') {
      activeBranch = 'ALL';
    }

    for (const b of availableBranches) {
      b.isCurrent = (b.id === activeBranch);
    }

    if (activeBranch !== 'ALL') {
      filteredPortal = portalRaw.filter(i => {
        const inv = String(i.invoiceNumber || '').toUpperCase();
        if (activeBranch === 'AAS') {
          return inv.startsWith('AAS/') || inv.startsWith('AAS-') || inv.startsWith('AASC/') || inv.startsWith('AASC-') || inv === 'AAS' || inv === 'AASC';
        }
        if (activeBranch === 'AAV') {
          return inv.startsWith('AAV/') || inv.startsWith('AAV-') || inv.startsWith('AAVC/') || inv.startsWith('AAVC-') || inv === 'AAV' || inv === 'AAVC';
        }
        return inv.startsWith(activeBranch + '/') || inv.startsWith(activeBranch + '-') || inv === activeBranch;
      });
    }
  }

  // Deep clone items and assign unique internal tracking IDs
  const prList = validBooks.map((item, idx) => ({
    ...item,
    _id: `${prPrefix}_${idx}_${item.canonicalInvoiceNo || idx}`,
    _matched: false
  }));

  const gstr2bList = filteredPortal.map((item, idx) => ({
    ...item,
    _id: `${portalPrefix}_${idx}_${item.canonicalInvoiceNo || idx}`,
    _matched: false
  }));

  const exactMatches = [];
  const probableMatches = [];
  const splitBatchMatches = [];

  // -------------------------------------------------------------
  // PASS 1: Exact Hash Match (O(1) Map Lookup)
  // Key: Party_GSTIN + Canonical_Invoice_No + Taxable_Paise + Total_Tax_Paise
  // -------------------------------------------------------------
  const gstr2bExactMap = new Map();
  for (const item of gstr2bList) {
    const key = `${item.supplierGstin}|${item.canonicalInvoiceNo}|${item.taxableValuePaise}|${item.totalTaxPaise}`;
    if (!gstr2bExactMap.has(key)) {
      gstr2bExactMap.set(key, []);
    }
    gstr2bExactMap.get(key).push(item);
  }

  for (const pr of prList) {
    const key = `${pr.supplierGstin}|${pr.canonicalInvoiceNo}|${pr.taxableValuePaise}|${pr.totalTaxPaise}`;
    const candidates = gstr2bExactMap.get(key);
    if (candidates && candidates.length > 0) {
      const match2B = candidates.shift();
      pr._matched = true;
      match2B._matched = true;

      exactMatches.push({
        matchType: 'EXACT_MATCH',
        matchScore: 100,
        statusBadge: 'EXACT',
        prItem: pr,
        gstr2bItem: match2B,
        varianceTaxable: 0,
        varianceTax: 0,
        remarks: isOutward
          ? '100% Exact Match: Buyer GSTIN, Invoice Number, Taxable Value, and Output Tax heads agree.'
          : '100% Exact Match: GSTIN, Invoice Number, Taxable Value, and Tax heads agree.'
      });
    }
  }

  // -------------------------------------------------------------
  // PASS 1.5: Exact Match within Statutory Rounding Tolerance (<= toleranceAmount, e.g. Rs 1.00)
  // When Supplier GSTIN and Canonical Invoice Number agree exactly, and value differences are within rounding tolerance
  // (with fallback for missing or blank GSTIN in books if Invoice Number, Amount and Vendor Name agree)
  // -------------------------------------------------------------
  const gstr2bInvMap = new Map();
  const gstr2bTypoMap = new Map();
  const gstr2bByInvOnlyMap = new Map();
  for (const item of gstr2bList) {
    if (item._matched) continue;
    const key = `${item.supplierGstin}|${item.canonicalInvoiceNo}`;
    if (!gstr2bInvMap.has(key)) {
      gstr2bInvMap.set(key, []);
    }
    gstr2bInvMap.get(key).push(item);

    const typoKey = `${item.supplierGstin}|${normalizeInvoiceTypo(item.canonicalInvoiceNo || item.invoiceNumber)}`;
    if (!gstr2bTypoMap.has(typoKey)) {
      gstr2bTypoMap.set(typoKey, []);
    }
    gstr2bTypoMap.get(typoKey).push(item);

    const inv = item.canonicalInvoiceNo;
    if (inv) {
      if (!gstr2bByInvOnlyMap.has(inv)) gstr2bByInvOnlyMap.set(inv, []);
      gstr2bByInvOnlyMap.get(inv).push(item);
    }
  }

  for (const pr of prList) {
    if (pr._matched) continue;
    const key = `${pr.supplierGstin}|${pr.canonicalInvoiceNo}`;
    const typoKey = `${pr.supplierGstin}|${normalizeInvoiceTypo(pr.canonicalInvoiceNo || pr.invoiceNumber)}`;
    let candidates = gstr2bInvMap.get(key);
    let matchMethod = 'CANONICAL';

    if ((!candidates || candidates.length === 0) && pr.supplierGstin) {
      candidates = gstr2bTypoMap.get(typoKey);
      if (candidates && candidates.length > 0) matchMethod = 'TYPO_NORMALIZED';
    }

    if ((!candidates || candidates.length === 0) && pr.canonicalInvoiceNo) {
      const invCandidates = gstr2bByInvOnlyMap.get(pr.canonicalInvoiceNo);
      if (invCandidates && invCandidates.length > 0) {
        candidates = invCandidates;
        matchMethod = 'FALLBACK_INV';
      }
    }

    if (candidates && candidates.length > 0) {
      // Find candidate with smallest variance that satisfies tolerance
      let bestIdx = -1;
      let minDiff = Infinity;
      for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
        const cand = candidates[cIdx];
        const diffTaxable = Math.abs((pr.taxableValuePaise || 0) - (cand.taxableValuePaise || 0));
        const diffTax = Math.abs((pr.totalTaxPaise || 0) - (cand.totalTaxPaise || 0));
        const isTaxableWithinTol = tolerancePaise === 0 ? diffTaxable === 0 : diffTaxable < tolerancePaise;
        const isTaxWithinTol = tolerancePaise === 0 ? diffTax === 0 : diffTax < tolerancePaise;
        if (isTaxableWithinTol && isTaxWithinTol) {
          if (matchMethod === 'FALLBACK_INV') {
            const nameSim = stringSimilarity(pr.supplierName, cand.supplierName);
            const cleanPr = (pr.supplierName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const cleanCand = (cand.supplierName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const nameMatch = nameSim >= 0.4 || (cleanPr.length > 3 && cleanCand.length > 3 && (cleanPr.includes(cleanCand) || cleanCand.includes(cleanPr)));
            if (!nameMatch && pr.supplierGstin && cand.supplierGstin) continue;
          }

          const totalDiff = diffTaxable + diffTax;
          if (totalDiff < minDiff) {
            minDiff = totalDiff;
            bestIdx = cIdx;
          }
        }
      }

      if (bestIdx !== -1) {
        const match2B = candidates.splice(bestIdx, 1)[0];
        pr._matched = true;
        match2B._matched = true;

        if (!pr.supplierGstin && match2B.supplierGstin) {
          pr.supplierGstin = match2B.supplierGstin;
        }

        const vTaxable = Math.round(((pr.taxableValue || 0) - (match2B.taxableValue || 0)) * 100) / 100;
        const vTax = Math.round(((pr.totalTax || 0) - (match2B.totalTax || 0)) * 100) / 100;

        let remarks = (vTaxable === 0 && vTax === 0) 
          ? (isOutward ? '100% Exact Match: Buyer GSTIN, Invoice Number, Taxable Value, and Output Tax heads agree.' : '100% Exact Match: GSTIN, Invoice Number, Taxable Value, and Tax heads agree.')
          : `Exact Match within statutory tolerance (rounding diff: Taxable ₹${Math.abs(vTaxable).toFixed(2)}, Tax ₹${Math.abs(vTax).toFixed(2)}).`;

        if (matchMethod === 'TYPO_NORMALIZED') {
          remarks = `Exact Match: GST No and Amounts agree. Invoice number matched with OCR/character normalization (${pr.invoiceNumber} vs ${match2B.invoiceNumber}).`;
        } else if (matchMethod === 'FALLBACK_INV') {
          remarks = `Exact Match: Invoice Number and Amounts agree. Vendor GSTIN verified from GSTR-2B (${match2B.supplierGstin}).`;
        }

        exactMatches.push({
          matchType: 'EXACT_MATCH',
          matchScore: 100,
          statusBadge: 'EXACT',
          prItem: pr,
          gstr2bItem: match2B,
          varianceTaxable: vTaxable,
          varianceTax: vTax,
          remarks
        });
      }
    }
  }

  // -------------------------------------------------------------
  // PASS 2: Probable & Fuzzy Tolerance Match
  // Matches when GSTIN agrees (or differing/missing GSTIN with high name & invoice confidence)
  // and (Invoice Number is similar OR Date within 30 days)
  // with Taxable/Tax variance within tolerance band (or rate head differences)
  // -------------------------------------------------------------
  const unmatchedPrPass2 = prList.filter(p => !p._matched);
  const unmatched2bPass2 = gstr2bList.filter(g => !g._matched);

  for (const pr of unmatchedPrPass2) {
    let bestMatch = null;
    let highestScore = 0;
    let matchDiagnostics = null;

    for (const g2b of unmatched2bPass2) {
      if (g2b._matched) continue;

      // Primary anchor: GSTIN match or PAN match or high-confidence invoice number + name/value match
      const sameGstin = pr.supplierGstin && g2b.supplierGstin && pr.supplierGstin === g2b.supplierGstin;
      const samePan = pr.supplierGstin && g2b.supplierGstin && 
        pr.supplierGstin.slice(2, 12) === g2b.supplierGstin.slice(2, 12);

      // Number similarity
      const invSim = stringSimilarity(pr.canonicalInvoiceNo, g2b.canonicalInvoiceNo);
      const daysDiff = calculateDateDiffDays(pr.invoiceDate, g2b.invoiceDate);

      // Value variance
      const taxableDiffPaise = Math.abs((pr.taxableValuePaise || 0) - (g2b.taxableValuePaise || 0));
      const taxDiffPaise = Math.abs((pr.totalTaxPaise || 0) - (g2b.totalTaxPaise || 0));

      // Name similarity & matching
      const nameSim = stringSimilarity(pr.supplierName, g2b.supplierName);
      const cleanPr = (pr.supplierName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanG2b = (g2b.supplierName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameMatch = nameSim >= 0.45 || 
        (cleanPr.length > 3 && cleanG2b.length > 3 && (cleanPr.includes(cleanG2b) || cleanG2b.includes(cleanPr)));

      // Effective tax rate detection
      const prRate = detectTaxRate(pr.totalTax, pr.taxableValue);
      const g2bRate = detectTaxRate(g2b.totalTax, g2b.taxableValue);
      const rateDiff = Math.round(Math.abs(prRate - g2bRate) * 10) / 10;
      const isTaxableClose = taxableDiffPaise <= Math.max(tolerancePaise * 10, 10000) || 
        (pr.taxableValue > 0 && Math.abs(pr.taxableValue - g2b.taxableValue) / pr.taxableValue <= 0.02);
      const hasRateMismatch = isTaxableClose && rateDiff >= 1.0;

      // Anchor rule: must have same GSTIN/PAN OR (invSim >= 0.8 && (nameMatch || isTaxableClose)) OR exact invoice match
      if (!sameGstin && !samePan && !(invSim >= 0.8 && (nameMatch || isTaxableClose)) && !(invSim === 1.0)) {
        continue;
      }

      // Calculate composite score (0 to 100)
      let score = 0;
      let scoreReasons = [];

      // 1. GSTIN weight: 30 pts
      if (sameGstin) {
        score += 30;
      } else if (samePan) {
        score += 20;
        scoreReasons.push('Branch GSTIN mismatch (same PAN)');
      } else if (!pr.supplierGstin || !g2b.supplierGstin) {
        if (nameMatch) {
          score += 20;
          scoreReasons.push('Missing GSTIN in books (Vendor verified by Name & Invoice No)');
        } else {
          score += 10;
        }
      } else if (nameMatch) {
        score += 15;
        scoreReasons.push(`Supplier GSTIN Mismatch (Books: ${pr.supplierGstin} vs Portal: ${g2b.supplierGstin})`);
      }

      // 2. Invoice number similarity: 35 pts
      if (pr.canonicalInvoiceNo === g2b.canonicalInvoiceNo) {
        score += 35;
      } else if (invSim >= 0.8) {
        score += Math.round(invSim * 35);
        scoreReasons.push(`Invoice No Typo (${Math.round(invSim * 100)}% match: ${pr.invoiceNumber} vs ${g2b.invoiceNumber})`);
      } else if (invSim >= 0.5) {
        score += Math.round(invSim * 25);
      }

      // 3. Taxable value match: 20 pts
      if (taxableDiffPaise <= tolerancePaise) {
        score += 20;
        if (taxableDiffPaise > 0) {
          scoreReasons.push(`Rounding diff in Taxable Value: ₹${(taxableDiffPaise / 100).toFixed(2)}`);
        }
      } else if (taxableDiffPaise <= 1000) { // within Rs 10
        score += 10;
        scoreReasons.push(`Minor Taxable Value variance: ₹${(taxableDiffPaise / 100).toFixed(2)}`);
      }

      // 4. Tax amount match or Rate variance diagnostic: 15 pts
      if (hasRateMismatch) {
        score += 15; // Diagnostic alignment: rate slab mismatch identified
        scoreReasons.push(`Tax Rate Variance: Books @ ${prRate}% vs Portal @ ${g2bRate}%`);
      } else if (taxDiffPaise <= tolerancePaise) {
        score += 10;
      } else {
        scoreReasons.push(`Tax mismatch: PR ₹${pr.totalTax.toFixed(2)} vs 2B ₹${g2b.totalTax.toFixed(2)}`);
      }

      // 5. Date proximity: 5 pts
      if (daysDiff <= 5) {
        score += 5;
      } else if (daysDiff <= 30) {
        score += 3;
        scoreReasons.push(`Date variance: ${daysDiff} days`);
      }

      // Accept if Composite Score >= 65
      if (score >= 65 && score > highestScore) {
        highestScore = score;
        bestMatch = g2b;
        matchDiagnostics = {
          score,
          scoreReasons,
          taxableDiff: (pr.taxableValue - g2b.taxableValue),
          taxDiff: (pr.totalTax - g2b.totalTax),
          hasRateMismatch,
          prRate,
          g2bRate,
          rateDiff,
          sameGstin,
          samePan,
          invSim
        };
      }
    }

    if (bestMatch && highestScore >= 65) {
      pr._matched = true;
      bestMatch._matched = true;

      if (!pr.supplierGstin && bestMatch.supplierGstin) {
        pr.supplierGstin = bestMatch.supplierGstin;
      }

      const taxableDiff = Math.round(matchDiagnostics.taxableDiff * 100) / 100;
      const taxDiff = Math.round(matchDiagnostics.taxDiff * 100) / 100;
      const isTaxableWithinTolerance = toleranceAmount === 0 
        ? Math.abs(taxableDiff) === 0 
        : Math.abs(taxableDiff) < toleranceAmount;
      const isTaxWithinTolerance = toleranceAmount === 0 
        ? Math.abs(taxDiff) === 0 
        : Math.abs(taxDiff) < toleranceAmount;
      const isAmountMatch = isTaxableWithinTolerance && isTaxWithinTolerance;
      const isGstinMatch = matchDiagnostics.sameGstin || matchDiagnostics.samePan || (!pr.supplierGstin && bestMatch.supplierGstin);
      const isInvoiceMatch = (pr.canonicalInvoiceNo === bestMatch.canonicalInvoiceNo) || (matchDiagnostics.invSim >= 0.85);

      // User instruction: When GST number, Amount, and Invoice number match -> add to EXACT MATCH section!
      if (isGstinMatch && isAmountMatch && isInvoiceMatch) {
        exactMatches.push({
          matchType: 'EXACT_MATCH',
          matchScore: highestScore,
          statusBadge: 'EXACT',
          prItem: pr,
          gstr2bItem: bestMatch,
          varianceTaxable: taxableDiff,
          varianceTax: taxDiff,
          remarks: (pr.canonicalInvoiceNo === bestMatch.canonicalInvoiceNo)
            ? 'Exact Match: GST No, Invoice No, and Amounts agree.'
            : `Exact Match: GST No and Amounts agree. Invoice No matched (${pr.invoiceNumber} vs ${bestMatch.invoiceNumber}).`
        });
      } else {
        let statusBadge = taxableDiff === 0 && taxDiff === 0 ? 'FUZZY_KEY' : 'VALUE_MISMATCH';
        let customRemark = '';

        if (matchDiagnostics.hasRateMismatch) {
          statusBadge = 'TAX_RATE_VARIANCE';
          const prR = matchDiagnostics.prRate;
          const g2bR = matchDiagnostics.g2bRate;

          if (isOutward) {
            if (taxDiff > 0) {
              customRemark = `Tax Rate Variance: Books applied ${prR}% (₹${pr.totalTax.toFixed(2)}) vs GSTR-1 ${g2bR}% (₹${bestMatch.totalTax.toFixed(2)}) on Taxable ₹${pr.taxableValue.toFixed(2)}. Short outward liability declared in GSTR-1 by ₹${Math.abs(taxDiff).toFixed(2)} - Rule 88C (Form DRC-01B) notice risk. File GSTR-1A amendment.`;
            } else {
              customRemark = `Tax Rate Variance: Books applied ${prR}% (₹${pr.totalTax.toFixed(2)}) vs GSTR-1 ${g2bR}% (₹${bestMatch.totalTax.toFixed(2)}) on Taxable ₹${pr.taxableValue.toFixed(2)}. Excess outward liability declared in GSTR-1 by ₹${Math.abs(taxDiff).toFixed(2)}. Verify if credit note needed.`;
            }
          } else {
            if (taxDiff > 0) {
              customRemark = `Tax Rate Variance: Books applied ${prR}% (₹${pr.totalTax.toFixed(2)}) vs GSTR-2B ${g2bR}% (₹${bestMatch.totalTax.toFixed(2)}) on Taxable ₹${pr.taxableValue.toFixed(2)}. Excess ITC claimed in Books by ₹${Math.abs(taxDiff).toFixed(2)} - Rule 88D (Form DRC-01C) notice risk. Supplier billed lower rate; reverse excess ITC or seek debit note.`;
            } else {
              customRemark = `Tax Rate Variance: Books applied ${prR}% (₹${pr.totalTax.toFixed(2)}) vs GSTR-2B ${g2bR}% (₹${bestMatch.totalTax.toFixed(2)}) on Taxable ₹${pr.taxableValue.toFixed(2)}. Under-claimed ITC in Books by ₹${Math.abs(taxDiff).toFixed(2)}. Supplier billed higher rate; verify original tax invoice to claim eligible credit.`;
            }
          }
        }

        probableMatches.push({
          matchType: matchDiagnostics.hasRateMismatch ? 'TAX_RATE_VARIANCE' : 'PROBABLE_MATCH',
          matchScore: highestScore,
          statusBadge,
          prItem: pr,
          gstr2bItem: bestMatch,
          varianceTaxable: taxableDiff,
          varianceTax: taxDiff,
          hasRateMismatch: Boolean(matchDiagnostics.hasRateMismatch),
          booksRate: matchDiagnostics.prRate,
          portalRate: matchDiagnostics.g2bRate,
          rateDiff: matchDiagnostics.rateDiff,
          remarks: customRemark || (matchDiagnostics.scoreReasons.join('; ') || 'Fuzzy candidate matched within acceptable tolerance bands.')
        });
      }
    }
  }

  // -------------------------------------------------------------
  // PASS 3: Unmatched Categorization into Statutory Buckets
  // -------------------------------------------------------------
  const missingInPortal = [];
  const ineligibleSection17_5 = [];
  const missingInBooks = [];

  for (const pr of prList) {
    if (!pr._matched) {
      if (!isOutward && pr.isBlocked17_5) {
        ineligibleSection17_5.push({
          matchType: 'INELIGIBLE_17_5',
          matchScore: 0,
          statusBadge: 'BLOCKED_ITC',
          prItem: pr,
          gstr2bItem: null,
          varianceTaxable: pr.taxableValue,
          varianceTax: pr.totalTax,
          remarks: `Blocked Credit under ${pr.blocked17_5Clause || 'Sec 17(5)'}: ${pr.blocked17_5Reason}`
        });
      } else {
        missingInPortal.push({
          matchType: 'MISSING_IN_PORTAL',
          matchScore: 0,
          statusBadge: isOutward ? 'UNREPORTED_GSTR1' : 'MISSING_IN_2B',
          prItem: pr,
          gstr2bItem: null,
          varianceTaxable: pr.taxableValue,
          varianceTax: pr.totalTax,
          remarks: isOutward
            ? 'Recorded in Sales Register but omitted from GSTR-1. Buyer will be unable to claim ITC u/s 16(2)(aa). Subject to Section 50 interest risk.'
            : 'Present in Books of Accounts but not uploaded by supplier in GSTR-1 / missing in GSTR-2B. Risk of Rule 36(4) ITC disallowance.'
        });
      }
    }
  }

  for (const g2b of gstr2bList) {
    if (!g2b._matched) {
      missingInBooks.push({
        matchType: 'MISSING_IN_BOOKS',
        matchScore: 0,
        statusBadge: isOutward ? 'UNRECORDED_IN_BOOKS' : 'MISSING_IN_BOOKS',
        prItem: null,
        gstr2bItem: g2b,
        varianceTaxable: -g2b.taxableValue,
        varianceTax: -g2b.totalTax,
        remarks: isOutward
          ? 'Reported in GSTR-1 portal return but not recorded in Sales Register. Risk of excess tax liability declared or missing sales invoice in ERP.'
          : 'Present in GSTR-2B but not recorded in Purchase Register. Potential unclaimed ITC opportunity or missed expense entry.'
      });
    }
  }

  // Calculate Vendor / Customer Compliance & Action Plan
  const vendorCompliance = computeVendorComplianceScores(prList, gstr2bList, missingInPortal, probableMatches, isOutward);

  // Rate Mismatches (subset of probableMatches where effective tax rate differs by >= 1.0%)
  const rateMismatches = probableMatches.filter(m => m.hasRateMismatch);
  const rateVarianceCount = rateMismatches.length;
  const rateVarianceTaxDiff = roundTo2(rateMismatches.reduce((acc, m) => acc + Math.abs(m.varianceTax), 0));

  // Calculate Statutory Guardrails (Sec 16(4), Rule 37 180-day, Rule 88D DRC-01C for Inward; Rule 88C DRC-01B for Outward)
  const statutoryGuards = isOutward
    ? computeOutwardStatutoryGuards(prList, gstr2bList, missingInPortal, missingInBooks, rateMismatches)
    : computeGstStatutoryGuards(prList, gstr2bList, missingInPortal, rateMismatches);

  // Executive Reconciliation Summary
  const b2cTaxable = roundTo2(b2cInvoices.reduce((acc, i) => acc + (i.taxableValue || 0), 0));
  const b2cTax = roundTo2(b2cInvoices.reduce((acc, i) => acc + (i.totalTax || 0), 0));
  const ledgerDiscrepanciesTax = roundTo2(ledgerDiscrepancies.reduce((acc, i) => acc + (i.totalTax || 0), 0));

  const exactMatchTax = roundTo2(exactMatches.reduce((acc, m) => acc + (m.prItem ? m.prItem.totalTax : (m.gstr2bItem ? m.gstr2bItem.totalTax : 0)), 0));
  const probableMatchTax = roundTo2(probableMatches.reduce((acc, m) => acc + (m.prItem ? m.prItem.totalTax : (m.gstr2bItem ? m.gstr2bItem.totalTax : 0)), 0));
  const matchedTax = roundTo2(exactMatchTax + probableMatchTax);
  const missingInPortalTaxRisk = roundTo2(missingInPortal.reduce((acc, m) => acc + m.prItem.totalTax, 0));
  const missingInBooksTaxOpportunity = roundTo2(missingInBooks.reduce((acc, m) => acc + m.gstr2bItem.totalTax, 0));
  const netTaxDiffPaise = Math.round((missingInPortalTaxRisk - missingInBooksTaxOpportunity) * 100) / 100;

  // Detect Entity / Period Mismatch Guard
  let periodMismatchWarning = null;
  if (prList.length > 0 && gstr2bList.length > 0 && (exactMatches.length + probableMatches.length) === 0) {
    const booksYears = Array.from(new Set(prList.map(p => p.financialYear).filter(Boolean)));
    const portalYears = Array.from(new Set(gstr2bList.map(g => g.financialYear).filter(Boolean)));
    const booksGstins = new Set(prList.map(p => p.supplierGstin || p.gstin).filter(Boolean));
    const portalGstins = new Set(gstr2bList.map(g => g.supplierGstin || g.gstin).filter(Boolean));

    let commonGstins = 0;
    for (const g of booksGstins) {
      if (portalGstins.has(g)) commonGstins++;
    }

    const yearOverlap = booksYears.some(by => portalYears.includes(by));
    if (!yearOverlap || (commonGstins === 0 && prList.length >= 10 && gstr2bList.length >= 10)) {
      periodMismatchWarning = {
        hasMismatch: true,
        booksYears,
        portalYears,
        commonGstinsCount: commonGstins,
        booksRecordCount: prList.length,
        portalRecordCount: gstr2bList.length,
        message: !yearOverlap
          ? `Mismatched Financial Periods Detected: The uploaded books file belongs to FY ${booksYears.join(', ') || 'an earlier year'}, while the portal return belongs to FY ${portalYears.join(', ') || 'a different period'}. Please ensure you upload matching period files (e.g. for August 2026, upload 'Purchase Reg.xlsx').`
          : `Different Entity / Vendor Base Detected: None of the ${booksGstins.size} GSTINs in the uploaded register match the ${portalGstins.size} GSTINs in the portal return. Please verify that both files belong to the same business entity.`
      };
    }
  }

  // Variance Discrepancies Bucket: picks out matched invoices having difference of toleranceAmount and above (e.g. >= 1 rs)
  const varianceDiscrepancies = [];
  const varianceThresholdPaise = tolerancePaise === 0 ? 1 : tolerancePaise;

  for (const m of exactMatches) {
    const diffTaxablePaise = Math.round(Math.abs(m.varianceTaxable || 0) * 100);
    const diffTaxPaise = Math.round(Math.abs(m.varianceTax || 0) * 100);
    if (diffTaxablePaise >= varianceThresholdPaise || diffTaxPaise >= varianceThresholdPaise) {
      varianceDiscrepancies.push(m);
    }
  }

  for (const m of probableMatches) {
    const diffTaxablePaise = Math.round(Math.abs(m.varianceTaxable || 0) * 100);
    const diffTaxPaise = Math.round(Math.abs(m.varianceTax || 0) * 100);
    if (diffTaxablePaise >= varianceThresholdPaise || diffTaxPaise >= varianceThresholdPaise || m.hasRateMismatch) {
      varianceDiscrepancies.push(m);
    }
  }

  const varianceDiscrepanciesTaxDiff = roundTo2(varianceDiscrepancies.reduce((acc, m) => acc + Math.abs(m.varianceTax || 0), 0));
  const varianceDiscrepanciesTaxableDiff = roundTo2(varianceDiscrepancies.reduce((acc, m) => acc + Math.abs(m.varianceTaxable || 0), 0));

  // Compute GST Rate-Wise Reconciliation
  const rateWiseRecon = buildRateWiseReconciliation({
    booksItems: validBooks,
    portalItems: filteredPortal,
    exactMatches,
    probableMatches,
    missingInPortal,
    missingInBooks,
    isOutward
  });

  const summary = {
    reconType: isOutward ? 'OUTWARD' : 'INWARD',
    toleranceAmount,
    totalRecordsPR: prList.length,
    totalRecords2B: gstr2bList.length,
    matchedCount: exactMatches.length + probableMatches.length,
    exactMatchCount: exactMatches.length,
    probableMatchCount: probableMatches.length,
    varianceDiscrepanciesCount: varianceDiscrepancies.length,
    varianceDiscrepanciesTaxDiff,
    varianceDiscrepanciesTaxableDiff,
    rateVarianceCount,
    rateVarianceTaxDiff,
    rateWiseSummary: rateWiseRecon.summary,
    missingInPortalCount: missingInPortal.length,
    missingInBooksCount: missingInBooks.length,
    ineligible17_5Count: isOutward ? 0 : ineligibleSection17_5.length,
    matchRatePercentage: prList.length > 0 
      ? Math.round(((exactMatches.length + probableMatches.length) / prList.length) * 10000) / 100 
      : 0,
    availableBranches,
    activeBranch,
    periodMismatchWarning,
    b2cCount: b2cInvoices.length,
    b2cTaxable,
    b2cTax,
    ledgerDiscrepanciesCount: ledgerDiscrepancies.length,
    ledgerDiscrepanciesTax,
    taxDifference: netTaxDiffPaise,
    financialTotals: {
      prTaxable: roundTo2(prList.reduce((acc, i) => acc + (i.taxableValue || 0), 0)),
      prTax: roundTo2(prList.reduce((acc, i) => acc + (i.totalTax || 0), 0)),
      gstr2bTaxable: roundTo2(gstr2bList.reduce((acc, i) => acc + (i.taxableValue || 0), 0)),
      gstr2bTax: roundTo2(gstr2bList.reduce((acc, i) => acc + (i.totalTax || 0), 0)),
      exactMatchTax,
      probableMatchTax,
      varianceDiscrepanciesTaxDiff,
      rateVarianceTaxDiff,
      rateVarianceCount,
      totalMatchedTax: matchedTax,
      matchedTax,
      missingInPortalTaxRisk,
      missingInBooksTaxOpportunity,
      blocked17_5TaxAmount: isOutward ? 0 : roundTo2(ineligibleSection17_5.reduce((acc, m) => acc + m.prItem.totalTax, 0)),
      taxDifference: netTaxDiffPaise
    }
  };

  return {
    success: true,
    summary,
    statutoryGuards,
    vendorCompliance,
    rateWiseReconciliation: rateWiseRecon,
    buckets: {
      exactMatches,
      probableMatches,
      varianceDiscrepancies,
      rateMismatches,
      missingInPortal,
      missingInBooks,
      ineligibleSection17_5,
      b2cInvoices,
      ledgerDiscrepancies
    }
  };
}

/**
 * GST Rate-Wise Reconciliation Engine
 * Calculates statutory rate slab breakdowns (0%, 0.1%, 0.25%, 1.5%, 3%, 5%, 6%, 12%, 18%, 28%, Other)
 * comparing Books vs Portal with rate shift diagnostics, tax head variances, and Rule 88C/88D statutory notices.
 */
export function buildRateWiseReconciliation({
  booksItems = [],
  portalItems = [],
  exactMatches = [],
  probableMatches = [],
  missingInPortal = [],
  missingInBooks = [],
  isOutward = false
}) {
  const rateSlabsDef = [
    { key: '0', rate: 0, label: '0% (Nil / Exempt)' },
    { key: '0.1', rate: 0.1, label: '0.1% (Export / Concessional)' },
    { key: '0.25', rate: 0.25, label: '0.25% (Precious Stones)' },
    { key: '1.5', rate: 1.5, label: '1.5% (Affordable Housing)' },
    { key: '3', rate: 3, label: '3% (Gold / Silver / Jewellery)' },
    { key: '5', rate: 5, label: '5% (Essential Goods / Services)' },
    { key: '6', rate: 6, label: '6% (Composition / Bricks)' },
    { key: '12', rate: 12, label: '12% (Standard Slab 1)' },
    { key: '18', rate: 18, label: '18% (Standard Slab 2)' },
    { key: '28', rate: 28, label: '28% (Luxury / Sin Goods)' },
    { key: 'OTHER', rate: -1, label: 'Other / Mixed Rates' }
  ];

  const slabMap = new Map();
  for (const s of rateSlabsDef) {
    slabMap.set(s.key, {
      key: s.key,
      rate: s.rate,
      label: s.label,
      books: {
        count: 0,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
        totalTax: 0
      },
      portal: {
        count: 0,
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
        totalTax: 0
      },
      variance: {
        taxable: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        cess: 0,
        totalTax: 0
      },
      exactMatchesCount: 0,
      probableMatchesCount: 0,
      rateMismatchesCount: 0,
      missingInPortalCount: 0,
      missingInBooksCount: 0,
      statutoryRisk: 'BALANCED',
      statutoryRiskMessage: ''
    });
  }

  function getSlabKey(rate) {
    const r = Number(rate);
    if (isNaN(r) || r < 0) return 'OTHER';
    if (r === 0) return '0';
    if (Math.abs(r - 0.1) <= 0.05) return '0.1';
    if (Math.abs(r - 0.25) <= 0.05) return '0.25';
    if (Math.abs(r - 1.5) <= 0.1) return '1.5';
    if (Math.abs(r - 3) <= 0.2) return '3';
    if (Math.abs(r - 5) <= 0.25) return '5';
    if (Math.abs(r - 6) <= 0.25) return '6';
    if (Math.abs(r - 12) <= 0.3) return '12';
    if (Math.abs(r - 18) <= 0.4) return '18';
    if (Math.abs(r - 28) <= 0.5) return '28';
    return 'OTHER';
  }

  // Aggregate Books items by rate slab
  for (const itm of booksItems) {
    const rate = itm.rate !== undefined && !isNaN(Number(itm.rate)) && Number(itm.rate) >= 0 
      ? Number(itm.rate) 
      : detectTaxRate(itm.totalTax, itm.taxableValue);
    const key = getSlabKey(rate);
    const s = slabMap.get(key) || slabMap.get('OTHER');
    s.books.count += 1;
    s.books.taxable = roundTo2(s.books.taxable + (itm.taxableValue || 0));
    s.books.cgst = roundTo2(s.books.cgst + (itm.cgst || 0));
    s.books.sgst = roundTo2(s.books.sgst + (itm.sgst || 0));
    s.books.igst = roundTo2(s.books.igst + (itm.igst || 0));
    s.books.cess = roundTo2(s.books.cess + (itm.cess || 0));
    s.books.totalTax = roundTo2(s.books.totalTax + (itm.totalTax || 0));
  }

  // Aggregate Portal items by rate slab
  for (const itm of portalItems) {
    const rate = itm.rate !== undefined && !isNaN(Number(itm.rate)) && Number(itm.rate) >= 0 
      ? Number(itm.rate) 
      : detectTaxRate(itm.totalTax, itm.taxableValue);
    const key = getSlabKey(rate);
    const s = slabMap.get(key) || slabMap.get('OTHER');
    s.portal.count += 1;
    s.portal.taxable = roundTo2(s.portal.taxable + (itm.taxableValue || 0));
    s.portal.cgst = roundTo2(s.portal.cgst + (itm.cgst || 0));
    s.portal.sgst = roundTo2(s.portal.sgst + (itm.sgst || 0));
    s.portal.igst = roundTo2(s.portal.igst + (itm.igst || 0));
    s.portal.cess = roundTo2(s.portal.cess + (itm.cess || 0));
    s.portal.totalTax = roundTo2(s.portal.totalTax + (itm.totalTax || 0));
  }

  // Track matched items and mismatches
  for (const m of exactMatches) {
    const rate = detectTaxRate(m.prItem?.totalTax, m.prItem?.taxableValue);
    const s = slabMap.get(getSlabKey(rate)) || slabMap.get('OTHER');
    s.exactMatchesCount += 1;
  }

  for (const m of probableMatches) {
    const prRate = m.booksRate !== undefined ? m.booksRate : detectTaxRate(m.prItem?.totalTax, m.prItem?.taxableValue);
    const s = slabMap.get(getSlabKey(prRate)) || slabMap.get('OTHER');
    s.probableMatchesCount += 1;
    if (m.hasRateMismatch) {
      s.rateMismatchesCount += 1;
    }
  }

  for (const m of missingInPortal) {
    const rate = detectTaxRate(m.prItem?.totalTax, m.prItem?.taxableValue);
    const s = slabMap.get(getSlabKey(rate)) || slabMap.get('OTHER');
    s.missingInPortalCount += 1;
  }

  for (const m of missingInBooks) {
    const rate = detectTaxRate(m.gstr2bItem?.totalTax, m.gstr2bItem?.taxableValue);
    const s = slabMap.get(getSlabKey(rate)) || slabMap.get('OTHER');
    s.missingInBooksCount += 1;
  }

  // Compute variances and statutory risk per slab
  const activeSlabs = [];
  let totalBooksTaxable = 0, totalBooksTax = 0;
  let totalPortalTaxable = 0, totalPortalTax = 0;
  let totalTaxableVariance = 0, totalTaxVariance = 0;
  let slabsWithVarianceCount = 0;

  for (const s of slabMap.values()) {
    s.variance.taxable = roundTo2(s.books.taxable - s.portal.taxable);
    s.variance.cgst = roundTo2(s.books.cgst - s.portal.cgst);
    s.variance.sgst = roundTo2(s.books.sgst - s.portal.sgst);
    s.variance.igst = roundTo2(s.books.igst - s.portal.igst);
    s.variance.cess = roundTo2(s.books.cess - s.portal.cess);
    s.variance.totalTax = roundTo2(s.books.totalTax - s.portal.totalTax);

    totalBooksTaxable = roundTo2(totalBooksTaxable + s.books.taxable);
    totalBooksTax = roundTo2(totalBooksTax + s.books.totalTax);
    totalPortalTaxable = roundTo2(totalPortalTaxable + s.portal.taxable);
    totalPortalTax = roundTo2(totalPortalTax + s.portal.totalTax);
    totalTaxableVariance = roundTo2(totalTaxableVariance + s.variance.taxable);
    totalTaxVariance = roundTo2(totalTaxVariance + s.variance.totalTax);

    if (Math.abs(s.variance.totalTax) >= 1.00 || Math.abs(s.variance.taxable) >= 1.00) {
      slabsWithVarianceCount++;
    }

    if (isOutward) {
      if (s.variance.totalTax > 1.00) {
        s.statutoryRisk = 'RULE_88C_RISK';
        s.statutoryRiskMessage = `Rule 88C (DRC-01B) Notice Risk: Short outward tax declared in GSTR-1 by ₹${s.variance.totalTax.toLocaleString('en-IN')}. Rectify in GSTR-1A/Table 9.`;
      } else if (s.variance.totalTax < -1.00) {
        s.statutoryRisk = 'EXCESS_PORTAL_TAX';
        s.statutoryRiskMessage = `Higher tax reported in GSTR-1 than Books by ₹${Math.abs(s.variance.totalTax).toLocaleString('en-IN')}. Verify credit note requirement.`;
      } else {
        s.statutoryRisk = 'BALANCED';
        s.statutoryRiskMessage = 'Turnover and tax heads balanced within statutory threshold.';
      }
    } else {
      if (s.variance.totalTax > 1.00) {
        s.statutoryRisk = 'RULE_88D_RISK';
        s.statutoryRiskMessage = `Rule 88D (DRC-01C) Notice Risk: Excess ITC claimed in Books over 2B by ₹${s.variance.totalTax.toLocaleString('en-IN')}. Reverse excess ITC or obtain supplier debit note.`;
      } else if (s.variance.totalTax < -1.00) {
        s.statutoryRisk = 'UNCLAIMED_ITC';
        s.statutoryRiskMessage = `Unclaimed eligible ITC on Portal: ₹${Math.abs(s.variance.totalTax).toLocaleString('en-IN')}. Verify tax invoice to claim credit.`;
      } else {
        s.statutoryRisk = 'BALANCED';
        s.statutoryRiskMessage = 'ITC and tax heads balanced within statutory threshold.';
      }
    }

    // Only include slabs that have transactions in Books or Portal
    if (s.books.count > 0 || s.portal.count > 0) {
      activeSlabs.push(s);
    }
  }

  // Rate-Wise Invoices line item listing
  const rateWiseInvoices = [];
  for (const m of exactMatches) {
    const r = detectTaxRate(m.prItem?.totalTax, m.prItem?.taxableValue);
    rateWiseInvoices.push({
      invoiceNumber: m.prItem?.invoiceNumber,
      invoiceDate: m.prItem?.invoiceDate,
      supplierName: m.prItem?.supplierName,
      supplierGstin: m.prItem?.supplierGstin,
      rateSlab: getSlabKey(r),
      rateLabel: `${r}%`,
      booksRate: r,
      portalRate: r,
      rateDiff: 0,
      hasRateMismatch: false,
      booksTaxable: m.prItem?.taxableValue,
      portalTaxable: m.gstr2bItem?.taxableValue,
      varianceTaxable: m.varianceTaxable || 0,
      booksTax: m.prItem?.totalTax,
      portalTax: m.gstr2bItem?.totalTax,
      varianceTax: m.varianceTax || 0,
      matchType: 'EXACT_MATCH',
      statusBadge: 'EXACT',
      remarks: m.remarks
    });
  }

  for (const m of probableMatches) {
    const prR = m.booksRate !== undefined ? m.booksRate : detectTaxRate(m.prItem?.totalTax, m.prItem?.taxableValue);
    const pR = m.portalRate !== undefined ? m.portalRate : detectTaxRate(m.gstr2bItem?.totalTax, m.gstr2bItem?.taxableValue);
    rateWiseInvoices.push({
      invoiceNumber: m.prItem?.invoiceNumber,
      invoiceDate: m.prItem?.invoiceDate,
      supplierName: m.prItem?.supplierName,
      supplierGstin: m.prItem?.supplierGstin,
      rateSlab: getSlabKey(prR),
      rateLabel: `${prR}%`,
      booksRate: prR,
      portalRate: pR,
      rateDiff: m.rateDiff !== undefined ? m.rateDiff : Math.abs(prR - pR),
      hasRateMismatch: Boolean(m.hasRateMismatch),
      booksTaxable: m.prItem?.taxableValue,
      portalTaxable: m.gstr2bItem?.taxableValue,
      varianceTaxable: m.varianceTaxable || 0,
      booksTax: m.prItem?.totalTax,
      portalTax: m.gstr2bItem?.totalTax,
      varianceTax: m.varianceTax || 0,
      matchType: m.matchType,
      statusBadge: m.statusBadge,
      remarks: m.remarks
    });
  }

  const rateWiseSummary = {
    totalBooksTaxable,
    totalBooksTax,
    totalPortalTaxable,
    totalPortalTax,
    totalTaxableVariance,
    totalTaxVariance,
    slabsWithVarianceCount,
    rateMismatchCount: probableMatches.filter(m => m.hasRateMismatch).length
  };

  return {
    summary: rateWiseSummary,
    slabs: activeSlabs,
    invoices: rateWiseInvoices
  };
}

/**
 * Vendor Reliability Index (VRI) & Automated Action Generator
 */
export function computeVendorComplianceScores(prList, gstr2bList, missingInPortal, probableMatches, isOutward = false) {
  const vendorMap = new Map();

  // Aggregate invoices by party GSTIN
  for (const pr of prList) {
    const partyGstin = pr.supplierGstin || 'UNREGISTERED';
    const partyName = pr.supplierName || (isOutward ? 'B2C / Unregistered Customer' : 'Unknown Vendor');

    if (!vendorMap.has(partyGstin)) {
      vendorMap.set(partyGstin, {
        gstin: partyGstin,
        vendorName: partyName,
        totalInvoices: 0,
        totalTaxable: 0,
        totalTax: 0,
        matchedInvoices: 0,
        missingInvoices: [],
        mismatchedInvoices: [],
        unfiledTaxAmount: 0
      });
    }
    const v = vendorMap.get(partyGstin);
    v.totalInvoices++;
    v.totalTaxable += pr.taxableValue;
    v.totalTax += pr.totalTax;
    if (pr._matched) {
      v.matchedInvoices++;
    }
  }

  // Track missing invoices
  for (const m of missingInPortal) {
    const pr = m.prItem;
    if (!pr) continue;
    const partyGstin = pr.supplierGstin || 'UNREGISTERED';
    if (vendorMap.has(partyGstin)) {
      const v = vendorMap.get(partyGstin);
      v.missingInvoices.push({
        invoiceNumber: pr.invoiceNumber,
        date: pr.invoiceDate,
        taxable: pr.taxableValue,
        tax: pr.totalTax
      });
      v.unfiledTaxAmount += pr.totalTax;
    }
  }

  // Calculate scores
  const vendorScores = [];
  for (const [gstin, data] of vendorMap.entries()) {
    const matchRatio = data.totalInvoices > 0 ? (data.matchedInvoices / data.totalInvoices) : 1;
    const vriScore = Math.round(matchRatio * 100);

    let grade = 'A';
    let statusText = isOutward ? 'FULLY REPORTED (Compliant)' : 'COMPLIANT (Low Risk)';
    if (vriScore < 70) {
      grade = 'C';
      statusText = isOutward ? 'UNREPORTED RISK (Action Required)' : 'HIGH RISK (Action Required)';
    } else if (vriScore < 90) {
      grade = 'B';
      statusText = isOutward ? 'PARTIALLY REPORTED (Review)' : 'MODERATE (Minor Follow-up)';
    }

    // Recommended payment hold (Inward) / Unfiled tax component (Outward)
    const recommendedPaymentHold = roundTo2(data.unfiledTaxAmount);

    // Generate tailored notice
    const whatsappNotice = isOutward ? generateCustomerWhatsAppNotice(data) : generateVendorWhatsAppNotice(data);
    const emailNotice = isOutward ? generateCustomerEmailNotice(data) : generateVendorEmailNotice(data);

    vendorScores.push({
      gstin,
      vendorName: data.vendorName,
      totalInvoices: data.totalInvoices,
      matchedInvoices: data.matchedInvoices,
      missingInvoicesCount: data.missingInvoices.length,
      totalTaxable: roundTo2(data.totalTaxable),
      totalTax: roundTo2(data.totalTax),
      unfiledTaxAmount: roundTo2(data.unfiledTaxAmount),
      recommendedPaymentHold,
      vriScore,
      grade,
      statusText,
      missingInvoicesList: data.missingInvoices,
      whatsappNotice,
      emailNotice
    });
  }

  // Sort by highest unfiled tax risk
  vendorScores.sort((a, b) => b.unfiledTaxAmount - a.unfiledTaxAmount);
  return vendorScores;
}

/**
 * Statutory Guardrails (Section 16(4), Rule 37 180-Day, Rule 88D DRC-01C)
 */
export function computeGstStatutoryGuards(prList, gstr2bList, missingInPortal, rateMismatches = []) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-12

  // 1. Section 16(4) Expiration Radar:
  // Invoices of prior Financial Year must be claimed before 30th November
  const priorFyCutoffDate = new Date(`${currentYear}-11-30`);
  const daysUntilCutoff = Math.round((priorFyCutoffDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const expiringInvoices = [];
  for (const m of missingInPortal) {
    const pr = m.prItem;
    if (!pr.invoiceDate) continue;
    const invDate = new Date(pr.invoiceDate);
    const invYear = invDate.getFullYear();
    const invMonth = invDate.getMonth() + 1;

    // Check if invoice belongs to previous FY
    const isPriorFiscalYear = (currentMonth >= 4 && invYear < currentYear) ||
      (currentMonth < 4 && (invYear < currentYear - 1 || (invYear === currentYear - 1 && invMonth < 4)));

    if (isPriorFiscalYear) {
      expiringInvoices.push({
        invoiceNumber: pr.invoiceNumber,
        date: pr.invoiceDate,
        supplierName: pr.supplierName,
        supplierGstin: pr.supplierGstin,
        taxable: pr.taxableValue,
        tax: pr.totalTax,
        daysRemaining: daysUntilCutoff
      });
    }
  }

  // 2. Rule 37 (180-Day Aging Watchdog)
  // Unpaid invoices where invoice date is older than 150 days (Warning) or 180 days (Mandatory Reversal)
  const payablesAging180 = [];
  for (const pr of prList) {
    if (!pr.invoiceDate) continue;
    const daysElapsed = calculateDateDiffDays(pr.invoiceDate, today.toISOString().slice(0, 10));

    if (daysElapsed >= 150) {
      const isReversalMandatory = daysElapsed > 180;
      const daysOverdueBeyond180 = Math.max(0, daysElapsed - 180);
      // Interest under Sec 50 at 18% p.a.
      const estimatedInterest = isReversalMandatory 
        ? roundTo2(pr.totalTax * 0.18 * (daysOverdueBeyond180 / 365)) 
        : 0;

      payablesAging180.push({
        invoiceNumber: pr.invoiceNumber,
        date: pr.invoiceDate,
        supplierName: pr.supplierName,
        supplierGstin: pr.supplierGstin,
        taxable: pr.taxableValue,
        tax: pr.totalTax,
        daysElapsed,
        daysRemainingTo180: Math.max(0, 180 - daysElapsed),
        status: isReversalMandatory ? 'REVERSAL_REQUIRED' : 'WARNING_APPROACHING_180',
        estimatedInterest
      });
    }
  }

  // 3. Rule 88D (Form DRC-01C) Risk Gauge
  // Compares total ITC claimed in Books against total available in GSTR-2B
  const totalClaimedTax = prList.reduce((acc, p) => acc + (p.isBlocked17_5 ? 0 : p.totalTax), 0);
  const totalEligible2bTax = gstr2bList.reduce((acc, g) => acc + (g.itcAvailability === 'N' ? 0 : g.totalTax), 0);
  const excessClaimed = Math.max(0, totalClaimedTax - totalEligible2bTax);
  const excessPercentage = totalEligible2bTax > 0 
    ? Math.round(((totalClaimedTax - totalEligible2bTax) / totalEligible2bTax) * 10000) / 100 
    : 0;

  const triggersDrc01c = excessPercentage > 10 || excessClaimed >= 2500000;

  // Rate variance impact on ITC
  const rateVarianceExcessTax = roundTo2(rateMismatches.filter(m => m.varianceTax > 0).reduce((acc, m) => acc + m.varianceTax, 0));
  const rateVarianceUnderTax = roundTo2(rateMismatches.filter(m => m.varianceTax < 0).reduce((acc, m) => acc + Math.abs(m.varianceTax), 0));

  return {
    section16_4: {
      cutoffDate: `${currentYear}-11-30`,
      daysUntilCutoff,
      expiringInvoicesCount: expiringInvoices.length,
      expiringTaxRisk: roundTo2(expiringInvoices.reduce((acc, i) => acc + i.tax, 0)),
      invoices: expiringInvoices
    },
    rule37_180Day: {
      totalFlaggedCount: payablesAging180.length,
      mandatoryReversalCount: payablesAging180.filter(p => p.status === 'REVERSAL_REQUIRED').length,
      totalTaxAtRisk: roundTo2(payablesAging180.reduce((acc, p) => acc + p.tax, 0)),
      totalEstimatedInterest: roundTo2(payablesAging180.reduce((acc, p) => acc + p.estimatedInterest, 0)),
      items: payablesAging180
    },
    rule88D_DRC01C: {
      totalClaimedTax: roundTo2(totalClaimedTax),
      totalEligible2bTax: roundTo2(totalEligible2bTax),
      excessClaimed: roundTo2(excessClaimed),
      excessPercentage,
      triggersNotice: triggersDrc01c,
      riskLevel: triggersDrc01c ? 'CRITICAL (DRC-01C Notice Risk)' : 'COMPLIANT'
    },
    rateVarianceRisk: {
      count: rateMismatches.length,
      excessTaxClaimed: rateVarianceExcessTax,
      underClaimedTax: rateVarianceUnderTax,
      statutoryAdvisory: rateVarianceExcessTax > 0 
        ? `Excess ITC of ₹${rateVarianceExcessTax.toLocaleString('en-IN')} booked due to tax rate slab differences. Risk of Rule 88D (Form DRC-01C) notice unless reversed or adjusted.`
        : (rateMismatches.length > 0 ? 'Under-claimed ITC identified due to rate differences. Verify original tax invoices.' : 'No rate variances detected.')
    }
  };
}

/**
 * Helper to generate pre-formatted WhatsApp notice for non-compliant vendors
 */
function generateVendorWhatsAppNotice(vendorData) {
  const invLines = vendorData.missingInvoices
    .slice(0, 5)
    .map(i => `• Inv #${i.invoiceNumber} dt ${i.date}: ₹${i.tax.toLocaleString('en-IN')}`)
    .join('\n');
  const moreCount = vendorData.missingInvoices.length > 5 
    ? `\n...and ${vendorData.missingInvoices.length - 5} more invoice(s)` 
    : '';

  return `*GST RECONCILIATION NOTICE - ACTION REQUIRED*\n\n` +
    `Dear ${vendorData.vendorName},\n\n` +
    `During our monthly GST compliance audit, the following invoice(s) issued by you are *missing in our GSTR-2B* (not reflected in your GSTR-1/IFF):\n\n` +
    `${invLines}${moreCount}\n\n` +
    `*Total Unreflected GST Credit:* ₹${vendorData.unfiledTaxAmount.toLocaleString('en-IN')}\n\n` +
    `⚠️ Under Section 16(2)(aa) of the CGST Act, we cannot avail Input Tax Credit unless these invoices appear in our GSTR-2B. ` +
    `Kindly upload or rectify these invoices in your upcoming GSTR-1 filing immediately.\n\n` +
    `_Note: As per commercial policy, payment of GST component (₹${vendorData.unfiledTaxAmount.toLocaleString('en-IN')}) will be placed on hold until reflection in GSTR-2B._\n\n` +
    `Accounts Department`;
}

/**
 * Helper to generate pre-formatted formal Email notice
 */
function generateVendorEmailNotice(vendorData) {
  const invRows = vendorData.missingInvoices
    .map(i => `  - Invoice No: ${i.invoiceNumber} | Date: ${i.date} | Taxable: ₹${i.taxable.toLocaleString('en-IN')} | GST: ₹${i.tax.toLocaleString('en-IN')}`)
    .join('\n');

  return `Subject: URGENT: Non-Reflection of Invoices in GSTR-2B | GSTIN: ${vendorData.gstin}\n\n` +
    `Dear Accounts Team,\n\n` +
    `This is regarding the monthly Input Tax Credit (ITC) reconciliation for our purchases from ${vendorData.vendorName} (GSTIN: ${vendorData.gstin}).\n\n` +
    `The following invoice(s) recorded in our books are currently NOT reflected in our auto-drafted GSTR-2B statement on the GST Portal:\n\n` +
    `${invRows}\n\n` +
    `Total GST Credit Blocked: ₹${vendorData.unfiledTaxAmount.toLocaleString('en-IN')}\n\n` +
    `Statutory Implication:\n` +
    `Under Section 16(2)(aa) of the Central Goods and Services Tax Act, 2017 read with Rule 36(4), we are legally prohibited from claiming ITC unless the tax invoice is declared by you in Form GSTR-1 / IFF.\n\n` +
    `Requested Action:\n` +
    `1. Please verify your filed GSTR-1 returns and rectify/upload the above invoices in your next filing period.\n` +
    `2. If filed under a different GSTIN or with an incorrect invoice number, please provide the revised details immediately.\n\n` +
    `Please note that until these invoices reflect in our GSTR-2B, the GST amount of ₹${vendorData.unfiledTaxAmount.toLocaleString('en-IN')} will remain on payment hold.\n\n` +
    `Thank you for your cooperation.\n\n` +
    `Best regards,\n` +
    `Finance & Taxation Department`;
}

/**
 * Outward Statutory Guardrails (Rule 88C DRC-01B, Section 50 Interest, Section 16(2)(aa) Recipient Impact)
 */
export function computeOutwardStatutoryGuards(salesList, gstr1List, missingInPortal, missingInBooks, rateMismatches = []) {
  const booksTax = roundTo2(salesList.reduce((acc, p) => acc + (p.totalTax || 0), 0));
  const portalTax = roundTo2(gstr1List.reduce((acc, g) => acc + (g.totalTax || 0), 0));
  const missingPortalTax = roundTo2(missingInPortal.reduce((acc, m) => acc + (m.prItem?.totalTax || 0), 0));
  const missingBooksTax = roundTo2(missingInBooks.reduce((acc, m) => acc + (m.gstr2bItem?.totalTax || 0), 0));

  // Rule 88C (Form DRC-01B): Triggered when tax payable in GSTR-1 exceeds books/3B by > 20% AND > ₹25,000
  const excessPortalTax = Math.max(0, roundTo2(portalTax - booksTax));
  const excessPercentage = booksTax > 0 
    ? Math.round(((portalTax - booksTax) / booksTax) * 10000) / 100 
    : (portalTax > 0 ? 100 : 0);

  const triggersDrc01b = excessPercentage > 20 && excessPortalTax >= 25000;

  // Section 50 Interest Risk on Sales Omitted from GSTR-1 (at 18% p.a. for ~30 days delay)
  const estimatedInterest18 = roundTo2(missingPortalTax * 0.18 * (30 / 365));

  // Rate variance impact on outward liability
  const rateVarianceShortTax = roundTo2(rateMismatches.filter(m => m.varianceTax > 0).reduce((acc, m) => acc + m.varianceTax, 0));
  const rateVarianceExcessTax = roundTo2(rateMismatches.filter(m => m.varianceTax < 0).reduce((acc, m) => acc + Math.abs(m.varianceTax), 0));

  return {
    rule88C_DRC01B: {
      booksOutputTax: booksTax,
      portalOutputTax: portalTax,
      excessPortalTax,
      excessPercentage,
      triggersNotice: triggersDrc01b,
      riskLevel: triggersDrc01b 
        ? 'CRITICAL (Form DRC-01B Notice Risk)' 
        : (excessPortalTax > 0 ? 'MODERATE (Excess GSTR-1 Liability)' : 'COMPLIANT'),
      statutoryRule: 'Rule 88C - Form DRC-01B automatically generated if GSTR-1 liability exceeds books/3B by > 20% and > ₹25,000.'
    },
    omittedTurnoverRisk: {
      omittedInvoiceCount: missingInPortal.length,
      omittedTaxAmount: missingPortalTax,
      estimatedMonthlyInterest: estimatedInterest18,
      statutoryAdvisory: 'Under Section 16(2)(aa), your buyers cannot claim ITC for unfiled invoices. Mandatory upload required in next GSTR-1 / GSTR-1A.'
    },
    unrecordedPortalTurnover: {
      unrecordedInvoiceCount: missingInBooks.length,
      unrecordedTaxAmount: missingBooksTax,
      statutoryAdvisory: 'Invoices appearing in GSTR-1 but missing from Sales Register. Reconcile with ERP to prevent duplicate turnover or misallocated GSTINs.'
    },
    rateVarianceRisk: {
      count: rateMismatches.length,
      shortOutputTax: rateVarianceShortTax,
      excessOutputTax: rateVarianceExcessTax,
      statutoryAdvisory: rateVarianceShortTax > 0
        ? `Short output tax of ₹${rateVarianceShortTax.toLocaleString('en-IN')} declared in GSTR-1 due to lower rate billed on portal. Triggers Rule 88C (Form DRC-01B) liability audit risk.`
        : (rateMismatches.length > 0 ? 'Excess outward tax declared on portal compared to books rate.' : 'No rate variances detected.')
    }
  };
}

/**
 * Helper to generate pre-formatted WhatsApp notice for buyers/customers
 */
function generateCustomerWhatsAppNotice(customerData) {
  const invLines = customerData.missingInvoices
    .slice(0, 5)
    .map(i => `• Inv #${i.invoiceNumber} dt ${i.date}: ₹${i.tax.toLocaleString('en-IN')}`)
    .join('\n');
  const moreCount = customerData.missingInvoices.length > 5 
    ? `\n...and ${customerData.missingInvoices.length - 5} more invoice(s)` 
    : '';

  return `*GST SALES RECONCILIATION - INVOICE ADVISORY*\n\n` +
    `Dear ${customerData.vendorName},\n\n` +
    `We have reconciled our outward sales records with the GST Portal for your GSTIN (${customerData.gstin}).\n\n` +
    `The following invoice(s) are undergoing GSTR-1 amendment / reporting:\n\n` +
    `${invLines}${moreCount}\n\n` +
    `*Total Tax Component:* ₹${customerData.unfiledTaxAmount.toLocaleString('en-IN')}\n\n` +
    `These invoices are scheduled for reflection in your GSTR-2B so your accounts department can claim full ITC under Section 16(2)(aa).\n\n` +
    `Sales & Accounts Department`;
}

/**
 * Helper to generate pre-formatted formal Email notice for buyers/customers
 */
function generateCustomerEmailNotice(customerData) {
  const invRows = customerData.missingInvoices
    .map(i => `  - Invoice No: ${i.invoiceNumber} | Date: ${i.date} | Taxable: ₹${i.taxable.toLocaleString('en-IN')} | GST: ₹${i.tax.toLocaleString('en-IN')}`)
    .join('\n');

  return `Subject: GST Outward Reconciliation & GSTR-1 Reporting Advisory | GSTIN: ${customerData.gstin}\n\n` +
    `Dear Accounts Team,\n\n` +
    `This is to inform you regarding the reconciliation of tax invoices issued to ${customerData.vendorName} (GSTIN: ${customerData.gstin}).\n\n` +
    `The following invoice(s) recorded in our outward sales register are being aligned with GSTR-1 / GSTR-1A:\n\n` +
    `${invRows}\n\n` +
    `Total GST Component: ₹${customerData.unfiledTaxAmount.toLocaleString('en-IN')}\n\n` +
    `Statutory Note:\n` +
    `Under Section 16(2)(aa) of the CGST Act, 2017, these invoices will reflect in your GSTR-2B statement to enable smooth ITC availment in your monthly GSTR-3B return.\n\n` +
    `Thank you for your valued partnership.\n\n` +
    `Best regards,\n` +
    `Finance & Accounts Department`;
}

function roundTo2(val) {
  return Math.round((val || 0) * 100) / 100;
}
