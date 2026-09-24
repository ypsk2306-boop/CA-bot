import React from 'react';
import { Terminal, ArrowRight, Loader2, Send, Scale, CheckCircle2 } from 'lucide-react';

export default function PromptConsole({
  userPrompt,
  setUserPrompt,
  onExecute,
  isGenerating,
  statutoryRegime,
  setStatutoryRegime,
  hasData,
  hasExistingSchema,
  lastFeedback
}) {
  const statutoryOptions = [
    { id: 'AUTO', label: 'Auto-Detect Applicable Act & Standard', desc: 'Auto-detects Companies Act Schedule III, GST, Income Tax 44AD/44ADA, Non-Corporate, or Trial Balance' },
    { id: 'COMPANIES_ACT_SCHEDULE_III_PL', label: 'Companies Act 2013: Schedule III Profit & Loss', desc: 'Revenue, Cost of Materials, Employee Benefits, PBT, PAT' },
    { id: 'COMPANIES_ACT_SCHEDULE_III_BS', label: 'Companies Act 2013: Schedule III Balance Sheet', desc: 'Equity & Liabilities vs Assets with comparative periods' },
    { id: 'SCHEDULE_III_RATIOS', label: 'Schedule III: 11 Statutory Analytical Ratios', desc: 'Current Ratio, Debt-Equity, ROE, ROCE, Turnover Ratios & Variances' },
    { id: 'NON_CORPORATE_ENTITY', label: 'ICAI Non-Corporate Entity Financials', desc: 'Proprietorships, Partnerships, LLPs & Trusts with Capital schedules' },
    { id: 'ITR_RECASTING', label: 'ITR Recasting: Book Profit to Taxable P&L', desc: 'Bridges Accounting Profit to Taxable Income (Sec 43B, 40(a)(ia), 40(b))' },
    { id: 'SECTION_43B_H', label: 'Sec 43B(h) MSME Delayed Payment Audit', desc: 'Vendor classification (Micro/Small), 15/45-day limits & 3x RBI Interest' },
    { id: 'GST_GSTR3B', label: 'GST Act 2017: Form GSTR-3B Return & ITC', desc: 'Table 3.1 Outward supplies, Table 4 Eligible ITC & Net Tax' },
    { id: 'INCOME_TAX_44ADA', label: 'Income Tax Act: Sec 44AD / 44ADA Presumptive', desc: 'Gross receipts, 50% / 6% deemed profit & Net taxable income' },
    { id: 'PARTNERSHIP_CAPITAL', label: 'Partnership Act 1932: Capital Accounts & Affairs', desc: 'Partner capital accounts, interest on capital, drawings' },
    { id: 'TRIAL_BALANCE', label: 'Double-Entry Trial Balance & Ledger', desc: 'Debit vs Credit balanced ledger with variance verification' }
  ];

  const quickPills = hasExistingSchema ? [
    { label: "Convert to P&L", prompt: "Convert statement to Schedule III Profit and Loss" },
    { label: "Convert to Balance Sheet", prompt: "Convert statement to Schedule III Balance Sheet" },
    { label: "11 Statutory Ratios", prompt: "Compute 11 MCA Schedule III mandatory analytical ratios" },
    { label: "ITR Recasting", prompt: "Recast financials for ITR filing with Sec 43B and Sec 32 depreciation" },
    { label: "Sec 43B(h) MSME Audit", prompt: "Audit Trade Payables for MSME delayed payments under Sec 43B(h)" },
    { label: "+ Add 18% GST", prompt: "Add 18% GST on all revenue items" },
    { label: "Set Tax Rate 22%", prompt: "Set corporate tax rate to 22%" }
  ] : [
    { label: "Profit & Loss (P&L)", prompt: "Generate a Schedule III Profit & Loss statement with 25% tax rate", regime: 'COMPANIES_ACT_SCHEDULE_III_PL' },
    { label: "Balance Sheet", prompt: "Generate a Schedule III Balance Sheet showing Assets & Liabilities", regime: 'COMPANIES_ACT_SCHEDULE_III_BS' },
    { label: "Non-Corporate (ICAI)", prompt: "Format as Non-Corporate Entity Balance Sheet and Capital Account", regime: 'NON_CORPORATE_ENTITY' },
    { label: "ITR Recasting", prompt: "Recast financials for Income Tax Return with statutory disallowances", regime: 'ITR_RECASTING' },
    { label: "Sec 43B(h) MSME", prompt: "Perform Section 43B(h) MSME compliance audit and interest calculation", regime: 'SECTION_43B_H' },
    { label: "44ADA Presumptive", prompt: "Compute presumptive professional income under Section 44ADA", regime: 'INCOME_TAX_44ADA' }
  ];

  return (
    <div className="surface-card p-4 flex flex-col gap-3.5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              CA Command & Statutory Controller
            </h2>
          </div>
        </div>

        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
          {hasExistingSchema ? 'Interactive Mode' : 'Statutory Engine'}
        </span>
      </div>

      {/* Target Statutory Act Dropdown */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-slate-400" /> Target Statutory Act / Standard:
          </span>
          <span className="text-[10px] text-emerald-400 font-mono">
            {statutoryRegime === 'AUTO' ? 'Auto-Routing Active' : 'Locked Standard'}
          </span>
        </div>
        <select
          value={statutoryRegime}
          onChange={(e) => setStatutoryRegime(e.target.value)}
          className="w-full bg-slate-950 border border-slate-800 text-slate-100 text-xs rounded-lg p-2.5 focus:outline-none focus:border-blue-500 font-medium transition-colors"
        >
          {statutoryOptions.map(opt => (
            <option key={opt.id} value={opt.id} className="bg-slate-900 text-slate-200">
              {opt.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-slate-400">
          {statutoryOptions.find(o => o.id === statutoryRegime)?.desc || ''}
        </p>
      </div>

      {/* Unified Main Command Bar & Primary Hero Action */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
          <span>{hasExistingSchema ? 'Accounting Directive / Live Adjustment:' : 'Direct Command / Parameter (Optional):'}</span>
        </div>
        <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg p-1.5 focus-within:border-blue-500 transition-colors">
          <input
            type="text"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder={
              hasExistingSchema
                ? "E.g., 'Add 18% GST', 'Reclassify to Cost of Materials', 'Set tax rate 22%'..."
                : "E.g., 'Corporate tax rate 22%', 'Presumptive profit at 50%', 'Add partner drawings'..."
            }
            className="w-full bg-transparent px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none placeholder:text-slate-500 font-medium"
            onKeyDown={(e) => e.key === 'Enter' && !isGenerating && onExecute()}
          />
          <button
            onClick={onExecute}
            disabled={isGenerating || (!hasData && !userPrompt.trim() && !hasExistingSchema)}
            className="btn-primary text-xs py-2 px-4 whitespace-nowrap disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> Executing...
              </>
            ) : hasExistingSchema ? (
              <>
                Apply Directive <Send className="w-3.5 h-3.5 ml-1.5" />
              </>
            ) : (
              <>
                Generate Statement <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Action Suggestion Pills */}
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <span className="text-[11px] text-slate-400 font-medium">Quick Directives:</span>
        {quickPills.map((pill, idx) => (
          <button
            key={idx}
            onClick={() => {
              setUserPrompt(pill.prompt);
              if (pill.regime) setStatutoryRegime(pill.regime);
            }}
            className="text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700/60 transition-colors cursor-pointer whitespace-nowrap"
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Feedback Alert if an adjustment was just applied */}
      {lastFeedback && (
        <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="whitespace-pre-line font-mono text-[11px] leading-relaxed">
            {lastFeedback}
          </div>
        </div>
      )}
    </div>
  );
}
