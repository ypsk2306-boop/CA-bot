import React, { useState } from 'react';
import { Cpu, ShieldCheck, HardDrive, Layers, Brain, Key, Sparkles, Settings } from 'lucide-react';
import ClaudeKeyModal from './ClaudeKeyModal';

export default function StatusHeader({
  status,
  preferredModel,
  setPreferredModel,
  aiProvider,
  setAiProvider,
  claudeApiKey,
  setClaudeApiKey,
  claudeModel = 'claude-sonnet-5',
  setClaudeModel
}) {
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);

  const isOffline = !status || status?.isOffline;
  const isOllamaConnected = status?.ollama?.connected;
  const models = status?.ollama?.models || [];
  const serverHasClaudeKey = status?.claudeBrain?.available || false;
  const hasClaudeKey = !!claudeApiKey || serverHasClaudeKey;

  return (
    <>
      <header className="border-b border-slate-800 bg-slate-900/95 px-5 py-3 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Title & Authoritative CA Branding */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-blue-400 shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-sm font-semibold tracking-tight text-white">Local AI Financial Bot</h1>
                <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Air-Gapped Local CA Engine
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Statutory compliance engine for Indian Chartered Accountants &bull; Schedule III, MSME 43B(h), GST ITC
              </p>
            </div>
          </div>

          {/* Engine & Brain Selector Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            {isOffline ? (
              <div className="px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 bg-rose-950/50 border-rose-800/60 text-rose-300">
                <HardDrive className="w-3.5 h-3.5 text-rose-400" />
                <span>Backend Offline (Port 3001)</span>
              </div>
            ) : (
              <>
                {/* Segmented AI Provider Control */}
                <div className="inline-flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
                  {/* Claude Brain Button */}
                  <button
                    onClick={() => setAiProvider('claude')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      aiProvider === 'claude'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                    }`}
                  >
                    <Brain className="w-3.5 h-3.5" />
                    <span>Claude Brain</span>
                  </button>

                  {/* Ollama Local Button */}
                  <button
                    onClick={() => setAiProvider('ollama')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      aiProvider === 'ollama'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                    }`}
                  >
                    <HardDrive className="w-3.5 h-3.5" />
                    <span>Ollama Local</span>
                  </button>

                  {/* Rules Engine Button */}
                  <button
                    onClick={() => setAiProvider('rules')}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      aiProvider === 'rules'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Rules Engine</span>
                  </button>
                </div>

                {/* Claude Model Selector (Visible when Claude is selected) */}
                {aiProvider === 'claude' && (
                  <div className="flex items-center gap-1 bg-slate-850 border border-slate-750 rounded-lg px-2 py-1">
                    <select
                      value={claudeModel || 'claude-sonnet-5'}
                      onChange={(e) => {
                        if (setClaudeModel) {
                          setClaudeModel(e.target.value);
                          localStorage.setItem('anthropic_claude_model', e.target.value);
                        }
                      }}
                      className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer font-medium pr-1"
                    >
                      <option value="claude-sonnet-5" className="bg-slate-900 text-slate-200">Claude Sonnet 5</option>
                      <option value="claude-opus-5" className="bg-slate-900 text-slate-200">Claude Opus 5</option>
                      <option value="claude-haiku-4-5-20251001" className="bg-slate-900 text-slate-200">Claude Haiku 4.5</option>
                      <option value="claude-3-5-sonnet-20241022" className="bg-slate-900 text-slate-200">Claude 3.5 Sonnet</option>
                    </select>
                  </div>
                )}

                {/* Claude Brain API Key Settings Button */}
                <button
                  onClick={() => setIsKeyModalOpen(true)}
                  className={`btn-secondary text-xs py-1 px-2.5 flex items-center gap-1.5 ${
                    hasClaudeKey
                      ? 'text-slate-200 border-slate-700'
                      : 'text-amber-300 border-amber-800/50 bg-amber-950/20 hover:bg-amber-950/40'
                  }`}
                  title="Configure Anthropic Claude API Key"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>{hasClaudeKey ? 'Claude Key Active' : 'Configure Key'}</span>
                  <Settings className="w-3 h-3 text-slate-400 ml-0.5" />
                </button>

                {/* Ollama Model Selector (Visible when Ollama is connected) */}
                {aiProvider === 'ollama' && isOllamaConnected && models.length > 0 && (
                  <div className="flex items-center gap-1 bg-slate-850 border border-slate-750 rounded-lg px-2 py-1">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <select
                      value={preferredModel || models[0]}
                      onChange={(e) => setPreferredModel(e.target.value)}
                      className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer font-medium pr-1"
                    >
                      {models.map(m => (
                        <option key={m} value={m} className="bg-slate-900 text-slate-200">
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </header>

      {/* Claude API Key Modal */}
      <ClaudeKeyModal
        isOpen={isKeyModalOpen}
        onClose={() => setIsKeyModalOpen(false)}
        apiKey={claudeApiKey}
        setApiKey={setClaudeApiKey}
        serverHasKey={serverHasClaudeKey}
        claudeModel={claudeModel}
        setClaudeModel={setClaudeModel}
      />
    </>
  );
}
