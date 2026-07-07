import React, { useMemo, useRef, useState } from 'react';
import { chatWithAi } from '../services/api';
import { Expense, Income } from '../types';
import { SparklesIcon, DocumentMagnifyingGlassIcon, ExclamationTriangleIcon } from './Icons';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

interface AiAnalystProps {
  expenses: Expense[];
  incomes: Income[];
}

type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const QUICK_PROMPTS = [
  'What are my top 3 spending leaks this month?',
  'Give me a 7-day spending plan to stay on budget.',
  'Where can I save quickly without hurting essentials?',
  'Summarize this month in 5 bullet points.',
];

const AiAnalyst: React.FC<AiAnalystProps> = ({ expenses, incomes }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        'Ask anything about your spending, categories, or budget performance. I can answer using your account context.',
    },
  ]);
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

  const dataStatusLabel = useMemo(() => {
    const transactionCount = expenses.length + incomes.length;
    if (transactionCount === 0) {
      return 'Waiting for transactions';
    }
    return `Context loaded (${transactionCount} records)`;
  }, [expenses.length, incomes.length]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) {
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const result = await chatWithAi(
        trimmed,
        nextMessages
          .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
          .slice(-8)
          .map((msg) => ({ role: msg.role, content: msg.content }))
      );

      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
    } catch (e: any) {
      setError(e.message || "Analysis failed");
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

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleReset = () => {
    setMessages([
      {
        role: 'assistant',
        content:
          'New chat ready. Ask one focused question and I will keep it concise with actionable steps.',
      },
    ]);
    setInput('');
    setError(null);
  };

  return (
    <div className="glass rounded-2xl p-5 md:p-7 relative overflow-hidden group">
      <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:opacity-10 transition-opacity hidden sm:block">
        <SparklesIcon className="h-48 w-48 text-app-text" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-surface-2 border border-app-border text-primary p-2 rounded-xl flex-shrink-0">
            <DocumentMagnifyingGlassIcon className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <h3 className="font-display font-bold text-xl md:text-2xl text-app-text leading-none break-words">AI analyst</h3>
        </div>

        <div className="space-y-4 mb-4">
          <p className="text-xs md:text-sm text-app-muted leading-tight border-l-2 border-primary/50 pl-4 max-w-full">
            Chat with your data. Ask about trends, overspending risk, category shifts, or quick saving moves.
          </p>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-ok animate-pulse flex-shrink-0" />
            <span className="text-[9px] md:text-[10px] tracking-tight text-app-faint">{dataStatusLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleQuickPrompt(prompt)}
                className="rounded-full bg-surface-2 border border-app-border px-3 py-1.5 text-sm text-app-muted hover:text-app-text hover:border-app-border-strong transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="h-72 md:h-80 overflow-y-auto rounded-2xl border border-app-border bg-surface-2 p-3 md:p-4 space-y-3 mb-4"
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] md:max-w-[80%] px-3 py-2 rounded-2xl text-sm md:text-base whitespace-pre-wrap ${
                  message.role === 'user'
                    ? 'bg-primary text-on-primary'
                    : 'glass text-app-text'
                }`}
              >
                {message.role === 'assistant' ? renderAssistantMessage(message.content) : message.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="w-full flex justify-start">
              <div className="max-w-[90%] md:max-w-[80%] px-3 py-2 rounded-2xl glass text-app-text text-sm md:text-base">
                Analyzing…
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask one focused question for a brief answer…"
            className="w-full h-24 md:h-28 resize-none bg-surface-2 border border-app-border rounded-xl px-4 py-3 text-app-text placeholder:text-app-faint focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-all"
            disabled={isLoading}
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => void handleSend()}
              disabled={isLoading || !input.trim()}
              className="rounded-xl font-semibold text-base md:text-lg flex items-center justify-center px-4 md:px-6 py-3 md:py-4 bg-primary text-on-primary shadow-glow hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing…' : 'Send'}
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="rounded-xl font-semibold text-base md:text-lg flex items-center justify-center px-4 md:px-6 py-3 md:py-4 bg-surface-2 border border-app-border text-app-text hover:border-app-border-strong active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-surface-2 border border-danger/40 text-danger flex items-center text-xs">
            <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default AiAnalyst;