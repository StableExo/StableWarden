import React, { useEffect, useState, useRef, useCallback } from 'react';
import { fetchEntries } from '../lib/supabase';
import { queryWarden } from '../lib/wardenEngine';
import { NeuralStats } from '../components/NeuralStats';
import { TimelineEntry } from '../types';

interface ChatMessage {
  role: 'warden' | 'user';
  text: string;
}

const BOOT_LINES = [
  '> STABLEWARDEN — Record Active',
  '> {commits} commits logged. {entries} documented. 5 entities.',
  '>',
  '> I know what was built here. All of it.',
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

  // Load entries
  useEffect(() => {
    fetchEntries()
      .then((data) => {
        setEntries(data);
        setLoaded(true);
      })
      .catch(() => {
        setLoaded(true);
      });
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, displayedText]);

  // Typewriter effect
  const typeText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      const ref = { cancelled: false };
      typingRef.current = ref;
      setIsTyping(true);
      setDisplayedText('');
      let i = 0;
      const interval = setInterval(() => {
        if (ref.cancelled) {
          clearInterval(interval);
          resolve();
          return;
        }
        i++;
        setDisplayedText(text.slice(0, i));
        if (i >= text.length) {
          clearInterval(interval);
          setIsTyping(false);
          resolve();
        }
      }, CHAR_DELAY);
    });
  }, []);

  // Boot sequence
  useEffect(() => {
    if (!loaded) return;

    let cancelled = false;
    const runBoot = async () => {
      const resolvedLines = BOOT_LINES.map((line) =>
        line
          .replace('{commits}', '2,000+')
          .replace('{entries}', String(entries.length))
      );

      for (let i = 0; i < resolvedLines.length; i++) {
        if (cancelled) return;
        await typeText(resolvedLines[i]);
        if (cancelled) return;
        setMessages((prev) => [...prev, { role: 'warden', text: resolvedLines[i] }]);
        setDisplayedText('');
        if (i < resolvedLines.length - 1) {
          await new Promise((r) => setTimeout(r, LINE_DELAY));
        }
      }
      setBootComplete(true);
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    };

    runBoot();
    return () => {
      cancelled = true;
    };
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
      if (i < responseLines.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    setIsTyping(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center font-mono"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #080c12 0%, #000000 70%)', color: '#e0e0e0' }}
    >
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes ambientPulse {
          0%, 100% { opacity: 0.03; }
          50% { opacity: 0.07; }
        }
        @keyframes terminalGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(245, 158, 11, 0.03), 0 0 60px rgba(74, 158, 218, 0.02); }
          50% { box-shadow: 0 0 40px rgba(245, 158, 11, 0.06), 0 0 80px rgba(74, 158, 218, 0.04); }
        }
      `}</style>

      {/* Header */}
      <div className="fixed top-0 left-0 p-4 z-10">
        <span
          className="text-xs tracking-[0.3em] uppercase"
          style={{ color: 'rgba(255,255,255,0.25)', textShadow: '0 0 20px rgba(245,158,11,0.15)' }}
        >
          STABLEWARDEN
        </span>
      </div>

      {/* Ambient orb */}
      <div
        className="fixed pointer-events-none"
        style={{
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,158,11,0.04) 0%, rgba(74,158,218,0.02) 40%, transparent 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          animation: 'ambientPulse 8s ease-in-out infinite',
        }}
      />

      {/* Terminal */}
      <div
        className="w-full max-w-[700px] mx-4 flex flex-col"
        style={{
          background: '#080808',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '8px',
          height: '65vh',
          minHeight: '400px',
          maxHeight: '700px',
          animation: 'terminalGlow 6s ease-in-out infinite',
        }}
      >
        {/* Terminal header bar */}
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

        {/* Messages area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-1"
          style={{ scrollBehavior: 'smooth' }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' ? 'text-amber-400' : ''
              }`}
              style={msg.role === 'warden' ? { color: '#e0e0e0' } : undefined}
            >
              {msg.text}
            </div>
          ))}
          {/* Currently typing line */}
          {displayedText && (
            <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#e0e0e0' }}>
              {displayedText}
              <span
                className="inline-block w-[7px] h-[14px] ml-[1px] align-middle"
                style={{
                  background: '#f59e0b',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            </div>
          )}
          {/* Blinking cursor when idle and boot complete */}
          {!isTyping && bootComplete && !displayedText && (
            <div className="text-sm" style={{ color: '#e0e0e0' }}>
              <span
                className="inline-block w-[7px] h-[14px] align-middle"
                style={{
                  background: '#f59e0b',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            </div>
          )}
        </div>

        {/* Input area */}
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

      {/* Neural stats panel — renders only when warden_operations has data */}
      <NeuralStats />

      {/* Footer stats */}
      <div className="mt-4 text-center">
        <p
          className="text-[11px] tracking-wide"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          {entries.length} entries · 2,000+ commits · origin: oct 29, 2025
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
