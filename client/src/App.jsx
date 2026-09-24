import React, { useState, useEffect } from 'react';
import StatusHeader from './components/StatusHeader';
import DataInputPanel from './components/DataInputPanel';
import PromptConsole from './components/PromptConsole';
import PreviewGrid from './components/PreviewGrid';
import GstReconView from './components/GstReconView';
import BankReconView from './components/BankReconView';
import TdsReconView from './components/TdsReconView';
import Form3cdView from './components/Form3cdView';
import TallySyncModal from './components/TallySyncModal';
import { FileCheck, Landmark, Scale, AlertCircle, Receipt, ClipboardCheck, Server } from 'lucide-react';

export default function App() {
  const [activeModule, setActiveModule] = useState('gst_reconciliation'); // default or toggle
  const [sharedTdsReconResult, setSharedTdsReconResult] = useState(null);
  const [status, setStatus] = useState(null);
  const [tallyStatus, setTallyStatus] = useState(null);
  const [isTallyHubOpen, setIsTallyHubOpen] = useState(false);
  const [preferredModel, setPreferredModel] = useState('');
  const [statutoryRegime, setStatutoryRegime] = useState('AUTO');
  const [aiProvider, setAiProvider] = useState('claude'); // 'claude' | 'ollama' | 'rules'
  const [claudeApiKey, setClaudeApiKey] = useState(() => localStorage.getItem('anthropic_api_key') || '');
  const [claudeModel, setClaudeModel] = useState(() => localStorage.getItem('anthropic_claude_model') || 'claude-sonnet-5');
  const [rawText, setRawText] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [schema, setSchema] = useState(null);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastFeedback, setLastFeedback] = useState('');

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
        if (data.ollama?.models?.length > 0 && !preferredModel) {
          setPreferredModel(data.ollama.models[0]);
        }
        // If Claude key not configured anywhere and Ollama is connected, default to Ollama or Rules
        const hasKey = !!localStorage.getItem('anthropic_api_key') || data.claudeBrain?.available;
        if (!hasKey && data.ollama?.connected) {
          setAiProvider('ollama');
        } else if (!hasKey && !data.ollama?.connected) {
          setAiProvider('rules');
        }
      } else {
        setStatus({ isOffline: true, error: `HTTP ${res.status}` });
      }
    } catch (err) {
      console.warn('Status check warning:', err.message);
      setStatus({ isOffline: true, error: err.message });
    }

    // Check Tally Server status on localhost:9000
    try {
      const tallyRes = await fetch('/api/tally/status');
      if (tallyRes.ok) {
        const tallyData = await tallyRes.json();
        setTallyStatus(tallyData);
      }
    } catch (tErr) {
      setTallyStatus({ online: false, source: 'TALLY_SIMULATED' });
    }
  };

  const handleTallyFinancialsSyncComplete = async (data) => {
    if (data.rawText) {
      setRawText(data.rawText);
      setIsGenerating(true);
      try {
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rawText: data.rawText,
            userPrompt: 'Structure into statutory Schedule III Balance Sheet and P&L statement',
            explicitRegime: statutoryRegime,
            aiProvider: 'rules'
          })
        });
        const analyzeJson = await analyzeRes.json();
        if (analyzeJson.schema) {
          setSchema(analyzeJson.schema);
          await generateExcelForSchema(analyzeJson.schema);
          setLastFeedback(`Imported ${data.itemCount} ledger accounts from Tally (${data.companyName || 'Tally'})`);
        }
      } catch (err) {
        console.error('Error generating from Tally sync:', err);
      } finally {
        setIsGenerating(false);
      }
    }
  };

  // Unified Execute action (handles both initial generation and interactive directives)
  const handleExecute = async () => {
    if (!schema) {
      await handleInitialGenerate();
    } else {
      if (!userPrompt.trim()) {
        await handleInitialGenerate();
      } else {
        await handleApplyAdjustment(userPrompt);
        setUserPrompt('');
      }
    }
  };

  const handleInitialGenerate = async () => {
    if (!rawText.trim() && !userPrompt.trim()) {
      setErrorMessage('Please paste financial data or enter a prompt command.');
      return;
    }

    setErrorMessage('');
    setLastFeedback('');
    setIsGenerating(true);

    try {
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          userPrompt,
          preferredModel,
          claudeModel,
          explicitRegime: statutoryRegime,
          aiProvider,
          apiKey: claudeApiKey || undefined
        })
      });

      if (!analyzeRes.ok) {
        const errJson = await analyzeRes.json();
        throw new Error(errJson.error || 'Failed to analyze financials');
      }

      const analyzeData = await analyzeRes.json();
      const currentSchema = analyzeData.schema;
      setSchema(currentSchema);

      await generateExcelForSchema(currentSchema);
      const brainSource = currentSchema.source === 'claude_brain' 
        ? '🧠 Claude 3.5 Sonnet' 
        : currentSchema.source === 'ollama' 
          ? '🦙 Ollama Local' 
          : '⚡ Statutory Rules Engine';
      setLastFeedback(`Generated via ${brainSource}: ${currentSchema.title} (${currentSchema.lineItems?.length || 0} line items)`);
    } catch (err) {
      console.error('Generation pipeline error:', err);
      setErrorMessage(err.message || 'An error occurred during generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const generateExcelForSchema = async (targetSchema) => {
    try {
      const excelRes = await fetch('/api/generate-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schema: targetSchema })
      });

      if (!excelRes.ok) {
        const errJson = await excelRes.json();
        throw new Error(errJson.error || 'Failed to create Excel workbook');
      }

      const excelData = await excelRes.json();
      setResult(excelData);
    } catch (err) {
      console.error('Excel generation error:', err);
      setErrorMessage('Excel generation failed: ' + err.message);
    }
  };

  const handleApplyAdjustment = async (userAdjustmentText) => {
    if (!schema) return;
    setIsGenerating(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: userAdjustmentText,
          currentSchema: schema,
          preferredModel,
          claudeModel,
          aiProvider,
          apiKey: claudeApiKey || undefined
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to apply adjustment');
      }

      const data = await res.json();
      if (data.updatedSchema) {
        setSchema(data.updatedSchema);
        await generateExcelForSchema(data.updatedSchema);
        setLastFeedback(data.reply || `Adjustment applied: "${userAdjustmentText}"`);
      }
    } catch (err) {
      console.error('Adjustment error:', err);
      setErrorMessage('Adjustment error: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-600/30">
      {/* Top System Status Bar */}
      <StatusHeader
        status={status}
        preferredModel={preferredModel}
        setPreferredModel={setPreferredModel}
        aiProvider={aiProvider}
        setAiProvider={setAiProvider}
        claudeApiKey={claudeApiKey}
        setClaudeApiKey={setClaudeApiKey}
        claudeModel={claudeModel}
        setClaudeModel={setClaudeModel}
      />

      {/* Module Switcher Navigation Tabs */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 px-4 md:px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <nav className="flex items-center gap-1.5 -mb-px overflow-x-auto whitespace-nowrap py-1">
            <button
              onClick={() => setActiveModule('gst_reconciliation')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium transition-colors border-b-2 shrink-0 ${
                activeModule === 'gst_reconciliation'
                  ? 'border-blue-500 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <FileCheck className={`w-4 h-4 ${activeModule === 'gst_reconciliation' ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>GST Reconciliation</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Rule 36(4)</span>
            </button>

            <button
              onClick={() => setActiveModule('bank_reconciliation')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium transition-colors border-b-2 shrink-0 ${
                activeModule === 'bank_reconciliation'
                  ? 'border-blue-500 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Scale className={`w-4 h-4 ${activeModule === 'bank_reconciliation' ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>Bank Reconciliation</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/50 border border-blue-700 text-blue-300 font-mono">BRS</span>
            </button>

            <button
              onClick={() => setActiveModule('tds_reconciliation')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium transition-colors border-b-2 shrink-0 ${
                activeModule === 'tds_reconciliation'
                  ? 'border-blue-500 text-white font-semibold bg-blue-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Receipt className={`w-4 h-4 ${activeModule === 'tds_reconciliation' ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>TDS Reconciliation</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/50 border border-blue-700 text-blue-300 font-mono">26AS / AIS</span>
            </button>

            <button
              onClick={() => setActiveModule('form3cd_audit')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium transition-colors border-b-2 shrink-0 ${
                activeModule === 'form3cd_audit'
                  ? 'border-emerald-500 text-white font-semibold bg-emerald-950/20'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <ClipboardCheck className={`w-4 h-4 ${activeModule === 'form3cd_audit' ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span>Form 3CD Tax Audit</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 border border-emerald-700 text-emerald-300 font-mono">Sec 44AB</span>
            </button>

            <button
              onClick={() => setActiveModule('financials')}
              className={`flex items-center gap-2 px-3.5 py-3 text-xs font-medium transition-colors border-b-2 shrink-0 ${
                activeModule === 'financials'
                  ? 'border-blue-500 text-white font-semibold'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <Landmark className={`w-4 h-4 ${activeModule === 'financials' ? 'text-blue-400' : 'text-slate-400'}`} />
              <span>Financial Statements</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Schedule III</span>
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0 pl-2">
            <button
              onClick={() => setIsTallyHubOpen(true)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-2 transition-all font-mono ${
                tallyStatus?.online
                  ? 'bg-emerald-950/70 border-emerald-700/80 text-emerald-300 hover:bg-emerald-900/50 shadow-sm'
                  : 'bg-slate-900 border-slate-750 text-slate-300 hover:border-cyan-500 hover:text-cyan-300'
              }`}
              title="Open TallyPrime Universal Sync Hub"
            >
              <Server className={`w-3.5 h-3.5 ${tallyStatus?.online ? 'text-emerald-400' : 'text-cyan-400'}`} />
              <span className="hidden sm:inline">Tally:</span>
              <span>{tallyStatus?.online ? 'Online (9000)' : 'Sync Hub'}</span>
              <span className={`w-2 h-2 rounded-full ${tallyStatus?.online ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`}></span>
            </button>

            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>127.0.0.1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        {activeModule === 'gst_reconciliation' ? (
          <GstReconView />
        ) : activeModule === 'bank_reconciliation' ? (
          <BankReconView currentSchema={schema} />
        ) : activeModule === 'tds_reconciliation' ? (
          <TdsReconView 
            currentSchema={schema} 
            onReconComplete={(reconData) => setSharedTdsReconResult(reconData)}
            onNavigateToForm3cd={() => setActiveModule('form3cd_audit')}
          />
        ) : activeModule === 'form3cd_audit' ? (
          <Form3cdView 
            currentSchema={schema} 
            tdsReconResult={sharedTdsReconResult}
            onNavigateToTds={() => setActiveModule('tds_reconciliation')}
          />
        ) : (
          <>
            {/* Error Banner */}
            {errorMessage && (
              <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  onClick={() => setErrorMessage('')}
                  className="btn-secondary text-[11px] py-1 px-2 text-rose-300 border-rose-800/50 hover:bg-rose-900/30"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Top Split Area: Left Input Panel | Right Merged Unified Command Console */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Raw Financial Data Input */}
              <div className="lg:col-span-6 flex flex-col gap-4">
                <DataInputPanel
                  rawText={rawText}
                  setRawText={setRawText}
                />
              </div>

              {/* Right Column: Unified CA Command Bar & Statutory Controller */}
              <div className="lg:col-span-6 flex flex-col gap-4">
                <PromptConsole
                  userPrompt={userPrompt}
                  setUserPrompt={setUserPrompt}
                  onExecute={handleExecute}
                  isGenerating={isGenerating}
                  statutoryRegime={statutoryRegime}
                  setStatutoryRegime={setStatutoryRegime}
                  hasData={rawText.trim().length > 0}
                  hasExistingSchema={!!schema}
                  lastFeedback={lastFeedback}
                />
              </div>
            </div>

            {/* Bottom Area: Live Financial Statement Preview & Reconciliation Grid */}
            <div className="w-full">
              <PreviewGrid
                schema={schema}
                result={result}
                isGenerating={isGenerating}
                onApplyAdjustment={handleApplyAdjustment}
              />
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-slate-800/60 text-center text-xs text-slate-400">
        Local AI Financial Bot • Unified CA Directives & Statutory Frameworks Engine • 100% Offline
      </footer>

      {/* Universal TallyPrime Sync Hub Modal */}
      <TallySyncModal
        isOpen={isTallyHubOpen}
        onClose={() => setIsTallyHubOpen(false)}
        activeModule={activeModule}
        onSwitchModule={(mod) => setActiveModule(mod)}
        onSyncComplete={handleTallyFinancialsSyncComplete}
      />
    </div>
  );
}
