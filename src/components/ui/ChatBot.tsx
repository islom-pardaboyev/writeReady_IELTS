import { useState, useRef, useEffect, type ReactNode } from 'react';
import { TOGGLE_ASSISTANT_EVENT } from '@/lib/shortcuts';
import { useAuth } from '@/hooks/useAuth';

function renderMarkdown(text: string): ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, li) => {
    // numbered list
    const numMatch = line.match(/^(\d+)\.\s+(.*)/);
    // bullet list
    const bulletMatch = line.match(/^[-*]\s+(.*)/);

    const parseLine = (raw: string): ReactNode[] => {
      // bold+italic ***text***, italic+bold
      // bold **text**, italic *text*, inline code `text`
      const parts: ReactNode[] = [];
      const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|_(.+?)_|\*(.+?)\*|`(.+?)`)/g;
      let last = 0, m: RegExpExecArray | null;
      while ((m = re.exec(raw)) !== null) {
        if (m.index > last) parts.push(raw.slice(last, m.index));
        if (m[2]) parts.push(<strong key={m.index}><em>{m[2]}</em></strong>);
        else if (m[3]) parts.push(<strong key={m.index}>{m[3]}</strong>);
        else if (m[4]) parts.push(<strong key={m.index}>{m[4]}</strong>);
        else if (m[5]) parts.push(<em key={m.index}>{m[5]}</em>);
        else if (m[6]) parts.push(<em key={m.index}>{m[6]}</em>);
        else if (m[7]) parts.push(<code key={m.index} className="bg-black/10 dark:bg-white/10 rounded px-1 font-mono text-[0.8em]">{m[7]}</code>);
        last = m.index + m[0].length;
      }
      if (last < raw.length) parts.push(raw.slice(last));
      return parts;
    };

    if (numMatch) {
      return <div key={li} className="flex gap-1.5 my-0.5"><span className="shrink-0 font-semibold">{numMatch[1]}.</span><span>{parseLine(numMatch[2])}</span></div>;
    }
    if (bulletMatch) {
      return <div key={li} className="flex gap-1.5 my-0.5"><span className="shrink-0">•</span><span>{parseLine(bulletMatch[1])}</span></div>;
    }
    if (line === '') return <div key={li} className="h-2" />;
    return <div key={li}>{parseLine(line)}</div>;
  });
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'How do I improve my band score?',
  'What is a good essay structure?',
  'Check my sentence: "The graph show…"',
  'Difference between Task 1 and Task 2?',
];

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      <line x1="12" y1="3" x2="12" y2="7" />
      <circle cx="9" cy="16" r="1" fill="currentColor" />
      <circle cx="15" cy="16" r="1" fill="currentColor" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function ChatBot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Hand focus back to the launcher so keyboard users don't land on <body>.
  const close = () => {
    setOpen(false);
    toggleRef.current?.focus();
  };

  // The "open or close the AI assistant" keyboard shortcut. Cancelling the
  // event tells the shortcut this page has an assistant.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    const onToggle = (e: Event) => {
      e.preventDefault();
      if (openRef.current) {
        setOpen(false);
        toggleRef.current?.focus();
      } else {
        setOpen(true);
      }
    };
    window.addEventListener(TOGGLE_ASSISTANT_EVENT, onToggle);
    return () => window.removeEventListener(TOGGLE_ASSISTANT_EVENT, onToggle);
  }, []);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const newMessages: Message[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      // A signed-in student gets their own, larger daily allowance (api/chat.ts).
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = await user?.getIdToken().catch(() => null);
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json() as { reply?: string; error?: string };
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.reply ?? data.error ?? 'Something went wrong.',
      }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Network error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {/* Floating button */}
      <button
        ref={toggleRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="ielts-assistant"
        className="fixed bottom-6 right-6 z-[200] w-14 h-14 rounded-full bg-[var(--ink-blue-solid)] text-white shadow-lg flex items-center justify-center hover:opacity-90 transition-colors"
        aria-label={open ? 'Close IELTS assistant' : 'Open IELTS assistant'}
      >
        {open ? <CloseIcon /> : <BotIcon />}
      </button>

      {/* Chat window */}
      {open && (
        <div
          id="ielts-assistant"
          role="dialog"
          aria-label="IELTS assistant"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            }
          }}
          className="fixed bottom-24 right-6 z-[200] w-[360px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.18)] border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden"
          style={{ height: '480px' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-color)] bg-[var(--ink-blue-solid)] shrink-0">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white">
              <BotIcon />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">IELTS Assistant</p>
              <p className="text-[0.65rem] text-white/85">Powered by AI · Ask me anything</p>
            </div>
            <button type="button" onClick={close} className="text-white/85 hover:text-white transition-colors bg-transparent border-0 cursor-pointer p-1" aria-label="Close IELTS assistant">
              <CloseIcon />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3" aria-live="polite">
            {messages.length === 0 ? (
              <div className="flex flex-col gap-3">
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 text-[var(--ink-blue)] dark:text-brand-300 flex items-center justify-center shrink-0 mt-0.5">
                    <BotIcon />
                  </div>
                  <div className="bg-[var(--bg-subtle)] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[var(--text-primary)] max-w-[85%]">
                    Hi! I'm your IELTS Writing assistant. Ask me about essay structure, vocabulary, grammar, or band scores.
                  </div>
                </div>
                <p className="text-[0.7rem] text-[var(--text-secondary)] text-center mt-1">Suggestions</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="text-left text-xs text-[var(--ink-blue)] dark:text-brand-300 border border-brand-200 dark:border-brand-800 rounded-xl px-3 py-2 bg-brand-50 dark:bg-brand-900/20 hover:bg-brand-100 dark:hover:bg-brand-900/40 transition-colors cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`flex gap-2.5 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  {m.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 text-[var(--ink-blue)] dark:text-brand-300 flex items-center justify-center shrink-0 mt-0.5">
                      <BotIcon />
                    </div>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm max-w-[85%] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-[var(--ink-blue-solid)] text-white rounded-tr-sm'
                      : 'bg-[var(--bg-subtle)] text-[var(--text-primary)] rounded-tl-sm'
                  }`}>
                    {m.role === 'assistant' ? renderMarkdown(m.content) : m.content}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/40 text-[var(--ink-blue)] dark:text-brand-300 flex items-center justify-center shrink-0">
                  <BotIcon />
                </div>
                <div className="bg-[var(--bg-subtle)] rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-secondary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-[var(--border-color)] shrink-0">
            <div className="flex items-end gap-2 bg-[var(--bg-subtle)] rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--ink-blue)]">
              <textarea name="message-to-ielts-assistant" autoComplete="off"
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 96) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about IELTS Writing…"
                aria-label="Message to IELTS assistant"
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none resize-none leading-relaxed overflow-hidden"
                style={{ minHeight: '24px', maxHeight: '96px' }}
              />
              <button
                type="button"
                onClick={() => send(input)}
                disabled={!input.trim() || loading}
                aria-label="Send message"
                className="w-8 h-8 rounded-lg bg-[var(--ink-blue-solid)] text-white flex items-center justify-center shrink-0 hover:opacity-90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-0"
              >
                <SendIcon />
              </button>
            </div>
            <p className="text-[0.6rem] text-[var(--text-secondary)] text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  );
}
