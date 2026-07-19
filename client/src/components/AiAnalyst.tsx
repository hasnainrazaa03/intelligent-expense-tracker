import React, { useMemo, useRef, useState } from 'react';
import { chatWithAi } from '../services/api';
import { Expense, Income } from '../types';
import {
  SparklesIcon, ExclamationTriangleIcon, ChartPieIcon, CalendarDaysIcon,
  ClipboardDocumentListIcon, BanknotesIcon,
} from './Icons';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import cosmicRobot from '../assets/cosmic-robot.svg';

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

// Cosmic robot mascot (custom SVG asset). The SVG has a transparent background
// and its own soft glow; a drop-shadow adds a little extra lift on dark surfaces.
const Mascot: React.FC<{ className?: string }> = ({ className = 'w-16 h-16' }) => (
  <img
    src={cosmicRobot}
    alt="Orbit AI mascot"
    aria-hidden="true"
    className={`flex-shrink-0 object-contain select-none ${className}`}
    style={{ filter: 'drop-shadow(0 6px 20px rgba(124,108,255,0.4))' }}
  />
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
    <div className="glass rounded-2xl p-4 md:p-5 relative overflow-hidden flex flex-col md:h-[calc(100dvh-9rem)]">
      {/* ambient cosmic glow */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 w-80 h-80 rounded-full opacity-40"
        style={{ background: 'radial-gradient(circle, rgba(124,108,255,0.28), transparent 70%)' }} />

      {/* The chat area is the star: header + suggestions stay compact so the
          conversation gets the vertical space. Suggestions only show before the
          first message; once chatting, the chat area flexes to fill. */}
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        {/* COMPACT HEADER */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Mascot className="w-10 h-10 md:w-11 md:h-11 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display text-lg md:text-xl font-bold text-app-text leading-none flex items-center gap-1.5">
                AI Analyst <SparklesIcon className="h-4 w-4 text-primary" />
              </h2>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
                <span className="text-xs text-app-muted">
                  {recordCount === 0 ? 'Waiting for transactions' : `${recordCount} records analyzed`}
                </span>
              </div>
            </div>
          </div>
          {hasConversation && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface-2 border border-app-border px-3 py-1.5 text-xs font-semibold text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors flex-shrink-0"
              title="New chat"
              aria-label="Start a new chat"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-3.5 w-3.5"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
              New chat
            </button>
          )}
        </div>

        {/* CHAT AREA — flex-1, the main real estate */}
        <div
          ref={scrollRef}
          className="flex-1 min-h-[16rem] overflow-y-auto rounded-2xl border border-app-border bg-surface-2 p-4 mb-3"
        >
          {!hasConversation ? (
            <div className="h-full flex flex-col">
              {/* greeting + cosmic tip */}
              <div className="relative overflow-hidden rounded-xl flex items-center gap-3 md:gap-4 p-4 md:p-5"
                style={{ background: 'radial-gradient(120% 120% at 85% 20%, rgba(124,108,255,0.20), transparent 60%)' }}>
                <Mascot className="w-16 h-16 md:w-20 md:h-20 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-display text-lg md:text-xl font-bold text-app-text">Hi, Explorer! 👋</p>
                  <p className="text-sm text-app-muted mt-1 leading-relaxed">{cosmicTip}</p>
                </div>
              </div>

              {/* suggestions */}
              <p className="text-xs font-semibold text-app-muted uppercase tracking-wide mt-4 mb-2">Try asking</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {QUICK_PROMPTS.map((p) => (
                  <button
                    key={p.text}
                    onClick={() => void handleSend(p.text)}
                    disabled={isLoading}
                    className="flex items-center gap-2.5 text-left rounded-xl bg-surface border border-app-border px-3 py-2 hover:border-app-border-strong hover:bg-surface-2 transition-colors disabled:opacity-50"
                  >
                    <span className={`grid place-items-center w-7 h-7 rounded-lg flex-shrink-0 ${p.tint}`}>{p.icon}</span>
                    <span className="text-[13px] font-medium text-app-text leading-snug">{p.text}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[92%] md:max-w-[85%] px-4 py-3 rounded-2xl text-sm md:text-[15px] ${
                    message.role === 'user'
                      ? 'bg-primary text-on-primary rounded-br-md'
                      : 'bg-surface border border-app-border text-app-text rounded-bl-md shadow-soft'
                  }`}>
                    {message.role === 'assistant' ? renderAssistantMessage(message.content) : <span className="whitespace-pre-wrap">{message.content}</span>}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="w-full flex justify-start">
                  <div className="px-4 py-3 rounded-2xl rounded-bl-md bg-surface border border-app-border text-app-muted text-sm inline-flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Analyzing…
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* INPUT — larger */}
        <div className="relative flex-shrink-0">
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
          <div className="mt-3 p-3 rounded-xl bg-danger/10 border border-danger/40 text-danger flex items-center text-sm flex-shrink-0">
            <ExclamationTriangleIcon className="h-4 w-4 mr-2 flex-shrink-0" />
            {error}
          </div>
        )}

        <p className="mt-2 text-center text-[11px] text-app-faint flex items-center justify-center gap-1.5 flex-shrink-0">
          <span aria-hidden="true">🔒</span> Private &amp; secure · AI insights are informational only.
        </p>
      </div>
    </div>
  );
};

export default AiAnalyst;
