import React, { useState } from 'react';
import { 
  ClipboardCheck, ShieldAlert, ShieldCheck, AlertCircle, AlertTriangle, 
  CheckCircle2, Download, Sparkles, RefreshCw, FileSpreadsheet, 
  Search, ArrowRight, ExternalLink, Info, Check, Copy, Layers,
  Building2, Hash, Calendar, FileText, Scale, Lock, Eye, Server, Loader2
} from 'lucide-react';

export default function Form3cdView({ currentSchema, tdsReconResult, onNavigateToTds }) {
  const [report, setReport] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncingTally, setIsSyncingTally] = useState(false);
  const [activeTab, setActiveTab] = useState('summary'); 
  // 'summary' | 'clause13' | 'clause21' | 'clause26' | 'clause34' | 'honest_gaps' | 'json'
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState('');
  const [auditorOverrides, setAuditorOverrides] = useState({});

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  // 1. One-Click Demo Form 3CD Audit Generator
  const handleLoadDemoAudit = async () => {
    setIsGenerating(true);
    try {
      const demoSchema = {
        title: 'Surya Tech Solutions Private Limited',
        pan: 'AAACS1234F',
        tan: 'MUMA12345C',
        statusOfAssessee: 'Domestic Company (Private Limited)',
        assessmentYear: '2024-25',
        previousYear: '2023-24',
        methodOfAccounting: 'Mercantile System of Accounting',
        lineItems: [
          { label: 'Revenue from IT & Software Consulting', category: 'REVENUE FROM OPERATIONS', amount: 8500000, credit: 8500000 },
          { label: 'Cloud Infrastructure & AWS Hosting', category: 'COST OF MATERIALS CONSUMED', amount: 620000, debit: 620000 },
          
          // 1. Confirmed Cash Payment > 10k on normal working day -> 100% Disallowed u/s 40A(3)
          { 
            label: 'Office Interior Renovation - Cash Payment', 
            narration: 'Paid in cash against voucher #V-104',
            voucherNo: 'V-104',
            category: 'OTHER EXPENSES', 
            amount: 28000, 
            debit: 28000, 
            date: '2024-05-15', 
            partyName: 'Quick Civil Works' 
          },

          // 2. Rule 6DD(a): Bank payment > 10,000 in cash -> Exempt
          {
            label: 'HDFC Bank Term Loan Processing Charges',
            narration: 'Cash settlement of bank processing charges at branch counter',
            voucherNo: 'BNK-01',
            category: 'FINANCE COSTS',
            amount: 18500,
            debit: 18500,
            date: '2024-06-12',
            partyName: 'HDFC Bank Ltd'
          },

          // 3. Rule 6DD(b): Government statutory tax payment in cash -> Exempt
          {
            label: 'Advance Tax Treasury Challan Deposit (Cash)',
            narration: 'Paid in cash at bank treasury counter for advance tax challan 280',
            isCash: true,
            voucherNo: 'TAX-01',
            category: 'TAX EXPENSE',
            amount: 50000,
            debit: 50000,
            date: '2024-06-15',
            partyName: 'Income Tax Department (Government of India)'
          },

          // 4. Rule 6DD(e): Direct purchase from cultivator -> Exempt
          {
            label: 'Direct Agricultural Produce Purchase from Cultivator (Cash)',
            narration: 'Paid in cash for direct farm gate purchase of crops from cultivator',
            isCash: true,
            voucherNo: 'AGR-12',
            category: 'COST OF MATERIALS CONSUMED',
            amount: 42000,
            debit: 42000,
            date: '2024-07-20',
            partyName: 'Rameshwar Kisan (Cultivator)'
          },

          // 5. Rule 6DD(j): Cash payment on Sunday / Bank Holiday -> Exempt
          {
            label: 'Emergency Power Substation Repair on Sunday',
            narration: 'Emergency cash repair executed on Sunday when bank branches closed',
            isCash: true,
            voucherNo: 'SUN-01',
            category: 'REPAIRS AND MAINTENANCE',
            amount: 16000,
            debit: 16000,
            date: '2024-05-19', // 2024-05-19 is a Sunday
            partyName: 'Emergency Generator Services'
          },

          // 6. Aggregated expense without per-voucher detail -> Requires verification
          { 
            label: 'Office Sundry & Pantry Supplies (Aggregated)', 
            category: 'OTHER EXPENSES', 
            amount: 45000, 
            debit: 45000 
          },

          // 7. Transporter carriage charges within 35k limit
          { 
            label: 'Freight & Transporter Carriage Charges', 
            narration: 'Cash paid to lorry driver',
            voucherNo: 'LR-55',
            category: 'OTHER EXPENSES', 
            amount: 22000, 
            debit: 22000, 
            partyName: 'National Freight Logistics' 
          },

          // 8. Overdue MSME trade payables u/s 43B(h)
          { label: 'Sundry Creditors - Micro Tools Ltd (MSME overdue)', category: 'TRADE PAYABLES', amount: 150000, credit: 150000 },
          { label: 'GST Payable on Reverse Charge', category: 'OTHER CURRENT LIABILITIES', amount: 35000, credit: 35000 }
        ]
      };

      const demoTdsRecon = tdsReconResult || {
        summary: {
          totalMatchedTds: 10000,
          totalTdsMatched: 10000,
          totalUnmatchedBooksTds: 16560,
          totalUnmatchedSourceTds: 20000,
          shortDeductionCount: 1,
          totalLateFees234E: 7500,
          totalInterest201_1A: 2000
        },
        matched: [
          {
            deductorTAN: 'MUMB12345A',
            deductorName: 'Reliance Industries Ltd',
            section: '194C',
            amount: 10000,
            amountPaid: 500000,
            date: '2024-05-15'
          }
        ],
        unmatchedIn26AS: [
          {
            id: 'BK_UNM_1',
            type: 'PAYABLE',
            tan: 'PUNE55555C',
            deductorTAN: 'PUNE55555C',
            partyName: 'Design Studio Architects',
            section: '194J',
            amount: 16000,
            baseAmount: 160000,
            date: '2024-04-10',
            dueDate: '2024-05-07',
            penalties: {
              delayDays: 131,
              delayMonths: 5,
              fee234E: 7500,
              interest201_1A: 1200
            }
          },
          // Overlapping entry on Voucher V-104 (Quick Civil Works)
          // Demonstrates Anti-Double-Counting: Section 40A(3) 100% takes precedence, 30% 40(a)(ia) suppressed!
          {
            id: 'BK_UNM_OVERLAP',
            type: 'PAYABLE',
            voucherNo: 'V-104',
            tan: 'DELQ11111Z',
            deductorTAN: 'DELQ11111Z',
            partyName: 'Quick Civil Works',
            section: '194C',
            amount: 560,
            baseAmount: 28000,
            date: '2024-05-15',
            dueDate: '2024-06-07',
            penalties: {
              delayDays: 100,
              delayMonths: 4,
              fee234E: 560,
              interest201_1A: 34
            }
          }
        ],
        shortDeductions: [
          {
            id: 'BK_SHORT_1',
            tan: 'DELA98765B',
            deductorTAN: 'DELA98765B',
            partyName: 'Apex Advisory Services',
            section: '194J',
            actualRate: 2,
            mandatedRate: 10,
            actualTds: 4000,
            mandatedTds: 20000,
            shortfallAmount: 16000,
            baseAmount: 200000,
            delayMonths: 5,
            interest201_1A: 800,
            date: '2024-05-01',
            dueDate: '2024-06-07'
          }
        ],
        sectionMismatches: [],
        discrepancyReport: [
          {
            category: 'TDS_PAYABLE_NOT_DEPOSITED',
            severity: 'CRITICAL',
            title: 'TDS Deducted but not deposited u/s 194J',
            party: 'Design Studio Architects',
            tan: 'PUNE55555C',
            amount: 16000,
            penalty: 8700,
            action: 'Deposit immediately under Challan 281 with 201(1A) interest.'
          },
          {
            category: 'SHORT_DEDUCTION',
            severity: 'HIGH',
            title: 'Short deduction u/s 194J (deducted @ 2% vs mandated 10%)',
            party: 'Apex Advisory Services',
            tan: 'DELA98765B',
            amount: 16000,
            penalty: 800,
            action: 'Recover differential TDS and pay interest u/s 201(1A).'
          }
        ]
      };

      const res = await fetch('/api/form3cd/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: demoSchema,
          tdsReconResult: demoTdsRecon,
          auditorInputs: auditorOverrides
        })
      });

      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
        showToast('Form 3CD Tax Audit Statement generated successfully!');
      } else {
        alert('Error generating Form 3CD: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to generate Form 3CD: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 2. Generate from Active Session Financials + TDS Recon
  const handleGenerateFromSession = async () => {
    if (!currentSchema && !tdsReconResult) {
      alert('No active financial statement or TDS reconciliation data found. Click "Load Demo Audit Data" to test.');
      return;
    }

    setIsGenerating(true);
    try {
      const res = await fetch('/api/form3cd/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: currentSchema || {},
          tdsReconResult: tdsReconResult || null,
          auditorInputs: auditorOverrides
        })
      });

      const data = await res.json();
      if (data.success && data.report) {
        setReport(data.report);
        showToast('Form 3CD updated from active session data.');
      } else {
        alert('Error generating Form 3CD: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to generate Form 3CD: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // 3. Direct Tally XML Port Sync for Clause 21(d) & 26
  const handleSyncFromTally = async () => {
    setIsSyncingTally(true);
    try {
      const res = await fetch('/api/tally/sync-form3cd-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to sync Form 3CD data from Tally');
      }

      const existingItems = currentSchema?.lineItems || [];
      const tallyItems = data.lineItems || [];

      const mergedSchema = {
        title: currentSchema?.title || data.companyName || 'Tally Company Account (Tax Audit)',
        pan: currentSchema?.pan || data.pan || '',
        tan: currentSchema?.tan || data.tan || '',
        statusOfAssessee: currentSchema?.statusOfAssessee || 'Domestic Company',
        assessmentYear: currentSchema?.assessmentYear || '2024-25',
        previousYear: currentSchema?.previousYear || '2023-24',
        methodOfAccounting: currentSchema?.methodOfAccounting || 'Mercantile System of Accounting',
        lineItems: [...existingItems, ...tallyItems]
      };

      const genRes = await fetch('/api/form3cd/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schema: mergedSchema,
          tdsReconResult: tdsReconResult || undefined,
          auditorInputs: auditorOverrides
        })
      });

      const genData = await genRes.json();
      if (genData.success && genData.report) {
        setReport(genData.report);
        showToast(`Synced Cash Book (${data.cashBook?.count || 0}) & MSME Creditors (${data.sundryCreditors?.count || 0}) from Tally (${data.online ? 'Live Port 9000' : 'Simulated'})!`);
      } else {
        alert('Error generating Form 3CD: ' + (genData.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Tally Form 3CD Sync failed: ' + err.message);
    } finally {
      setIsSyncingTally(false);
    }
  };

  // Copy JSON to clipboard
  const handleCopyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    showToast('Form 3CD JSON copied to clipboard!');
  };

  // Format currency
  const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;

  const summary = report?.summary;
  const clauses = report?.clauses;
  const crossCheck = report?.crossReferenceAuditCheck;
  const honestGaps = report?.honestGaps || [];
  const remediations = report?.statutoryAuditRemediations || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-emerald-500/50 text-white px-4 py-3 rounded-lg shadow-2xl flex items-center gap-3 animate-fade-in text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Distinction & Context Banner */}
      <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0 mt-0.5">
            <Info className="w-4 h-4" />
          </div>
          <div>
            <div className="font-semibold text-slate-200 flex items-center gap-2">
              <span>Statutory Distinction: Form 3CD vs TDS Reconciliation</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 font-mono">
                Section 44AB
              </span>
            </div>
            <p className="text-slate-400 mt-1 leading-relaxed">
              <strong>TDS Reconciliation</strong> matches Form 26AS/AIS against book ledgers to discover missing credits and interest exposure. 
              <strong> Form 3CD</strong> is the formal statutory Tax Audit Statement. Form 3CD ingests the verified TDS defaults into 
              <strong> Clause 34</strong> & <strong>Clause 21(a)</strong>, scans books for <strong>Clause 13</strong>, <strong>Clause 21(d)</strong> (cash payments &gt; ₹10k) and <strong>Clause 26</strong>, while enforcing honest-gap reporting for non-derivable clauses.
            </p>
          </div>
        </div>
        {onNavigateToTds && (
          <button
            onClick={onNavigateToTds}
            className="btn-secondary text-xs shrink-0 self-start sm:self-center flex items-center gap-1.5 py-1.5 px-3 text-blue-300 border-blue-800/40 hover:bg-blue-950/40"
          >
            <span>Open TDS Recon</span>
            <ArrowRight className="w-3.5 h-3.5 text-blue-400" />
          </button>
        )}
      </div>

      {/* Module Action Header */}
      <div className="surface-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              Form 3CD Tax Audit Statement of Particulars
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/50 border border-emerald-700 text-emerald-300 font-mono">
                Sec 44AB Rules 6G(1)(b)
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Automated derivation of Clauses 13, 21, 26, 34 with honest-gap declarations (zero hallucination).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleLoadDemoAudit}
            disabled={isGenerating || isSyncingTally}
            className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 text-emerald-300 border-emerald-800/40 hover:bg-emerald-950/30"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Load Demo 3CD Audit</span>
          </button>

          <button
            onClick={handleSyncFromTally}
            disabled={isGenerating || isSyncingTally}
            className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 text-cyan-400 border-cyan-800/40 hover:bg-cyan-950/30"
            title="Sync Cash Book (40A(3)) and Sundry Creditors (43B(h)) directly from TallyPrime on Port 9000"
          >
            {isSyncingTally ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Syncing Tally...</span>
              </>
            ) : (
              <>
                <Server className="w-3.5 h-3.5" />
                <span>Sync Cash & Creditors (Tally)</span>
              </>
            )}
          </button>

          {(currentSchema || tdsReconResult) && (
            <button
              onClick={handleGenerateFromSession}
              disabled={isGenerating || isSyncingTally}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 text-slate-200 hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Sync from Active Session</span>
            </button>
          )}

          {report && (
            <button
              onClick={handleCopyJson}
              className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3 text-slate-300 hover:text-white"
            >
              <Copy className="w-3.5 h-3.5 text-slate-400" />
              <span>Copy e-Filing JSON</span>
            </button>
          )}
        </div>
      </div>

      {!report ? (
        /* Empty State / Prompt to Run */
        <div className="surface-card p-12 text-center flex flex-col items-center justify-center gap-4">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <ClipboardCheck className="w-10 h-10" />
          </div>
          <div className="max-w-md">
            <h3 className="text-base font-semibold text-white">No Form 3CD Audit Statement Generated Yet</h3>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Generate a full statutory Statement of Particulars incorporating accounting methods (Clause 13), 
              cash & TDS disallowances (Clause 21), MSME liabilities (Clause 26), Chapter XVII-B TDS tables (Clause 34), 
              and the Honest-Gap Auditor Registry.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap justify-center">
            <button
              onClick={handleLoadDemoAudit}
              disabled={isGenerating || isSyncingTally}
              className="btn-primary text-xs flex items-center gap-2 py-2 px-4"
            >
              <Sparkles className="w-4 h-4" />
              <span>Load Realistic Sample Audit</span>
            </button>
            <button
              onClick={handleSyncFromTally}
              disabled={isGenerating || isSyncingTally}
              className="btn-secondary text-xs flex items-center gap-2 py-2 px-4 text-cyan-300 border-cyan-800/50 hover:bg-cyan-950/40"
            >
              {isSyncingTally ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4 text-cyan-400" />}
              <span>Sync from TallyPrime (Port 9000)</span>
            </button>
            {tdsReconResult && (
              <button
                onClick={handleGenerateFromSession}
                disabled={isGenerating || isSyncingTally}
                className="btn-secondary text-xs flex items-center gap-2 py-2 px-4"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Compile with Active TDS Recon</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Top Statutory Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {/* 1. Audit Readiness */}
            <div className="surface-card p-4 flex flex-col justify-between">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Audit Readiness</span>
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="mt-2">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold ${
                  summary?.auditReadinessStatus === 'READY_FOR_E_FILING'
                    ? 'bg-emerald-950 border border-emerald-700 text-emerald-300'
                    : 'bg-amber-950 border border-amber-700 text-amber-300'
                }`}>
                  {summary?.auditReadinessStatus === 'READY_FOR_E_FILING' ? 'READY FOR E-FILING' : 'GAPS PENDING'}
                </span>
                <p className="text-[10px] text-slate-400 mt-1">
                  {summary?.manualAuditorInputCount || 0} external clauses require evidence
                </p>
              </div>
            </div>

            {/* 2. Total Disallowances */}
            <div className="surface-card p-4 flex flex-col justify-between">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Disallowances</span>
                <ShieldAlert className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-2">
                <div className="text-lg font-bold text-rose-300 tabular-nums">
                  {fmt(summary?.totalDisallowancesQuantified)}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Sec 40(a)(ia) + 40A(3) + 43B(h)
                </p>
              </div>
            </div>

            {/* 3. Sec 201(1A) Interest */}
            <div className="surface-card p-4 flex flex-col justify-between">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>201(1A) Interest</span>
                <Scale className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2">
                <div className="text-lg font-bold text-amber-300 tabular-nums">
                  {fmt(summary?.totalTdsInterestPayable)}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Accrued on TDS non-deposit
                </p>
              </div>
            </div>

            {/* 4. Sec 234E Late Fee */}
            <div className="surface-card p-4 flex flex-col justify-between">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>234E Late Fees</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="mt-2">
                <div className="text-lg font-bold text-amber-300 tabular-nums">
                  {fmt(summary?.totalLateFees234E)}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  ₹200/day capped at TDS
                </p>
              </div>
            </div>

            {/* 5. Total Exposure */}
            <div className="surface-card p-4 flex flex-col justify-between col-span-2 md:col-span-1">
              <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Total Exposure</span>
                <AlertCircle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="mt-2">
                <div className="text-lg font-bold text-rose-400 tabular-nums">
                  {fmt(summary?.totalStatutoryExposure)}
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Disallowance + Penalties
                </p>
              </div>
            </div>
          </div>

          {/* Form 3CD Internal Tabs Navigation */}
          <div className="border-b border-slate-800 flex items-center gap-2 overflow-x-auto whitespace-nowrap pb-1">
            <button
              onClick={() => setActiveTab('summary')}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'summary'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Audit Overview & Remediations</span>
            </button>

            <button
              onClick={() => setActiveTab('clause13')}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'clause13'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Clause 13 (ICDS & Method)</span>
            </button>

            <button
              onClick={() => setActiveTab('clause21')}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'clause21'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Clause 21 (Disallowances)</span>
              {(clauses?.clause21?.totalDisallowancesQuantified > 0) && (
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 font-mono">
                  {fmt(clauses?.clause21?.totalDisallowancesQuantified)}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('clause26')}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'clause26'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Clause 26 (Sec 43B / MSME)</span>
            </button>

            <button
              onClick={() => setActiveTab('clause34')}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'clause34'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>Clause 34 (TDS Chapter XVII-B)</span>
            </button>

            <button
              onClick={() => setActiveTab('honest_gaps')}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'honest_gaps'
                  ? 'bg-amber-600 text-white font-semibold'
                  : 'text-amber-400 hover:text-amber-300 hover:bg-amber-950/40'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Honest-Gap Registry ({honestGaps.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('json')}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'json'
                  ? 'bg-emerald-600 text-white font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Structured JSON</span>
            </button>
          </div>

          {/* TAB 1: SUMMARY & REMEDIATIONS */}
          {activeTab === 'summary' && (
            <div className="flex flex-col gap-6">
              {/* Assessee Particulars */}
              <div className="surface-card p-5">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                  Assessee & Audit Engagement Details
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400">Assessee Name:</span>
                    <p className="font-semibold text-white mt-0.5">{report.metadata?.entityName || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Permanent Account Number:</span>
                    <p className="font-mono font-semibold text-white mt-0.5">{report.metadata?.pan || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Assessment Year:</span>
                    <p className="font-mono font-semibold text-white mt-0.5">AY {report.metadata?.assessmentYear}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Previous Year:</span>
                    <p className="font-mono font-semibold text-white mt-0.5">FY {report.metadata?.previousYear}</p>
                  </div>
                </div>
              </div>

              {/* Anti-Double-Counting Cross-Clause Check Summary Banner */}
              {crossCheck && (
                <div className={`p-4 rounded-xl border flex items-start gap-3.5 text-xs ${
                  crossCheck.overlapsFound > 0
                    ? 'bg-blue-950/30 border-blue-800/50 text-blue-200'
                    : 'bg-emerald-950/30 border-emerald-800/50 text-emerald-200'
                }`}>
                  <div className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                    crossCheck.overlapsFound > 0
                      ? 'bg-blue-900/40 text-blue-400'
                      : 'bg-emerald-900/40 text-emerald-400'
                  }`}>
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="font-bold text-white flex items-center gap-2">
                        <span>Anti-Double-Counting Self-Check:</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                          crossCheck.overlapsFound > 0
                            ? 'bg-blue-900 text-blue-200 border border-blue-700'
                            : 'bg-emerald-900 text-emerald-200 border border-emerald-700'
                        }`}>
                          {crossCheck.status}
                        </span>
                      </span>
                      {crossCheck.totalDoubleDisallowancePrevented > 0 && (
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                          Prevented Duplicate Disallowance: {fmt(crossCheck.totalDoubleDisallowancePrevented)}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 mt-1 leading-relaxed">
                      {crossCheck.plainLanguageSummary}
                    </p>
                  </div>
                </div>
              )}

              {/* Statutory Remediations Action List */}
              <div className="surface-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>Prioritized Auditor Remediation Plan ({remediations.length})</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">
                    Mandatory steps prior to signing Form 3CA / 3CB
                  </span>
                </div>

                {remediations.length === 0 ? (
                  <div className="p-4 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>No critical statutory tax audit defaults detected in evaluated clauses.</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {remediations.map((rem, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-lg border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                          rem.priority === 'CRITICAL'
                            ? 'bg-rose-950/40 border-rose-800/50 text-rose-200'
                            : 'bg-amber-950/40 border-amber-800/50 text-amber-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold uppercase shrink-0 ${
                            rem.priority === 'CRITICAL' ? 'bg-rose-900 text-rose-200' : 'bg-amber-900 text-amber-200'
                          }`}>
                            Clause {rem.clause} • {rem.priority}
                          </span>
                          <div>
                            <div className="font-semibold text-white">{rem.subject}</div>
                            <p className="text-slate-300 mt-0.5">{rem.recommendation}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: CLAUSE 13 (ICDS & METHOD) */}
          {activeTab === 'clause13' && (
            <div className="flex flex-col gap-6">
              <div className="surface-card p-5">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Clause 13(a): Method of Accounting Employed
                </h3>
                <p className="text-xs text-slate-300">
                  Method: <strong className="text-emerald-400">{clauses?.clause13?.clause13a?.method || 'Mercantile'}</strong>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Change in method of accounting: <strong>{clauses?.clause13?.clause13b?.hasChange || 'No'}</strong>
                </p>
                {clauses?.clause13?.clause13b?.hasChange === 'Yes' && (
                  <p className="text-[11px] text-amber-300 mt-1">
                    Details of change: {clauses?.clause13?.clause13b?.details} (Effect on profit: {fmt(clauses?.clause13?.clause13c?.effectOnProfit)})
                  </p>
                )}
              </div>

              <div className="surface-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Clause 13(d) & 13(e): Income Computation and Disclosure Standards (ICDS I to X)
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    Net ICDS Profit Effect: {fmt(clauses?.clause13?.clause13e?.summary?.netEffect)}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Standard</th>
                        <th className="py-2.5 px-3">Name of ICDS</th>
                        <th className="py-2.5 px-3 text-right">Profit Increase (₹)</th>
                        <th className="py-2.5 px-3 text-right">Profit Decrease (₹)</th>
                        <th className="py-2.5 px-3 text-right">Net P&L Effect (₹)</th>
                        <th className="py-2.5 px-3">Mandatory Disclosure Requirement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {clauses?.clause13?.clause13e?.schedule?.map((icds) => (
                        <tr key={icds.icdsCode} className="hover:bg-slate-900/40">
                          <td className="py-2.5 px-3 font-mono text-emerald-400 font-semibold">{icds.standard}</td>
                          <td className="py-2.5 px-3 text-slate-200">{icds.icdsName}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmt(icds.increaseInProfit)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">{fmt(icds.decreaseInProfit)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-300 font-semibold">{fmt(icds.netEffect)}</td>
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">{icds.disclosureNotes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: CLAUSE 21 (DISALLOWANCES, RULE 6DD & ANTI-DOUBLE-COUNTING) */}
          {activeTab === 'clause21' && (
            <div className="flex flex-col gap-6">
              {/* Anti-Double-Counting Verification Banner */}
              {crossCheck && (
                <div className="surface-card p-4 border-l-4 border-l-blue-500 flex flex-col gap-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-400" />
                      <span>Cross-Clause Anti-Double-Counting Self-Check</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 border border-blue-800 text-blue-300 font-mono">
                        {crossCheck.status}
                      </span>
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      Prevented Double Disallowance: {fmt(crossCheck.totalDoubleDisallowancePrevented)}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    {crossCheck.plainLanguageSummary}
                  </p>
                  {crossCheck.details?.length > 0 && (
                    <div className="mt-2 p-2.5 rounded bg-slate-900/80 border border-slate-800 text-[11px]">
                      <span className="font-semibold text-slate-300">Resolved Overlapping Transactions:</span>
                      <div className="mt-1 flex flex-col gap-1.5">
                        {crossCheck.details.map((d, i) => (
                          <div key={i} className="flex items-start justify-between gap-2 text-slate-300">
                            <div>
                              <strong className="text-white">Voucher {d.transactionRef}</strong> ({d.partyName}) — Total: {fmt(d.expenseAmount)}.
                              <span className="text-slate-400 ml-1">100% disallowed u/s 40A(3). Overlapping 30% u/s 40(a)(ia) ({fmt(d.suppressedDisallowance)}) suppressed.</span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 shrink-0">
                              Capped at 100%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Clause 21(d): Section 40A(3) Cash Payments & Rule 6DD Carve-Outs */}
              <div className="surface-card p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                      <span>Clause 21(d) — Section 40A(3): Cash Payments Exceeding ₹10,000 / ₹35,000</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-900/50 border border-amber-700 text-amber-300 font-mono">
                        Rule 6DD Carve-Outs Guarded
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      100% disallowance for non-exempt cash payments. Rule 6DD carve-outs (banks, govt, cultivators, holidays) exempt from disallowance.
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span className="text-[10px] text-slate-400">Rule 6DD Exempt:</span>
                      <div className="text-xs font-bold text-emerald-400 font-mono">
                        {clauses?.clause21?.clause21d?.exempt6DDCount || 0} Carved Out
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">Total Confirmed Disallowance:</span>
                      <div className="text-base font-bold text-rose-400 font-mono">
                        {fmt(clauses?.clause21?.clause21d?.totalConfirmedDisallowance)}
                      </div>
                    </div>
                  </div>
                </div>

                {clauses?.clause21?.clause21d?.verificationRequiredCount > 0 && (
                  <div className="p-3 mb-4 rounded-lg bg-amber-950/40 border border-amber-800/50 text-amber-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      <strong>Auditor Caution:</strong> {clauses?.clause21?.clause21d?.verificationRequiredCount} aggregated ledger head(s) exceed ₹10,000 but require daily cash voucher tracing before confirming disallowance. Premature disallowance suppressed.
                    </span>
                  </div>
                )}

                {clauses?.clause21?.clause21d?.items?.length === 0 ? (
                  <div className="p-3 rounded bg-slate-900/60 border border-slate-800 text-slate-400 text-xs">
                    No cash payments exceeding statutory thresholds found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Party / Ledger Head</th>
                          <th className="py-2 px-3">Voucher #</th>
                          <th className="py-2 px-3 text-right">Amount (₹)</th>
                          <th className="py-2 px-3 text-right">Threshold</th>
                          <th className="py-2 px-3">Status / Rule 6DD</th>
                          <th className="py-2 px-3 text-right text-rose-400">Disallowed (₹)</th>
                          <th className="py-2 px-3">Statutory Audit Explanation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {clauses?.clause21?.clause21d?.items?.map((fe, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">{fe.date}</td>
                            <td className="py-2 px-3 font-medium text-slate-200">{fe.partyName}</td>
                            <td className="py-2 px-3 font-mono text-slate-400 whitespace-nowrap">{fe.voucherNo}</td>
                            <td className="py-2 px-3 text-right font-mono text-white font-bold">{fmt(fe.amount)}</td>
                            <td className="py-2 px-3 text-right font-mono text-slate-400">{fmt(fe.threshold)}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {fe.status === 'EXEMPT_UNDER_RULE_6DD' && (
                                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-emerald-950 border border-emerald-800 text-emerald-300">
                                  EXEMPT: {fe.exemptionRule}
                                </span>
                              )}
                              {fe.status === 'DISALLOWED_SEC_40A3' && (
                                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-rose-950 border border-rose-800 text-rose-300">
                                  100% DISALLOWED
                                </span>
                              )}
                              {fe.status === 'REQUIRES_VOUCHER_VERIFICATION' && (
                                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-amber-950 border border-amber-800 text-amber-300">
                                  REQUIRES VOUCHER PROOF
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-rose-400">
                              {fmt(fe.disallowedAmount)}
                            </td>
                            <td className="py-2 px-3 text-slate-300 text-[11px] max-w-xs">{fe.auditExplanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Clause 21(a): Sec 40(a)(ia) 30% TDS Disallowance */}
              <div className="surface-card p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-rose-300 uppercase tracking-wider flex items-center gap-2">
                      <span>Clause 21(a) — Section 40(a)(ia): 30% Disallowance for TDS Defaults</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-rose-900/50 border border-rose-700 text-rose-300 font-mono">
                        Directly Sourced from TDS Recon
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      30% of expenditure disallowed for failure to deduct/deposit TDS before the due date u/s 139(1).
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Total 30% Disallowed:</span>
                    <div className="text-base font-bold text-rose-400 font-mono">
                      {fmt(clauses?.clause21?.clause21a?.totalDisallowance)}
                    </div>
                  </div>
                </div>

                {clauses?.clause21?.clause21a?.items?.length === 0 ? (
                  <div className="p-3 rounded bg-slate-900/60 border border-slate-800 text-slate-400 text-xs">
                    No Section 40(a)(ia) disallowances identified. All deducted taxes are reconciled as deposited.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Party / Account Head</th>
                          <th className="py-2 px-3">TAN</th>
                          <th className="py-2 px-3">Section</th>
                          <th className="py-2 px-3 text-right">Base Expense (₹)</th>
                          <th className="py-2 px-3 text-right">TDS Shortfall (₹)</th>
                          <th className="py-2 px-3 text-right text-rose-300">30% Disallowed (₹)</th>
                          <th className="py-2 px-3">Anti-Double-Counting</th>
                          <th className="py-2 px-3">Statutory Audit Explanation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {clauses?.clause21?.clause21a?.items?.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="py-2 px-3 font-medium text-slate-200">{it.partyName}</td>
                            <td className="py-2 px-3 font-mono text-slate-400">{it.tan}</td>
                            <td className="py-2 px-3 font-mono text-emerald-400">{it.section}</td>
                            <td className="py-2 px-3 text-right font-mono text-slate-300">{fmt(it.baseExpenseAmount)}</td>
                            <td className="py-2 px-3 text-right font-mono text-amber-300">{fmt(it.tdsAmount)}</td>
                            <td className="py-2 px-3 text-right font-mono text-rose-400 font-bold">
                              {it.antiDoubleCountingSuppressed ? (
                                <span className="line-through text-slate-500">{fmt(it.suppressedAmount)}</span>
                              ) : (
                                fmt(it.disallowedAmount40a_ia)
                              )}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              {it.antiDoubleCountingSuppressed ? (
                                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-blue-950 border border-blue-800 text-blue-300">
                                  SUPPRESSED (OVERLAP)
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-rose-950 border border-rose-800 text-rose-300">
                                  30% ADD-BACK
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-300 text-[11px] max-w-xs">{it.auditExplanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: CLAUSE 26 (SEC 43B / 43B(h) MSME) */}
          {activeTab === 'clause26' && (
            <div className="flex flex-col gap-6">
              <div className="surface-card p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div>
                    <h3 className="text-xs font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                      <span>Clause 26: Deductions Allowed Only on Actual Payment (Section 43B & 43B(h))</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Statutory liabilities (GST, PF, ESIC, bonus) and Section 43B(h) MSME overdue payments.
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400">Total Sec 43B(h) Disallowance:</span>
                    <div className="text-base font-bold text-rose-400 font-mono">
                      {fmt(clauses?.clause26?.clause26_MSME_43Bh?.totalDisallowed43Bh)}
                    </div>
                  </div>
                </div>

                {/* Section 43B(h) MSME Highlights */}
                <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 flex flex-col gap-2 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-400">
                      Section 43B(h) MSME Compliance Overview
                    </span>
                    <span className="text-xs font-mono font-bold text-rose-300">
                      {fmt(clauses?.clause26?.clause26_MSME_43Bh?.totalDisallowed43Bh)} Disallowed u/s 43B(h)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Applicable to Micro & Small Enterprises under Section 15 of MSMED Act, 2006. 
                    Amounts unpaid beyond 45 days (written agreement) or 15 days (no agreement) as on 31st March are strictly disallowed. Under Section 23 of the MSMED Act, penal interest at 3x the RBI bank rate is strictly non-deductible.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">Liability Head</th>
                        <th className="py-2 px-3 text-right">Amount (₹)</th>
                        <th className="py-2 px-3">Statutory Classification</th>
                        <th className="py-2 px-3">Audit Treatment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {clauses?.clause26?.clause26_StatutoryDues?.items?.map((sd, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-2 px-3 font-medium text-slate-200">{sd.head}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-300 font-bold">{fmt(sd.amount)}</td>
                          <td className="py-2 px-3 font-mono text-emerald-400">Statutory Liability</td>
                          <td className="py-2 px-3 text-slate-400 text-[11px]">
                            Deductible only if deposited before statutory return filing due date u/s 139(1).
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CLAUSE 34 (TDS CHAPTER XVII-B & DISCREPANCIES) */}
          {activeTab === 'clause34' && (
            <div className="flex flex-col gap-6">
              {/* Clause 34(a): 10-Column Compliance Table */}
              <div className="surface-card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                      <span>Clause 34(a): Chapter XVII-B TDS/TCS 10-Column Schedule</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono">
                        Statutory Format
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Schedule of payments liable to TDS/TCS, amounts deducted at specified/lower rates, and amounts deposited or unremitted.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800">
                      <tr>
                        <th className="py-2 px-3">TAN</th>
                        <th className="py-2 px-3">Section</th>
                        <th className="py-2 px-3">Party / Nature of Payment</th>
                        <th className="py-2 px-3 text-right">Total Paid (₹)</th>
                        <th className="py-2 px-3 text-right">Liable to TDS (₹)</th>
                        <th className="py-2 px-3 text-right">Tax Deducted (₹)</th>
                        <th className="py-2 px-3 text-right text-rose-400">Undeposited (₹)</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3">Statutory Audit Explanation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {clauses?.clause34?.clause34a?.schedule?.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-900/40">
                          <td className="py-2 px-3 font-mono text-slate-300 whitespace-nowrap">{row.tan}</td>
                          <td className="py-2 px-3 font-mono text-emerald-400 font-semibold">{row.section}</td>
                          <td className="py-2 px-3 text-slate-200">{row.partyName}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-300">{fmt(row.totalAmountPaid)}</td>
                          <td className="py-2 px-3 text-right font-mono text-slate-300">{fmt(row.totalSubjectToDeduction)}</td>
                          <td className="py-2 px-3 text-right font-mono text-emerald-400">{fmt(row.taxDeductedAtSpecifiedRate + row.taxDeductedAtLowerRate)}</td>
                          <td className="py-2 px-3 text-right font-mono text-rose-400 font-bold">{fmt(row.taxDeductedNotPaid)}</td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                              row.complianceStatus === 'COMPLIANT'
                                ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                                : 'bg-rose-950 border border-rose-800 text-rose-300'
                            }`}>
                              {row.complianceStatus}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-300 text-[11px] max-w-xs">{row.auditExplanation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Clause 34(b) & 34(c): 234E Fees & 201(1A) Interest */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Clause 34(b): 234E Late Fee */}
                <div className="surface-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                      Clause 34(b) — Section 234E Late Filing Fees
                    </h3>
                    <span className="font-mono text-amber-400 font-bold">
                      {fmt(clauses?.clause34?.clause34b?.totalLateFees234E)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800">
                        <tr>
                          <th className="py-1.5 px-2">Statement</th>
                          <th className="py-1.5 px-2">TAN</th>
                          <th className="py-1.5 px-2">Due Date</th>
                          <th className="py-1.5 px-2">Delay</th>
                          <th className="py-1.5 px-2 text-right">Fee (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {clauses?.clause34?.clause34b?.defaulters?.map((st, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 px-2 font-mono text-slate-300">{st.formType}</td>
                            <td className="py-1.5 px-2 font-mono text-slate-400">{st.tan}</td>
                            <td className="py-1.5 px-2 font-mono text-slate-400">{st.dueDate}</td>
                            <td className="py-1.5 px-2 text-amber-300">{st.delayDays} days</td>
                            <td className="py-1.5 px-2 text-right font-mono text-amber-400 font-bold">{fmt(st.fee234E)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Clause 34(c): 201(1A) Interest */}
                <div className="surface-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-rose-300 uppercase tracking-wider">
                      Clause 34(c) — Section 201(1A) Statutory Interest
                    </h3>
                    <span className="font-mono text-rose-400 font-bold">
                      {fmt(clauses?.clause34?.clause34c?.totalInterest201_1A)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800">
                        <tr>
                          <th className="py-1.5 px-2">Party / Head</th>
                          <th className="py-1.5 px-2">Sec</th>
                          <th className="py-1.5 px-2">Rate</th>
                          <th className="py-1.5 px-2 text-right">Interest (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {clauses?.clause34?.clause34c?.schedule?.map((ii, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 px-2 text-slate-200">{ii.partyName}</td>
                            <td className="py-1.5 px-2 font-mono text-emerald-400">{ii.section}</td>
                            <td className="py-1.5 px-2 text-slate-400">{ii.rateDescription}</td>
                            <td className="py-1.5 px-2 text-right font-mono text-rose-400 font-bold">{fmt(ii.interestAmountPayable)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* TDS Recon Ingested Discrepancy Audit Summary */}
              {clauses?.clause34?.discrepancyAuditSummary?.length > 0 && (
                <div className="surface-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      <span>Ingested TDS Reconciliation Discrepancy Report</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300 font-mono">
                        {clauses.clause34.discrepancyAuditSummary.length} Findings
                      </span>
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-[11px] text-slate-400 bg-slate-900/80 border-b border-slate-800">
                        <tr>
                          <th className="py-2 px-3">Severity</th>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3">Party / TAN</th>
                          <th className="py-2 px-3 text-right">Default Amount (₹)</th>
                          <th className="py-2 px-3 text-right">Penalty/Interest (₹)</th>
                          <th className="py-2 px-3">Governing 3CD Clause</th>
                          <th className="py-2 px-3">Auditor Finding</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {clauses.clause34.discrepancyAuditSummary.map((disc, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/40">
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                                disc.severity === 'CRITICAL'
                                  ? 'bg-rose-950 border border-rose-800 text-rose-300'
                                  : 'bg-amber-950 border border-amber-800 text-amber-300'
                              }`}>
                                {disc.severity}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-300">{disc.category}</td>
                            <td className="py-2 px-3 text-slate-200">
                              <div>{disc.party}</div>
                              <span className="text-[10px] font-mono text-slate-400">{disc.tan}</span>
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-200">{fmt(disc.amount)}</td>
                            <td className="py-2 px-3 text-right font-mono text-rose-400 font-bold">{fmt(disc.penalty)}</td>
                            <td className="py-2 px-3 font-mono text-emerald-400 text-[11px] whitespace-nowrap">{disc.statutoryClause}</td>
                            <td className="py-2 px-3 text-slate-300 text-[11px] max-w-sm">{disc.auditExplanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: HONEST-GAP REGISTRY */}
          {activeTab === 'honest_gaps' && (
            <div className="flex flex-col gap-6">
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <span className="font-semibold text-amber-300">
                    Zero-Fabrication Guarantee (Honest-Gap Architecture)
                  </span>
                  <p className="text-amber-200/80 mt-1 leading-relaxed">
                    Under ICAI tax audit standards, an auditor cannot fabricate figures for clauses that require external registers, 
                    independent merchant banker valuations, or specialized board declarations (e.g. Related Parties u/s 40A(2)(b), 
                    Stamp Duty transfers u/s 43CA, or Loan modes u/s 269SS/T). 
                    Each clause below is transparently declared with an auditor evidence requirement.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {honestGaps.map((gap, idx) => (
                  <div key={idx} className="surface-card p-5 flex flex-col justify-between gap-3 border-l-4 border-l-amber-500">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-amber-400">
                          Clause {gap.clause} {gap.subClause ? `(${gap.subClause})` : ''}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300 font-mono font-semibold">
                          REQUIRES_MANUAL_AUDITOR_INPUT
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white mt-1">{gap.title}</h4>
                      <p className="text-[11px] font-mono text-slate-400 mt-0.5">{gap.governingSection}</p>

                      <div className="mt-3 p-2.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300">
                        <span className="text-slate-400 font-semibold">Honest-Gap Reason:</span>
                        <p className="mt-0.5 text-slate-300">{gap.honestGapReason}</p>
                      </div>

                      <div className="mt-2 text-[11px] text-slate-400">
                        <span className="font-semibold text-slate-300">Required Audit Evidence:</span>
                        <p className="mt-0.5 text-slate-400">{gap.requiredInput}</p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Auditor Status:</span>
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <Lock className="w-3 h-3 text-slate-400" />
                        <span>Awaiting Auditor Sign-off</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 7: STRUCTURED JSON VIEW */}
          {activeTab === 'json' && (
            <div className="surface-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Raw Form 3CD Statement Payload (JSON)
                </h3>
                <button
                  onClick={handleCopyJson}
                  className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy JSON</span>
                </button>
              </div>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-[500px]">
                {JSON.stringify(report, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
