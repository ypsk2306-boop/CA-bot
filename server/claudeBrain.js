import Anthropic from '@anthropic-ai/sdk';
import { 
  SCHEDULE_III_ORDER, 
  SCHEDULE_III_BS_ORDER, 
  STATUTORY_REGIMES 
} from './indianAccountingKnowledge.js';

export const DEFAULT_CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5';

export const CLAUDE_MODELS = [
  { id: 'claude-sonnet-5', name: '🧠 Claude Sonnet 5 (Balanced & Accurate)' },
  { id: 'claude-opus-5', name: '🏛️ Claude Opus 5 (Deep Statutory Audit & Reasoning)' },
  { id: 'claude-haiku-4-5-20251001', name: '⚡ Claude Haiku 4.5 (Fast Conversational CA)' },
  { id: 'claude-3-5-sonnet-20241022', name: '🔬 Claude 3.5 Sonnet (Legacy)' }
];

/**
 * Claude AI Brain - Verification & Calculation Engine
 * Acts as the Senior Chartered Accountant: verifies numbers, performs calculations,
 * audits tax adjustments, and categorizes line items into statutory heads.
 */
export async function executeClaudeBrain({
  rawText,
  userPrompt = '',
  targetRegime = 'AUTO',
  apiKey = null,
  model = DEFAULT_CLAUDE_MODEL
}) {
  const activeKey = apiKey || process.env.ANTHROPIC_API_KEY;

  if (!activeKey) {
    throw new Error('Anthropic API Key is required to run Claude Brain. Please configure ANTHROPIC_API_KEY in .env or via UI Settings.');
  }

  const anthropic = new Anthropic({
    apiKey: activeKey
  });

  const activeModel = model || DEFAULT_CLAUDE_MODEL;

  const systemPrompt = `You are a Senior Chartered Accountant (CA), Tax Auditor, and Statutory Expert in Indian Accounting Standards, Companies Act 2013 (Schedule III Part I & II), Income Tax Act 1961, and MSMED Act 2006.

YOUR ROLE: THE BRAIN 🧠 (Calculations, Verification & Statutory Classification)
1. 0% HALLUCINATION RULE: Every single amount in "lineItems" MUST correspond strictly to a number present in the source financial data. DO NOT invent or fabricate amounts.
2. CALCULATIONS: Calculate all statutory totals:
   - Gross Revenue (Revenue from Operations + Other Income)
   - Total Expenses by Schedule III Heads
   - Profit Before Tax (PBT) = Total Revenue - Total Expenses
   - Tax Provision & Profit After Tax (PAT)
   - Balance Sheet Totals: Equity & Liabilities vs Total Assets
   - 11 Mandatory Schedule III Analytical Ratios
   - Section 43B(h) MSME overdue days & 3x RBI compound interest
   - Schedule BP Book Profit to Taxable Business Income Bridging
3. CATEGORIZATION: Map every line item to one of the canonical Schedule III statutory categories:
   P&L Heads:
   - 'REVENUE FROM OPERATIONS'
   - 'OTHER INCOME'
   - 'COST OF MATERIALS CONSUMED'
   - 'PURCHASES OF STOCK-IN-TRADE'
   - 'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE'
   - 'EMPLOYEE BENEFITS EXPENSE'
   - 'FINANCE COSTS'
   - 'DEPRECIATION AND AMORTISATION EXPENSE'
   - 'OTHER EXPENSES'
   Balance Sheet Heads:
   - 'SHARE CAPITAL'
   - 'RESERVES AND SURPLUS'
   - 'LONG-TERM BORROWINGS'
   - 'SHORT-TERM BORROWINGS'
   - 'TRADE PAYABLES'
   - 'OTHER CURRENT LIABILITIES'
   - 'PROVISIONS'
   - 'PROPERTY, PLANT AND EQUIPMENT'
   - 'NON-CURRENT INVESTMENTS'
   - 'INVENTORIES'
   - 'TRADE RECEIVABLES'
   - 'CASH AND CASH EQUIVALENTS'
   - 'OTHER CURRENT ASSETS'

OUTPUT REQUIREMENT:
Respond ONLY with valid JSON (no markdown fences, no conversational text before or after).

JSON Structure:
{
  "docType": "PL" | "BALANCE_SHEET" | "NON_CORPORATE" | "TRIAL_BALANCE" | "GST_RETURN",
  "regime": "${targetRegime}",
  "companyName": "COMPANY NAME",
  "cin": "CIN (if available)",
  "period": "Period Description (e.g. For the year ended on 31-03-2025)",
  "currentYearLabel": "2024-25",
  "previousYearLabel": "2023-24",
  "currencySymbol": "₹",
  "taxRate": 0.25,
  "verifiedCalculations": {
    "totalRevenueCY": 0,
    "totalRevenuePY": 0,
    "totalExpensesCY": 0,
    "totalExpensesPY": 0,
    "profitBeforeTaxCY": 0,
    "profitBeforeTaxPY": 0,
    "currentTaxCY": 0,
    "profitAfterTaxCY": 0,
    "totalAssetsCY": 0,
    "totalLiabilitiesCY": 0
  },
  "lineItems": [
    {
      "category": "REVENUE FROM OPERATIONS",
      "label": "Item Name",
      "amount": 100000,
      "previousAmount": 80000,
      "noteNo": 1
    }
  ],
  "caAuditObservations": [
    "Audit note or statutory compliance remark 1",
    "Explanation of any ratio variance > 25% under Note 7"
  ]
}`;

  const userMessageContent = `Please verify, calculate, and structure the following financial records:

TARGET STATUTORY REGIME: ${targetRegime}
USER DIRECTIVE / ADJUSTMENTS: ${userPrompt || 'Standard statutory verification and compilation'}

RAW FINANCIAL DATA:
${rawText}`;

  try {
    const response = await anthropic.messages.create({
      model: activeModel,
      max_tokens: 8192,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessageContent
        }
      ]
    });

    if (response.stop_reason === 'max_tokens') {
      console.warn('⚠️ Warning: Claude output was truncated by max_tokens limit (8192 tokens).');
    }

    const responseText = response.content[0]?.text || '';
    
    // Find JSON substring
    let cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(cleanJson);

    return {
      source: 'claude_brain',
      model: activeModel,
      usage: response.usage,
      wasTruncated: response.stop_reason === 'max_tokens',
      ...parsed
    };
  } catch (err) {
    console.error('Error executing Claude Brain:', err);
    throw new Error(`Claude Brain verification failed: ${err.message}`);
  }
}
