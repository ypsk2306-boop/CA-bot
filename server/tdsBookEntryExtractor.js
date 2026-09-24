import { 
  SCHEDULE_III_LIABILITY_CATEGORIES, 
  SCHEDULE_III_ASSET_CATEGORIES,
  classifyIndianAccountingHead 
} from './indianAccountingKnowledge.js';
import { normalizeTdsSection, normalizeTan } from './tdsIngestionEngine.js';

/**
 * Statutory TDS Book Entry Extractor
 * 
 * Extracts TDS-related entries from parsed book/ledger line items
 * (e.g. from Trial Balance, Tally Sync, or Schedule III pipeline).
 * 
 * Classifies items into:
 * - RECEIVABLE (Current Asset: TDS deducted by customers on our sales/revenue; claimed in 26AS/ITR)
 * - PAYABLE (Current Liability: TDS deducted by us on vendor expenses/salary; payable to Govt)
 * 
 * Target Normalized Book TDS Schema:
 * {
 *   id: string,
 *   label: string,
 *   accountHead: string,
 *   type: 'RECEIVABLE' | 'PAYABLE' | 'UNKNOWN',
 *   section: string | null,
 *   amount: number,
 *   direction: 'Debit' | 'Credit',
 *   date: string | null,
 *   refNo: string | null,
 *   partyName: string | null,
 *   category: string,
 *   rawItem: any
 * }
 */

const TDS_KEYWORD_REGEX = /\b(?:TDS|T\.D\.S\.|TAX\s+DEDUCTED(?:\s+AT\s+SOURCE)?|WITHHOLDING\s+TAX|TCS|TAX\s+COLLECTED(?:\s+AT\s+SOURCE)?)\b/i;

const TDS_SECTION_REGEX = /\b(?:SEC(?:TION)?\s*)?(?:192[A-Z]?|193|194[A-Z]{0,3}|195|196[A-Z]?|206C[A-Z]{0,2})\b/i;

export function extractTdsBookEntries(bookLineItems = []) {
  if (!Array.isArray(bookLineItems)) {
    if (bookLineItems && Array.isArray(bookLineItems.lineItems)) {
      bookLineItems = bookLineItems.lineItems;
    } else if (bookLineItems && Array.isArray(bookLineItems.items)) {
      bookLineItems = bookLineItems.items;
    } else {
      return {
        success: true,
        summary: {
          totalBookTdsEntries: 0,
          totalTdsReceivable: 0,
          totalTdsPayable: 0,
          receivableEntriesCount: 0,
          payableEntriesCount: 0,
          sectionWiseSummary: {}
        },
        entries: [],
        warnings: ['No valid line items array provided to TDS book entry extractor.']
      };
    }
  }

  const entries = [];
  const warnings = [];
  const sectionWiseSummary = {};

  let totalTdsReceivable = 0;
  let totalTdsPayable = 0;
  let receivableEntriesCount = 0;
  let payableEntriesCount = 0;

  for (let idx = 0; idx < bookLineItems.length; idx++) {
    const item = bookLineItems[idx];
    if (!item) continue;

    const label = String(item.label || item.particulars || item.accountName || item.ledgerName || item.narration || '').trim();
    const category = String(item.category || '').toUpperCase().trim();
    const subType = String(item.subType || '').toUpperCase().trim();

    // Check if item is a TDS-related head
    if (!isTdsRelatedItem(label, category, subType, item)) {
      continue;
    }

    // Determine direction and effective amount
    const { amount, direction, isCredit } = determineItemAmountAndDirection(item);
    if (amount <= 0) {
      continue;
    }

    // Classify as RECEIVABLE (Asset) vs PAYABLE (Liability)
    const type = determineTdsType(label, category, isCredit, direction, item);

    // Extract Section
    const section = item.section ? normalizeTdsSection(item.section) : extractSectionFromItem(label, category);

    // Extract Party Name if embedded (e.g. "TDS Receivable - Tata Motors Ltd")
    const partyName = item.partyName || item.deductorName || extractPartyNameFromLabel(label);
    const tan = normalizeTan(item.tan || item.deductorTAN || item.partyTAN || label);

    const bookEntry = {
      id: item.id || `book-tds-${idx + 1}`,
      label,
      accountHead: cleanAccountHead(label),
      type,
      section,
      amount: Math.round(amount * 100) / 100,
      direction,
      date: item.date || null,
      refNo: item.refNo || item.voucherNo || item.chequeNo || null,
      partyName,
      tan,
      deductorTAN: tan,
      category: category || (type === 'RECEIVABLE' ? 'OTHER CURRENT ASSETS' : 'OTHER CURRENT LIABILITIES'),
      rawItem: item
    };

    entries.push(bookEntry);

    // Update summaries
    if (type === 'RECEIVABLE') {
      totalTdsReceivable += bookEntry.amount;
      receivableEntriesCount++;
    } else if (type === 'PAYABLE') {
      totalTdsPayable += bookEntry.amount;
      payableEntriesCount++;
    }

    // Section-wise aggregation
    const secKey = section || 'OTHER / UNCLASSIFIED';
    if (!sectionWiseSummary[secKey]) {
      sectionWiseSummary[secKey] = {
        section: secKey,
        count: 0,
        receivable: 0,
        payable: 0
      };
    }
    sectionWiseSummary[secKey].count++;
    if (type === 'RECEIVABLE') {
      sectionWiseSummary[secKey].receivable += bookEntry.amount;
    } else if (type === 'PAYABLE') {
      sectionWiseSummary[secKey].payable += bookEntry.amount;
    }
  }

  // Round summaries
  totalTdsReceivable = Math.round(totalTdsReceivable * 100) / 100;
  totalTdsPayable = Math.round(totalTdsPayable * 100) / 100;

  for (const k of Object.keys(sectionWiseSummary)) {
    sectionWiseSummary[k].receivable = Math.round(sectionWiseSummary[k].receivable * 100) / 100;
    sectionWiseSummary[k].payable = Math.round(sectionWiseSummary[k].payable * 100) / 100;
  }

  return {
    success: true,
    summary: {
      totalBookTdsEntries: entries.length,
      totalTdsReceivable,
      totalTdsPayable,
      receivableEntriesCount,
      payableEntriesCount,
      sectionWiseSummary
    },
    entries,
    warnings
  };
}

/**
 * Check if a book line item relates to TDS / TCS
 */
function isTdsRelatedItem(label, category, subType, item = {}) {
  if (item.tan || item.deductorTAN || item.tdsAmount || item.tdsDeducted || item.type === 'RECEIVABLE' || item.type === 'PAYABLE') {
    return true;
  }
  if (item.section && isSectionPattern(item.section)) {
    return true;
  }
  if (TDS_KEYWORD_REGEX.test(label) || TDS_KEYWORD_REGEX.test(subType) || TDS_KEYWORD_REGEX.test(category)) {
    return true;
  }

  // Check section numbers specifically combined with tax/withholding
  if (TDS_SECTION_REGEX.test(label) && /tax|deduct|receivable|payable|challan|advance|sec/i.test(label)) {
    return true;
  }

  // Explicit label heads
  const l = String(label || '').toLowerCase();
  if (
    l.includes('advance tax') || 
    l.includes('tax paid under protest') ||
    l.includes('withholding') ||
    (l.includes('duties & taxes') && l.includes('tds'))
  ) {
    return true;
  }

  return false;
}

/**
 * Determine Debit/Credit direction and monetary amount
 */
function determineItemAmountAndDirection(item) {
  let debit = parseFloat(item.debit || 0) || 0;
  let credit = parseFloat(item.credit || 0) || 0;
  let amount = parseFloat(item.amount || item.tdsAmount || item.tdsDeducted || 0) || 0;

  if (debit > 0 && credit === 0) {
    return { amount: debit, direction: 'Debit', isCredit: false };
  }
  if (credit > 0 && debit === 0) {
    return { amount: credit, direction: 'Credit', isCredit: true };
  }

  // If item only has amount:
  const isCreditExplicit = item.isCredit !== undefined ? Boolean(item.isCredit) : null;
  const isDebitExplicit = item.isDebit !== undefined ? Boolean(item.isDebit) : null;

  if (isCreditExplicit === true) {
    return { amount: Math.abs(amount), direction: 'Credit', isCredit: true };
  }
  if (isDebitExplicit === true) {
    return { amount: Math.abs(amount), direction: 'Debit', isCredit: false };
  }

  // If label mentions (Cr) or (Dr)
  const l = String(item.label || '').toLowerCase();
  if (/\b(?:cr|credit)\b/i.test(l)) {
    return { amount: Math.abs(amount), direction: 'Credit', isCredit: true };
  }
  if (/\b(?:dr|debit)\b/i.test(l)) {
    return { amount: Math.abs(amount), direction: 'Debit', isCredit: false };
  }

  // Fallback based on classification in statutory schedules
  const cat = String(item.category || '').toUpperCase();
  if (SCHEDULE_III_LIABILITY_CATEGORIES.includes(cat) || cat.includes('LIABIL') || cat.includes('PAYABLE')) {
    return { amount: Math.abs(amount), direction: 'Credit', isCredit: true };
  }
  if (SCHEDULE_III_ASSET_CATEGORIES.includes(cat) || cat.includes('ASSET') || cat.includes('RECEIVABLE')) {
    return { amount: Math.abs(amount), direction: 'Debit', isCredit: false };
  }

  // Default
  return { amount: Math.abs(amount), direction: amount >= 0 ? 'Debit' : 'Credit', isCredit: amount < 0 };
}

/**
 * Classify as TDS RECEIVABLE (Asset) vs TDS PAYABLE (Liability)
 */
function determineTdsType(label, category, isCredit, direction, item = {}) {
  if (item.type === 'RECEIVABLE' || item.type === 'PAYABLE') {
    return item.type;
  }
  const l = String(label || '').toLowerCase();

  // Explicit receivable / asset keywords
  if (
    l.includes('receivable') || 
    l.includes('advance tax') || 
    l.includes('tax credit') || 
    l.includes('deducted by') || 
    l.includes('deducted on sales') ||
    l.includes('deducted on revenue') ||
    l.includes('tcs receivable') ||
    l.includes('asset')
  ) {
    return 'RECEIVABLE';
  }

  // Explicit payable / liability keywords
  if (
    l.includes('payable') || 
    l.includes('duties & taxes') || 
    l.includes('duties and taxes') || 
    l.includes('challan') || 
    l.includes('deducted on contractor') ||
    l.includes('deducted on salary') ||
    l.includes('deducted on rent') ||
    l.includes('deducted on professional') ||
    l.includes('liability')
  ) {
    return 'PAYABLE';
  }

  // If category is an Asset category (e.g. OTHER CURRENT ASSETS, LOANS & ADVANCES)
  if (SCHEDULE_III_ASSET_CATEGORIES.includes(category)) {
    return 'RECEIVABLE';
  }

  // If category is a Liability category (e.g. OTHER CURRENT LIABILITIES)
  if (SCHEDULE_III_LIABILITY_CATEGORIES.includes(category)) {
    return 'PAYABLE';
  }

  // Disambiguate by accounting direction:
  // Debit balance = Asset = TDS Receivable
  // Credit balance = Liability = TDS Payable
  if (direction === 'Debit' || isCredit === false) {
    return 'RECEIVABLE';
  }
  if (direction === 'Credit' || isCredit === true) {
    return 'PAYABLE';
  }

  return 'UNKNOWN';
}

/**
 * Extract Section Code from item label or category
 */
function extractSectionFromItem(label, category) {
  const combined = `${label} ${category}`;
  const match = combined.match(TDS_SECTION_REGEX);
  if (match) {
    return normalizeTdsSection(match[0]);
  }

  const l = combined.toLowerCase();
  if (l.includes('professional') || l.includes('technical') || l.includes('consulting')) return '194J';
  if (l.includes('contractor') || l.includes('sub-contractor') || l.includes('subcontractor')) return '194C';
  if (l.includes('rent')) return '194I';
  if (l.includes('salary') || l.includes('salaries')) return '192';
  if (l.includes('commission') || l.includes('brokerage')) return '194H';
  if (l.includes('interest on fd') || l.includes('fixed deposit') || l.includes('interest other than')) return '194A';
  if (l.includes('goods') || l.includes('purchase of goods')) return '194Q';
  if (l.includes('tcs') || l.includes('scrap') || l.includes('timber')) return '206C';

  return null;
}

/**
 * Extract Party / Deductor Name from composite ledger labels
 * e.g. "TDS Receivable - Tech Mahindra Ltd" => "Tech Mahindra Ltd"
 */
function extractPartyNameFromLabel(label) {
  if (!label) return null;
  let clean = String(label)
    .replace(/\s*TDS\s*TDS.*$/i, '')
    .replace(/\s*TDS\s*-\s*ACT.*$/i, '')
    .replace(/\s*-\s*ACT\.\s*RECD.*$/i, '')
    .replace(/\s*-\s*ACTUAL\s*DATE.*$/i, '')
    .replace(/\s*ACT\.\s*RECD\.\s*ON.*$/i, '')
    .replace(/\s*RECD\.\s*ON.*$/i, '')
    .replace(/\b(?:TDS|T\.D\.S\.|Receivable|Payable|A\/c|Account|u\/s|sec(?:tion)?\s*\w+)\b/gi, '')
    .replace(/\b(?:19[0-9][A-Z0-9]*|206[A-Z0-9]*)\b/gi, '')
    .replace(/[\(\)\[\]（）]/g, ' ')
    .trim();

  const parts = clean.split(/[-–—:]/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (
      part.length > 2 && 
      !/^\d+$/.test(part) && 
      !/^(?:dr|cr|debit|credit|tax|asset|liability)$/i.test(part) &&
      !TDS_KEYWORD_REGEX.test(part)
    ) {
      return part.replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, '').trim();
    }
  }
  return clean.length > 2 ? clean : null;
}

function cleanAccountHead(label) {
  return label.replace(/\s+/g, ' ').replace(/[\(（]\s*(?:Dr|Cr|Debit|Credit)\s*[\)）]/gi, '').trim();
}
