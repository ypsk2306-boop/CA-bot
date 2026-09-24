/**
 * Local LLM & Robust Financial Parser Engine
 * Implements Statutory Schedule III Standards, Column-Aware Multi-Column Resolvers,
 * Note Number Separation, True Sign Detection, and Anti-Double-Counting Guards.
 */

import {
  classifyIndianAccountingHead,
  correctFinancialSpellings,
  detectStatutoryRegime,
  STATUTORY_REGIMES,
  INDIAN_TAX_SECTIONS,
  AIS_TIS_SFT_CODES,
  SCHEDULE_III_HEADS,
  SCHEDULE_III_ORDER,
  SCHEDULE_III_BS_ORDER
} from './indianAccountingKnowledge.js';
import { detectDocumentLayout } from './documentParser.js';
import { executeClaudeBrain } from './claudeBrain.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';

export async function getOllamaStatus() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`Ollama status ${res.status}`);
    const data = await res.json();
    return {
      connected: true,
      models: (data.models || []).map(m => m.name),
      url: OLLAMA_BASE_URL,
      statutoryRegimes: Object.values(STATUTORY_REGIMES),
      caKnowledgeBase: 'ACTIVE (Companies Act 2013, GST Act 2017, Income Tax 1961, Partnership Act 1932)',
      claudeBrainAvailable: !!process.env.ANTHROPIC_API_KEY
    };
  } catch (err) {
    return {
      connected: false,
      models: [],
      error: err.message,
      url: OLLAMA_BASE_URL,
      statutoryRegimes: Object.values(STATUTORY_REGIMES),
      caKnowledgeBase: 'ACTIVE (Statutory Rules & Regimes Engine)',
      claudeBrainAvailable: !!process.env.ANTHROPIC_API_KEY
    };
  }
}

/**
 * 4-Tier Financial Analysis & Placement Pipeline:
 * 1. 👁️ The Eyes: Universal ingestion & OCR extraction
 * 2. 🧠 The Brain (Claude AI / Local LLM): Calculations, verification, and tax rules
 * 3. ✋ The Hands: Statutory grid slotting, category alignment, and self-balancing
 * 4. 📊 The Excel Exporter: Multi-sheet workbook compilation
 */
export async function analyzeFinancials(rawText, userPrompt = '', preferredModel = null, explicitRegime = 'AUTO', options = {}) {
  const targetRegime = detectStatutoryRegime(rawText, userPrompt, explicitRegime);
  const extractionResult = extractLineItemsAccurately(rawText);

  const aiProvider = options.aiProvider || (preferredModel && preferredModel.startsWith('claude') ? 'claude' : (process.env.ANTHROPIC_API_KEY ? 'claude' : 'local'));
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

  // ----------------------------------------------------
  // 🧠 TIER 2: THE BRAIN (Claude AI or Local LLM)
  // ----------------------------------------------------
  if (aiProvider === 'claude' && apiKey) {
    try {
      console.log('🧠 Invoking Claude AI Brain for Calculations & Verification...');
      const claudeResult = await executeClaudeBrain({
        rawText,
        userPrompt,
        targetRegime,
        apiKey,
        model: preferredModel && (preferredModel.startsWith('claude') || preferredModel.includes('sonnet') || preferredModel.includes('opus') || preferredModel.includes('haiku')) ? preferredModel : undefined
      });

      // ----------------------------------------------------
      // 🛡️ ANTI-HALLUCINATION HARD VERIFICATION CHECK (#4)
      // Programmatically cross-verify that numbers emitted by Claude
      // exist in the source raw text or independently extracted items.
      // ----------------------------------------------------
      const sourceNumbers = new Set(
        (rawText.match(/\d[\d,.]*/g) || [])
          .map(n => parseIndianNumber(n))
          .filter(n => n !== 0 && !isNaN(n))
      );
      extractionResult.items.forEach(item => {
        if (item.amount) sourceNumbers.add(item.amount);
        if (item.previousAmount) sourceNumbers.add(item.previousAmount);
      });

      const hallucinationNotes = [];
      if (Array.isArray(claudeResult.lineItems)) {
        for (const cItem of claudeResult.lineItems) {
          const amt = typeof cItem.amount === 'number' ? cItem.amount : parseIndianNumber(String(cItem.amount));
          const inSource = sourceNumbers.has(amt) || sourceNumbers.has(Math.abs(amt));
          if (!inSource && amt !== 0) {
            hallucinationNotes.push(`🔍 Programmatic Audit: Line item "${cItem.label}" figure (${amt}) requires verification against source records.`);
          }
        }
      }

      if (hallucinationNotes.length > 0) {
        claudeResult.caAuditObservations = [
          ...(claudeResult.caAuditObservations || []),
          ...hallucinationNotes
        ];
      }

      // ----------------------------------------------------
      // ✋ TIER 3: THE HANDS (Placement Engine)
      // ----------------------------------------------------
      const placedStatement = placeItemsInStatutorySlots(claudeResult, rawText, userPrompt, targetRegime, extractionResult.items);
      return {
        ...placedStatement,
        source: 'claude_brain',
        model: claudeResult.model,
        caAuditObservations: claudeResult.caAuditObservations || []
      };
    } catch (err) {
      console.warn('⚠️ Claude Brain execution fallback to local engine:', err.message);
    }
  }

  // 1. High-Precision Deterministic Statutory Parsing
  const ruleParsed = ruleBasedFinancialParser(rawText, userPrompt, targetRegime);

  // 2. Local Ollama LLM if directives exist
  const hasDirectives = userPrompt && userPrompt.trim().length > 3 && !userPrompt.toLowerCase().includes('generate') && !userPrompt.toLowerCase().includes('analyze');

  if (hasDirectives && aiProvider === 'ollama') {
    const status = await getOllamaStatus();
    if (status.connected && status.models.length > 0) {
      const modelToUse = preferredModel && status.models.includes(preferredModel)
        ? preferredModel
        : status.models[0];

      try {
        const parsedFromLLM = await callOllamaForSchema(rawText, userPrompt, modelToUse, ruleParsed.lineItems, targetRegime);
        if (parsedFromLLM && parsedFromLLM.lineItems && parsedFromLLM.lineItems.length > 0) {
          const placed = placeItemsInStatutorySlots(parsedFromLLM, rawText, userPrompt, targetRegime, ruleParsed.lineItems);
          return {
            source: 'ollama',
            model: modelToUse,
            ...placed
          };
        }
      } catch (error) {
        console.warn('Ollama LLM generation fallback:', error.message);
      }
    }
  }

  const finalized = placeItemsInStatutorySlots(ruleParsed, rawText, userPrompt, targetRegime, ruleParsed.lineItems);
  return {
    source: 'rule_engine',
    model: 'Statutory Act & Accounting Rules Engine',
    ...finalized
  };
}

/**
 * ✋ The Hands: Statutory Placement & Canonical Slotting Engine
 * Maps every verified line item into exact Schedule III / Tax slots
 */
function placeItemsInStatutorySlots(schema, rawText, userPrompt, targetRegime, exactLineItems = []) {
  const currencySymbol = schema.currencySymbol || detectCurrency(rawText + ' ' + userPrompt);
  const meta = extractCompanyMetadata(rawText);

  let docType = schema.docType || 'PL';
  if (targetRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' || targetRegime === 'PARTNERSHIP_CAPITAL') {
    docType = 'BALANCE_SHEET';
  }

  const rawItems = Array.isArray(schema.lineItems) && schema.lineItems.length > 0 
    ? schema.lineItems 
    : exactLineItems;

  const validStatutoryHeads = [
    ...SCHEDULE_III_ORDER,
    ...SCHEDULE_III_BS_ORDER
  ];

  const placedItems = rawItems
    .filter(i => !isTotalOrSubtotalLabel(i.label || i.particulars || ''))
    .map(i => {
      const label = cleanItemLabel(i.label || i.particulars || 'Financial Item');
      
      // CRITICAL FIX #1: If category was provided by Claude Brain or is already valid,
      // TRUST IT directly! Only run regex as a fallback when category is absent or invalid.
      let category = i.category ? String(i.category).toUpperCase().trim() : '';
      let subType = i.subType || 'Statutory Line';

      if (!category || !validStatutoryHeads.includes(category)) {
        const classification = classifyIndianAccountingHead(label, category || '');
        category = classification.category;
        subType = classification.subType;
      }

      const amt = typeof i.amount === 'number' ? i.amount : parseIndianNumber(String(i.amount));
      const py = i.previousAmount !== undefined && i.previousAmount !== null ? (typeof i.previousAmount === 'number' ? i.previousAmount : parseIndianNumber(String(i.previousAmount))) : undefined;

      return {
        category,
        subType,
        label,
        amount: amt,
        ...(py !== undefined && !isNaN(py) ? { previousAmount: py } : {}),
        noteNo: i.noteNo || null
      };
    })
    .filter(i => !isNaN(i.amount) && i.amount !== 0);

  // Statutory Hierarchy Sorting
  if (docType === 'PL') {
    placedItems.sort((a, b) => {
      const idxA = SCHEDULE_III_ORDER.indexOf(a.category);
      const idxB = SCHEDULE_III_ORDER.indexOf(b.category);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  } else if (docType === 'BALANCE_SHEET') {
    placedItems.sort((a, b) => {
      const idxA = SCHEDULE_III_BS_ORDER.indexOf(a.category);
      const idxB = SCHEDULE_III_BS_ORDER.indexOf(b.category);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  }

  const statement = {
    docType,
    regime: targetRegime,
    regimeMeta: STATUTORY_REGIMES[targetRegime] || STATUTORY_REGIMES.COMPANIES_ACT_SCHEDULE_III_PL,
    currencySymbol,
    title: schema.title || getStatutoryTitle(targetRegime, userPrompt, rawText),
    companyName: schema.companyName || meta.companyName,
    cin: schema.cin || meta.cin,
    period: schema.period || meta.period,
    currentYearLabel: schema.currentYearLabel || meta.currentYearLabel,
    previousYearLabel: schema.previousYearLabel || meta.previousYearLabel,
    taxRate: schema.taxRate || extractTaxRate(userPrompt),
    verifiedCalculations: schema.verifiedCalculations || null,
    lineItems: placedItems
  };

  return validateAndBalanceFinancials(statement);
}

async function callOllamaForSchema(rawText, userPrompt, modelName, exactLineItems = [], targetRegime = 'COMPANIES_ACT_SCHEDULE_III_PL') {
  const systemPrompt = `You are a Senior Chartered Accountant (CA) expert in Indian Accounting Standards, Companies Act 2013, GST Act, and Income Tax Act.
Extract and categorize financial line items accurately with full support for comparative columns (Current Year & Previous Year).
Column 1 is Current Year (amount), Column 2 is Previous Year (previousAmount).
Always preserve exact numbers from the data.

Respond ONLY with valid JSON in this exact structure:
{
  "docType": "PL" | "BALANCE_SHEET" | "GST_RETURN" | "PRESUMPTIVE_TAX" | "TRIAL_BALANCE",
  "regime": "${targetRegime}",
  "currencySymbol": "₹",
  "companyName": "COMPANY NAME",
  "cin": "CIN NUMBER",
  "period": "For the year ended on 31-03-2025",
  "title": "Financial Statement Title",
  "taxRate": 0.25,
  "lineItems": [
    { "category": "REVENUE FROM OPERATIONS", "label": "Item Name", "amount": 50000, "previousAmount": 40000 }
  ]
}`;

  const prompt = `User Directive: ${userPrompt}\n\nFinancial Data:\n${rawText}`;

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: modelName,
      prompt: systemPrompt + '\n' + prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1,
        num_predict: 2048
      }
    }),
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) throw new Error(`Ollama HTTP error ${response.status}`);
  const json = await response.json();
  let text = json.response.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(text);

  return standardizeSchema(parsed, rawText, userPrompt, exactLineItems, targetRegime);
}

function standardizeSchema(parsed, rawText, userPrompt, exactLineItems = [], targetRegime = 'COMPANIES_ACT_SCHEDULE_III_PL') {
  const currencySymbol = detectCurrency(userPrompt + ' ' + rawText);
  const meta = extractCompanyMetadata(rawText);

  let docType = parsed.docType || 'PL';
  if (targetRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' || targetRegime === 'PARTNERSHIP_CAPITAL') {
    docType = 'BALANCE_SHEET';
  } else if (targetRegime === 'GST_GSTR3B') {
    docType = 'GST_RETURN';
  }

  let lineItems = [];
  if (Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0) {
    lineItems = parsed.lineItems
      .filter(i => !isTotalOrSubtotalLabel(i.label || i.name || ''))
      .map(i => {
        const rawAmt = typeof i.amount === 'number' ? i.amount : parseIndianNumber(String(i.amount));
        const rawPy = i.previousAmount !== undefined && i.previousAmount !== null ? (typeof i.previousAmount === 'number' ? i.previousAmount : parseIndianNumber(String(i.previousAmount))) : undefined;
        const cleanName = cleanItemLabel(i.label || i.name || 'Financial Item');
        const classification = classifyIndianAccountingHead(cleanName, i.category || '');
        return {
          category: classification.category,
          label: cleanName,
          amount: rawAmt,
          ...(rawPy !== undefined && !isNaN(rawPy) ? { previousAmount: rawPy } : {})
        };
      })
      .filter(i => !isNaN(i.amount) && i.amount !== 0);
  }

  // Merge with exactLineItems if comparative figures exist in exactLineItems
  if (exactLineItems.length > 0) {
    lineItems = lineItems.map(item => {
      const match = exactLineItems.find(e => e.label.toLowerCase() === item.label.toLowerCase() || item.label.toLowerCase().includes(e.label.toLowerCase()));
      if (match && match.previousAmount !== undefined && item.previousAmount === undefined) {
        return { ...item, previousAmount: match.previousAmount };
      }
      return item;
    });
  }

  if (lineItems.length === 0 || (exactLineItems.length > 0 && lineItems.length < exactLineItems.length / 2)) {
    lineItems = exactLineItems.length > 0 ? exactLineItems : extractLineItemsAccurately(rawText).items;
  }

  return {
    docType,
    regime: targetRegime,
    currencySymbol,
    title: parsed.title || getStatutoryTitle(targetRegime, userPrompt, rawText),
    companyName: parsed.companyName || meta.companyName,
    cin: parsed.cin || meta.cin,
    period: parsed.period || meta.period,
    currentYearLabel: meta.currentYearLabel,
    previousYearLabel: meta.previousYearLabel,
    taxRate: typeof parsed.taxRate === 'number' && parsed.taxRate > 0 && parsed.taxRate < 1 ? parsed.taxRate : extractTaxRate(userPrompt),
    lineItems
  };
}

export function ruleBasedFinancialParser(rawText, userPrompt = '', explicitRegime = 'AUTO') {
  const targetRegime = detectStatutoryRegime(rawText, userPrompt, explicitRegime);
  const currencySymbol = detectCurrency(rawText + ' ' + userPrompt);
  const taxRate = extractTaxRate(userPrompt);
  const meta = extractCompanyMetadata(rawText);

  let docType = 'PL';
  if (targetRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' || targetRegime === 'PARTNERSHIP_CAPITAL') {
    docType = 'BALANCE_SHEET';
  } else if (targetRegime === 'STATEMENT_OF_AFFAIRS_PROFIT') {
    docType = 'STATEMENT_OF_AFFAIRS_PROFIT';
  } else if (targetRegime === 'GST_GSTR3B') {
    docType = 'GST_RETURN';
  } else if (targetRegime === 'INCOME_TAX_44ADA') {
    docType = 'PRESUMPTIVE_TAX';
  } else if (targetRegime === 'TRIAL_BALANCE') {
    docType = 'TRIAL_BALANCE';
  }

  const title = getStatutoryTitle(targetRegime, userPrompt, rawText);
  const extractionResult = extractLineItemsAccurately(rawText);
  let lineItems = extractionResult.items;

  if (lineItems.length === 0 && rawText.trim() === '') {
    lineItems = extractLineItemsAccurately(userPrompt).items;
  }

  // Sort strictly by Statutory Schedule III Sequence if standard PL/BS
  if (docType === 'PL' || docType === 'BALANCE_SHEET' || docType === 'STATEMENT_OF_AFFAIRS_PROFIT') {
    lineItems.sort((a, b) => {
      const idxA = SCHEDULE_III_ORDER.indexOf(a.category);
      const idxB = SCHEDULE_III_ORDER.indexOf(b.category);
      return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    });
  }

  const statement = {
    docType,
    regime: targetRegime,
    regimeMeta: STATUTORY_REGIMES[targetRegime] || STATUTORY_REGIMES.COMPANIES_ACT_SCHEDULE_III_PL,
    currencySymbol,
    title,
    companyName: meta.companyName,
    cin: meta.cin,
    period: meta.period,
    currentYearLabel: meta.currentYearLabel,
    previousYearLabel: meta.previousYearLabel,
    taxRate,
    layoutInfo: extractionResult.layoutInfo || { isTabular: false, layout: 'FREE_FORM' },
    lineItems
  };

  return validateAndBalanceFinancials(statement);
}

export function extractCompanyMetadata(rawText = '') {
  if (!rawText) return { 
    companyName: '[Company Name Not Detected — Please Verify]', 
    cin: null, 
    companyNameDetected: false,
    cinDetected: false,
    period: 'For the year ended on 31-03-2025', 
    currentYearLabel: '2024-25', 
    previousYearLabel: '2023-24' 
  };
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  // 1. CIN Extraction (Standard 21-character MCA CIN like L12345MH2020PLC012345)
  let cin = null;
  const cinMatch = rawText.match(/\b([LUlu]\d{5}[A-Za-z]{2}\d{4}[A-Za-z]{3}\d{6})\b/) || rawText.match(/CIN\s*[-:]?\s*([A-Za-z0-9]+)/i);
  if (cinMatch) {
    cin = cinMatch[1].toUpperCase();
  }

  // 2. Company / Entity Name Extraction
  let companyName = null;
  for (let i = 0; i < Math.min(lines.length, 6); i++) {
    const line = lines[i];
    if (/^(CIN|STATEMENT|BALANCE|PROFIT|FOR THE|AS ON|AS AT|PARTICULARS|SR|NOTE|SCHEDULE|TRIAL|LEDGER|VOUCHER)/i.test(line)) continue;
    if (line.includes('=== [Document')) continue;
    // Discard lines containing monetary amounts, currency symbols, or ledger patterns (e.g. "Sales: 500000", "Rent 50,000 Dr")
    if (/[₹$€£]|\b(?:\d{1,3}(?:,\d{3})+|\d{4,})\b|:\s*[-+]?\d+|(?:^|\s)(?:Dr|Cr)\b/i.test(line)) continue;
    if (/^(Sales|Revenue|Purchases|Expenses|Rent|Salaries|Wages|Cash|Bank|Debtors|Creditors|Stock|Capital)\b/i.test(line)) continue;

    if (line.length >= 4 && !/^\d+$/.test(line) && /[a-zA-Z]{3,}/.test(line)) {
      companyName = line.replace(/[:\-–=]+$/, '').trim();
      break;
    }
  }

  // 3. Period / Date Extraction
  let period = null;
  const periodMatch = rawText.match(/For\s+the\s+year\s+ended\s+(?:on\s+)?(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i) ||
    rawText.match(/(?:ended\s+(?:on\s+)?|as\s+at\s+|as\s+on\s+)(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i);
  if (periodMatch) {
    period = periodMatch[0].trim();
  }

  // 4. Financial Years / Column Headers
  let currentYearLabel = '2024-25';
  let previousYearLabel = '2023-24';
  const yrMatches = rawText.match(/\b(20\d{2}[-–/]\d{2,4})\b/g);
  if (yrMatches && yrMatches.length >= 2) {
    currentYearLabel = yrMatches[0];
    previousYearLabel = yrMatches[1];
  } else if (yrMatches && yrMatches.length === 1) {
    currentYearLabel = yrMatches[0];
  }

  return {
    cin: cin || null,
    companyName: companyName ? companyName.toUpperCase() : '[Company Name Not Detected — Please Verify]',
    companyNameDetected: !!companyName,
    cinDetected: !!cin,
    period: period || 'For the year ended on 31-03-2025',
    currentYearLabel,
    previousYearLabel
  };
}

export function cleanItemLabel(rawLabel) {
  if (!rawLabel) return 'Financial Item';
  return correctFinancialSpellings(rawLabel) || rawLabel.trim();
}

/**
 * Perform Mathematical Validation and Self-Balancing on financial statement
 */
export function validateAndBalanceFinancials(statement) {
  if (!statement || !Array.isArray(statement.lineItems)) return statement;

  const items = statement.lineItems;
  const revOps = items.filter(i => i.category === 'REVENUE FROM OPERATIONS');
  const otherInc = items.filter(i => i.category === 'OTHER INCOME');
  const expenses = items.filter(i => i.category.includes('EXPENSE') || i.category.includes('COST') || i.category.includes('PURCHASE') || i.category.includes('INVENTOR'));

  const totalRevCY = revOps.reduce((s, i) => s + (i.amount || 0), 0) + otherInc.reduce((s, i) => s + (i.amount || 0), 0);
  const totalRevPY = revOps.reduce((s, i) => s + (i.previousAmount || 0), 0) + otherInc.reduce((s, i) => s + (i.previousAmount || 0), 0);

  const totalExpCY = expenses.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpPY = expenses.reduce((s, i) => s + (i.previousAmount || 0), 0);

  const pbtCY = totalRevCY - totalExpCY;
  const pbtPY = totalRevPY - totalExpPY;

  statement.calculatedTotals = {
    totalRevenueCY: totalRevCY,
    totalRevenuePY: totalRevPY,
    totalExpensesCY: totalExpCY,
    totalExpensesPY: totalExpPY,
    profitBeforeTaxCY: pbtCY,
    profitBeforeTaxPY: pbtPY
  };

  // CRITICAL FIX #2: Reconcile and Diff Claude's verifiedCalculations with Deterministic Arithmetic
  const discrepancies = [];
  if (statement.verifiedCalculations) {
    const vc = statement.verifiedCalculations;
    if (vc.profitBeforeTaxCY !== undefined && Math.abs(pbtCY - vc.profitBeforeTaxCY) > 1) {
      discrepancies.push(`Discrepancy in PBT: Code calculated ₹${pbtCY.toLocaleString('en-IN')} vs Claude verified ₹${vc.profitBeforeTaxCY.toLocaleString('en-IN')} (Variance: ₹${Math.abs(pbtCY - vc.profitBeforeTaxCY).toLocaleString('en-IN')})`);
    }
    if (vc.totalRevenueCY !== undefined && Math.abs(totalRevCY - vc.totalRevenueCY) > 1) {
      discrepancies.push(`Discrepancy in Total Revenue: Code calculated ₹${totalRevCY.toLocaleString('en-IN')} vs Claude verified ₹${vc.totalRevenueCY.toLocaleString('en-IN')} (Variance: ₹${Math.abs(totalRevCY - vc.totalRevenueCY).toLocaleString('en-IN')})`);
    }
    if (vc.totalExpensesCY !== undefined && Math.abs(totalExpCY - vc.totalExpensesCY) > 1) {
      discrepancies.push(`Discrepancy in Total Expenses: Code calculated ₹${totalExpCY.toLocaleString('en-IN')} vs Claude verified ₹${vc.totalExpensesCY.toLocaleString('en-IN')} (Variance: ₹${Math.abs(totalExpCY - vc.totalExpensesCY).toLocaleString('en-IN')})`);
    }
  }

  statement.statutoryDiscrepancies = discrepancies;

  statement.auditWarnings = statement.auditWarnings || [];
  if (!statement.companyName || statement.companyName.includes('[Company Name Not Detected')) {
    statement.auditWarnings.push({
      type: 'COMPANY_METADATA_WARNING',
      severity: 'HIGH',
      message: 'Company name was not detected from document headers. Placeholder "[Company Name Not Detected — Please Verify]" has been used. Please verify entity identity.'
    });
  }

  return statement;
}

function getStatutoryTitle(regime, prompt, rawText = '') {
  const firstLine = (rawText || '').split('\n')[0] || '';
  const companyMatch = firstLine.match(/^(.*?)(?:-|–|:\s*|\s*Financial|\s*Ledger|\s*Statement|$)/i);
  const entity = companyMatch && companyMatch[1].trim().length > 3 ? companyMatch[1].trim() : 'Entity';

  if (regime === 'COMPANIES_ACT_SCHEDULE_III_BS') {
    return `${entity} - Balance Sheet (As per Schedule III of Companies Act 2013)`;
  }
  if (regime === 'STATEMENT_OF_AFFAIRS_PROFIT') {
    return `${entity} - Statement of Profit (Derived via Single-Entry & Statement of Affairs Method)`;
  }
  if (regime === 'GST_GSTR3B') {
    return `${entity} - Monthly GST Return (Form GSTR-3B Summary)`;
  }
  if (regime === 'INCOME_TAX_44ADA') {
    return `${entity} - Presumptive Business Income (Section 44AD / 44ADA of Income Tax Act)`;
  }
  if (regime === 'PARTNERSHIP_CAPITAL') {
    return `${entity} - Statement of Affairs & Partner Capital Accounts (Partnership Act 1932)`;
  }
  if (regime === 'TRIAL_BALANCE') {
    return `${entity} - Double-Entry Trial Balance`;
  }
  return `${entity} - Statement of Profit and Loss (As per Schedule III of Companies Act 2013)`;
}

function detectCurrency(text) {
  if (text.includes('$') || text.toLowerCase().includes('usd')) return '$';
  if (text.includes('€') || text.toLowerCase().includes('eur')) return '€';
  if (text.includes('£') || text.toLowerCase().includes('gbp')) return '£';
  return '₹'; // Default Indian Rupee (INR)
}

function extractTaxRate(prompt) {
  const match = (prompt || '').match(/(\d+(\.\d+)?)%\s*(?:corporate\s*)?tax/i) || (prompt || '').match(/tax\s*(?:rate)?\s*(?:of)?\s*(\d+(\.\d+)?)%/i);
  if (match) return parseFloat(match[1]) / 100;
  return 0.25; // Default 25% corporate tax rate in India
}

function getIndianTitle(docType, prompt, rawText = '') {
  const firstLine = (rawText || '').split('\n')[0] || '';
  const companyMatch = firstLine.match(/^(.*?)(?:-|–|:\s*|\s*Financial|\s*Ledger|\s*Statement|$)/i);
  const company = companyMatch && companyMatch[1].trim().length > 3 ? companyMatch[1].trim() : 'Company';

  if (docType === 'BALANCE_SHEET') {
    return `${company} - Balance Sheet (As per Schedule III of Companies Act 2013)`;
  }
  if (docType === 'CASH_FLOW') {
    return `${company} - Statement of Cash Flows (As per Ind AS 7 / AS 3)`;
  }
  return `${company} - Statement of Profit and Loss (As per Schedule III of Companies Act 2013)`;
}

/**
 * Check if a label is a total, subtotal, or summary line that must not be added as a raw line item
 */
export function isTotalOrSubtotalLabel(label) {
  if (!label) return false;
  const l = label.toLowerCase()
    .replace(/^[i|v|x|a-z0-9\.\)\(\-]+\s*/i, '') // strip Roman numeral / letter prefixes like "III ", "A ", "v "
    .trim();
  const rawLower = label.toLowerCase().trim();

  return (
    l.startsWith('total') || l.startsWith('grand total') || l.startsWith('sub total') ||
    l.startsWith('subtotal') || l.startsWith('sum of') || l.startsWith('net total') ||
    l.includes('total revenue') || l.includes('total income') || l.includes('total expenses') ||
    l.includes('total expenditure') || l.includes('gross venue') || l.includes('gross revenue') ||
    rawLower.includes('gross venue') || rawLower.includes('gross revenue') ||
    l.includes('profit before tax') || l.includes('profit after tax') || l.includes('profit/(loss) before tax') ||
    rawLower.includes('profit before tax') || rawLower.includes('profit/(loss) before tax') ||
    l.includes('loss before tax') || l.includes('profit for the period') || l.includes('loss for the period') ||
    l.includes('profit for the year') || l.includes('profit/(loss) for the year') ||
    rawLower.includes('profit for the year') || rawLower.includes('profit/(loss) for the year') ||
    l.includes('tax expense') || rawLower.includes('tax expense') ||
    l.includes('current tax') || l.includes('deferred tax') ||
    l.includes('pbt') || l.includes('pat') || l.includes('total invoice amount') ||
    l.includes('net profit') || l.includes('gross profit')
  );
}

/**
 * Check if a line is a section header (e.g. "REVENUE (FY 2023-24):" or "EXPENSES:")
 */
function isCategoryHeader(line) {
  const l = line.trim();
  if (
    (l.endsWith(':') || l.endsWith(':-') || l.endsWith('-')) &&
    /\b(purchase|purchases|sales|revenue|income|expense|expenses|expenditure|cost|assets|liabilities|equity|note|notes|particulars)\b/i.test(l)
  ) {
    return true;
  }
  if (
    l === l.toUpperCase() &&
    l.length >= 3 &&
    /\b(PURCHASE|SALES|REVENUE|INCOME|EXPENSES|EXPENDITURE|COST|ASSETS|LIABILITIES|EQUITY)\b/.test(l) &&
    !/\d{3,}/.test(l)
  ) {
    return true;
  }
  return false;
}

/**
 * Stitch and normalize OCR lines where label and numbers are split across lines
 */
function stitchAndNormalizeOcrLines(text) {
  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  const stitched = [];
  
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    
    // Clean common OCR noise artifacts
    line = line
      .replace(/\bhed:\s*/gi, '')
      .replace(/\bRe\.\s*/gi, '')
      .replace(/\bRs\.?\s*/gi, '')
      .replace(/(\d+),\s*(\d+)/g, '$1,$2'); // Fix broken numbers like "8, 000"

    const numbersInLine = (line.match(/(?:Rs\.?|INR|[₹$€£])?\s*\(?-?\d[\d,.]*\)?/gi) || [])
      .filter(n => /\d/.test(n) && parseIndianNumber(n) !== 0);

    const hasLetters = /[a-zA-Z]{3,}/.test(line);
    const isExplicitNil = /\b(nil|--|- -)\b/i.test(line) || line.endsWith('- -') || line.endsWith('--');

    // Case 1: Pure text line followed by pure number line (e.g. "Cash at Bank" followed by "3,000  6,500")
    if (hasLetters && !isExplicitNil && numbersInLine.length === 0 && i + 1 < rawLines.length) {
      let nextLine = rawLines[i + 1].trim().replace(/\bhed:\s*/gi, '').replace(/\bRe\.\s*/gi, '').replace(/\bRs\.?\s*/gi, '').replace(/(\d+),\s*(\d+)/g, '$1,$2');
      const nextNumbers = (nextLine.match(/(?:Rs\.?|INR|[₹$€£])?\s*\(?-?\d[\d,.]*\)?/gi) || [])
        .filter(n => /\d/.test(n) && parseIndianNumber(n) !== 0);
      const nextHasLetters = /[a-zA-Z]{3,}/.test(nextLine);

      if (nextNumbers.length > 0 && !nextHasLetters) {
        stitched.push(`${line}   ${nextLine}`);
        i++; // consume next line
        continue;
      }
    }

    // Case 2: Label + 1 number followed by line with another number (e.g. "Stock in Trade 60,000" followed by "68,000")
    if (hasLetters && !isExplicitNil && numbersInLine.length === 1 && i + 1 < rawLines.length) {
      let nextLine = rawLines[i + 1].trim().replace(/\bhed:\s*/gi, '').replace(/\bRe\.\s*/gi, '').replace(/\bRs\.?\s*/gi, '').replace(/(\d+),\s*(\d+)/g, '$1,$2');
      const nextNumbers = (nextLine.match(/(?:Rs\.?|INR|[₹$€£])?\s*\(?-?\d[\d,.]*\)?/gi) || [])
        .filter(n => /\d/.test(n) && parseIndianNumber(n) !== 0);
      const nextHasLetters = /[a-zA-Z]{3,}/.test(nextLine);

      if (nextNumbers.length === 1 && !nextHasLetters) {
        stitched.push(`${line}   ${nextLine}`);
        i++; // consume next line
        continue;
      }
    }

    stitched.push(line);
  }

  return stitched.join('\n');
}

/**
 * Column-Aware Multi-Column Line Extractor & Note Number Separation
 */
export function extractLineItemsAccurately(rawInputText) {
  if (!rawInputText) return { items: [], warnings: [], layoutInfo: { isTabular: false, layout: 'FREE_FORM' } };
  const layoutInfo = detectDocumentLayout(rawInputText);
  const text = stitchAndNormalizeOcrLines(rawInputText);

  // 1. Check for Multi-Block Column Inputs (e.g. Block 1 = Labels, Block 2 = Col 1, Block 3 = Col 2)
  const rawBlocks = text.split(/\r?\n\s*\r?\n/).map(b => b.trim()).filter(b => b.length > 0);
  if (rawBlocks.length >= 2) {
    const block0Lines = rawBlocks[0].split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const block1Lines = rawBlocks[1].split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    const block2Lines = rawBlocks.length >= 3 ? rawBlocks[2].split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0) : null;

    // Check if Block 0 has labels (mostly text) and Block 1 has numbers/placeholders
    const block0HasLabels = block0Lines.filter(l => /[a-zA-Z]/.test(l)).length >= Math.ceil(block0Lines.length * 0.7);
    const block1HasNumbers = block1Lines.filter(l => /\d|____|---|nil/i.test(l)).length >= Math.ceil(block1Lines.length * 0.5);

    if (block0HasLabels && block1HasNumbers && Math.abs(block0Lines.length - block1Lines.length) <= 2) {
      const items = [];
      const warnings = [];
      const count = Math.min(block0Lines.length, block1Lines.length);

      for (let i = 0; i < count; i++) {
        const label = block0Lines[i];
        if (isTotalOrSubtotalLabel(label)) continue;

        let cyAmount = 0;
        let pyAmount = 0;

        if (block2Lines && block2Lines[i]) {
          cyAmount = parseIndianNumber(block1Lines[i]);
          pyAmount = parseIndianNumber(block2Lines[i]);
        } else {
          cyAmount = parseIndianNumber(block1Lines[i]);
        }

        const classification = classifyIndianAccountingHead(label);
        items.push({
          category: classification.category,
          label: label.replace(/^[-*•]\s*/, '').trim(),
          amount: cyAmount,
          previousAmount: pyAmount
        });
      }

      return { items, warnings, layoutInfo };
    }
  }

  const lines = text.split('\n');
  const items = [];
  const warnings = [];
  let currentCategory = 'General Items';

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Detect category headers (e.g. Purchase:-, Sales:-, REVENUE (FY 2023-24):)
    if (isCategoryHeader(line)) {
      currentCategory = line.replace(/[:\-]/g, '').trim();
      continue;
    }

    // Skip metadata headers, document titles, or command phrases
    const lineLower = line.toLowerCase();
    if (
      lineLower.includes('cin') || /^[LUlu]\d{5}/i.test(line) ||
      lineLower.includes('accounting standards') || lineLower.includes('for the year ended') ||
      lineLower.includes('balance sheet as at') || lineLower.includes('statement of profit and loss') ||
      (lineLower.includes('particulars') && (lineLower.includes('amount') || lineLower.includes('note') || lineLower.includes('year'))) ||
      lineLower.includes('note no.') || (lineLower.includes('current year') && lineLower.includes('previous year')) ||
      lineLower.startsWith('item,') || lineLower.startsWith('item name,') || lineLower.startsWith('particulars,') ||
      lineLower.startsWith('item |') || lineLower.startsWith('particulars |') || lineLower.startsWith('account name,') ||
      lineLower.startsWith('account name |') || lineLower.startsWith('ledger name') || lineLower.startsWith('account head')
    ) {
      continue;
    }

    let label = '';
    let extractedAmount = null;
    let extractedPreviousAmount = null;
    let extractedNoteNo = null;

    // 1. Key-Value pairs with "=" or ":" (e.g. "A=2345", "b=58775986", "Software: 45000")
    if ((line.includes('=') || line.includes(':')) && !line.includes('|') && !line.includes('\t') && !line.includes(',')) {
      const delim = line.includes('=') ? '=' : ':';
      const delimIdx = line.indexOf(delim);
      label = line.substring(0, delimIdx).trim();
      const valuePart = line.substring(delimIdx + 1).trim();
      extractedAmount = parseIndianNumber(valuePart);
    } 
    // 2. Tab, pipe, or comma separated format: "Label | Note | CY | PY" or "Label, 1800000, 2500000"
    else if (line.includes('|') || line.includes('\t') || (line.includes(',') && !line.match(/\d,\d/))) {
      const tokens = line.split(/[|\t]|,(?!\d)/).map(t => t.trim()).filter(t => t.length > 0);
      if (tokens.length >= 2) {
        label = tokens[0];
        
        // Find monetary amount tokens across columns
        const numberTokens = [];
        for (let i = 1; i < tokens.length; i++) {
          const val = parseIndianNumber(tokens[i]);
          if (!isNaN(val)) {
            numberTokens.push({ token: tokens[i], val });
          }
        }

        if (numberTokens.length === 1) {
          if (numberTokens[0].val <= 50 && (line.includes('-') || line.includes('–'))) {
            extractedNoteNo = numberTokens[0].val;
            extractedAmount = 0;
            extractedPreviousAmount = 0;
          } else {
            extractedAmount = numberTokens[0].val;
          }
        } else if (numberTokens.length === 2) {
          if (numberTokens[0].val <= 50 && numberTokens[1].val > 50) {
            extractedNoteNo = numberTokens[0].val;
            extractedAmount = numberTokens[1].val;
          } else {
            extractedAmount = numberTokens[0].val;
            extractedPreviousAmount = numberTokens[1].val;
          }
        } else if (numberTokens.length >= 3) {
          if (numberTokens[0].val <= 50) {
            extractedNoteNo = numberTokens[0].val;
            extractedAmount = numberTokens[1].val;
            extractedPreviousAmount = numberTokens[2].val;
          } else {
            extractedAmount = numberTokens[0].val;
            extractedPreviousAmount = numberTokens[1].val;
          }
        }
      }
    } 
    // 3. Multi-column space separated format: "Other Expenses   9   18318.00   59094.25"
    else {
      const numberMatches = [];
      const numRegex = /(?:\bRs\.?|\bINR|[₹$€£])?\s*\(?-?\d[\d,.]*(?:\s*(?:lakhs?|crores?|cr|k|m|b|thousand|million|billion))?\)?(?![a-zA-Z])/gi;
      let match;

      while ((match = numRegex.exec(line)) !== null) {
        const token = match[0].trim();
        const preToken = line.substring(Math.max(0, match.index - 8), match.index).toLowerCase();
        const postToken = line.substring(match.index + match[0].length, Math.min(line.length, match.index + match[0].length + 4));

        if (preToken.includes('sec') || preToken.includes('sft') || /^[a-zA-Z]/.test(postToken)) {
          continue;
        }

        const val = parseIndianNumber(token);
        if (!isNaN(val) && !isDateToken(token, line)) {
          numberMatches.push({ index: match.index, text: token, val });
        }
      }

      if (numberMatches.length > 0) {
        label = line.substring(0, numberMatches[0].index).trim();
        if (label.endsWith('-') || label.endsWith('–') || label.endsWith('=')) {
          label = label.slice(0, -1).trim();
        }

        if (numberMatches.length === 1) {
          if (numberMatches[0].val <= 50 && (line.includes('- -') || line.includes('-') || line.includes('–'))) {
            extractedNoteNo = numberMatches[0].val;
            extractedAmount = 0;
            extractedPreviousAmount = 0;
          } else {
            extractedAmount = numberMatches[0].val;
          }
        } else if (numberMatches.length === 2) {
          if (numberMatches[0].val <= 50 && numberMatches[1].val > 50) {
            extractedNoteNo = numberMatches[0].val;
            extractedAmount = numberMatches[1].val;
          } else {
            extractedAmount = numberMatches[0].val;
            extractedPreviousAmount = numberMatches[1].val;
          }
        } else if (numberMatches.length >= 3) {
          if (numberMatches[0].val <= 50) {
            extractedNoteNo = numberMatches[0].val;
            extractedAmount = numberMatches[1].val;
            extractedPreviousAmount = numberMatches[2].val;
          } else {
            extractedAmount = numberMatches[0].val;
            extractedPreviousAmount = numberMatches[1].val;
          }
        }
      } else if (line.includes('- -') || line.endsWith('-') || line.endsWith('--')) {
        // Line with Nil amounts like "Depreciation - -" or "Other Income -"
        label = line.replace(/[-–=:]+$/, '').replace(/[-–\s]+$/, '').trim();
        extractedAmount = 0;
        extractedPreviousAmount = 0;
      }
    }

    if (!label || label.length < 1) continue;

    // Filter out Totals / Subtotals to prevent double counting
    if (isTotalOrSubtotalLabel(label)) {
      continue;
    }

    if (extractedAmount !== null && !isNaN(extractedAmount)) {
      const cleanName = cleanItemLabel(label);
      const classification = classifyIndianAccountingHead(cleanName, currentCategory);
      items.push({
        category: classification.category,
        label: cleanName,
        amount: extractedAmount,
        ...(extractedPreviousAmount !== null ? { previousAmount: extractedPreviousAmount } : {}),
        ...(extractedNoteNo !== null ? { noteNo: extractedNoteNo } : {})
      });
    } else {
      warnings.push(`Skipped non-monetary or unparsed line: "${line}"`);
    }
  }

  return { items, warnings, layoutInfo };
}

function isDateToken(token, fullLine) {
  // Check if token is part of a date pattern like DD-MM-YYYY or DD/MM/YYYY
  if (/\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(fullLine)) return true;
  // Year token like 2023 or 2024 next to FY or FY 2023-24
  if (/\b(FY|AY|Year|Period)\s*\d{2,4}/i.test(fullLine)) return true;
  return false;
}

/**
 * True Negative & Suffix Multiplier Number Parser
 * Multipliers: Cr (1e7), Lakh (1e5), M / Million (1e6), B / Billion (1e9), K / Thousand (1e3)
 */
export function parseIndianNumber(str) {
  if (!str) return 0;
  const strTrim = String(str).trim();

  // True Negative Detection:
  // Must have a leading negative sign, or parentheses strictly wrapping the digits: (15,000) or -15,000
  const isNegative = /^\s*-\s*[\d₹$€£Rs]/i.test(strTrim) ||
    /^\s*\(\s*[\d₹$€£Rs,.]+\s*\)\s*$/i.test(strTrim) ||
    /-\s*[\d,.]+\s*$/i.test(strTrim);

  // Strip currency prefixes & symbols ('Rs.', 'INR', '₹', '$', '€', '£')
  let cleaned = strTrim
    .replace(/rs\.?/gi, ' ')
    .replace(/inr/gi, ' ')
    .replace(/[₹$€£]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/^\s*-\s*/, '')
    .trim();

  // Unit Multipliers (Indian & International)
  if (/crores?|cr\b/i.test(cleaned)) {
    const val = parseFloat(cleaned.replace(/[^\d.]/g, ''));
    return (isNegative ? -1 : 1) * (isNaN(val) ? 0 : val * 10000000);
  }
  if (/lakhs?|lacs?/i.test(cleaned)) {
    const val = parseFloat(cleaned.replace(/[^\d.]/g, ''));
    return (isNegative ? -1 : 1) * (isNaN(val) ? 0 : val * 100000);
  }
  if (/billions?|b\b/i.test(cleaned)) {
    const val = parseFloat(cleaned.replace(/[^\d.]/g, ''));
    return (isNegative ? -1 : 1) * (isNaN(val) ? 0 : val * 1000000000);
  }
  if (/millions?|m\b/i.test(cleaned)) {
    const val = parseFloat(cleaned.replace(/[^\d.]/g, ''));
    return (isNegative ? -1 : 1) * (isNaN(val) ? 0 : val * 1000000);
  }
  if (/k\b|thousand/i.test(cleaned)) {
    const val = parseFloat(cleaned.replace(/[^\d.]/g, ''));
    return (isNegative ? -1 : 1) * (isNaN(val) ? 0 : val * 1000);
  }

  // Remove comma thousands separators (e.g. 45,000 or 12,50,000)
  const commaRemoved = cleaned.replace(/,/g, '');

  // Extract number tokens
  const matches = commaRemoved.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return 0;

  // If percentage exists on line (e.g. 'GST 18%: 10350'), select the non-percentage number
  let chosen = matches[matches.length - 1];
  if (matches.length > 1 && /%/.test(strTrim)) {
    const nonPctMatches = matches.filter(m => !strTrim.includes(m + '%') && !strTrim.includes(m + ' %') && !strTrim.includes('(' + m + '%)'));
    if (nonPctMatches.length > 0) chosen = nonPctMatches[nonPctMatches.length - 1];
  }

  const num = parseFloat(chosen);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
}
