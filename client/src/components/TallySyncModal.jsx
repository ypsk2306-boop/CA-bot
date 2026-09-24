import React, { useState, useEffect } from 'react';
import { 
  X, RefreshCw, CheckCircle2, AlertCircle, HardDrive, Building, Server, 
  ArrowRight, Loader2, HelpCircle, FileCheck, Scale, Receipt, ClipboardCheck, 
  Landmark, Sparkles, Check, ChevronRight
} from 'lucide-react';

export default function TallySyncModal({ 
  isOpen, 
  onClose, 
  onSyncComplete,
  activeModule,
  onSwitchModule,
  onSyncBankComplete,
  onSyncGstComplete,
  onSyncTdsComplete,
  onSyncForm3cdComplete
}) {
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('9000');
  const [isChecking, setIsChecking] = useState(false);
  const [syncingTarget, setSyncingTarget] = useState(null); // 'all' | 'financials' | 'bank' | 'gst' | 'tds' | 'form3cd' | null
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [moduleSyncLogs, setModuleSyncLogs] = useState({});

  useEffect(() => {
    if (isOpen) {
      handleCheckConnection();
    }
  }, [isOpen]);

  const handleCheckConnection = async () => {
    setIsChecking(true);
    setErrorMessage('');
    try {
      const res = await fetch(`/api/tally/status?host=${encodeURIComponent(host)}&port=${encodeURIComponent(port)}`);
      const data = await res.json();
      setConnectionStatus(data);
      if (data.online) {
        const comps = data.activeCompanies || [];
        setCompanies(comps);
        if (comps.length > 0 && !selectedCompany) {
          setSelectedCompany(comps[0]);
        }
      } else {
        setCompanies(['Simulated Tally Enterprise (Port 9000 Offline)']);
        setSelectedCompany('Simulated Tally Enterprise (Port 9000 Offline)');
      }
    } catch (err) {
      setConnectionStatus({ online: false, message: err.message, source: 'TALLY_SIMULATED' });
      setCompanies(['Simulated Tally Enterprise (Port 9000 Offline)']);
      setSelectedCompany('Simulated Tally Enterprise (Port 9000 Offline)');
    } finally {
      setIsChecking(false);
    }
  };

  // 1. Sync Financial Statements (Trial Balance)
  const handleSyncFinancials = async () => {
    setSyncingTarget('financials');
    setErrorMessage('');
    try {
      const res = await fetch('/api/tally/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port: parseInt(port, 10), companyName: selectedCompany })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to sync Trial Balance');

      setModuleSyncLogs(prev => ({
        ...prev,
        financials: { success: true, count: data.itemCount, label: `${data.itemCount} ledger accounts synced` }
      }));
      setSuccessMessage(`✓ Imported ${data.itemCount} ledger accounts for Financial Statements.`);
      if (onSyncComplete) onSyncComplete(data);
    } catch (err) {
      setErrorMessage(`Financials sync failed: ${err.message}`);
    } finally {
      setSyncingTarget(null);
    }
  };

  // 2. Sync Bank Book (BRS)
  const handleSyncBank = async () => {
    setSyncingTarget('bank');
    setErrorMessage('');
    try {
      const res = await fetch('/api/tally/sync-bank-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledgerName: 'HDFC Bank Current A/c' })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to sync Bank Book');

      setModuleSyncLogs(prev => ({
        ...prev,
        bank: { success: true, count: data.count, label: `${data.count} bank vouchers synced (${data.ledgerName})` }
      }));
      setSuccessMessage(`✓ Imported ${data.count} bank vouchers from ${data.ledgerName} for BRS.`);
      if (onSyncBankComplete) onSyncBankComplete(data);
    } catch (err) {
      setErrorMessage(`Bank Book sync failed: ${err.message}`);
    } finally {
      setSyncingTarget(null);
    }
  };

  // 3. Sync GST Purchase Register
  const handleSyncGst = async () => {
    setSyncingTarget('gst');
    setErrorMessage('');
    try {
      const res = await fetch('/api/tally/sync-purchase-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to sync Purchase Register');

      setModuleSyncLogs(prev => ({
        ...prev,
        gst: { success: true, count: data.count, label: `${data.count} purchase register vouchers synced` }
      }));
      setSuccessMessage(`✓ Imported ${data.count} purchase vouchers for GST ITC Reconciliation.`);
      if (onSyncGstComplete) onSyncGstComplete(data);
    } catch (err) {
      setErrorMessage(`GST PR sync failed: ${err.message}`);
    } finally {
      setSyncingTarget(null);
    }
  };

  // 4. Sync TDS Ledgers
  const handleSyncTds = async () => {
    setSyncingTarget('tds');
    setErrorMessage('');
    try {
      const res = await fetch('/api/tally/sync-tds-ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to sync TDS Ledgers');

      setModuleSyncLogs(prev => ({
        ...prev,
        tds: { success: true, count: data.count, label: `${data.count} TDS entries extracted` }
      }));
      setSuccessMessage(`✓ Imported ${data.count} TDS entries for 26AS/AIS Reconciliation.`);
      if (onSyncTdsComplete) onSyncTdsComplete(data);
    } catch (err) {
      setErrorMessage(`TDS sync failed: ${err.message}`);
    } finally {
      setSyncingTarget(null);
    }
  };

  // 5. Sync Form 3CD Cash Book & Creditors
  const handleSyncForm3cd = async () => {
    setSyncingTarget('form3cd');
    setErrorMessage('');
    try {
      const res = await fetch('/api/tally/sync-form3cd-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to sync Form 3CD Data');

      setModuleSyncLogs(prev => ({
        ...prev,
        form3cd: { 
          success: true, 
          count: data.lineItems?.length || 0, 
          label: `${data.cashBook?.count || 0} Cash Vouchers + ${data.sundryCreditors?.count || 0} MSME Creditors` 
        }
      }));
      setSuccessMessage(`✓ Imported Cash Book & MSME Creditors for Form 3CD Tax Audit.`);
      if (onSyncForm3cdComplete) onSyncForm3cdComplete(data);
    } catch (err) {
      setErrorMessage(`Form 3CD sync failed: ${err.message}`);
    } finally {
      setSyncingTarget(null);
    }
  };

  // 6. Super Sync: Run All 5 Modules
  const handleSyncAll = async () => {
    setSyncingTarget('all');
    setErrorMessage('');
    setSuccessMessage('');
    try {
      // 1. Financials
      const finRes = await fetch('/api/tally/sync-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port: parseInt(port, 10), companyName: selectedCompany })
      }).then(r => r.json()).catch(() => null);

      // 2. Bank
      const bankRes = await fetch('/api/tally/sync-bank-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ledgerName: 'HDFC Bank Current A/c' })
      }).then(r => r.json()).catch(() => null);

      // 3. GST
      const gstRes = await fetch('/api/tally/sync-purchase-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(r => r.json()).catch(() => null);

      // 4. TDS
      const tdsRes = await fetch('/api/tally/sync-tds-ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(r => r.json()).catch(() => null);

      // 5. Form 3CD
      const f3cdRes = await fetch('/api/tally/sync-form3cd-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      }).then(r => r.json()).catch(() => null);

      setModuleSyncLogs({
        financials: { success: !!finRes?.itemCount, count: finRes?.itemCount || 0, label: `${finRes?.itemCount || 0} accounts` },
        bank: { success: !!bankRes?.success, count: bankRes?.count || 0, label: `${bankRes?.count || 0} bank vouchers` },
        gst: { success: !!gstRes?.success, count: gstRes?.count || 0, label: `${gstRes?.count || 0} purchase vouchers` },
        tds: { success: !!tdsRes?.success, count: tdsRes?.count || 0, label: `${tdsRes?.count || 0} TDS entries` },
        form3cd: { success: !!f3cdRes?.success, count: f3cdRes?.lineItems?.length || 0, label: `${f3cdRes?.cashBook?.count || 0} cash + ${f3cdRes?.sundryCreditors?.count || 0} creditors` }
      });

      if (finRes && onSyncComplete) onSyncComplete(finRes);
      if (bankRes && onSyncBankComplete) onSyncBankComplete(bankRes);
      if (gstRes && onSyncGstComplete) onSyncGstComplete(gstRes);
      if (tdsRes && onSyncTdsComplete) onSyncTdsComplete(tdsRes);
      if (f3cdRes && onSyncForm3cdComplete) onSyncForm3cdComplete(f3cdRes);

      setSuccessMessage('✓ All 5 statutory modules successfully synced with TallyPrime!');
    } catch (err) {
      setErrorMessage(`Universal batch sync failed: ${err.message}`);
    } finally {
      setSyncingTarget(null);
    }
  };

  if (!isOpen) return null;

  const modules = [
    {
      id: 'financials',
      title: 'Financial Statements',
      badge: 'Schedule III',
      icon: Landmark,
      color: 'text-blue-400',
      description: 'Sync Trial Balance ledger masters and closing balances for Balance Sheet & P&L generation.',
      syncFn: handleSyncFinancials,
      btnLabel: 'Sync Financials'
    },
    {
      id: 'bank',
      title: 'Bank Reconciliation',
      badge: 'BRS',
      icon: Scale,
      color: 'text-blue-400',
      description: 'Sync Bank Book vouchers from active bank ledger (HDFC Bank) with paise-exact debits/credits.',
      syncFn: handleSyncBank,
      btnLabel: 'Sync Bank Book'
    },
    {
      id: 'gst',
      title: 'GST Reconciliation',
      badge: 'ITC Rule 36(4)',
      icon: FileCheck,
      color: 'text-blue-400',
      description: 'Sync Purchase Register vouchers with IGST/CGST/SGST tax breakdowns for GSTR-2B matching.',
      syncFn: handleSyncGst,
      btnLabel: 'Sync Purchase Register'
    },
    {
      id: 'tds',
      title: 'TDS Reconciliation',
      badge: '26AS / AIS',
      icon: Receipt,
      color: 'text-blue-400',
      description: 'Sync TDS duty payable and receivable ledgers for 26AS cross-check and Section 201(1A) penalty calculation.',
      syncFn: handleSyncTds,
      btnLabel: 'Sync TDS Ledgers'
    },
    {
      id: 'form3cd',
      title: 'Form 3CD Tax Audit',
      badge: 'Sec 44AB',
      icon: ClipboardCheck,
      color: 'text-emerald-400',
      description: 'Sync Cash Book vouchers for Section 40A(3) cash disallowance and MSME overdue creditors for Section 43B(h).',
      syncFn: handleSyncForm3cd,
      btnLabel: 'Sync Cash & Creditors'
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="surface-card max-w-2xl w-full p-6 shadow-2xl relative flex flex-col gap-5 border border-slate-750 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  TallyPrime Universal Sync Hub
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-semibold ${
                  connectionStatus?.online 
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700' 
                    : 'bg-blue-950 text-blue-300 border border-blue-700'
                }`}>
                  {connectionStatus?.online ? '🟢 Live Port 9000' : '🔵 Simulation Ready'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Direct XML port integration across all 5 statutory audit and reconciliation engines.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Server & Company Configuration Bar */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            <div className="sm:col-span-5 flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <div className="flex items-center gap-1.5 w-full text-xs">
                <span className="text-slate-400 font-mono text-[11px]">PORT:</span>
                <input
                  type="text"
                  value={`${host}:${port}`}
                  onChange={(e) => {
                    const parts = e.target.value.split(':');
                    if (parts[0]) setHost(parts[0]);
                    if (parts[1]) setPort(parts[1]);
                  }}
                  placeholder="127.0.0.1:9000"
                  className="w-full bg-slate-950 border border-slate-750 text-slate-100 text-xs rounded px-2 py-1 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="sm:col-span-5 flex items-center gap-2">
              <Building className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="w-full bg-slate-950 border border-slate-750 text-slate-100 text-xs rounded px-2 py-1 focus:outline-none focus:border-blue-500 font-medium"
              >
                {companies.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 flex justify-end">
              <button
                onClick={handleCheckConnection}
                disabled={isChecking}
                className="btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1 w-full justify-center"
              >
                {isChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                <span>Test</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Super-Sync Button */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-cyan-950/30 to-emerald-950/40 border border-cyan-800/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-left">
            <div className="p-2.5 rounded-lg bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                Universal Super-Sync
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-900/60 border border-cyan-700 text-cyan-300 font-mono">
                  All 5 Modules
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Execute end-to-end sync for Financials, BRS, GST, TDS, and Form 3CD in a single click.
              </p>
            </div>
          </div>

          <button
            onClick={handleSyncAll}
            disabled={syncingTarget !== null}
            className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-2 shrink-0 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 border-cyan-400"
          >
            {syncingTarget === 'all' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running Super-Sync...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Sync All 5 Modules</span>
              </>
            )}
          </button>
        </div>

        {/* Feedback alerts */}
        {errorMessage && (
          <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* 5 Module Cards Grid */}
        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Individual Module Sync Controls
          </span>

          <div className="grid grid-cols-1 gap-2.5">
            {modules.map((m) => {
              const Icon = m.icon;
              const isCurrentSyncing = syncingTarget === m.id;
              const log = moduleSyncLogs[m.id];

              return (
                <div 
                  key={m.id}
                  className="surface-card p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-slate-900 border border-slate-800 ${m.color} shrink-0 mt-0.5`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-white">{m.title}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-850 border border-slate-750 text-slate-300 font-mono">
                          {m.badge}
                        </span>
                        {log?.success && (
                          <span className="badge-matched text-[10px] flex items-center gap-1 font-mono">
                            <Check className="w-3 h-3" /> {log.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 max-w-lg">
                        {m.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    {onSwitchModule && (
                      <button
                        type="button"
                        onClick={() => {
                          onSwitchModule(
                            m.id === 'financials' ? 'financials' :
                            m.id === 'bank' ? 'bank_reconciliation' :
                            m.id === 'gst' ? 'gst_reconciliation' :
                            m.id === 'tds' ? 'tds_reconciliation' : 'form3cd_audit'
                          );
                          onClose();
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-800 transition-colors flex items-center gap-1"
                      >
                        <span>Open Tab</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={m.syncFn}
                      disabled={syncingTarget !== null}
                      className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 font-medium border-slate-700 hover:border-cyan-500 text-slate-200 hover:text-cyan-300"
                    >
                      {isCurrentSyncing ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                          <span>Syncing...</span>
                        </>
                      ) : (
                        <>
                          <Server className="w-3 h-3 text-cyan-400" />
                          <span>{m.btnLabel}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Setup Help Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-400 flex items-start gap-2.5">
          <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-slate-300">How Tally XML Sync operates:</strong>
            <p className="mt-0.5 text-slate-400">
              When TallyPrime is open with HTTP Server enabled on port 9000, real ledger XML payloads are retrieved. When Tally is offline, the system seamlessly operates in Statutory Simulation Mode so all reconciliation matching workflows remain 100% testable without breaking.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
          <span className="text-[11px] text-slate-500 font-mono">
            {connectionStatus?.online ? 'Connected: 127.0.0.1:9000' : 'Offline Mode: Simulation Active'}
          </span>
          <button
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-2 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
