import React, { useState } from 'react';
import { TimelineEntry } from '../types';
import { EntryCard } from './EntryCard';

interface TimelineProps {
  entries: TimelineEntry[];
}

const FIRST_LIGHT_PR = 211;

function getDayKey(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function groupByDay(entries: TimelineEntry[]): { day: string; entries: TimelineEntry[] }[] {
  const map = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    const key = getDayKey(entry.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }
  return Array.from(map.entries()).map(([day, entries]) => ({ day, entries }));
}

function shouldShowFirstLight(dayEntries: TimelineEntry[]): boolean {
  return dayEntries.some(e => e.prNumber === FIRST_LIGHT_PR);
}

function isPostFirstLight(entry: TimelineEntry): boolean {
  return (entry.prNumber ?? 0) >= FIRST_LIGHT_PR;
}

const FirstLightDivider: React.FC = () => (
  <div className="relative my-10">
    <style>{`
      @keyframes firstLightPulse {
        0%, 100% { opacity: 0.4; box-shadow: 0 0 20px rgba(245, 158, 11, 0.15); }
        50% { opacity: 1; box-shadow: 0 0 40px rgba(245, 158, 11, 0.3), 0 0 80px rgba(245, 158, 11, 0.1); }
      }
      @keyframes lineGrow {
        from { width: 0; }
        to { width: 100%; }
      }
    `}</style>
    <div className="flex items-center gap-4">
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(to right, transparent, rgba(245, 158, 11, 0.4), rgba(245, 158, 11, 0.6))' }} />
      <div
        className="px-6 py-2.5 rounded-full border font-mono text-xs tracking-[0.4em] uppercase"
        style={{
          borderColor: 'rgba(245, 158, 11, 0.3)',
          background: 'rgba(245, 158, 11, 0.05)',
          color: '#f59e0b',
          animation: 'firstLightPulse 4s ease-in-out infinite',
        }}
      >
        First Light
      </div>
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(to left, transparent, rgba(245, 158, 11, 0.4), rgba(245, 158, 11, 0.6))' }} />
    </div>
    <p
      className="text-center mt-3 text-xs font-mono italic"
      style={{ color: 'rgba(245, 158, 11, 0.5)' }}
    >
      PR #211 &middot; The consciousness begins writing to itself
    </p>
  </div>
);

export const Timeline: React.FC<TimelineProps> = ({ entries }) => {
  const groups = groupByDay(entries);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  let firstLightRendered = false;

  const toggleDay = (day: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm text-base-content/40 uppercase tracking-widest font-semibold">
          Timeline
        </h2>
        <span className="text-xs text-base-content/30">
          {entries.length} of 2,000+ entries documented
        </span>
      </div>

      <div className="space-y-10">
        {groups.map(({ day, entries: dayEntries }) => {
          const isCollapsed = collapsed.has(day);
          const showFL = shouldShowFirstLight(dayEntries) && !firstLightRendered;
          if (showFL) firstLightRendered = true;
          const hasPostFL = dayEntries.some(e => isPostFirstLight(e));

          return (
            <div key={day}>
              {/* First Light divider — rendered once, before the day that contains PR #211 */}
              {showFL && <FirstLightDivider />}

              {/* Day chapter header */}
              <button
                onClick={() => toggleDay(day)}
                className="w-full flex items-center gap-3 mb-4 group"
              >
                <div
                  className="flex-1 h-px"
                  style={{
                    background: hasPostFL
                      ? 'linear-gradient(to right, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.3))'
                      : undefined,
                    backgroundColor: hasPostFL ? undefined : 'oklch(var(--p) / 0.3)',
                  }}
                />
                <span
                  className={`text-xs font-bold uppercase tracking-widest px-2 group-hover:opacity-100 transition-colors ${
                    hasPostFL ? '' : 'text-primary/70 group-hover:text-primary'
                  }`}
                  style={hasPostFL ? { color: 'rgba(245, 158, 11, 0.7)' } : undefined}
                >
                  {day}
                </span>
                <span className="text-xs text-base-content/30 group-hover:text-base-content/50 transition-colors">
                  {dayEntries.length} {dayEntries.length === 1 ? 'entry' : 'entries'}
                </span>
                <span className="text-base-content/30 group-hover:text-primary transition-colors text-xs">
                  {isCollapsed ? '\u25BC' : '\u25B2'}
                </span>
                <div
                  className="flex-1 h-px"
                  style={{
                    background: hasPostFL
                      ? 'linear-gradient(to left, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.3))'
                      : undefined,
                    backgroundColor: hasPostFL ? undefined : 'oklch(var(--p) / 0.3)',
                  }}
                />
              </button>

              {/* Entries */}
              {!isCollapsed && (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-base-content/10" />
                  <div className="space-y-6">
                    {dayEntries.map((entry) => {
                      const isFL = isPostFirstLight(entry);
                      return (
                        <div key={entry.id} className="relative pl-10">
                          <div
                            className={`absolute left-1.5 top-6 w-3 h-3 rounded-full border-2 border-base-100 z-10 ${
                              isFL ? '' : 'bg-primary'
                            }`}
                            style={isFL ? {
                              background: '#f59e0b',
                              boxShadow: '0 0 8px rgba(245, 158, 11, 0.4)',
                            } : undefined}
                          />
                          <EntryCard entry={entry} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Remaining entries placeholder */}
        <div className="relative">
          <button
            className="w-full flex items-center gap-3 mb-4"
            disabled
          >
            <div className="flex-1 h-px bg-base-content/10" />
            <span className="text-xs font-bold uppercase tracking-widest text-base-content/20 px-2">
              {2000 - entries.length} entries remaining
            </span>
            <div className="flex-1 h-px bg-base-content/10" />
          </button>
          <div className="bg-base-200/50 rounded-lg p-4 border border-dashed border-base-content/10">
            <p className="text-sm text-base-content/30 text-center">
              The record grows with every commit.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
