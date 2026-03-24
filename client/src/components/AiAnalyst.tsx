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
      return 'System: Waiting_for_transactions';
    }
    return `System: Context_loaded (${transactionCount}_records)`;
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
      setError(e.message || "SYSTEM_ERROR: ANALYSIS_FAILED");
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
    <div className="bg-bone border-4 border-ink p-5 md:p-8 shadow-neo-gold relative overflow-hidden group">
      <div className="absolute -right-8 -bottom-8 opacity-5 group-hover:opacity-10 transition-opacity hidden sm:block">
        <SparklesIcon className="h-48 w-48 text-ink" />
      </div>

      <div className="relative z-10">
        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-ink text-usc-gold p-2 border-2 border-ink shadow-[3px_3px_0px_0px_#FFCC00] flex-shrink-0">
            <DocumentMagnifyingGlassIcon className="h-5 w-5 md:h-6 md:w-6" />
          </div>
          <h3 className="font-loud text-xl md:text-2xl text-ink leading-none break-words">AI_SPENDING_COPILOT</h3>
        </div>

        <div className="space-y-4 mb-4">
          <p className="font-bold text-xs md:text-sm text-ink/70 leading-tight border-l-4 border-usc-gold pl-4 max-w-full">
            CHAT WITH YOUR DATA. ASK ABOUT TRENDS, OVERSPENDING RISK, CATEGORY SHIFTS, OR QUICK SAVING MOVES.
          </p>
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-tighter opacity-50">{dataStatusLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleQuickPrompt(prompt)}
                className="px-2 py-1 border-2 border-ink bg-white text-ink font-mono text-[10px] uppercase hover:bg-usc-gold"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="h-72 md:h-80 overflow-y-auto border-4 border-ink bg-white/50 p-3 md:p-4 space-y-3 mb-4"
        >
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`w-full flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[90%] md:max-w-[80%] px-3 py-2 border-2 border-ink text-sm md:text-base whitespace-pre-wrap ${
                  message.role === 'user'
                    ? 'bg-usc-gold text-ink shadow-[2px_2px_0px_0px_#2B2B2B]'
                    : 'bg-bone text-ink'
                }`}
              >
                {message.role === 'assistant' ? renderAssistantMessage(message.content) : message.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="w-full flex justify-start">
              <div className="max-w-[90%] md:max-w-[80%] px-3 py-2 border-2 border-ink bg-bone text-ink text-sm md:text-base">
                Analyzing your account context...
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask one focused question for a brief answer..."
            className="w-full h-24 md:h-28 resize-none border-4 border-ink bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-0"
            disabled={isLoading}
          />
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => void handleSend()}
              disabled={isLoading || !input.trim()}
              className="font-loud text-base md:text-lg flex items-center justify-center px-4 md:px-6 py-3 md:py-4 bg-usc-gold text-ink border-4 border-ink shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'PROCESSING...' : 'SEND'}
            </button>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="font-loud text-base md:text-lg flex items-center justify-center px-4 md:px-6 py-3 md:py-4 bg-white text-ink border-4 border-ink shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              RESET
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-usc-cardinal text-bone border-2 border-ink shadow-neo flex items-center font-bold text-xs uppercase italic">
            <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default AiAnalyst;