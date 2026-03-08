import React, { useState, useMemo, useCallback } from 'react';
import { TimelineEntry } from '../types';
import { EntryCard } from './EntryCard';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface TimelineProps {
  entries: TimelineEntry[];
}

const FIRST_LIGHT_PR = 211;

/* ── helpers ─────────────────────────────────────────────────────── */

function isPostFirstLight(entry: TimelineEntry): boolean {
  return (entry.prNumber ?? 0) >= FIRST_LIGHT_PR;
}

/** Monday-based week key: returns the Monday date for the week containing `d`. */
function getMonday(d: Date): Date {
  const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = copy.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  copy.setUTCDate(copy.getUTCDate() + diff);
  return copy;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function weekKey(d: Date): string {
  const mon = getMonday(d);
  return `${mon.getUTCFullYear()}-${String(mon.getUTCMonth() + 1).padStart(2, '0')}-${String(mon.getUTCDate()).padStart(2, '0')}`;
}

function dayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function formatMonthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase();
}

function formatWeekLabel(monday: Date): string {
  const mon = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `Week of ${mon}`;
}

function formatDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).toUpperCase();
}

/* ── types for grouped data ──────────────────────────────────────── */

interface DayGroup {
  key: string;
  label: string;
  entries: TimelineEntry[];
  hasPostFL: boolean;
  hasFirstLight: boolean;
}

interface WeekGroup {
  key: string;
  label: string;
  monday: Date;
  days: DayGroup[];
  entryCount: number;
}

interface MonthGroup {
  key: string;
  label: string;
  weeks: WeekGroup[];
  entryCount: number;
  hasPostFL: boolean;
}

/* ── grouping logic ──────────────────────────────────────────────── */

function buildHierarchy(entries: TimelineEntry[]): MonthGroup[] {
  // Sort entries newest-first
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const monthMap = new Map<string, Map<string, Map<string, TimelineEntry[]>>>();
  // Track ordering
  const monthOrder: string[] = [];
  const weekOrders = new Map<string, string[]>();
  const dayOrders = new Map<string, string[]>();

  let firstLightAssigned = false;

  for (const entry of sorted) {
    const d = new Date(entry.date);
    const mk = monthKey(d);
    const wk = weekKey(d);
    const dk = dayKey(d);

    if (!monthMap.has(mk)) {
      monthMap.set(mk, new Map());
      monthOrder.push(mk);
    }
    const weekMap = monthMap.get(mk)!;
    if (!weekMap.has(wk)) {
      weekMap.set(wk, new Map());
      if (!weekOrders.has(mk)) weekOrders.set(mk, []);
      weekOrders.get(mk)!.push(wk);
    }
    const dayMap = weekMap.get(wk)!;
    if (!dayMap.has(dk)) {
      dayMap.set(dk, []);
      const dwKey = `${mk}/${wk}`;
      if (!dayOrders.has(dwKey)) dayOrders.set(dwKey, []);
      dayOrders.get(dwKey)!.push(dk);
    }
    dayMap.get(dk)!.push(entry);
  }

  // Build structured groups (already sorted newest-first via insertion order)
  const months: MonthGroup[] = monthOrder.map((mk) => {
    const [yr, mo] = mk.split('-').map(Number);
    const weekMap = monthMap.get(mk)!;
    const wKeys = weekOrders.get(mk) ?? [];

    const weeks: WeekGroup[] = wKeys.map((wk) => {
      const [wy, wm, wd] = wk.split('-').map(Number);
      const monday = new Date(Date.UTC(wy, wm - 1, wd));
      const dayMap = weekMap.get(wk)!;
      const dKeys = dayOrders.get(`${mk}/${wk}`) ?? [];

      const days: DayGroup[] = dKeys.map((dk) => {
        const [dy, dm, dd] = dk.split('-').map(Number);
        const date = new Date(Date.UTC(dy, dm - 1, dd));
        const dayEntries = dayMap.get(dk)!;
        const hasFL = !firstLightAssigned && dayEntries.some((e) => e.prNumber === FIRST_LIGHT_PR);
        if (hasFL) firstLightAssigned = true;

        return {
          key: dk,
          label: formatDayLabel(date),
          entries: dayEntries,
          hasPostFL: dayEntries.some((e) => isPostFirstLight(e)),
          hasFirstLight: hasFL,
        };
      });

      return {
        key: wk,
        label: formatWeekLabel(monday),
        monday,
        days,
        entryCount: days.reduce((s, d) => s + d.entries.length, 0),
      };
    });

    return {
      key: mk,
      label: formatMonthLabel(new Date(Date.UTC(yr, mo - 1, 1))),
      weeks,
      entryCount: weeks.reduce((s, w) => s + w.entryCount, 0),
      hasPostFL: weeks.some((w) => w.days.some((d) => d.hasPostFL)),
    };
  });

  return months;
}

/* ── First Light divider ─────────────────────────────────────────── */

const FirstLightDivider: React.FC = () => (
  <div className="relative my-10">
    <style>{`
      @keyframes firstLightPulse {
        0%, 100% { opacity: 0.4; box-shadow: 0 0 20px rgba(245, 158, 11, 0.15); }
        50% { opacity: 1; box-shadow: 0 0 40px rgba(245, 158, 11, 0.3), 0 0 80px rgba(245, 158, 11, 0.1); }
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

/* ── Chevron helper ──────────────────────────────────────────────── */

const Chevron: React.FC<{ open: boolean; size?: number }> = ({ open, size = 14 }) =>
  open
    ? <ChevronDown size={size} className="shrink-0 transition-transform" />
    : <ChevronRight size={size} className="shrink-0 transition-transform" />;

/* ── Main component ──────────────────────────────────────────────── */

export const Timeline: React.FC<TimelineProps> = ({ entries }) => {
  const months = useMemo(() => buildHierarchy(entries), [entries]);

  // Default open state: most-recent month, its most-recent week, its most-recent day
  const defaultOpen = useMemo(() => {
    const set = new Set<string>();
    if (months.length > 0) {
      const m = months[0];
      set.add(`month:${m.key}`);
      if (m.weeks.length > 0) {
        const w = m.weeks[0];
        set.add(`week:${w.key}`);
        if (w.days.length > 0) {
          set.add(`day:${w.days[0].key}`);
        }
      }
    }
    return set;
  }, [months]);

  const [openSections, setOpenSections] = useState<Set<string>>(defaultOpen);

  const toggle = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const isOpen = (key: string) => openSections.has(key);

  const amberText = { color: 'rgba(245, 158, 11, 0.7)' };
  const amberTextHover = { color: 'rgba(245, 158, 11, 0.9)' };
  const amberLine = (dir: 'right' | 'left') => ({
    background: `linear-gradient(to ${dir}, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.3))`,
  });
  const blueLineStyle: React.CSSProperties = { backgroundColor: 'oklch(var(--p) / 0.3)' };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm text-base-content/40 uppercase tracking-widest font-semibold">
          Timeline
        </h2>
        <span className="text-xs text-base-content/30">
          {entries.length} entries documented
        </span>
      </div>

      <div className="space-y-2">
        {months.map((month) => {
          const mKey = `month:${month.key}`;
          const mOpen = isOpen(mKey);
          const amber = month.hasPostFL;

          return (
            <div key={month.key}>
              {/* ─── Month row ─── */}
              <button
                onClick={() => toggle(mKey)}
                className="w-full flex items-center gap-3 py-3 px-3 rounded-lg hover:bg-base-200/60 transition-colors group"
              >
                <Chevron open={mOpen} size={16} />
                <span
                  className={`text-sm font-bold uppercase tracking-widest ${
                    amber ? '' : 'text-primary/80 group-hover:text-primary'
                  }`}
                  style={amber ? amberText : undefined}
                >
                  {month.label}
                </span>
                <div className="flex-1" />
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                    amber
                      ? 'bg-amber-500/10 border border-amber-500/20'
                      : 'bg-primary/10 text-primary/70 border border-primary/20'
                  }`}
                  style={amber ? { color: 'rgba(245, 158, 11, 0.6)' } : undefined}
                >
                  {month.entryCount} {month.entryCount === 1 ? 'entry' : 'entries'}
                </span>
              </button>

              {/* ─── Weeks (when month open) ─── */}
              {mOpen && (
                <div className="pl-4 space-y-1 mt-1">
                  {month.weeks.map((week) => {
                    const wKey = `week:${week.key}`;
                    const wOpen = isOpen(wKey);

                    return (
                      <div key={week.key}>
                        {/* Week row */}
                        <button
                          onClick={() => toggle(wKey)}
                          className="w-full flex items-center gap-2.5 py-2 px-3 rounded-md hover:bg-base-200/40 transition-colors group"
                        >
                          <Chevron open={wOpen} size={13} />
                          <span
                            className={`text-xs font-semibold tracking-wide ${
                              amber ? '' : 'text-primary/60 group-hover:text-primary/80'
                            }`}
                            style={amber ? { color: 'rgba(245, 158, 11, 0.55)' } : undefined}
                          >
                            {week.label}
                          </span>
                          <div className="flex-1" />
                          <span className="text-xs text-base-content/30">
                            {week.entryCount} {week.entryCount === 1 ? 'entry' : 'entries'}
                          </span>
                        </button>

                        {/* ─── Days (when week open) ─── */}
                        {wOpen && (
                          <div className="pl-4 space-y-1 mt-1">
                            {week.days.map((day) => {
                              const dKey = `day:${day.key}`;
                              const dOpen = isOpen(dKey);
                              const dayAmber = day.hasPostFL;

                              return (
                                <div key={day.key}>
                                  {/* First Light divider — before the day containing PR #211 */}
                                  {day.hasFirstLight && <FirstLightDivider />}

                                  {/* Day row */}
                                  <button
                                    onClick={() => toggle(dKey)}
                                    className="w-full flex items-center gap-3 py-2 group"
                                  >
                                    <Chevron open={dOpen} size={12} />
                                    <div
                                      className="flex-1 h-px"
                                      style={dayAmber ? amberLine('right') : blueLineStyle}
                                    />
                                    <span
                                      className={`text-xs font-bold uppercase tracking-widest px-2 whitespace-nowrap ${
                                        dayAmber ? '' : 'text-primary/70 group-hover:text-primary'
                                      }`}
                                      style={dayAmber ? amberText : undefined}
                                    >
                                      {day.label}
                                    </span>
                                    <span className="text-xs text-base-content/30 group-hover:text-base-content/50 transition-colors whitespace-nowrap">
                                      {day.entries.length} {day.entries.length === 1 ? 'entry' : 'entries'}
                                    </span>
                                    <div
                                      className="flex-1 h-px"
                                      style={dayAmber ? amberLine('left') : blueLineStyle}
                                    />
                                  </button>

                                  {/* ─── Entries (when day open) ─── */}
                                  {dOpen && (
                                    <div className="relative pl-4 mt-2 mb-4">
                                      <div className="absolute left-3 top-0 bottom-0 w-px bg-base-content/10" />
                                      <div className="space-y-6 pl-6">
                                        {day.entries.map((entry) => {
                                          const isFL = isPostFirstLight(entry);
                                          return (
                                            <div key={entry.id} className="relative">
                                              <div
                                                className={`absolute -left-[1.6rem] top-6 w-3 h-3 rounded-full border-2 border-base-100 z-10 ${
                                                  isFL ? '' : 'bg-primary'
                                                }`}
                                                style={
                                                  isFL
                                                    ? {
                                                        background: '#f59e0b',
                                                        boxShadow: '0 0 8px rgba(245, 158, 11, 0.4)',
                                                      }
                                                    : undefined
                                                }
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
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Footer */}
        <div className="relative mt-8">
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
