import React, { useMemo, useRef, useState } from 'react';
import { chatWithAi } from '../services/api';
import { Expense, Income } from '../types';
import {
  SparklesIcon, ExclamationTriangleIcon, ChartPieIcon, CalendarDaysIcon,
  ClipboardDocumentListIcon, BanknotesIcon,
} from './Icons';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

interface AiAnalystProps {
  expenses: Expense[];
  incomes: Income[];
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

const QUICK_PROMPTS: Array<{ text: string; icon: React.ReactNode; tint: string }> = [
  { text: 'What are my top 3 spending leaks this month?', icon: <ChartPieIcon className="h-4 w-4" />, tint: 'text-[color:var(--color-cat-indigo)] bg-[color:var(--color-cat-indigo)]/15' },
  { text: 'Give me a 7-day spending plan to stay on budget.', icon: <CalendarDaysIcon className="h-4 w-4" />, tint: 'text-[color:var(--color-cat-sky)] bg-[color:var(--color-cat-sky)]/15' },
  { text: 'Where can I save quickly without hurting essentials?', icon: <BanknotesIcon className="h-4 w-4" />, tint: 'text-ok bg-ok/15' },
  { text: 'Summarize this month in 5 bullet points.', icon: <ClipboardDocumentListIcon className="h-4 w-4" />, tint: 'text-warn bg-warn/15' },
];

// Friendly gradient "mascot" orb (no external image — CSP-safe, high contrast).
const Mascot: React.FC<{ className?: string }> = ({ className = 'w-14 h-14 text-3xl' }) => (
  <div className={`relative grid place-items-center rounded-2xl flex-shrink-0 ${className}`}
    style={{ background: 'radial-gradient(circle at 30% 25%, #8b7ff6, #5b45d6 70%)', boxShadow: '0 8px 30px rgba(124,108,255,0.45)' }}>
    <span aria-hidden="true">🤖</span>
  </div>
);

const AiAnalyst: React.FC<AiAnalystProps> = ({ expenses, incomes }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const renderAssistantMessage = (content: string) => {
    const html = marked.parse(content, { breaks: true, gfm: true });
    const sanitized = DOMPurify.sanitize(html as string);
    return <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: sanitized }} />;
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  const recordCount = expenses.length + incomes.length;

  // Data-driven "Cosmic tip": this month vs last month spend.
  const cosmicTip = useMemo(() => {
    if (recordCount === 0) return 'Log a few expenses and I’ll surface trends and quick saving moves right here.';
    const now = new Date();
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const thisKey = key(now);
    const lastKey = key(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    let thisM = 0, lastM = 0;
    for (const e of expenses) {
      if (e.date.startsWith(thisKey)) thisM += e.amount;
      else if (e.date.startsWith(lastKey)) lastM += e.amount;
    }
    if (lastM <= 0) return 'You’re just getting started this month — ask me where your money is going. ✨';
    const pct = Math.round(((thisM - lastM) / lastM) * 100);
    if (pct <= 0) return `You’ve spent ${Math.abs(pct)}% less than last month so far. Keep it up! 🚀`;
    return `You’re spending ${pct}% more than last month so far — worth a quick review. 🔍`;
  }, [expenses, recordCount]);

  const handleSend = async (preset?: string) => {
    const trimmed = (preset ?? input).trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setError(null);
    scrollToBottom();

    try {
      const result = await chatWithAi(
        trimmed,
        nextMessages.slice(-8).map((msg) => ({ role: msg.role, content: msg.content })),
      );
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
    } catch (e: any) {
      setError(e.message || 'Analysis failed');
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
    setError(null);
  };

  const hasConversation = messages.length > 0;

  return (
    <div className="glass rounded-2xl p-5 md:p-7 relative overflow-hidden">
      {/* ambient cosmic glow */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(124,108,255,0.28), transparent 70%)' }} />

      <div className="relative z-10">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 mb-7">
          <div className="flex items-start gap-4 min-w-0">
            <Mascot />
            <div className="min-w-0">
              <h2 className="font-display text-2xl md:text-3xl font-bold text-app-text leading-tight flex items-center gap-2">
                AI Analyst <SparklesIcon className="h-5 w-5 text-primary" />
              </h2>
              <p className="text-sm text-app-muted mt-1.5 max-w-lg leading-relaxed">
                Your smart financial companion. Ask anything about your spending and get personalized, actionable insights.
              </p>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
                <span className="text-xs font-medium text-app-muted">{recordCount === 0 ? 'Waiting for transactions' : 'Context loaded'}</span>
                {recordCount > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-primary-soft text-primary text-xs font-semibold tabular-nums">
                    {recordCount} records analyzed
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Cosmic tip */}
          <div className="rounded-2xl border border-app-border bg-surface-2 p-4 w-full lg:max-w-xs flex gap-3 items-start flex-shrink-0">
            <div className="grid place-items-center w-10 h-10 rounded-xl flex-shrink-0 text-xl"
              style={{ background: 'radial-gradient(circle at 35% 30%, #7c6cff, #2a2350 75%)' }}>
              <span aria-hidden="true">🪐</span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-app-text">Cosmic tip</p>
              <p className="text-xs text-app-muted mt-1 leading-relaxed">{cosmicTip}</p>
            </div>
          </div>
        </div>

        {/* TRY ASKING */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-app-text flex items-center gap-1.5">
              Try asking <SparklesIcon className="h-4 w-4 text-primary" />
            </p>
            {hasConversation && (
              <button
                onClick={handleReset}
                className="grid place-items-center w-9 h-9 rounded-xl bg-surface-2 border border-app-border text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors"
                title="New chat"
                aria-label="Start a new chat"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p.text}
                onClick={() => void handleSend(p.text)}
                disabled={isLoading}
                className="flex items-center gap-3 text-left rounded-xl bg-surface-2 border border-app-border px-3.5 py-3 hover:border-app-border-strong hover:bg-surface transition-colors disabled:opacity-50"
              >
                <span className={`grid place-items-center w-8 h-8 rounded-lg flex-shrink-0 ${p.tint}`}>{p.icon}</span>
                <span className="text-sm font-medium text-app-text leading-snug">{p.text}</span>
              </button>
            ))}
          </div>
        </div>

        {/* CHAT AREA */}
        <div
          ref={scrollRef}
          className="min-h-[16rem] max-h-[26rem] overflow-y-auto rounded-2xl border border-app-border bg-surface-2 p-4 md:p-5 mb-4"
        >
          {!hasConversation ? (
            <div className="relative overflow-hidden rounded-xl h-full min-h-[14rem] flex items-center p-5 md:p-7"
              style={{ background: 'radial-gradient(120% 120% at 85% 20%, rgba(124,108,255,0.20), transparent 60%)' }}>
              <div className="flex items-center gap-4 md:gap-5">
                <Mascot className="w-16 h-16 md:w-20 md:h-20 text-4xl md:text-5xl" />
                <div>
                  <p className="font-display text-xl md:text-2xl font-bold text-app-text">Hi, Explorer! 👋</p>
                  <p className="text-sm md:text-base text-app-muted mt-1.5 max-w-md leading-relaxed">
                    I&rsquo;m here to help you understand your finances better. Ask me anything, or pick a suggestion above.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] md:max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm md:text-base ${
                    message.role === 'user'
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface border border-app-border text-app-text'
                  }`}>
                    {message.role === 'assistant' ? renderAssistantMessage(message.content) : <span className="whitespace-pre-wrap">{message.content}</span>}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="w-full flex justify-start">
                  <div className="px-3.5 py-2.5 rounded-2xl bg-surface border border-app-border text-app-muted text-sm inline-flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Analyzing…
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* INPUT */}
        <div className="relative">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your spending, categories, or budget performance…"
            className="w-full h-24 resize-none bg-surface-2 border border-app-border rounded-2xl pl-4 pr-32 py-3.5 text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            disabled={isLoading}
          />
          <button
            onClick={() => void handleSend()}
            disabled={isLoading || !input.trim()}
            className="absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 bg-primary text-on-primary font-semibold text-sm shadow-glow hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <SparklesIcon className="h-4 w-4" />
            {isLoading ? 'Processing…' : 'Send'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-danger/10 border border-danger/40 text-danger flex items-center text-sm">
            <ExclamationTriangleIcon className="h-4 w-4 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        <p className="mt-4 text-center text-xs text-app-muted flex items-center justify-center gap-1.5">
          <span aria-hidden="true">🔒</span> Your data is secure and private. AI insights are for informational purposes only.
        </p>
      </div>
    </div>
  );
};

export default AiAnalyst;
