import React, { useState } from 'react';
import { TimelineEntry } from '../types';
import { EntryCard } from './EntryCard';

interface TimelineProps {
  entries: TimelineEntry[];
}

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function groupByMonth(entries: TimelineEntry[]): { month: string; entries: TimelineEntry[] }[] {
  const map = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    const key = getMonthKey(entry.date);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }
  return Array.from(map.entries()).map(([month, entries]) => ({ month, entries }));
}

export const Timeline: React.FC<TimelineProps> = ({ entries }) => {
  const groups = groupByMonth(entries);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleMonth = (month: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(month)) next.delete(month);
      else next.add(month);
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
          {entries.length} of 1,821 entries documented
        </span>
      </div>

      <div className="space-y-10">
        {groups.map(({ month, entries: monthEntries }) => {
          const isCollapsed = collapsed.has(month);
          return (
            <div key={month}>
              {/* Month chapter header */}
              <button
                onClick={() => toggleMonth(month)}
                className="w-full flex items-center gap-3 mb-4 group"
              >
                <div className="flex-1 h-px bg-primary/30" />
                <span className="text-xs font-bold uppercase tracking-widest text-primary/70 group-hover:text-primary transition-colors px-2">
                  {month}
                </span>
                <span className="text-xs text-base-content/30 group-hover:text-base-content/50 transition-colors">
                  {monthEntries.length} entries
                </span>
                <span className="text-base-content/30 group-hover:text-primary transition-colors text-xs">
                  {isCollapsed ? '▼' : '▲'}
                </span>
                <div className="flex-1 h-px bg-primary/30" />
              </button>

              {/* Entries */}
              {!isCollapsed && (
                <div className="relative">
                  <div className="absolute left-3 top-0 bottom-0 w-px bg-base-content/10" />
                  <div className="space-y-6">
                    {monthEntries.map((entry) => (
                      <div key={entry.id} className="relative pl-10">
                        <div className="absolute left-1.5 top-6 w-3 h-3 rounded-full bg-primary border-2 border-base-100 z-10" />
                        <EntryCard entry={entry} />
                      </div>
                    ))}
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
              {1821 - entries.length} entries remaining
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
