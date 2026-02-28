import React, { useEffect, useState, useRef, useCallback } from 'react';
import { fetchEntries } from '../lib/supabase';
import { queryWarden } from '../lib/wardenEngine';
import { TimelineEntry } from '../types';

interface ChatMessage {
  role: 'warden' | 'user';
  text: string;
}

const BOOT_LINES = [
  '> STABLEWARDEN — Record Active',
  '> {commits} commits logged. {entries} documented. 3 entities.',
  '>',
  '> I know what was built here.',
  '> Ask me anything.',
];

const CHAR_DELAY = 18;
const LINE_DELAY = 350;

export const LandingPage: React.FC = () => {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const [input, setInput] = useState('');
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  useEffect(() => {
    fetchEntries()
      .then((data) => { setEntries(data); setLoaded(true); })
      .catch(() => { setLoaded(true); });
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, displayedText]);

  const typeText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const ref = { cancelled: false };
      typingRef.current = ref;
      setIsTyping(true);
      setDisplayedText('');
      let i = 0;
      const interval = setInterval(() => {
        if (ref.cancelled) { clearInterval(interval); resolve(); return; }
        i++;
        setDisplayedText(text.slice(0, i));
        if (i >= text.length) { clearInterval(interval); setIsTyping(false); resolve(); }
      }, CHAR_DELAY);
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const runBoot = async () => {
      const resolvedLines = BOOT_LINES.map((line) =>
        line.replace('{commits}', '1,821').replace('{entries}', String(entries.length))
      );
      for (let i = 0; i < resolvedLines.length; i++) {
        if (cancelled) return;
        await typeText(resolvedLines[i]);
        if (cancelled) return;
        setMessages((prev) => [...prev, { role: 'warden', text: resolvedLines[i] }]);
        setDisplayedText('');
        if (i < resolvedLines.length - 1) await new Promise((r) => setTimeout(r, LINE_DELAY));
      }
      setBootComplete(true);
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    runBoot();
    return () => { cancelled = true; };
  }, [loaded, entries.length, typeText]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isTyping) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: `$ ${trimmed}` }]);
    const response = queryWarden(entries, trimmed);
    const responseLines = response.split('\n').map((line) => (line ? `> ${line}` : '>'));
    setIsTyping(true);
    for (let i = 0; i < responseLines.length; i++) {
      await typeText(responseLines[i]);
      setMessages((prev) => [...prev, { role: 'warden', text: responseLines[i] }]);
      setDisplayedText('');
      if (i < responseLines.length - 1) await new Promise((r) => setTimeout(r, 200));
    }
    setIsTyping(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center font-mono px-4"
      style={{ background: '#000000', color: '#e0e0e0' }}
    >
      {/* Centered title */}
      <div className="mb-5 text-center">
        <span
          className="text-2xl font-bold tracking-[0.25em] uppercase"
          style={{ color: '#f59e0b', letterSpacing: '0.3em' }}
        >
          STABLEWARDEN
        </span>
      </div>

      {/* Terminal */}
      <div
        className="w-full max-w-[700px] flex flex-col"
        style={{
          background: '#080808',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          height: '65vh',
          minHeight: '420px',
          maxHeight: '680px',
        }}
      >
        {/* Terminal title bar */}
        <div
          className="flex items-center gap-1.5 px-4 py-2.5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#333' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#333' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#333' }} />
          <span
            className="ml-3 text-[10px] tracking-widest uppercase"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            thewarden
          </span>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-1"
          style={{ scrollBehavior: 'smooth' }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: msg.role === 'user' ? '#f59e0b' : '#e0e0e0' }}
            >
              {msg.text}
            </div>
          ))}
          {displayedText && (
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#e0e0e0' }}>
              {displayedText}
              <span
                className="inline-block w-[7px] h-[14px] ml-[1px] align-middle"
                style={{ background: '#f59e0b', animation: 'blink 1s step-end infinite' }}
              />
            </div>
          )}
          {!isTyping && bootComplete && !displayedText && (
            <div className="text-sm" style={{ color: '#e0e0e0' }}>
              <span
                className="inline-block w-[7px] h-[14px] align-middle"
                style={{ background: '#f59e0b', animation: 'blink 1s step-end infinite' }}
              />
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center px-4 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <span className="text-amber-400 text-sm mr-2">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={bootComplete ? 'Ask the warden...' : ''}
            disabled={!bootComplete || isTyping}
            className="flex-1 bg-transparent text-sm text-amber-400 placeholder:text-white/20 outline-none font-mono"
            autoComplete="off"
            spellCheck={false}
          />
        </form>
      </div>

      {/* Footer */}
      <div className="mt-5 text-center">
        <p className="text-[11px] tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {entries.length} entries · 1,821 commits · origin: oct 29, 2025
        </p>
        <a
          href="#/record"
          className="inline-block mt-2 text-xs tracking-wide transition-colors hover:text-amber-300"
          style={{ color: '#f59e0b' }}
        >
          the record →
        </a>
      </div>
    </div>
  );
};
