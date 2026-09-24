import React, { useState } from 'react';
import { Key, ShieldCheck, CheckCircle2, AlertCircle, Loader2, X, ExternalLink, Trash2, Sparkles } from 'lucide-react';

export default function ClaudeKeyModal({ 
  isOpen, 
  onClose, 
  apiKey, 
  setApiKey, 
  serverHasKey,
  claudeModel = 'claude-sonnet-5',
  setClaudeModel
}) {
  const [inputKey, setInputKey] = useState(apiKey || '');
  const [selectedModel, setSelectedModel] = useState(claudeModel);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  if (!isOpen) return null;

  const handleSave = () => {
    const trimmed = inputKey.trim();
    setApiKey(trimmed);
    localStorage.setItem('anthropic_api_key', trimmed);
    if (setClaudeModel) {
      setClaudeModel(selectedModel);
      localStorage.setItem('anthropic_claude_model', selectedModel);
    }
    onClose();
  };

  const handleClear = () => {
    setInputKey('');
    setApiKey('');
    localStorage.removeItem('anthropic_api_key');
    setTestResult(null);
  };

  const handleTestKey = async () => {
    const keyToTest = inputKey.trim();
    if (!keyToTest && !serverHasKey) {
      setTestResult({ success: false, message: 'Please enter an API Key to test.' });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/test-claude-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiKey: keyToTest || undefined,
          model: selectedModel 
        })
      });

      const data = await res.json();
      if (res.ok && data.valid) {
        setTestResult({ success: true, message: `Claude Brain Connected! (${data.testedModel || selectedModel} verified)` });
      } else {
        setTestResult({ success: false, message: data.error || 'Invalid API Key or connection failed.' });
      }
    } catch (err) {
      setTestResult({ success: false, message: 'Connection test failed: ' + err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="surface-card w-full max-w-lg p-6 flex flex-col gap-5 border border-slate-750 shadow-2xl relative">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                Claude AI Brain Settings
              </h3>
              <p className="text-xs text-slate-400">Configure Anthropic Claude 3.5 Sonnet as your Senior CA Brain</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 flex flex-col gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <ShieldCheck className="w-4 h-4 text-blue-400" />
            <span>Senior CA Brain Role (Verification & Audit)</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Claude 3.5 Sonnet handles mathematical cross-verification, Schedule III classifications, Sec 43B(h) MSME audit computations, and analytical ratio explanations.
          </p>
          {serverHasKey && (
            <div className="text-[11px] text-emerald-400 font-medium flex items-center gap-1.5 mt-1 pt-1.5 border-t border-slate-800">
              <CheckCircle2 className="w-3.5 h-3.5" /> Key detected from server environment. You can override it below or leave blank.
            </div>
          )}
        </div>

        {/* Claude Brain Model Selection */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-300">
            Select Claude Brain Model
          </label>
          <select
            value={selectedModel}
            onChange={(e) => {
              setSelectedModel(e.target.value);
              setTestResult(null);
            }}
            className="w-full bg-slate-950 border border-slate-750 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
          >
            <option value="claude-sonnet-5">claude-sonnet-5 (Recommended — Claude 3.5 Sonnet CA Brain)</option>
            <option value="claude-opus-5">claude-opus-5 (Claude Opus — Deepest Statutory Audit)</option>
            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001 (Claude Haiku — Ultra Fast)</option>
            <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet-20241022 (Legacy Fallback)</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span>Anthropic API Key (sk-ant-...)</span>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-normal"
            >
              Get Key <ExternalLink className="w-3 h-3" />
            </a>
          </label>
          <input
            type="password"
            value={inputKey}
            onChange={(e) => {
              setInputKey(e.target.value);
              setTestResult(null);
            }}
            placeholder={serverHasKey ? "Using server environment key (enter here to override)" : "sk-ant-api03-..."}
            className="w-full bg-slate-950 border border-slate-750 rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 font-mono tracking-wider transition-colors"
          />
          <p className="text-[10px] text-slate-400 leading-relaxed">
            <span className="text-amber-400 font-semibold">Security Note:</span> Keys entered in the browser are stored in browser <code className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">localStorage</code> in plain text for convenience. For highest security in multi-user/shared environments, configure <code className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">ANTHROPIC_API_KEY</code> directly in the server <code className="text-slate-300 bg-slate-800 px-1 py-0.5 rounded">.env</code> file.
          </p>
        </div>

        {testResult && (
          <div className={`p-3 rounded-lg border text-xs flex items-center gap-2.5 animate-fadeIn ${
            testResult.success 
              ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-300'
              : 'bg-rose-950/30 border-rose-800/40 text-rose-300'
          }`}>
            {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-800/80 pt-3 mt-1">
          <div className="flex items-center gap-2">
            <button
              onClick={handleTestKey}
              disabled={testing || (!inputKey.trim() && !serverHasKey)}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 font-medium disabled:opacity-40"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-blue-400" />}
              <span>Test Key</span>
            </button>
            {apiKey && (
              <button
                onClick={handleClear}
                className="btn-secondary text-rose-400 hover:text-rose-300 border-rose-800/40 hover:bg-rose-950/30 text-xs px-2.5 py-1.5 flex items-center gap-1 transition-colors"
                title="Clear saved key from browser"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="btn-ghost text-xs px-3 py-1.5 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="btn-primary text-xs px-4 py-1.5 font-semibold"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
