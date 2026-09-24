import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, Sparkles, Bot, User, Loader2, AlertCircle, Lightbulb, CheckCircle2 } from 'lucide-react';

export default function InteractiveChatPanel({
  currentSchema,
  setCurrentSchema,
  preferredModel,
  onGenerateExcel
}) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! I am your **Virtual Indian Chartered Accountant (CA)**. I can help refine your Schedule III P&L, Balance Sheet, or Cash Flow, adjust tax rates under Section 115BAA, calculate EBITDA, or answer AIS/TIS compliance questions. How can I assist you?'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [auditorInsights, setAuditorInsights] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMessage.trim() || isSending) return;

    const userText = inputMessage.trim();
    setInputMessage('');

    const newHistory = [...messages, { role: 'user', content: userText }];
    setMessages(newHistory);
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: userText,
          currentSchema,
          chatHistory: newHistory,
          preferredModel
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to get CA response');
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.reply }
      ]);

      if (data.updatedSchema) {
        setCurrentSchema(data.updatedSchema);
      }

      if (data.auditorInsights) {
        setAuditorInsights(data.auditorInsights);
      }
    } catch (err) {
      console.error('Chat error:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `⚠️ **Error**: ${err.message}` }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickPrompt = (promptText) => {
    setInputMessage(promptText);
  };

  return (
    <div className="surface-card p-5 flex flex-col h-[520px]">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-slate-100 uppercase tracking-wide">Interactive CA Assistant</h3>
            <p className="text-[11px] text-slate-400">Multi-turn dialogue & real-time financial adjustments</p>
          </div>
        </div>
        <span className="badge-matched">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block mr-1"></span>
          Live Session Active
        </span>
      </div>

      {/* Proactive Auditor Insights Banner */}
      {auditorInsights.length > 0 && (
        <div className="my-2 p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-amber-300 mb-1">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" /> Auditor Insights & Suggestions:
          </div>
          <div className="space-y-1 text-[11px] text-amber-200/90 leading-tight">
            {auditorInsights.map((ins, idx) => (
              <div key={idx}>• <span className="font-medium text-amber-100">{ins.title}:</span> {ins.message}</div>
            ))}
          </div>
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 my-3 scrollbar-thin scrollbar-thumb-slate-800">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-blue-400" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg p-3 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-200 shadow-sm'
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
            {msg.role === 'user' && (
              <div className="w-6 h-6 rounded-md bg-slate-800 border border-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-300" />
              </div>
            )}
          </div>
        ))}
        {isSending && (
          <div className="flex gap-2.5 justify-start items-center">
            <div className="w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Bot className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div className="bg-slate-900 text-slate-400 border border-slate-800 rounded-lg p-2.5 text-xs flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" /> CA Assistant is analyzing...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => handleQuickPrompt("Calculate corporate tax at 22% under Section 115BAA")}
          className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-750 hover:border-slate-600 whitespace-nowrap transition-colors"
        >
          22% Sec 115BAA Tax
        </button>
        <button
          onClick={() => handleQuickPrompt("What is our EBITDA and PAT margin?")}
          className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-750 hover:border-slate-600 whitespace-nowrap transition-colors"
        >
          EBITDA & Margins
        </button>
        <button
          onClick={() => handleQuickPrompt("Add AMC Revenue ₹6,00,000")}
          className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-750 hover:border-slate-600 whitespace-nowrap transition-colors"
        >
          + Add AMC Revenue ₹6L
        </button>
        <button
          onClick={() => handleQuickPrompt("Switch document to Schedule III Balance Sheet")}
          className="text-[11px] px-2.5 py-1 rounded-md bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-750 hover:border-slate-600 whitespace-nowrap transition-colors"
        >
          Switch to Balance Sheet
        </button>
      </div>

      {/* Input Box */}
      <form onSubmit={handleSendMessage} className="flex gap-2 mt-1">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Ask CA advice, adjust tax rate, add line items..."
          disabled={isSending}
          className="flex-1 bg-slate-900/90 border border-slate-750 rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          type="submit"
          disabled={isSending || !inputMessage.trim()}
          className="btn-primary px-3 py-2 rounded-lg flex items-center justify-center disabled:opacity-40 shadow-sm"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
}
