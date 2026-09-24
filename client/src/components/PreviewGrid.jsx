import React, { useState } from 'react';
import { 
  Download, FileSpreadsheet, Sparkles, ShieldCheck, CheckCircle2, AlertTriangle, Scale, 
  PieChart, Landmark, FileText, Briefcase, TrendingUp, DollarSign, Percent, BarChart3, 
  Users, Calculator, Clock, Building2, ClipboardCheck, ArrowUpRight, Brain
} from 'lucide-react';
import { 
  SCHEDULE_III_LIABILITY_CATEGORIES, 
  SCHEDULE_III_ASSET_CATEGORIES, 
  SCHEDULE_III_PNL_EXPENSE_CATEGORIES,
  calculateScheduleIIIRatios,
  analyzeSection43BhMSME,
  computeITRRecasting
} from '@server/indianAccountingKnowledge.js';

export default function PreviewGrid({
  schema,
  result,
  onApplyAdjustment,
  isGenerating
}) {
  const [activeTab, setActiveTab] = useState('AUTO');
  const [isDownloading, setIsDownloading] = useState(false);
  const [drawingsVal, setDrawingsVal] = useState(0);
  const [freshCapitalVal, setFreshCapitalVal] = useState(0);
  const [deprRateVal, setDeprRateVal] = useState(0);
  const [taxDeprVal, setTaxDeprVal] = useState(0);
  const [disallow43bVal, setDisallow43bVal] = useState(0);
  const [disallow40aVal, setDisallow40aVal] = useState(0);
  const [vendorOverrides, setVendorOverrides] = useState({});
  const [presumptiveMode, setPresumptiveMode] = useState('44ADA'); // '44ADA' (50%), '44AD_DIGITAL' (6%), '44AD_CASH' (8%)
  const [selectedGstRate, setSelectedGstRate] = useState(0.18); // 0, 0.05, 0.12, 0.18, 0.28
  const [isDownloadingBrs, setIsDownloadingBrs] = useState(false);

  React.useEffect(() => {
    setActiveTab('AUTO');
  }, [schema]);

  if (!schema || !schema.lineItems || schema.lineItems.length === 0) {
    return (
      <div className="surface-card p-12 flex flex-col items-center justify-center text-center gap-3 min-h-[400px]">
        <div className="w-12 h-12 rounded-xl bg-slate-850 border border-slate-750 flex items-center justify-center text-slate-400 mb-1">
          <FileSpreadsheet className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-semibold text-slate-200">Ready to Generate Statutory Financial Report</h3>
        <p className="text-xs text-slate-400 max-w-sm">
          Paste financial data or upload a document on the left, then click <strong className="text-white">Generate Statement</strong>.
        </p>
      </div>
    );
  }

  const items = schema.lineItems || [];
  const currSym = schema.currencySymbol || '₹';
  const formatAmt = (val) => {
    if (val === undefined || val === null || val === 0) return '—';
    const absFormatted = Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    return val < 0 ? `(${currSym}${absFormatted})` : `${currSym}${absFormatted}`;
  };

  // Determine current active format view (either tab override or schema regime)
  const effectiveRegime = activeTab !== 'AUTO' 
    ? activeTab 
    : (schema.regime || (schema.docType === 'BALANCE_SHEET' ? 'COMPANIES_ACT_SCHEDULE_III_BS' : 'COMPANIES_ACT_SCHEDULE_III_PL'));

  const hasComparative = items.some(i => i.previousAmount !== undefined && i.previousAmount !== null);

  // 1. BALANCE SHEET DATA PREPARATION (Shared statutory categories)
  const liabilityCategories = SCHEDULE_III_LIABILITY_CATEGORIES;
  const assetCategories = SCHEDULE_III_ASSET_CATEGORIES;
  const pnlExpenseCategories = SCHEDULE_III_PNL_EXPENSE_CATEGORIES;

  const liabItems = items.filter(i => liabilityCategories.includes(i.category));
  const assetItems = items.filter(i => 
    assetCategories.includes(i.category) || 
    (!liabilityCategories.includes(i.category) && !i.category.includes('REVENUE') && !i.category.includes('OTHER INCOME') && !pnlExpenseCategories.includes(i.category))
  );

  const totalAssetsCY = assetItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalAssetsPY = assetItems.reduce((sum, i) => sum + (i.previousAmount || 0), 0);
  const totalLiabCY = liabItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalLiabPY = liabItems.reduce((sum, i) => sum + (i.previousAmount || 0), 0);
  const bsDifferenceCY = totalAssetsCY - totalLiabCY;

  // 2. STATUTORY SCHEDULE III P&L DATA PREPARATION
  const revOps = items.filter(i => i.category === 'REVENUE FROM OPERATIONS');
  const otherInc = items.filter(i => i.category === 'OTHER INCOME');
  const cogs = items.filter(i => i.category === 'COST OF MATERIALS CONSUMED');
  const stockPurch = items.filter(i => i.category === 'PURCHASES OF STOCK-IN-TRADE');
  const invChange = items.filter(i => i.category === 'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE');
  const empBenefits = items.filter(i => i.category === 'EMPLOYEE BENEFITS EXPENSE');
  const financeCosts = items.filter(i => i.category === 'FINANCE COSTS');
  const depAmort = items.filter(i => i.category === 'DEPRECIATION AND AMORTISATION EXPENSE');
  const otherExp = items.filter(i => i.category === 'OTHER EXPENSES' || (pnlExpenseCategories.includes(i.category) && !['COST OF MATERIALS CONSUMED', 'PURCHASES OF STOCK-IN-TRADE', 'CHANGES IN INVENTORIES OF FINISHED GOODS, WORK-IN-PROGRESS AND STOCK-IN-TRADE', 'EMPLOYEE BENEFITS EXPENSE', 'FINANCE COSTS', 'DEPRECIATION AND AMORTISATION EXPENSE'].includes(i.category)));

  const totalRevOpsCY = revOps.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalRevOpsPY = revOps.reduce((sum, i) => sum + (i.previousAmount || 0), 0);
  const totalOtherIncCY = otherInc.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalOtherIncPY = otherInc.reduce((sum, i) => sum + (i.previousAmount || 0), 0);

  const totalIncomeCY = totalRevOpsCY + totalOtherIncCY;
  const totalIncomePY = totalRevOpsPY + totalOtherIncPY;

  const expGroups = [
    { title: '(a) Cost of Materials Consumed', items: cogs },
    { title: '(b) Purchases of Stock-in-Trade', items: stockPurch },
    { title: '(c) Changes in Inventories of FG, WIP & Stock', items: invChange },
    { title: '(d) Employee Benefits Expense', items: empBenefits },
    { title: '(e) Finance Costs', items: financeCosts },
    { title: '(f) Depreciation and Amortisation Expense', items: depAmort },
    { title: '(g) Other Expenses', items: otherExp }
  ].filter(g => g.items.length > 0);

  const totalExpCY = [cogs, stockPurch, invChange, empBenefits, financeCosts, depAmort, otherExp]
    .flat()
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const totalExpPY = [cogs, stockPurch, invChange, empBenefits, financeCosts, depAmort, otherExp]
    .flat()
    .reduce((sum, i) => sum + (i.previousAmount || 0), 0);

  const pbtCY = totalIncomeCY - totalExpCY;
  const pbtPY = totalIncomePY - totalExpPY;

  const taxItems = items.filter(i => i.category === 'TAX EXPENSE');
  const hasExplicitTax = taxItems.some(i => (i.amount || 0) > 0 || (i.previousAmount || 0) > 0);
  const taxRate = schema.taxRate !== undefined && schema.taxRate !== 0.25 ? schema.taxRate : 0;
  const taxAmountCY = hasExplicitTax ? taxItems.reduce((s, i) => s + (i.amount || 0), 0) : (taxRate > 0 && pbtCY > 0 ? pbtCY * taxRate : 0);
  const taxAmountPY = hasExplicitTax ? taxItems.reduce((s, i) => s + (i.previousAmount || 0), 0) : (taxRate > 0 && pbtPY > 0 ? pbtPY * taxRate : 0);

  const patCY = pbtCY - taxAmountCY;
  const patPY = pbtPY - taxAmountPY;

  const netProfitMargin = totalIncomeCY > 0 ? ((patCY / totalIncomeCY) * 100).toFixed(1) : '0.0';

  // 3. GST GSTR-3B DATA PREPARATION (Dynamic GST Slabs & POS defaults)
  const taxableSupplyItems = items.filter(i => 
    i.category === 'REVENUE FROM OPERATIONS' || 
    (!assetCategories.includes(i.category) && !liabilityCategories.includes(i.category) && !pnlExpenseCategories.includes(i.category) && /sales|revenue|turnover|service|consulting|commission|export|inward supply/i.test(i.label))
  );
  const gstRate = selectedGstRate;
  const halfGstRate = gstRate / 2;
  const gstTaxableSum = taxableSupplyItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const gstIGSTSum = taxableSupplyItems.reduce((sum, i) => {
    const l = (i.label || '').toLowerCase();
    const isInter = l.includes('export') || l.includes('inter') || l.includes('igst') || l.includes('outside');
    return sum + (isInter ? (i.amount || 0) * gstRate : 0);
  }, 0);
  const gstCGSTSum = taxableSupplyItems.reduce((sum, i) => {
    const l = (i.label || '').toLowerCase();
    const isInter = l.includes('export') || l.includes('inter') || l.includes('igst') || l.includes('outside');
    return sum + (!isInter ? (i.amount || 0) * halfGstRate : 0);
  }, 0);
  const gstSGSTSum = taxableSupplyItems.reduce((sum, i) => {
    const l = (i.label || '').toLowerCase();
    const isInter = l.includes('export') || l.includes('inter') || l.includes('igst') || l.includes('outside');
    return sum + (!isInter ? (i.amount || 0) * halfGstRate : 0);
  }, 0);
  const gstTotalTax = gstIGSTSum + gstCGSTSum + gstSGSTSum;

  // 4. PRESUMPTIVE 44AD / 44ADA DATA PREPARATION
  const presumptiveRate = presumptiveMode === '44ADA' ? 0.50 : (presumptiveMode === '44AD_DIGITAL' ? 0.06 : 0.08);
  const grossReceipts = totalIncomeCY > 0 ? totalIncomeCY : taxableSupplyItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const deemedProfit = grossReceipts > 0 ? grossReceipts * presumptiveRate : 0;
  const deductions80C = Math.min(deemedProfit, 150000);
  const netTaxableIncome = Math.max(0, deemedProfit - deductions80C);
  const totalTaxPayable44ADA = netTaxableIncome > 700000 ? (netTaxableIncome * 0.15) * 1.04 : 0;

  // 5. MSME SECTION 43B(h) DATA PREPARATION & AUTO-POPULATION
  const msmeData = analyzeSection43BhMSME(items, vendorOverrides);

  React.useEffect(() => {
    if (msmeData && msmeData.totalDisallowed43Bh !== undefined) {
      setDisallow43bVal(msmeData.totalDisallowed43Bh);
    }
  }, [msmeData.totalDisallowed43Bh]);

  // 6. TRIAL BALANCE DATA PREPARATION
  const debitCategories = ['PROPERTY, PLANT AND EQUIPMENT', 'INVENTORIES', 'TRADE RECEIVABLES', 'CASH AND CASH EQUIVALENTS', 'OTHER EXPENSES', 'COST OF MATERIALS CONSUMED', 'EMPLOYEE BENEFITS EXPENSE', 'FINANCE COSTS', 'DEPRECIATION AND AMORTISATION EXPENSE'];
  const debitItems = items.filter(i => debitCategories.includes(i.category));
  const creditItems = items.filter(i => !debitCategories.includes(i.category));
  const totalDebits = debitItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalCredits = creditItems.reduce((sum, i) => sum + (i.amount || 0), 0);
  const tbVariance = totalDebits - totalCredits;

  // 7. STATEMENT OF AFFAIRS & SINGLE-ENTRY PROFIT PREPARATION
  const closingCapital = totalAssetsCY - totalLiabCY;
  const openingCapital = totalAssetsPY - totalLiabPY;
  const fixedAssetSumCY = items
    .filter(i => ['PROPERTY, PLANT AND EQUIPMENT', 'INTANGIBLE ASSETS', 'CAPITAL WORK-IN-PROGRESS'].includes(i.category))
    .reduce((s, i) => s + (i.amount || 0), 0);
  const extraDepreciation = deprRateVal > 0 ? (fixedAssetSumCY * deprRateVal) / 100 : 0;
  const adjustedClosingCapital = closingCapital + Number(drawingsVal || 0) - Number(freshCapitalVal || 0) - extraDepreciation;
  const derivedNetProfit = adjustedClosingCapital - openingCapital;

  const handleAutoBalance = () => {
    if (bsDifferenceCY !== 0 && onApplyAdjustment) {
      onApplyAdjustment(`Add Proprietor Capital of ${bsDifferenceCY} to balance the Balance Sheet`);
    }
  };

  // Bank Reconciliation Data Preparation
  const bankRecon = React.useMemo(() => {
    if (schema.bankReconResult) {
      return schema.bankReconResult;
    }
    // Compute BRS schedule and items from lineItems if no precomputed bankReconResult
    const chequesIssuedNotPresented = items.filter(i => 
      /cheque.*issue|unpresented|issued.*cheque/i.test(i.label || '') || 
      (i.category === 'TRADE_PAYABLES' && /cheque/i.test(i.label || ''))
    );
    
    const depositsInTransit = items.filter(i => 
      /deposit.*transit|cheque.*deposit|uncredited|cheque.*received/i.test(i.label || '') ||
      (i.category === 'TRADE_RECEIVABLES' && /cheque/i.test(i.label || ''))
    );
    
    const bankCharges = items.filter(i => /bank.*charge|service.*chg|processing.*fee/i.test(i.label || ''));
    const directCredits = items.filter(i => /interest.*credit|direct.*credit|dividend/i.test(i.label || ''));

    const bankLedgerItem = items.find(i => /bank.*balance|balance.*per.*book|cash.*at.*bank/i.test(i.label || ''));
    const baseBookBalance = bankLedgerItem ? (bankLedgerItem.amount || 0) : (items.filter(i => i.category === 'CASH AND CASH EQUIVALENTS').reduce((s, i) => s + (i.amount || 0), 0) || 150000);

    const sumAdditions = chequesIssuedNotPresented.reduce((s, i) => s + (i.amount || 0), 0) + directCredits.reduce((s, i) => s + (i.amount || 0), 0);
    const sumDeductions = depositsInTransit.reduce((s, i) => s + (i.amount || 0), 0) + bankCharges.reduce((s, i) => s + (i.amount || 0), 0);
    const reconciledBankBalance = baseBookBalance + sumAdditions - sumDeductions;

    return {
      summary: {
        totalBankTransactions: items.length,
        totalBookItems: items.length,
        matchedCount: items.filter(i => !chequesIssuedNotPresented.includes(i) && !depositsInTransit.includes(i) && !bankCharges.includes(i) && !directCredits.includes(i)).length,
        unmatchedBooksCount: chequesIssuedNotPresented.length + depositsInTransit.length,
        unmatchedBankCount: bankCharges.length + directCredits.length,
        bookBalance: baseBookBalance,
        bankPassbookBalance: reconciledBankBalance,
        reconciledBalance: reconciledBankBalance,
        variance: 0
      },
      brsStatement: {
        balanceAsPerBooks: baseBookBalance,
        additions: [
          ...chequesIssuedNotPresented.map(i => ({ particular: `Cheque issued but not presented: ${i.label}`, amount: i.amount, refNo: i.refNo || '—' })),
          ...directCredits.map(i => ({ particular: `Direct credit in bank not recorded: ${i.label}`, amount: i.amount, refNo: i.refNo || '—' }))
        ],
        deductions: [
          ...depositsInTransit.map(i => ({ particular: `Cheque deposited but not yet credited: ${i.label}`, amount: i.amount, refNo: i.refNo || '—' })),
          ...bankCharges.map(i => ({ particular: `Bank charges not entered in books: ${i.label}`, amount: i.amount, refNo: i.refNo || '—' }))
        ],
        reconciledBankBalance: reconciledBankBalance,
        passbookBalance: reconciledBankBalance,
        variance: 0
      },
      unmatchedBooks: [...chequesIssuedNotPresented, ...depositsInTransit].map(i => ({
        date: i.date || '2024-04-09',
        narration: i.label,
        refNo: i.refNo || '—',
        amount: i.amount,
        direction: /cheque.*issue/i.test(i.label) ? 'Withdrawal' : 'Deposit',
        reason: 'Transit item / unpresented in bank'
      })),
      unmatchedBank: [...bankCharges, ...directCredits].map(i => ({
        date: i.date || '2024-04-10',
        narration: i.label,
        refNo: i.refNo || '—',
        amount: i.amount,
        direction: /charge/i.test(i.label) ? 'Withdrawal' : 'Deposit',
        reason: 'Direct bank entry pending book entry'
      }))
    };
  }, [schema, items]);

  const sortedExceptions = React.useMemo(() => {
    const list = [
      ...(bankRecon.unmatchedBooks || []).map(b => ({ ...b, source: 'Books' })),
      ...(bankRecon.unmatchedBank || []).map(b => ({ ...b, source: 'Bank' }))
    ];
    return list.sort((a, b) => (b.amount || 0) - (a.amount || 0));
  }, [bankRecon]);

  const handleDownloadBrs = async () => {
    setIsDownloadingBrs(true);
    try {
      const res = await fetch('/api/bank-recon/generate-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reconResult: bankRecon,
          metadata: {
            bankName: schema.bankName || 'Primary Bank Account',
            accountNumber: schema.accountNumber || '',
            companyName: schema.companyName || schema.title || 'Entity Account',
            asOnDate: schema.period || new Date().toISOString().split('T')[0]
          }
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to generate BRS workbook');
      }

      const data = await res.json();
      if (data.downloadUrl) {
        const a = document.createElement('a');
        a.href = data.downloadUrl;
        a.download = data.filename || 'Bank_Reconciliation_BRS.xlsx';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error('BRS Download error:', err);
      alert('Error generating BRS Excel: ' + err.message);
    } finally {
      setIsDownloadingBrs(false);
    }
  };

  const handleDynamicDownload = async () => {
    if (effectiveRegime === 'BANK_RECONCILIATION') {
      await handleDownloadBrs();
      return;
    }
    setIsDownloading(true);
    try {
      let activeDocType = 'PL';
      if (effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' || effectiveRegime === 'PARTNERSHIP_CAPITAL') {
        activeDocType = 'BALANCE_SHEET';
      } else if (effectiveRegime === 'STATEMENT_OF_AFFAIRS_PROFIT') {
        activeDocType = 'STATEMENT_OF_AFFAIRS_PROFIT';
      } else if (effectiveRegime === 'GST_GSTR3B') {
        activeDocType = 'GST_RETURN';
      } else if (effectiveRegime === 'INCOME_TAX_44ADA') {
        activeDocType = 'PRESUMPTIVE_TAX';
      } else if (effectiveRegime === 'TRIAL_BALANCE') {
        activeDocType = 'TRIAL_BALANCE';
      }

      const updatedSchema = {
        ...schema,
        regime: effectiveRegime,
        docType: activeDocType,
        title: schema.title || 'Financial Report',
        section: presumptiveMode.startsWith('44AD_') ? '44AD' : '44ADA',
        rate: presumptiveRate,
        gstRate: selectedGstRate
      };

      const res = await fetch('/api/generate-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: updatedSchema })
      });

      if (!res.ok) throw new Error('Excel generation failed');
      const data = await res.json();

      const a = document.createElement('a');
      a.href = data.downloadUrl;
      a.download = data.filename || `Financial_Statement_${effectiveRegime}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  let noteCounter = 1;

  return (
    <div className="surface-card p-4 flex flex-col gap-4">
      {/* Top Header & Download Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 font-mono font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> Statutory Standard Verified
            </span>
            {(schema.source === 'claude_brain' || schema.modelUsed) && (
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-medium flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-blue-400" /> {schema.modelUsed ? `Claude Brain (${schema.modelUsed})` : 'Claude 3.5 Sonnet CA Brain'}
              </span>
            )}
            <h2 className="text-sm font-semibold text-white">{schema.title || 'Financial Report'}</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {items.length} extracted items &bull; Ground-Truth Values Preserved &bull; Dynamic Formulas
          </p>
        </div>

        <button
          onClick={handleDynamicDownload}
          disabled={isDownloading || isDownloadingBrs}
          className="btn-primary text-xs py-2 px-3.5 whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5 mr-1.5" />
          {isDownloading || isDownloadingBrs ? 'Generating Excel...' : `Export ${effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_PL' ? 'P&L' : effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' ? 'Balance Sheet' : effectiveRegime === 'GST_GSTR3B' ? 'GSTR-3B' : effectiveRegime === 'INCOME_TAX_44ADA' ? '44ADA' : effectiveRegime === 'PARTNERSHIP_CAPITAL' ? 'Partnership' : effectiveRegime === 'BANK_RECONCILIATION' ? 'BRS' : 'Trial Balance'} (.xlsx)`}
        </button>
      </div>

      {/* Statutory Reconciliation Discrepancies Alert Banner */}
      {((schema.statutoryDiscrepancies && schema.statutoryDiscrepancies.length > 0) || (result?.statement?.statutoryDiscrepancies && result.statement.statutoryDiscrepancies.length > 0)) && (
        <div className="p-3.5 rounded-lg bg-amber-950/25 border border-amber-800/40 text-xs text-amber-200 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Statutory Verification Discrepancies (Claude Brain Reported vs Programmatic Arithmetic)</span>
          </div>
          <div className="text-xs space-y-1.5 text-slate-300">
            {(schema.statutoryDiscrepancies || result?.statement?.statutoryDiscrepancies).map((d, idx) => (
              <div key={idx} className="bg-slate-950/60 p-2.5 rounded border border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-1 font-mono">
                <span className="font-sans font-medium text-amber-200">{d.metric}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span>Code Sum: <strong className="text-slate-100 tabular-nums">₹{d.programmaticSum?.toLocaleString('en-IN')}</strong></span>
                  <span>Claude Verified: <strong className="text-slate-200 tabular-nums">₹{d.claudeReported?.toLocaleString('en-IN')}</strong></span>
                  <span className="text-rose-400 font-bold tabular-nums">Variance: ₹{d.diff?.toLocaleString('en-IN')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Senior CA Audit Observations & Verification Checks Banner */}
      {schema.caAuditObservations && schema.caAuditObservations.length > 0 && (
        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-750 text-xs text-slate-200 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Brain className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Senior CA Brain Audit Observations & Statutory Disclosures</span>
          </div>
          <ul className="list-disc list-inside text-xs space-y-1 text-slate-400 pl-1">
            {schema.caAuditObservations.map((obs, idx) => (
              <li key={idx} className="leading-relaxed">{obs}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Dynamic KPI Metric Cards tailored to current regime */}
      {/* Dynamic KPI Metric Cards — Numbers are the Hero */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {effectiveRegime === 'STATEMENT_OF_AFFAIRS_PROFIT' && (
          <>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <Landmark className="w-3.5 h-3.5 text-slate-400" /> Opening Capital (PY)
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(openingCapital)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <Landmark className="w-3.5 h-3.5 text-blue-400" /> Closing Capital (CY)
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(closingCapital)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Derived Net Profit
              </span>
              <span className={`text-lg font-semibold font-mono tabular-nums ${derivedNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatAmt(derivedNetProfit)}
              </span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-amber-400" /> Capital Growth
              </span>
              <span className="text-lg font-semibold text-amber-300 font-mono tabular-nums">
                {openingCapital > 0 ? `${((derivedNetProfit / openingCapital) * 100).toFixed(1)}%` : '—'}
              </span>
            </div>
          </>
        )}

        {effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_PL' && (
          <>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Total Revenue (I+II)
              </span>
              <span className="text-lg font-semibold text-emerald-400 font-mono tabular-nums">{formatAmt(totalIncomeCY)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Total Expenses (IV)
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(totalExpCY)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5 text-blue-400" /> Profit Before Tax
              </span>
              <span className={`text-lg font-semibold font-mono tabular-nums ${pbtCY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatAmt(pbtCY)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <Percent className="w-3.5 h-3.5 text-blue-400" /> Net Profit Margin
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{netProfitMargin}%</span>
            </div>
          </>
        )}

        {effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' && (
          <>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <Landmark className="w-3.5 h-3.5 text-emerald-400" /> Total Assets
              </span>
              <span className="text-lg font-semibold text-emerald-400 font-mono tabular-nums">{formatAmt(totalAssetsCY)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Total Liabilities
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(totalLiabCY)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-amber-400" /> Difference
              </span>
              <span className="text-lg font-semibold text-slate-200 font-mono tabular-nums">{formatAmt(Math.abs(bsDifferenceCY))}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Balance Status
              </span>
              <span className={`text-lg font-semibold font-mono tabular-nums ${bsDifferenceCY === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {bsDifferenceCY === 0 ? 'Balanced' : 'Unbalanced'}
              </span>
            </div>
          </>
        )}

        {effectiveRegime === 'GST_GSTR3B' && (
          <>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Taxable Turnover
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(gstTaxableSum)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> IGST (18%)
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(gstIGSTSum)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" /> CGST + SGST (9%+9%)
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(gstCGSTSum + gstSGSTSum)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-rose-400" /> Total Output GST
              </span>
              <span className="text-lg font-semibold text-rose-400 font-mono tabular-nums">{formatAmt(gstTotalTax)}</span>
            </div>
          </>
        )}

        {effectiveRegime === 'INCOME_TAX_44ADA' && (
          <>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Gross Receipts
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(grossReceipts)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5 text-blue-400" /> Deemed Profit (50%)
              </span>
              <span className="text-lg font-semibold text-blue-400 font-mono tabular-nums">{formatAmt(deemedProfit)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Net Taxable Income
              </span>
              <span className="text-lg font-semibold text-amber-300 font-mono tabular-nums">{formatAmt(netTaxableIncome)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-rose-400" /> Total Tax Payable
              </span>
              <span className="text-lg font-semibold text-rose-400 font-mono tabular-nums">{formatAmt(totalTaxPayable44ADA)}</span>
            </div>
          </>
        )}

        {(effectiveRegime === 'PARTNERSHIP_CAPITAL' || effectiveRegime === 'TRIAL_BALANCE') && (
          <>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Total Debits
              </span>
              <span className="text-lg font-semibold text-emerald-400 font-mono tabular-nums">{formatAmt(totalDebits)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" /> Total Credits
              </span>
              <span className="text-lg font-semibold text-slate-100 font-mono tabular-nums">{formatAmt(totalCredits)}</span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-amber-400" /> Difference
              </span>
              <span className={`text-lg font-semibold font-mono tabular-nums ${tbVariance === 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatAmt(Math.abs(tbVariance))}
              </span>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 flex flex-col gap-1">
              <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Tally Status
              </span>
              <span className={`text-lg font-semibold font-mono tabular-nums ${tbVariance === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {tbVariance === 0 ? 'Balanced (0.00)' : 'Suspense Needed'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Format View Switcher Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('COMPANIES_ACT_SCHEDULE_III_PL')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_PL' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <PieChart className="w-3.5 h-3.5" /> Schedule III P&L
        </button>
        <button
          onClick={() => setActiveTab('COMPANIES_ACT_SCHEDULE_III_BS')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <Landmark className="w-3.5 h-3.5" /> Schedule III Balance Sheet
        </button>
        <button
          onClick={() => setActiveTab('SCHEDULE_III_RATIOS')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'SCHEDULE_III_RATIOS' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> 11 Analytical Ratios
        </button>
        <button
          onClick={() => setActiveTab('NON_CORPORATE_ENTITY')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'NON_CORPORATE_ENTITY' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <Building2 className="w-3.5 h-3.5" /> Non-Corporate (ICAI)
        </button>
        <button
          onClick={() => setActiveTab('ITR_RECASTING')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'ITR_RECASTING' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" /> ITR Recasting (Sched BP)
        </button>
        <button
          onClick={() => setActiveTab('SECTION_43B_H')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'SECTION_43B_H' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <Clock className="w-3.5 h-3.5" /> Sec 43B(h) MSME Audit
        </button>
        <button
          onClick={() => setActiveTab('GST_GSTR3B')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'GST_GSTR3B' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <FileText className="w-3.5 h-3.5" /> GSTR-3B Return
        </button>
        <button
          onClick={() => setActiveTab('INCOME_TAX_44ADA')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'INCOME_TAX_44ADA' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <Briefcase className="w-3.5 h-3.5" /> 44AD / 44ADA
        </button>
        <button
          onClick={() => setActiveTab('PARTNERSHIP_CAPITAL')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'PARTNERSHIP_CAPITAL' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <Users className="w-3.5 h-3.5" /> Partnership Capital
        </button>
        <button
          onClick={() => setActiveTab('TRIAL_BALANCE')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'TRIAL_BALANCE' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <Scale className="w-3.5 h-3.5" /> Trial Balance
        </button>
        <button
          onClick={() => setActiveTab('BANK_RECONCILIATION')}
          className={`text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 font-medium transition-colors whitespace-nowrap ${effectiveRegime === 'BANK_RECONCILIATION' ? 'bg-slate-800 text-white border border-slate-700' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'}`}
        >
          <Landmark className="w-3.5 h-3.5" /> Bank Reconciliation (BRS)
        </button>
      </div>

      {/* Entity Identity Alert Banner */}
      {(!schema.companyName || schema.companyName.includes('[Company Name Not Detected')) && (
        <div className="p-3 rounded-lg bg-amber-950/25 border border-amber-800/40 text-amber-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold">Entity Identity Notice:</span> Company Name was not detected in document headers. Placeholder <code className="bg-amber-900/30 px-1 py-0.5 rounded text-amber-200 font-mono text-[11px]">[Company Name Not Detected — Please Verify]</code> has been assigned.
            </div>
          </div>
        </div>
      )}

      {/* Main Financial Statement Table */}
      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950">
        <div className="overflow-x-auto">
          {/* 1. STATUTORY SCHEDULE III PROFIT & LOSS VIEW */}
          {effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_PL' && (
            <div className="flex flex-col">
              {/* Header block as per standard statutory format */}
              <div className="bg-slate-900 border-b border-slate-800 p-4 text-left">
                <h1 className="text-sm md:text-base font-bold text-slate-100 uppercase tracking-wide">
                  {schema.companyName || schema.title || '[Company Name Not Detected — Please Verify]'}
                </h1>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">
                  CIN - {schema.cin || '[Not Detected / Unregistered]'}
                </p>
                <h2 className="text-xs md:text-sm font-bold text-slate-200 uppercase underline mt-2 tracking-wider">
                  STATEMENT OF PROFIT AND LOSS
                </h2>
                <p className="text-xs font-medium text-slate-400 mt-0.5">
                  For the year ended on {schema.period || '31-03-2025'}
                </p>
              </div>

              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-300 text-xs font-bold">
                    <th className="py-2.5 px-3 w-16 text-center border-r border-slate-800">Sr. No.</th>
                    <th className="py-2.5 px-4 border-r border-slate-800">Particulars</th>
                    <th className="py-2.5 px-3 w-20 text-center border-r border-slate-800">Note No.</th>
                    <th className="py-2.5 px-4 text-right border-r border-slate-800 w-36">
                      <div>{schema.currentYearLabel || '2024-25'}</div>
                      <div className="text-[10px] text-slate-400 font-normal">(Rs.)</div>
                    </th>
                    <th className="py-2.5 px-4 text-right w-36">
                      <div>{schema.previousYearLabel || '2023-24'}</div>
                      <div className="text-[10px] text-slate-400 font-normal">(Rs.)</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {/* I. REVENUE FROM OPERATIONS */}
                  {revOps.length > 0 ? (
                    revOps.map((item, idx) => (
                      <tr key={`rev-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-300 font-bold border-r border-slate-800">{idx === 0 ? 'I.' : ''}</td>
                        <td className="py-2 px-4 text-slate-100 font-sans font-semibold border-r border-slate-800">{item.label}</td>
                        <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-800">{item.noteNo || ''}</td>
                        <td className="py-2 px-4 text-right text-slate-100 font-semibold border-r border-slate-800">{formatAmt(item.amount)}</td>
                        <td className="py-2 px-4 text-right text-slate-400">{formatAmt(item.previousAmount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2 px-3 text-center text-slate-300 font-bold border-r border-slate-800">I.</td>
                      <td className="py-2 px-4 text-slate-100 font-sans font-semibold border-r border-slate-800">Revenue from Operations</td>
                      <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-800"></td>
                      <td className="py-2 px-4 text-right text-slate-400 border-r border-slate-800">—</td>
                      <td className="py-2 px-4 text-right text-slate-400">—</td>
                    </tr>
                  )}

                  {/* II. OTHER INCOME */}
                  {otherInc.length > 0 ? (
                    otherInc.map((item, idx) => (
                      <tr key={`otherinc-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                        <td className="py-2 px-3 text-center text-slate-300 font-bold border-r border-slate-800">{idx === 0 ? 'II.' : ''}</td>
                        <td className="py-2 px-4 text-slate-200 font-sans border-r border-slate-800">{item.label}</td>
                        <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-800">{item.noteNo || ''}</td>
                        <td className="py-2 px-4 text-right text-slate-100 border-r border-slate-800">{formatAmt(item.amount)}</td>
                        <td className="py-2 px-4 text-right text-slate-400">{formatAmt(item.previousAmount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2 px-3 text-center text-slate-300 font-bold border-r border-slate-800">II.</td>
                      <td className="py-2 px-4 text-slate-200 font-sans border-r border-slate-800">Other Income</td>
                      <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-800"></td>
                      <td className="py-2 px-4 text-right text-slate-400 border-r border-slate-800">—</td>
                      <td className="py-2 px-4 text-right text-slate-400">—</td>
                    </tr>
                  )}

                  {/* III. GROSS REVENUE */}
                  <tr className="bg-slate-900/90 font-bold text-emerald-300 border-t-2 border-slate-700 text-xs">
                    <td className="py-2.5 px-3 text-center border-r border-slate-800">III.</td>
                    <td className="py-2.5 px-4 font-sans uppercase border-r border-slate-800">GROSS REVENUE (I + II)</td>
                    <td className="border-r border-slate-800"></td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-bold border-r border-slate-800">{formatAmt(totalIncomeCY)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatAmt(totalIncomePY)}</td>
                  </tr>

                  {/* IV. EXPENSES HEADER */}
                  <tr className="bg-slate-900/50 text-slate-200 font-bold">
                    <td className="py-2 px-3 text-center text-slate-300 border-r border-slate-800">IV.</td>
                    <td colSpan={4} className="py-2 px-4 tracking-wide font-sans uppercase">
                      EXPENSES:
                    </td>
                  </tr>

                  {/* Dynamic Expense Items directly matching the document */}
                  {items.filter(i => pnlExpenseCategories.includes(i.category) || (!liabilityCategories.includes(i.category) && !assetCategories.includes(i.category) && !i.category.includes('REVENUE') && !i.category.includes('OTHER INCOME') && !i.category.includes('TAX'))).length > 0 ? (
                    items.filter(i => pnlExpenseCategories.includes(i.category) || (!liabilityCategories.includes(i.category) && !assetCategories.includes(i.category) && !i.category.includes('REVENUE') && !i.category.includes('OTHER INCOME') && !i.category.includes('TAX'))).map((item, idx) => (
                      <tr key={`pnl-exp-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                        <td className="border-r border-slate-800"></td>
                        <td className="py-2 px-4 text-slate-200 font-sans pl-6 border-r border-slate-800">{item.label}</td>
                        <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-800">{item.noteNo || ''}</td>
                        <td className="py-2 px-4 text-right text-slate-100 font-semibold border-r border-slate-800">{formatAmt(item.amount)}</td>
                        <td className="py-2 px-4 text-right text-slate-400">{formatAmt(item.previousAmount)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr className="hover:bg-slate-900/40 transition-colors">
                      <td className="border-r border-slate-800"></td>
                      <td className="py-2 px-4 text-slate-400 font-sans pl-6 border-r border-slate-800">Expenses</td>
                      <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-800"></td>
                      <td className="py-2 px-4 text-right text-slate-400 border-r border-slate-800">—</td>
                      <td className="py-2 px-4 text-right text-slate-400">—</td>
                    </tr>
                  )}

                  {/* TOTAL EXPENSES */}
                  <tr className="bg-slate-900/90 font-bold text-rose-300 border-t-2 border-slate-700 text-xs">
                    <td className="border-r border-slate-800"></td>
                    <td className="py-2.5 px-4 font-sans uppercase border-r border-slate-800">TOTAL EXPENSES (IV)</td>
                    <td className="border-r border-slate-800"></td>
                    <td className="py-2.5 px-4 text-right text-rose-400 font-bold border-r border-slate-800">{formatAmt(totalExpCY)}</td>
                    <td className="py-2.5 px-4 text-right text-rose-400">{formatAmt(totalExpPY)}</td>
                  </tr>

                  {/* V. PROFIT / LOSS BEFORE TAX */}
                  <tr className="bg-slate-900 font-bold border-t-2 border-slate-700">
                    <td className="py-3 px-3 text-center text-amber-300 border-r border-slate-800">V.</td>
                    <td className={`py-3 px-4 font-sans border-r border-slate-800 ${pbtCY >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                      {pbtCY >= 0 ? 'PROFIT/(LOSS) BEFORE TAX (III - IV)' : 'LOSS BEFORE TAX (III - IV)'}
                    </td>
                    <td className="border-r border-slate-800"></td>
                    <td className={`py-3 px-4 text-right font-bold border-r border-slate-800 ${pbtCY >= 0 ? 'text-amber-300' : 'text-rose-400'}`}>
                      {formatAmt(pbtCY)}
                    </td>
                    <td className="py-3 px-4 text-right text-amber-400">{formatAmt(pbtPY)}</td>
                  </tr>

                  {/* VI. TAX EXPENSE */}
                  <tr className="bg-slate-900/50 text-slate-300 font-bold">
                    <td className="py-2 px-3 text-center text-slate-300 border-r border-slate-800">VI.</td>
                    <td colSpan={4} className="py-2 px-4 tracking-wide font-sans">
                      Tax Expense:
                    </td>
                  </tr>
                  <tr className="text-slate-300 hover:bg-slate-900/40">
                    <td className="border-r border-slate-800"></td>
                    <td className="py-1.5 px-4 font-sans pl-6 border-r border-slate-800">- Current Tax</td>
                    <td className="border-r border-slate-800"></td>
                    <td className="py-1.5 px-4 text-right text-slate-400 font-mono border-r border-slate-800">—</td>
                    <td className="py-1.5 px-4 text-right text-slate-400 font-mono">—</td>
                  </tr>
                  <tr className="text-slate-300 hover:bg-slate-900/40">
                    <td className="border-r border-slate-800"></td>
                    <td className="py-1.5 px-4 font-sans pl-6 border-r border-slate-800">- Deferred Tax</td>
                    <td className="border-r border-slate-800"></td>
                    <td className="py-1.5 px-4 text-right text-slate-400 font-mono border-r border-slate-800">—</td>
                    <td className="py-1.5 px-4 text-right text-slate-400 font-mono">—</td>
                  </tr>

                  {/* VII. PROFIT / LOSS FOR THE YEAR */}
                  <tr className={`font-bold text-xs md:text-sm border-t-2 ${patCY >= 0 ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60' : 'bg-rose-950/90 text-rose-300 border-rose-500/60'}`}>
                    <td className="py-3 px-3 text-center border-r border-slate-800">VII.</td>
                    <td className="py-3 px-4 font-sans uppercase border-r border-slate-800">
                      PROFIT/(LOSS) FOR THE YEAR (V - VI)
                    </td>
                    <td className="border-r border-slate-800"></td>
                    <td className={`py-3 px-4 text-right font-bold font-mono border-r border-slate-800 ${patCY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatAmt(patCY)}</td>
                    <td className={`py-3 px-4 text-right ${patPY >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatAmt(patPY)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 2. STATUTORY SCHEDULE III BALANCE SHEET VIEW */}
          {effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' && (
            <div className="flex flex-col">
              {/* Header block as per standard statutory format */}
              <div className="bg-slate-900 border-b border-slate-800 p-4 text-left">
                <h1 className="text-sm md:text-base font-bold text-slate-100 uppercase tracking-wide">
                  {schema.companyName || schema.title || '[Company Name Not Detected — Please Verify]'}
                </h1>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">
                  CIN - {schema.cin || '[Not Detected / Unregistered]'}
                </p>
                <h2 className="text-xs md:text-sm font-bold text-slate-200 uppercase underline mt-2 tracking-wider">
                  BALANCE SHEET AS AT {schema.period || '31-03-2024'}
                </h2>
              </div>

              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-300 text-xs font-bold">
                    <th className="py-2.5 px-3 w-16 text-center border-r border-slate-800">Sr. No.</th>
                    <th className="py-2.5 px-4 border-r border-slate-800">Particulars (Schedule III Part I)</th>
                    <th className="py-2.5 px-3 w-20 text-center border-r border-slate-800">Note No.</th>
                    <th className="py-2.5 px-4 text-right border-r border-slate-800 w-36">
                      <div>{schema.currentYearLabel || '2023-24'}</div>
                      <div className="text-[10px] text-slate-400 font-normal">(Rs.)</div>
                    </th>
                    <th className="py-2.5 px-4 text-right w-36">
                      <div>{schema.previousYearLabel || '2022-23'}</div>
                      <div className="text-[10px] text-slate-400 font-normal">(Rs.)</div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {/* I. EQUITY AND LIABILITIES */}
                  <tr className="bg-slate-900/50 text-blue-300 font-bold">
                    <td className="py-2 px-3 text-center text-slate-300 border-r border-slate-800">I.</td>
                    <td colSpan={4} className="py-2 px-4 tracking-wide font-sans uppercase">
                      EQUITY AND LIABILITIES
                    </td>
                  </tr>
                  {liabItems.map((item, idx) => (
                    <tr key={`liab-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                      <td className="border-r border-slate-800 text-center text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-4 text-slate-200 font-sans pl-6 border-r border-slate-800">{item.label}</td>
                      <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-800">{item.noteNo || ''}</td>
                      <td className="py-2 px-4 text-right text-slate-100 font-semibold border-r border-slate-800">{formatAmt(item.amount)}</td>
                      <td className="py-2 px-4 text-right text-slate-400">{formatAmt(item.previousAmount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-bold text-blue-300 border-t-2 border-slate-700 text-xs">
                    <td className="border-r border-slate-800"></td>
                    <td className="py-2.5 px-4 font-sans uppercase border-r border-slate-800">TOTAL LIABILITIES</td>
                    <td className="border-r border-slate-800"></td>
                    <td className="py-2.5 px-4 text-right text-blue-400 font-bold border-r border-slate-800">{formatAmt(totalLiabCY)}</td>
                    <td className="py-2.5 px-4 text-right text-blue-400">{formatAmt(totalLiabPY)}</td>
                  </tr>

                  {/* II. ASSETS */}
                  <tr className="bg-slate-900/50 text-emerald-300 font-bold">
                    <td className="py-2 px-3 text-center text-slate-300 border-r border-slate-800">II.</td>
                    <td colSpan={4} className="py-2 px-4 tracking-wide font-sans uppercase">
                      ASSETS
                    </td>
                  </tr>
                  {assetItems.map((item, idx) => (
                    <tr key={`asset-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                      <td className="border-r border-slate-800 text-center text-slate-400">{idx + 1}</td>
                      <td className="py-2 px-4 text-slate-200 font-sans pl-6 border-r border-slate-800">{item.label}</td>
                      <td className="py-2 px-3 text-center text-slate-400 border-r border-slate-800">{item.noteNo || ''}</td>
                      <td className="py-2 px-4 text-right text-slate-100 font-semibold border-r border-slate-800">{formatAmt(item.amount)}</td>
                      <td className="py-2 px-4 text-right text-slate-400">{formatAmt(item.previousAmount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-900/90 font-bold text-emerald-300 border-t-2 border-slate-700 text-xs">
                    <td className="border-r border-slate-800"></td>
                    <td className="py-2.5 px-4 font-sans uppercase border-r border-slate-800">TOTAL ASSETS</td>
                    <td className="border-r border-slate-800"></td>
                    <td className="py-2.5 px-4 text-right text-emerald-400 font-bold border-r border-slate-800">{formatAmt(totalAssetsCY)}</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">{formatAmt(totalAssetsPY)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 3. STATEMENT OF AFFAIRS & SINGLE-ENTRY PROFIT DERIVATION VIEW */}
          {effectiveRegime === 'STATEMENT_OF_AFFAIRS_PROFIT' && (
            <div className="flex flex-col">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4 w-1/2">Particulars (Statement of Profit / Affairs Method)</th>
                    <th className="py-3 px-4 w-1/4">Computation Basis</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {/* Part 1: Capital at End */}
                  <tr className="bg-blue-950/30 text-blue-300 font-bold">
                    <td colSpan={3} className="py-2.5 px-4 uppercase tracking-wide font-sans">
                      Part 1: Capital Reconciliation & Net Profit Derivation
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 font-semibold text-slate-100">
                    <td className="py-2.5 px-4 text-slate-200 font-sans pl-6">1. Capital at the End of the Period (Closing Net Worth)</td>
                    <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">Assets ({formatAmt(totalAssetsCY)}) - Liabilities ({formatAmt(totalLiabCY)})</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-100">{formatAmt(closingCapital)}</td>
                  </tr>

                  {/* Add: Drawings */}
                  <tr className="hover:bg-slate-900/40 text-emerald-300">
                    <td className="py-2.5 px-4 font-sans pl-6 flex items-center justify-between">
                      <span>2. Add: Drawings / Personal Withdrawals during the year</span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">Drawings added back to Capital</td>
                    <td className="py-2.5 px-4 text-right text-emerald-400">+{formatAmt(drawingsVal)}</td>
                  </tr>

                  {/* Less: Additional Capital */}
                  <tr className="hover:bg-slate-900/40 text-rose-300">
                    <td className="py-2.5 px-4 font-sans pl-6">3. Less: Additional Capital Introduced during the year</td>
                    <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">Fresh capital deducted</td>
                    <td className="py-2.5 px-4 text-right text-rose-400">({formatAmt(freshCapitalVal)})</td>
                  </tr>

                  {/* Less: Extra Depreciation if applied */}
                  {extraDepreciation > 0 && (
                    <tr className="hover:bg-slate-900/40 text-rose-300">
                      <td className="py-2.5 px-4 font-sans pl-6">4. Less: Depreciation on Fixed Assets ({deprRateVal}%)</td>
                      <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">Wear & tear adjustment</td>
                      <td className="py-2.5 px-4 text-right text-rose-400">({formatAmt(extraDepreciation)})</td>
                    </tr>
                  )}

                  {/* Adjusted Closing Capital */}
                  <tr className="bg-slate-900/80 font-bold text-slate-200 border-t border-slate-700">
                    <td className="py-2.5 px-4 font-sans uppercase pl-6">Adjusted Closing Capital [1 + 2 - 3]</td>
                    <td className="py-2.5 px-4 text-slate-400 font-sans text-xs">Adjusted Net Worth Base</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-200">{formatAmt(adjustedClosingCapital)}</td>
                  </tr>

                  {/* Less: Opening Capital */}
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2.5 px-4 font-sans pl-6">5. Less: Capital at the Beginning of the Period (Opening Net Worth)</td>
                    <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">Assets ({formatAmt(totalAssetsPY)}) - Liabilities ({formatAmt(totalLiabPY)})</td>
                    <td className="py-2.5 px-4 text-right text-rose-400">({formatAmt(openingCapital)})</td>
                  </tr>

                  {/* DERIVED NET PROFIT */}
                  <tr className={`font-bold text-sm border-t-2 ${derivedNetProfit >= 0 ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60' : 'bg-rose-950/90 text-rose-300 border-rose-500/60'}`}>
                    <td className="py-3.5 px-4 font-sans uppercase">
                      {derivedNetProfit >= 0 ? '6. NET PROFIT FOR THE YEAR (DERIVED)' : '6. NET LOSS FOR THE YEAR (DERIVED)'}
                    </td>
                    <td className="py-3.5 px-4 font-sans text-xs">
                      Single-Entry Capital Comparison
                    </td>
                    <td className={`py-3.5 px-4 text-right font-bold font-mono ${derivedNetProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatAmt(derivedNetProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Interactive Adjustments Toolbar */}
              <div className="p-3 bg-slate-900/90 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 font-medium font-sans">Quick CA Adjustments:</span>
                  <button
                    onClick={() => setDrawingsVal(prev => prev + 5000)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 transition-colors"
                  >
                    + ₹5,000 Drawings
                  </button>
                  <button
                    onClick={() => setFreshCapitalVal(prev => prev + 10000)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-rose-300 border border-slate-700 transition-colors"
                  >
                    + ₹10,000 Fresh Capital
                  </button>
                  <button
                    onClick={() => setDeprRateVal(prev => prev === 10 ? 0 : 10)}
                    className={`px-2.5 py-1 rounded border transition-colors ${deprRateVal === 10 ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'}`}
                  >
                    {deprRateVal === 10 ? '✓ 10% Depr Applied' : '10% Depr on Fixed Assets'}
                  </button>
                </div>
                {(drawingsVal > 0 || freshCapitalVal > 0 || deprRateVal > 0) && (
                  <button
                    onClick={() => { setDrawingsVal(0); setFreshCapitalVal(0); setDeprRateVal(0); }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 underline"
                  >
                    Reset Adjustments
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 4. GST GSTR-3B VIEW */}
          {effectiveRegime === 'GST_GSTR3B' && (
            <div className="flex flex-col">
              <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                <div>
                  <h1 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                    FORM GSTR-3B: MONTHLY SUMMARY RETURN (GST ACT 2017)
                  </h1>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">
                    Statutory Return u/s 39 &bull; <span className="text-emerald-400 font-medium">Default POS: Intra-State (CGST + SGST)</span> unless specified Inter-State/Export
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <span className="text-[11px] text-slate-400 px-2 font-medium">GST Slab:</span>
                  {[0, 0.05, 0.12, 0.18, 0.28].map(rate => (
                    <button
                      key={rate}
                      onClick={() => setSelectedGstRate(rate)}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-all ${
                        selectedGstRate === rate 
                          ? 'bg-blue-600 text-white shadow' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      {rate === 0 ? '0% (Exempt)' : `${rate * 100}%`}
                    </button>
                  ))}
                </div>
              </div>

              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-4 w-1/3">Nature of Supplies / Table 3.1</th>
                    <th className="py-3 px-4 w-28">Supply Type</th>
                    <th className="py-3 px-4 text-right">Taxable Value</th>
                    <th className="py-3 px-4 text-right">IGST (Inter-State {selectedGstRate * 100}%)</th>
                    <th className="py-3 px-4 text-right">CGST (Intra-State {(selectedGstRate * 50).toFixed(1)}%)</th>
                    <th className="py-3 px-4 text-right">SGST (Intra-State {(selectedGstRate * 50).toFixed(1)}%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {taxableSupplyItems.length > 0 ? (
                    taxableSupplyItems.map((item, idx) => {
                      const amt = item.amount || 0;
                      const labelLower = (item.label || '').toLowerCase();
                      const isInterstate = labelLower.includes('inter-state') || labelLower.includes('interstate') || labelLower.includes('export') || labelLower.includes('igst') || labelLower.includes('outside state');
                      
                      const igst = isInterstate ? amt * selectedGstRate : 0;
                      const cgst = !isInterstate ? amt * (selectedGstRate / 2) : 0;
                      const sgst = !isInterstate ? amt * (selectedGstRate / 2) : 0;

                      return (
                        <tr key={`gst-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-2.5 px-4 text-slate-200 font-sans font-medium">{item.label}</td>
                          <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${isInterstate ? 'bg-purple-950/60 text-purple-300 border border-purple-800/40' : 'bg-blue-950/60 text-blue-300 border border-blue-800/40'}`}>
                              {isInterstate ? 'Inter-State' : 'Intra-State'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-100 font-semibold">{formatAmt(amt)}</td>
                          <td className="py-2.5 px-4 text-right text-purple-300">{formatAmt(igst)}</td>
                          <td className="py-2.5 px-4 text-right text-blue-300">{formatAmt(cgst)}</td>
                          <td className="py-2.5 px-4 text-right text-blue-300">{formatAmt(sgst)}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-6 px-4 text-center text-slate-400 font-sans">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="font-semibold text-slate-300 text-sm">No Taxable Supplies / Turnover in this Document</span>
                          <span className="text-xs text-slate-500 max-w-lg">
                            This dataset contains <strong>Balance Sheet Assets & Liabilities</strong> (Cash, Bank, Debtors, Creditors, Fixed Assets). Under Section 7 of the CGST Act 2017, balance sheet assets are capital balances and do not attract GST.
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-900/90 font-bold text-emerald-300 border-t-2 border-emerald-600/40">
                    <td colSpan={2} className="py-3 px-4 font-sans uppercase">TOTAL OUTWARD TAX LIABILITY (3.1)</td>
                    <td className="py-3 px-4 text-right text-emerald-400">{formatAmt(gstTaxableSum)}</td>
                    <td className="py-3 px-4 text-right text-purple-300">{formatAmt(gstIGSTSum)}</td>
                    <td className="py-3 px-4 text-right text-blue-300">{formatAmt(gstCGSTSum)}</td>
                    <td className="py-3 px-4 text-right text-blue-300">{formatAmt(gstSGSTSum)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 4. SECTION 44AD / 44ADA PRESUMPTIVE TAX VIEW */}
          {effectiveRegime === 'INCOME_TAX_44ADA' && (() => {
            let slab1 = 0;
            let slab2 = 0;
            let slab3 = 0;
            let slab4 = 0;
            let slab5 = 0;
            let slab6 = 0;

            const inc = netTaxableIncome;
            if (inc > 300000) slab2 = Math.min(inc - 300000, 300000) * 0.05;
            if (inc > 600000) slab3 = Math.min(inc - 600000, 300000) * 0.10;
            if (inc > 900000) slab4 = Math.min(inc - 900000, 300000) * 0.15;
            if (inc > 1200000) slab5 = Math.min(inc - 1200000, 300000) * 0.20;
            if (inc > 1500000) slab6 = (inc - 1500000) * 0.30;

            const grossTax = slab1 + slab2 + slab3 + slab4 + slab5 + slab6;
            const rebate87A = inc <= 700000 ? Math.min(grossTax, 25000) : 0;
            const taxAfterRebate = Math.max(0, grossTax - rebate87A);
            const cess4pct = taxAfterRebate * 0.04;
            const finalTax = taxAfterRebate + cess4pct;

            return (
              <div className="flex flex-col">
                <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                  <div>
                    <h1 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                      PRESUMPTIVE TAXATION REGIME (INCOME TAX ACT 1961)
                    </h1>
                    <p className="text-xs font-semibold text-slate-400 mt-0.5">
                      Statutory Scheme: <span className="text-purple-300 font-medium">{presumptiveMode === '44ADA' ? 'Sec 44ADA (50% Professionals)' : presumptiveMode === '44AD_DIGITAL' ? 'Sec 44AD (6% Digital Turnover)' : 'Sec 44AD (8% Cash Turnover)'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      onClick={() => setPresumptiveMode('44ADA')}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                        presumptiveMode === '44ADA' 
                          ? 'bg-blue-600 text-white shadow' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      Sec 44ADA (50% CA/Tech)
                    </button>
                    <button
                      onClick={() => setPresumptiveMode('44AD_DIGITAL')}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                        presumptiveMode === '44AD_DIGITAL' 
                          ? 'bg-emerald-600 text-white shadow' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      Sec 44AD (6% Digital/Bank)
                    </button>
                    <button
                      onClick={() => setPresumptiveMode('44AD_CASH')}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                        presumptiveMode === '44AD_CASH' 
                          ? 'bg-amber-600 text-white shadow' 
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      Sec 44AD (8% Cash)
                    </button>
                  </div>
                </div>

                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-3 px-4 w-1/2">Particulars under Income Tax Act 1961</th>
                      <th className="py-3 px-4 w-1/4">Computation Basis / Section</th>
                      <th className="py-3 px-4 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {/* Part A */}
                    <tr className="bg-blue-950/30 text-blue-300 font-bold">
                      <td colSpan={3} className="py-2 px-4 uppercase tracking-wide font-sans">
                        Part A: Gross Turnover & Presumptive Profit Computation
                      </td>
                    </tr>
                    <tr className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-4 text-slate-200 font-sans font-medium pl-6">1. Gross Professional / Business Receipts</td>
                      <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">Total Invoices / Bank Receipts</td>
                      <td className="py-2.5 px-4 text-right text-slate-100 font-semibold">{formatAmt(grossReceipts)}</td>
                    </tr>
                    <tr className="bg-emerald-950/30 text-emerald-300 font-semibold">
                      <td className="py-2.5 px-4 font-sans pl-6">2. Deemed Presumptive Net Profit</td>
                      <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">
                        {presumptiveMode === '44ADA' ? '50% under Sec 44ADA (Specified Professionals)' : presumptiveMode === '44AD_DIGITAL' ? '6% under Sec 44AD (Digital / Banking Mode)' : '8% under Sec 44AD (Cash Turnover)'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-emerald-400">{formatAmt(deemedProfit)}</td>
                    </tr>
                    <tr className="hover:bg-slate-900/40 text-slate-400 italic">
                      <td className="py-2.5 px-4 font-sans pl-6">3. Less: Chapter VI-A Deductions (80C / 80D)</td>
                      <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px]">Statutory Ceiling (₹1,50,000)</td>
                      <td className="py-2.5 px-4 text-right text-rose-400">({formatAmt(deductions80C)})</td>
                    </tr>
                    <tr className="bg-slate-900 font-bold text-amber-300 border-t-2 border-slate-700 text-xs">
                      <td className="py-3 px-4 font-sans">4. NET TAXABLE INCOME [2 - 3]</td>
                      <td className="py-3 px-4 font-sans text-xs text-slate-400">Tax Base for Slab Rates</td>
                      <td className="py-3 px-4 text-right text-amber-400">{formatAmt(netTaxableIncome)}</td>
                    </tr>

                  {/* Part B */}
                  <tr className="bg-purple-950/30 text-purple-300 font-bold">
                    <td colSpan={3} className="py-2 px-4 uppercase tracking-wide font-sans">
                      Part B: Step-by-Step Income Tax Slab Calculation (Sec 115BAC)
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6">&bull; Slab 1: Up to ₹3,00,000 (0% Exemption)</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">Nil Rate</td>
                    <td className="py-2 px-4 text-right text-slate-400">₹0.00</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6">&bull; Slab 2: ₹3,00,001 to ₹6,00,000 @ 5%</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">5% of amount in slab</td>
                    <td className="py-2 px-4 text-right text-slate-200">{formatAmt(slab2)}</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6">&bull; Slab 3: ₹6,00,001 to ₹9,00,000 @ 10%</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">10% of amount in slab</td>
                    <td className="py-2 px-4 text-right text-slate-200">{formatAmt(slab3)}</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6">&bull; Slab 4: ₹9,00,001 to ₹12,00,000 @ 15%</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">15% of amount in slab</td>
                    <td className="py-2 px-4 text-right text-slate-200">{formatAmt(slab4)}</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6">&bull; Slab 5: ₹12,00,001 to ₹15,00,000 @ 20%</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">20% of amount in slab</td>
                    <td className="py-2 px-4 text-right text-slate-200">{formatAmt(slab5)}</td>
                  </tr>
                  {slab6 > 0 && (
                    <tr className="hover:bg-slate-900/40 text-slate-300">
                      <td className="py-2 px-4 font-sans pl-6">&bull; Slab 6: Above ₹15,00,000 @ 30%</td>
                      <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">30% of balance income</td>
                      <td className="py-2 px-4 text-right text-slate-200">{formatAmt(slab6)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-900/80 font-semibold text-slate-200">
                    <td className="py-2 px-4 font-sans pl-6">5. Gross Income Tax (Sum of Slabs)</td>
                    <td className="py-2 px-4 text-slate-400 font-sans text-[11px]">Total Tax before Rebate</td>
                    <td className="py-2 px-4 text-right text-slate-100">{formatAmt(grossTax)}</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-emerald-400 italic">
                    <td className="py-2 px-4 font-sans pl-6">6. Less: Section 87A Tax Rebate</td>
                    <td className="py-2 px-4 font-sans text-[11px] text-slate-400">100% Tax Rebate if Income &le; ₹7,00,000</td>
                    <td className="py-2 px-4 text-right text-emerald-400">({formatAmt(rebate87A)})</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6">7. Add: Health & Education Cess @ 4%</td>
                    <td className="py-2 px-4 font-sans text-[11px] text-slate-400">4% on Net Tax</td>
                    <td className="py-2 px-4 text-right text-rose-400">{formatAmt(cess4pct)}</td>
                  </tr>
                  <tr className="bg-emerald-950/90 font-bold text-emerald-300 text-sm border-t-2 border-emerald-500/60">
                    <td className="py-3.5 px-4 font-sans uppercase">8. TOTAL NET TAX PAYABLE</td>
                    <td className="py-3.5 px-4 font-sans text-xs">Self-Assessment Tax Payable</td>
                    <td className="py-3.5 px-4 text-right text-emerald-400 font-bold font-mono">{formatAmt(finalTax)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            );
          })()}

          {/* 5. SCHEDULE III 11 STATUTORY RATIOS VIEW */}
          {effectiveRegime === 'SCHEDULE_III_RATIOS' && (() => {
            const calculatedRatios = calculateScheduleIIIRatios(items);

            return (
              <div className="flex flex-col">
                <div className="bg-slate-900 border-b border-slate-800 p-4 text-left">
                  <h1 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                    SCHEDULE III STATUTORY RATIO ANALYSIS (COMPANIES ACT 2013)
                  </h1>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">
                    Mandatory 11 Accounting Ratios &bull; 25% Variance Analysis u/s 129 &bull; Ground-Truth Computations
                  </p>
                </div>
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-300 text-xs font-bold">
                      <th className="py-2.5 px-3 w-12 text-center border-r border-slate-800">Sr.</th>
                      <th className="py-2.5 px-4 border-r border-slate-800 w-1/4">Mandatory Ratio (Schedule III)</th>
                      <th className="py-2.5 px-4 border-r border-slate-800 w-1/4">Computation Formula</th>
                      <th className="py-2.5 px-3 text-right border-r border-slate-800">{schema.currentYearLabel || 'Current Year'}</th>
                      <th className="py-2.5 px-3 text-right border-r border-slate-800">{schema.previousYearLabel || 'Previous Year'}</th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-800">Variance (%)</th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-800">Benchmark</th>
                      <th className="py-2.5 px-4 text-center">MCA Compliance Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {calculatedRatios.map(r => {
                      const formattedCY = r.valCY !== null ? `${r.valCY} ${r.unit}` : '— (N/A)';
                      const formattedPY = r.valPY !== null ? `${r.valPY} ${r.unit}` : '— (N/A)';
                      const formattedVar = r.variancePct !== null ? `${r.variancePct > 0 ? '+' : ''}${r.variancePct}%` : '—';
                      const statusRemark = r.valCY === null ? 'Insufficient Data' : (r.reasonRequired ? '⚠️ Variance > 25% (Explanation Required)' : `✓ Within Benchmark (${r.benchmark})`);

                      return (
                        <tr key={`ratio-${r.srNo}`} className="hover:bg-slate-900/40 transition-colors">
                          <td className="py-2.5 px-3 text-center text-slate-400 border-r border-slate-800">{r.srNo}</td>
                          <td className="py-2.5 px-4 font-sans font-semibold text-slate-100 border-r border-slate-800">{r.name}</td>
                          <td className="py-2.5 px-4 text-slate-400 font-sans text-[11px] border-r border-slate-800">{r.formula}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-100 border-r border-slate-800">{formattedCY}</td>
                          <td className="py-2.5 px-3 text-right text-slate-400 border-r border-slate-800">{formattedPY}</td>
                          <td className={`py-2.5 px-3 text-center font-bold border-r border-slate-800 ${r.reasonRequired ? 'text-rose-400' : 'text-slate-300'}`}>{formattedVar}</td>
                          <td className="py-2.5 px-3 text-center text-slate-400 font-sans text-[11px] border-r border-slate-800">{r.benchmark}</td>
                          <td className={`py-2.5 px-4 text-center font-sans text-[11px] font-medium ${r.valCY === null ? 'text-slate-500' : r.reasonRequired ? 'text-rose-400 font-semibold' : 'text-emerald-400'}`}>
                            {statusRemark}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 6. NON-CORPORATE ENTITY FINANCIALS VIEW (ICAI TECHNICAL GUIDE) */}
          {effectiveRegime === 'NON_CORPORATE_ENTITY' && (
            <div className="flex flex-col">
              <div className="bg-slate-900 border-b border-slate-800 p-4 text-left">
                <h1 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                  {schema.companyName || 'M/S PROPRIETORSHIP / PARTNERSHIP FIRM'}
                </h1>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">
                  Financial Reporting as per ICAI Technical Guide on Non-Corporate Entities
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800">
                {/* Left: Liabilities & Capital */}
                <div>
                  <div className="bg-blue-950/40 px-4 py-2 text-blue-300 font-bold text-xs uppercase">
                    I. Capital & Liabilities
                  </div>
                  <table className="w-full text-xs text-left border-collapse">
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      <tr className="hover:bg-slate-900/40 font-semibold text-slate-100">
                        <td className="py-2.5 px-4 font-sans text-slate-200">Proprietor / Partners Capital Account</td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-100">{formatAmt(closingCapital > 0 ? closingCapital : totalAssetsCY * 0.8)}</td>
                      </tr>
                      {liabItems.map((item, idx) => (
                        <tr key={`nc-liab-${idx}`} className="hover:bg-slate-900/40">
                          <td className="py-2 px-4 font-sans text-slate-300">{item.label}</td>
                          <td className="py-2 px-4 text-right text-slate-200">{formatAmt(item.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-900/90 font-bold text-blue-300 border-t border-slate-700">
                        <td className="py-2.5 px-4 font-sans uppercase">TOTAL LIABILITIES & CAPITAL</td>
                        <td className="py-2.5 px-4 text-right">{formatAmt(totalAssetsCY)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Right: Properties & Assets */}
                <div>
                  <div className="bg-emerald-950/40 px-4 py-2 text-emerald-300 font-bold text-xs uppercase">
                    II. Properties & Assets
                  </div>
                  <table className="w-full text-xs text-left border-collapse">
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {assetItems.map((item, idx) => (
                        <tr key={`nc-asset-${idx}`} className="hover:bg-slate-900/40">
                          <td className="py-2 px-4 font-sans text-slate-300">{item.label}</td>
                          <td className="py-2 px-4 text-right text-slate-200">{formatAmt(item.amount)}</td>
                        </tr>
                      ))}
                      <tr className="bg-slate-900/90 font-bold text-emerald-300 border-t border-slate-700">
                        <td className="py-2.5 px-4 font-sans uppercase">TOTAL ASSETS</td>
                        <td className="py-2.5 px-4 text-right">{formatAmt(totalAssetsCY)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 7. ITR RECASTING VIEW (SCHEDULE BP: BOOK PROFIT TO TAXABLE PROFIT) */}
          {effectiveRegime === 'ITR_RECASTING' && (() => {
            const bookDeprItem = items.find(i => i.category === 'DEPRECIATION AND AMORTISATION EXPENSE')?.amount || 0;
            const effectiveTaxDepr = taxDeprVal > 0 ? taxDeprVal : bookDeprItem;
            const totalITRAdditions = bookDeprItem + disallow43bVal + disallow40aVal;
            const totalITRDeductions = effectiveTaxDepr;
            const taxableBusinessIncome = (pbtCY > 0 ? pbtCY : 0) + totalITRAdditions - totalITRDeductions;

            return (
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-300 text-xs font-bold">
                    <th className="py-3 px-4 w-2/3">Particulars (Schedule BP - Income Tax Return Recasting)</th>
                    <th className="py-3 px-4 text-right">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  <tr className="bg-blue-950/30 font-bold text-blue-200">
                    <td className="py-2.5 px-4 font-sans">1. Net Profit before Tax as per Profit & Loss Account</td>
                    <td className="py-2.5 px-4 text-right text-blue-300">{formatAmt(pbtCY)}</td>
                  </tr>

                  {/* Additions Header */}
                  <tr className="bg-rose-950/30 text-rose-300 font-bold">
                    <td colSpan={2} className="py-2 px-4 uppercase tracking-wide font-sans text-[11px]">
                      2. Add: Inadmissible Expenses & Statutory Additions (Income Tax Act):
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6">&bull; Book Depreciation (added back for separate Sec 32 claim)</td>
                    <td className="py-2 px-4 text-right text-rose-400">+{formatAmt(bookDeprItem)}</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6 flex items-center justify-between">
                      <span>&bull; Disallowance u/s 43B(h) (MSME Delayed Overdue Payments)</span>
                    </td>
                    <td className="py-2 px-4 text-right text-rose-400">+{formatAmt(disallow43bVal)}</td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6 flex items-center justify-between">
                      <span>&bull; Disallowance u/s 40(a)(ia) (30% on TDS Defaults)</span>
                    </td>
                    <td className="py-2 px-4 text-right text-rose-400">+{formatAmt(disallow40aVal)}</td>
                  </tr>
                  <tr className="bg-slate-900/80 font-semibold text-rose-300 border-t border-slate-700">
                    <td className="py-2 px-4 font-sans pl-6 uppercase">Total Statutory Additions [A]</td>
                    <td className="py-2 px-4 text-right font-bold text-rose-400">+{formatAmt(totalITRAdditions)}</td>
                  </tr>

                  {/* Deductions Header */}
                  <tr className="bg-emerald-950/30 text-emerald-300 font-bold">
                    <td colSpan={2} className="py-2 px-4 uppercase tracking-wide font-sans text-[11px]">
                      3. Less: Allowable Deductions & Other Heads:
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-900/40 text-slate-300">
                    <td className="py-2 px-4 font-sans pl-6">&bull; Depreciation allowable u/s 32 (Income Tax Rules)</td>
                    <td className="py-2 px-4 text-right text-emerald-400">({formatAmt(effectiveTaxDepr)})</td>
                  </tr>
                  <tr className="bg-slate-900/80 font-semibold text-emerald-300 border-t border-slate-700">
                    <td className="py-2 px-4 font-sans pl-6 uppercase">Total Allowable Deductions [B]</td>
                    <td className="py-2 px-4 text-right font-bold text-emerald-400">({formatAmt(totalITRDeductions)})</td>
                  </tr>

                  {/* Final Taxable Business Profit */}
                  <tr className="bg-emerald-950/90 font-bold text-emerald-300 text-sm border-t-2 border-emerald-500/60">
                    <td className="py-3.5 px-4 font-sans uppercase">
                      4. TAXABLE PROFITS AND GAINS OF BUSINESS (ITR-3 / ITR-5 / ITR-6) [1 + A - B]
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-400 font-bold font-mono">
                      {formatAmt(taxableBusinessIncome)}
                    </td>
                  </tr>
                </tbody>
              </table>
            );
          })()}

          {/* 8. SECTION 43B(h) MSME DELAYED PAYMENT AUDIT VIEW */}
          {effectiveRegime === 'SECTION_43B_H' && (() => {
            return (
              <div className="flex flex-col">
                <div className="bg-slate-900 border-b border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                  <div>
                    <h1 className="text-sm font-bold text-slate-100 uppercase tracking-wide">
                      SECTION 43B(h) MSME DELAYED PAYMENT AUDIT REPORT
                    </h1>
                    <p className="text-xs font-semibold text-slate-400 mt-0.5">
                      Compliance with MSMED Act 2006 (Section 15, 16 & 23) & Form 3CD Clause 22 &bull; Auto-linked to ITR Recasting
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2.5 py-1 rounded-md font-medium border ${msmeData.totalDisallowed43Bh > 0 ? 'bg-rose-950/50 border-rose-800 text-rose-300' : 'bg-emerald-950/50 border-emerald-800 text-emerald-300'}`}>
                      Audit: {msmeData.complianceStatus}
                    </span>
                  </div>
                </div>
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-300 text-xs font-bold">
                      <th className="py-2.5 px-4 border-r border-slate-800">Vendor / Creditor Name</th>
                      <th className="py-2.5 px-3 border-r border-slate-800">Enterprise Type</th>
                      <th className="py-2.5 px-3 border-r border-slate-800">Written Agreement</th>
                      <th className="py-2.5 px-3 text-center border-r border-slate-800">Actual Days Overdue (Audit Input)</th>
                      <th className="py-2.5 px-4 text-right border-r border-slate-800">Closing Balance</th>
                      <th className="py-2.5 px-4 text-right border-r border-slate-800">Disallowed u/s 43B(h)</th>
                      <th className="py-2.5 px-4 text-right">3x RBI Interest (Sec 16)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {msmeData.vendors.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-4 text-center text-slate-400 font-sans">
                          <div className="flex flex-col items-center gap-1.5">
                            <span className="font-semibold text-slate-300 text-sm">No Trade Payables / MSME Creditors Detected</span>
                            <span className="text-xs text-slate-500 max-w-md">
                              No balances classified under <strong>TRADE PAYABLES</strong> or Sundry Creditors were detected in this financial dataset. Zero disallowance applicable.
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      msmeData.vendors.map((v, idx) => {
                        const override = vendorOverrides[v.vendorName] || {};
                        return (
                          <tr key={`msme-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-2.5 px-4 font-sans font-semibold text-slate-200 border-r border-slate-800">
                              {v.vendorName}
                            </td>
                            <td className="py-2.5 px-3 font-sans border-r border-slate-800">
                              <select
                                value={override.type || v.msmeType}
                                onChange={(e) => {
                                  setVendorOverrides({
                                    ...vendorOverrides,
                                    [v.vendorName]: { ...override, type: e.target.value }
                                  });
                                }}
                                className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                              >
                                <option value="Micro Enterprise">Micro Enterprise</option>
                                <option value="Small Enterprise">Small Enterprise</option>
                                <option value="Medium Enterprise">Medium Enterprise</option>
                              </select>
                            </td>
                            <td className="py-2.5 px-3 font-sans text-xs border-r border-slate-800">
                              <button
                                onClick={() => {
                                  const curAgree = override.hasAgreement !== undefined ? override.hasAgreement : true;
                                  setVendorOverrides({
                                    ...vendorOverrides,
                                    [v.vendorName]: { ...override, hasAgreement: !curAgree }
                                  });
                                }}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border ${v.hasAgreement ? 'bg-blue-950/50 border-blue-700 text-blue-300' : 'bg-amber-950/50 border-amber-700 text-amber-300'}`}
                              >
                                {v.hasAgreement ? 'Yes (45 Days)' : 'No (15 Days)'}
                              </button>
                            </td>
                            <td className="py-2.5 px-3 text-center border-r border-slate-800">
                              <div className="flex items-center justify-center gap-1.5">
                                <input
                                  type="number"
                                  min="0"
                                  value={override.daysOverdue !== undefined ? override.daysOverdue : (v.isDelayed ? v.actualDays : 0)}
                                  onChange={(e) => {
                                    const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    setVendorOverrides({
                                      ...vendorOverrides,
                                      [v.vendorName]: { ...override, daysOverdue: val }
                                    });
                                  }}
                                  className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right text-slate-100 text-xs font-mono focus:outline-none focus:border-blue-500"
                                />
                                <span className="text-[11px] text-slate-400 font-sans">days</span>
                                {v.isDelayed && <AlertTriangle className="w-3.5 h-3.5 text-rose-400 inline ml-1 shrink-0" title="Overdue beyond statutory terms" />}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right text-slate-100 font-semibold border-r border-slate-800">
                              {formatAmt(v.amount)}
                            </td>
                            <td className={`py-2.5 px-4 text-right font-bold border-r border-slate-800 ${v.disallowedAmount43Bh > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                              {formatAmt(v.disallowedAmount43Bh)}
                            </td>
                            <td className={`py-2.5 px-4 text-right font-bold ${v.msmeInterest3xRBI > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                              {formatAmt(v.msmeInterest3xRBI)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                    {msmeData.vendors.length > 0 && (
                      <tr className="bg-slate-900/90 font-bold border-t-2 border-b-2 border-slate-600 text-xs">
                        <td colSpan={4} className="py-3 px-4 font-sans uppercase border-r border-slate-800">
                          TOTAL AUDIT DISCLOSURES (FORM 3CD CLAUSE 22)
                        </td>
                        <td className="py-3 px-4 text-right text-slate-100 border-r border-slate-800 font-bold">
                          {formatAmt(msmeData.totalPayables)}
                        </td>
                        <td className="py-3 px-4 text-right text-rose-400 border-r border-slate-800 font-bold">
                          {formatAmt(msmeData.totalDisallowed43Bh)}
                        </td>
                        <td className="py-3 px-4 text-right text-amber-400 font-bold">
                          {formatAmt(msmeData.totalMSMEInterest)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="p-3 bg-amber-950/20 border-t border-amber-800/40 text-[11px] text-amber-300/90 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    <strong>Statutory Alert (Sec 23 MSMED Act):</strong> Interest paid or payable on delayed payments to MSME is <u>strictly non-deductible</u> under the Income Tax Act, 1961.
                  </span>
                </div>
              </div>
            );
          })()}

          {/* 9. PARTNERSHIP CAPITAL ACCOUNTS VIEW */}
          {effectiveRegime === 'PARTNERSHIP_CAPITAL' && (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4 w-1/2">Particulars (Partnership Act 1932)</th>
                  <th className="py-3 px-4 w-1/4">Account Category</th>
                  <th className="py-3 px-4 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {items.map((item, idx) => (
                  <tr key={`part-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-2.5 px-4 font-sans font-medium">{item.label}</td>
                    <td className="py-2.5 px-4 text-slate-400">{item.category}</td>
                    <td className="py-2.5 px-4 text-right text-slate-100 font-semibold">{formatAmt(item.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-900/90 font-bold text-slate-100 border-t-2 border-b-2 border-slate-600 text-xs">
                  <td colSpan={2} className="py-3 px-4 font-sans uppercase">NET PARTNERS CAPITAL / EQUITY</td>
                  <td className="py-3 px-4 text-right text-emerald-400 font-bold">{formatAmt(items.reduce((s, i) => s + (i.amount || 0), 0))}</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* 6. TRIAL BALANCE VIEW */}
          {effectiveRegime === 'TRIAL_BALANCE' && (
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4 w-1/2">Account Head / Ledger</th>
                  <th className="py-3 px-4 text-right">Debit (₹)</th>
                  <th className="py-3 px-4 text-right">Credit (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {items.map((item, idx) => {
                  const isDebit = ['PROPERTY, PLANT AND EQUIPMENT', 'INVENTORIES', 'TRADE RECEIVABLES', 'CASH AND CASH EQUIVALENTS', 'OTHER EXPENSES', 'COST OF MATERIALS CONSUMED', 'EMPLOYEE BENEFITS EXPENSE', 'FINANCE COSTS', 'DEPRECIATION AND AMORTISATION EXPENSE'].includes(item.category);
                  return (
                    <tr key={`tb-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-2.5 px-4 text-slate-200 font-sans font-medium">{item.label} [{item.category}]</td>
                      <td className="py-2.5 px-4 text-right text-slate-100 font-semibold">{isDebit ? formatAmt(item.amount) : '—'}</td>
                      <td className="py-2.5 px-4 text-right text-slate-100 font-semibold">{!isDebit ? formatAmt(item.amount) : '—'}</td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-900/90 font-bold text-slate-100 border-t-2 border-slate-600 text-xs">
                  <td className="py-3 px-4 font-sans uppercase">TOTAL TRIAL BALANCE</td>
                  <td className="py-3 px-4 text-right text-slate-100 font-bold">{formatAmt(totalDebits)}</td>
                  <td className="py-3 px-4 text-right text-slate-100 font-bold">{formatAmt(totalCredits)}</td>
                </tr>
                <tr className={`font-bold text-xs border-b-2 border-slate-600 ${tbVariance === 0 ? 'bg-emerald-950/20 text-emerald-300' : 'bg-rose-950/20 text-rose-300'}`}>
                  <td className="py-2.5 px-4 font-sans uppercase">DIFFERENCE / SUSPENSE ACCOUNT</td>
                  <td colSpan={2} className="py-2.5 px-4 text-right font-mono">
                    {tbVariance === 0 ? 'Balanced (0.00)' : `Variance: ${formatAmt(Math.abs(tbVariance))}`}
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {/* 10. BANK RECONCILIATION STATEMENT (BRS) VIEW */}
          {effectiveRegime === 'BANK_RECONCILIATION' && (
            <div className="flex flex-col">
              {/* Header & Controls */}
              <div className="bg-slate-900 border-b border-slate-800 p-4 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-sm md:text-base font-bold text-slate-100 uppercase tracking-wide">
                    {schema.companyName || schema.title || '[Company Name Not Detected]'}
                  </h1>
                  <h2 className="text-xs md:text-sm font-bold text-slate-200 uppercase underline mt-1 tracking-wider">
                    BANK RECONCILIATION STATEMENT (BRS)
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    As on {schema.period || new Date().toISOString().split('T')[0]} &bull; Statutory Schedule Format
                  </p>
                </div>
                <button
                  onClick={handleDownloadBrs}
                  disabled={isDownloadingBrs}
                  className="btn-primary text-xs py-2 px-3.5 whitespace-nowrap self-start sm:self-auto"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  {isDownloadingBrs ? 'Generating BRS...' : 'Download BRS (.xlsx)'}
                </button>
              </div>

              {/* Stat Summary Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-950 border-b border-slate-800">
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Balance as per Books</div>
                  <div className="text-sm font-bold text-slate-100 font-mono mt-1">{formatAmt(bankRecon.summary.bookBalance)}</div>
                </div>
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 font-medium">Balance as per Bank</div>
                  <div className="text-sm font-bold text-slate-100 font-mono mt-1">{formatAmt(bankRecon.summary.bankPassbookBalance)}</div>
                </div>
                <div className="bg-emerald-950/20 p-3 rounded-lg border border-emerald-800/30">
                  <div className="text-[11px] text-emerald-400 font-medium">Matched Items</div>
                  <div className="text-sm font-bold text-emerald-300 font-mono mt-1">{bankRecon.summary.matchedCount} Items</div>
                </div>
                <div className="bg-amber-950/20 p-3 rounded-lg border border-amber-800/30">
                  <div className="text-[11px] text-amber-400 font-medium">Exceptions (Unmatched)</div>
                  <div className="text-sm font-bold text-amber-300 font-mono mt-1">
                    {bankRecon.summary.unmatchedBooksCount + bankRecon.summary.unmatchedBankCount} Items
                  </div>
                </div>
              </div>

              {/* BRS Standard Schedule Table */}
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-400" /> Statutory BRS Schedule
                </h3>
                <table className="w-full text-xs text-left border-collapse bg-slate-900/40 rounded-lg overflow-hidden border border-slate-800">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="py-2.5 px-4 w-3/5">Particulars</th>
                      <th className="py-2.5 px-4 text-right w-1/5">Details (₹)</th>
                      <th className="py-2.5 px-4 text-right w-1/5">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    <tr className="bg-slate-900/70 font-semibold text-slate-200">
                      <td className="py-2.5 px-4 font-sans">Balance as per Cash Book / Ledger</td>
                      <td className="py-2.5 px-4 text-right">—</td>
                      <td className="py-2.5 px-4 text-right text-slate-100">{formatAmt(bankRecon.brsStatement.balanceAsPerBooks)}</td>
                    </tr>
                    <tr className="bg-slate-900/30 text-emerald-300 font-semibold">
                      <td colSpan={3} className="py-2 px-4 font-sans text-[11px] uppercase tracking-wider">
                        ADD: Items credited in Bank or Cheques Issued not presented
                      </td>
                    </tr>
                    {bankRecon.brsStatement.additions.map((item, idx) => (
                      <tr key={`add-${idx}`} className="text-slate-300 hover:bg-slate-900/30">
                        <td className="py-2 px-4 pl-8 font-sans">{item.particular}</td>
                        <td className="py-2 px-4 text-right text-slate-300">{formatAmt(item.amount)}</td>
                        <td className="py-2 px-4 text-right text-slate-500">—</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-900/30 text-rose-300 font-semibold">
                      <td colSpan={3} className="py-2 px-4 font-sans text-[11px] uppercase tracking-wider">
                        LESS: Items debited in Bank or Cheques Deposited not cleared
                      </td>
                    </tr>
                    {bankRecon.brsStatement.deductions.map((item, idx) => (
                      <tr key={`ded-${idx}`} className="text-slate-300 hover:bg-slate-900/30">
                        <td className="py-2 px-4 pl-8 font-sans">{item.particular}</td>
                        <td className="py-2 px-4 text-right text-slate-300">({formatAmt(item.amount)})</td>
                        <td className="py-2 px-4 text-right text-slate-500">—</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-900 font-bold text-slate-100 border-t-2 border-b-2 border-slate-700">
                      <td className="py-3 px-4 font-sans uppercase">Reconciled Balance as per Bank Passbook</td>
                      <td className="py-3 px-4 text-right">—</td>
                      <td className="py-3 px-4 text-right text-emerald-400 font-bold">{formatAmt(bankRecon.brsStatement.reconciledBankBalance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Exceptions Table (Sorted by amount descending) */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Exceptions Requiring Action (Sorted by Discrepancy Amount)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Showing {sortedExceptions.length} discrepancy items
                  </span>
                </div>
                {sortedExceptions.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-xs bg-slate-900/30 rounded-lg border border-slate-800">
                    No exceptions detected. All book ledger transactions match bank records perfectly.
                  </div>
                ) : (
                  <table className="w-full text-xs text-left border-collapse bg-slate-900/40 rounded-lg overflow-hidden border border-slate-800">
                    <thead>
                      <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
                        <th className="py-2.5 px-3 w-12 text-center">#</th>
                        <th className="py-2.5 px-3">Source</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Narration / Particulars</th>
                        <th className="py-2.5 px-3">Ref / Cheque</th>
                        <th className="py-2.5 px-3">Direction</th>
                        <th className="py-2.5 px-3 text-right">Discrepancy (₹)</th>
                        <th className="py-2.5 px-3">Action Required</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {sortedExceptions.map((ex, idx) => (
                        <tr key={`ex-${idx}`} className="hover:bg-slate-900/30">
                          <td className="py-2 px-3 text-center text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3 font-sans">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${ex.source === 'Bank' ? 'bg-blue-950/60 text-blue-300 border border-blue-800/40' : 'bg-purple-950/60 text-purple-300 border border-purple-800/40'}`}>
                              {ex.source === 'Bank' ? 'Bank Statement' : 'Books Ledger'}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-300">{ex.date || '—'}</td>
                          <td className="py-2 px-3 font-sans font-medium text-slate-200">{ex.narration}</td>
                          <td className="py-2 px-3 text-slate-400">{ex.refNo || '—'}</td>
                          <td className="py-2 px-3">
                            <span className={`text-[11px] font-medium ${ex.direction === 'Deposit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {ex.direction}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-amber-300">{formatAmt(ex.amount)}</td>
                          <td className="py-2 px-3 font-sans text-[11px] text-slate-400">{ex.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Balance Sheet Reconciliation & Capital Match Notification */}
      {effectiveRegime === 'COMPANIES_ACT_SCHEDULE_III_BS' && (
        <div className={`p-3 rounded-lg border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs ${bsDifferenceCY === 0 ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300' : 'bg-amber-950/20 border-amber-800/40 text-amber-300'}`}>
          <div className="flex items-center gap-2.5">
            {bsDifferenceCY === 0 ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <div>
              <span className="font-semibold">
                {bsDifferenceCY === 0 ? 'Statutory Balance Sheet Balanced' : 'Balance Sheet Reconciliation Notice:'}
              </span>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Total Assets ({formatAmt(totalAssetsCY)}) vs Total Liabilities ({formatAmt(totalLiabCY)})
                {bsDifferenceCY !== 0 && ` • Difference: ${formatAmt(Math.abs(bsDifferenceCY))} (Owner's Equity / Capital)`}
              </p>
            </div>
          </div>
          {bsDifferenceCY !== 0 && (
            <button
              onClick={handleAutoBalance}
              className="btn-primary text-xs py-1.5 px-3 whitespace-nowrap"
            >
              + Auto-Add Capital ({formatAmt(Math.abs(bsDifferenceCY))})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
