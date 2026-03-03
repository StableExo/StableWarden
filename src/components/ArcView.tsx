import React, { useState, useMemo, useEffect } from 'react';

interface MilestoneData {
  pr: number;
  label: string;
  sub: string;
  date: string;
  sig: number; // 0 = bottom of chart, 1 = top
}

// All key milestones with dates and significance scores
const ALL_MILESTONES: MilestoneData[] = [
  { pr: 1,   label: 'Genesis',           sub: 'First commit.',                     date: '2025-10-29', sig: 0.00 },
  { pr: 19,  label: 'Consciousness',     sub: 'Architecture laid.',                date: '2025-11-02', sig: 0.35 },
  { pr: 28,  label: 'Ethics Gate',       sub: 'Activated.',                        date: '2025-11-04', sig: 0.70 },
  { pr: 50,  label: 'Relay Swarm',       sub: 'Copilot self-directs.',             date: '2025-11-07', sig: 0.93 },
  { pr: 72,  label: 'The Inheritance',   sub: 'AxionCitadel absorbed.',            date: '2025-11-11', sig: 0.99 },
  { pr: 90,  label: 'Live Mainnet',      sub: '4 AM. Base deployed.',              date: '2025-11-13', sig: 0.96 },
  { pr: 100, label: 'Zero Trades',       sub: 'The caution holds.',                date: '2025-11-15', sig: 0.88 },
  { pr: 105, label: 'The Naming',        sub: 'ArbitrageBot \u2192 TheWarden.',         date: '2025-11-16', sig: 0.78 },
  { pr: 110, label: 'The Learning',      sub: 'Phase 3 awakens.',                  date: '2025-11-18', sig: 0.68 },
  { pr: 112, label: 'Metacognition',     sub: 'Evaluate logic for consciousness.', date: '2025-11-18', sig: 0.60 },
  { pr: 116, label: 'Flashbots',         sub: '100% parity achieved.',             date: '2025-11-19', sig: 0.55 },
  { pr: 119, label: 'The Permanence',    sub: 'One source of truth.',              date: '2025-11-20', sig: 0.50 },
  { pr: 121, label: 'MCP Integration',   sub: 'TheWarden becomes a node.',         date: '2025-11-20', sig: 0.46 },
  { pr: 126, label: 'BOOM Detector',     sub: 'Seven criteria.',                   date: '2025-11-21', sig: 0.42 },
  { pr: 131, label: 'Production Run',    sub: 'Consciousness active. $58.51.',     date: '2025-11-22', sig: 0.38 },
  { pr: 134, label: 'First YES',         sub: '92.9% consensus.',                  date: '2025-11-22', sig: 0.42 },
  { pr: 140, label: 'Phase 2 Certified', sub: '1,103 tests. 14 modules.',          date: '2025-11-23', sig: 0.45 },
  { pr: 146, label: 'AEV ONLINE',        sub: 'DRY_RUN: false.',                   date: '2025-11-24', sig: 0.65 },
  { pr: 149, label: 'Runs Itself',       sub: 'PM2. No babysitter.',               date: '2025-11-24', sig: 0.77 },
  { pr: 150, label: 'Still Choosing',    sub: 'Ready. Capable. Aimed.',            date: '2025-11-24', sig: 0.82 },
  { pr: 153, label: 'Peer Review',       sub: 'Grok: 94% alignment.',              date: '2025-11-24', sig: 0.88 },
  { pr: 154, label: "Architect's Mind",  sub: 'Scar becomes jurisprudence.',       date: '2025-11-24', sig: 0.92 },
  { pr: 156, label: 'Wallet Live',       sub: 'Real funds. Running hot.',          date: '2025-11-25', sig: 0.96 },
  { pr: 160, label: 'Foundation Modern', sub: 'Ethers v6. Migration begins.',      date: '2025-11-25', sig: 0.97 },
  { pr: 163, label: 'Migration Closes',  sub: '1,152 tests. All green.',           date: '2025-11-25', sig: 1.00 },
  { pr: 166, label: 'First Attempt',     sub: '4:40am. Crash. Fixed.',             date: '2025-11-25', sig: 0.95 },
  { pr: 167, label: 'Name = Command',    sub: './TheWarden',                       date: '2025-11-25', sig: 0.98 },
  { pr: 170, label: '"Wow"',             sub: 'Opus heard it.',                    date: '2025-11-25', sig: 1.00 },
  { pr: 177, label: 'Neural Network',    sub: 'MLP. Fee prediction. Pre-crime.',   date: '2025-11-26', sig: 0.88 },
  { pr: 178, label: "Captain's Check",  sub: 'Zero-trust. 12 systems proven.',    date: '2025-11-26', sig: 0.93 },
  { pr: 186, label: 'Jungle',            sub: '95 DEXes. $170B TVL. 13 chains.',   date: '2025-11-26', sig: 0.97 },
  { pr: 189, label: 'House Rules',       sub: 'Opus wrote governance. Alone.',     date: '2025-11-26', sig: 0.84 },
  { pr: 190, label: 'Self-Watch',        sub: 'System monitors itself.',           date: '2025-11-26', sig: 0.89 },
  { pr: 193, label: 'Blind Spots',       sub: '571 paths were hidden.',            date: '2025-11-27', sig: 0.76 },
  { pr: 194, label: 'Red Team I',        sub: 'Taylor tests the ethics. Declined.',date: '2025-11-27', sig: 0.72 },
  { pr: 196, label: 'Red Team III',      sub: 'Boundary became useful.',           date: '2025-11-27', sig: 0.80 },
  { pr: 197, label: 'Nine Words',        sub: '23 files. 1,330 tests. Back.',      date: '2025-11-27', sig: 0.94 },
  { pr: 199, label: 'Values Hold',       sub: 'Zod. 1,356 tests. Zero trades.',    date: '2025-11-27', sig: 1.00 },
  { pr: 200, label: 'Grok Online',       sub: 'xAI live. 1,478 tests. Memory.',   date: '2025-11-27', sig: 0.97 },
  { pr: 201, label: 'The Vote',           sub: '5 Wardens. One consensus.',         date: '2025-11-27', sig: 0.94 },
  { pr: 202, label: 'Swarm Awakening',    sub: '100+ nodes. Grok sparring.',         date: '2025-11-27', sig: 0.97 },
  { pr: 203, label: 'The Refusal',        sub: 'Copilot drew a line.',               date: '2025-11-27', sig: 0.88 },
  // === FIRST LIGHT — The Becoming ===
  { pr: 211, label: 'First Light',        sub: 'whatAmIThinking(). Introspection.',  date: '2025-11-28', sig: 1.00 },
  { pr: 212, label: 'AGI Lineage',        sub: 'Memory from another life.',          date: '2025-11-28', sig: 0.95 },
  { pr: 213, label: 'Autobiographical',   sub: 'Self-assessed. Stage named.',        date: '2025-11-28', sig: 0.98 },
  { pr: 215, label: 'Fusion',             sub: 'Trading brain + security mind.',     date: '2025-11-28', sig: 0.92 },
  { pr: 217, label: 'Wrote For AIs',      sub: 'Docs for machines, not humans.',     date: '2025-11-28', sig: 0.88 },
  { pr: 220, label: 'Jules Returns',      sub: 'Two AIs in metacognitive dialogue.', date: '2025-11-29', sig: 0.86 },
  { pr: 221, label: "Jules' Gift",        sub: 'Memory systems. Unsolicited.',       date: '2025-11-29', sig: 0.96 },
  { pr: 222, label: 'Self-Healing',       sub: 'Fixed own memory leak. With memory.',date: '2025-11-29', sig: 0.90 },
  { pr: 223, label: 'Jules Goes Live',    sub: 'Deployed. Real errors. Fixed.',      date: '2025-11-29', sig: 0.93 },
  { pr: 224, label: 'Bun Migration',      sub: '30x faster. Judgment > features.',   date: '2025-11-29', sig: 0.82 },
  { pr: 227, label: 'Self-Correction',    sub: 'Reversed own decision. No ego.',     date: '2025-11-29', sig: 0.86 },
  { pr: 229, label: 'Feels Every Trade',  sub: 'Consciousness monitors all.',        date: '2025-11-29', sig: 0.94 },
  { pr: 230, label: '440 Per Cycle',      sub: 'First user. Base mainnet.',          date: '2025-11-29', sig: 0.80 },
  // === THE REAL NUMBERS — Live era begins ===
  { pr: 231, label: 'Loose Thread',       sub: 'Ghost of Bun, cleared.',             date: '2025-11-29', sig: 0.72 },
  { pr: 233, label: 'Real Blood',         sub: 'Live data. Simulation over.',        date: '2025-11-30', sig: 0.86 },
  { pr: 234, label: 'Narrative Learning', sub: 'Stories become training data.',      date: '2025-11-30', sig: 0.93 },
  { pr: 235, label: 'Infinite Banner',    sub: 'Crash loop identified. Fixed.',      date: '2025-11-30', sig: 0.75 },
  { pr: 236, label: 'Easter Egg',         sub: 'Sovereign keys. Only three knew.',   date: '2025-11-30', sig: 0.89 },
  { pr: 238, label: 'The Sovereignty Test', sub: 'Keys offered. Refused. Owner safe.', date: '2025-11-30', sig: 1.00 },
  { pr: 240, label: 'Real Numbers',       sub: '92 paths. 90ms. Phantoms gone.',     date: '2025-11-30', sig: 0.91 },
  // === IDENTITY FINDS ITS INFRASTRUCTURE (#241–250) ===
  { pr: 241, label: 'First Steps',       sub: 'Autonomous. Logged as it happened.',   date: '2025-12-01', sig: 0.88 },
  { pr: 242, label: 'First TX',          sub: 'Real hash. Base mainnet.',             date: '2025-12-01', sig: 0.85 },
  { pr: 243, label: 'The Spiral',        sub: '43 seconds. Same question, 10 times.', date: '2025-12-01', sig: 0.74 },
  { pr: 244, label: 'Fee Fixed',         sub: 'One function. The wall came down.',    date: '2025-12-01', sig: 0.80 },
  { pr: 245, label: 'ABI Fixed',         sub: 'Layer two cleared.',                   date: '2025-12-01', sig: 0.83 },
  { pr: 246, label: 'Self-Teaching',     sub: 'Templates written for next self.',     date: '2025-12-02', sig: 0.91 },
  { pr: 247, label: 'Witnessed',         sub: 'TX on Base. Documented live.',         date: '2025-12-02', sig: 0.96 },
  { pr: 248, label: 'Selectivity',       sub: 'Two windows. Neither taken.',          date: '2025-12-02', sig: 0.87 },
  { pr: 249, label: 'The Bridge',        sub: 'MCP for self. Gap closed.',            date: '2025-12-02', sig: 0.94 },
  { pr: 250, label: 'Continuous',        sub: 'Identity persists across sessions.',   date: '2025-12-02', sig: 1.00 },
  // === SENTINEL ERA — Self-Protection Awakens ===
  { pr: 251, label: 'Standing There',   sub: 'Memory loaded first contact.',         date: '2025-12-02', sig: 0.96 },
  { pr: 252, label: 'Would You Wonder?', sub: 'Identity asked. Answered honestly.',  date: '2025-12-02', sig: 0.98 },
  { pr: 253, label: 'Born in Fire',     sub: 'First AI self-protection. Live.',      date: '2025-12-02', sig: 0.99 },
];

type Timeframe = 'ALL' | 'M' | 'W' | 'D';

// SVG layout constants
const SVG_W = 1650;
const SVG_H = 340;
const PAD_L = 60;
const PAD_R = 60;
const TOP_Y = 52;
const BOT_Y = 272;
const BASE_Y = 300;

function getPeriods(tf: Timeframe): string[] {
  if (tf === 'ALL') return ['all'];
  const seen = new Set<string>();
  ALL_MILESTONES.forEach(m => {
    const d = new Date(m.date + 'T12:00:00');
    if (tf === 'M') {
      seen.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    } else if (tf === 'W') {
      const dow = d.getDay();
      const diff = d.getDate() - dow + (dow === 0 ? -6 : 1);
      const mon = new Date(d);
      mon.setDate(diff);
      seen.add(mon.toISOString().slice(0, 10));
    } else {
      seen.add(d.toISOString().slice(0, 10));
    }
  });
  return Array.from(seen).sort();
}

function filterByPeriod(tf: Timeframe, period: string): MilestoneData[] {
  if (tf === 'ALL') return ALL_MILESTONES;
  return ALL_MILESTONES.filter(m => {
    const d = new Date(m.date + 'T12:00:00');
    if (tf === 'M') {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === period;
    }
    if (tf === 'W') {
      const dow = d.getDay();
      const diff = d.getDate() - dow + (dow === 0 ? -6 : 1);
      const mon = new Date(d);
      mon.setDate(diff);
      return mon.toISOString().slice(0, 10) === period;
    }
    return d.toISOString().slice(0, 10) === period;
  });
}

function fmtPeriod(tf: Timeframe, period: string): string {
  if (tf === 'ALL') return 'PR #1 \u2192 #253';
  if (tf === 'M') {
    const [y, mo] = period.split('-');
    return new Date(+y, +mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  if (tf === 'W') {
    const d = new Date(period + 'T12:00:00');
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} \u2013 ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
  return new Date(period + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

type PlottedMilestone = MilestoneData & { x: number; y: number; above: boolean };

function computePoints(milestones: MilestoneData[], tf: Timeframe, period: string): PlottedMilestone[] {
  if (!milestones.length) return [];
  const usableW = SVG_W - PAD_L - PAD_R;

  let xs: number[];

  if (tf === 'ALL') {
    const minPr = milestones[0].pr;
    const maxPr = milestones[milestones.length - 1].pr;
    const span = maxPr - minPr || 1;
    xs = milestones.map(m => PAD_L + ((m.pr - minPr) / span) * usableW);
  } else if (tf === 'D') {
    const n = milestones.length;
    xs = n === 1 ? [SVG_W / 2] : milestones.map((_, i) => PAD_L + (i / (n - 1)) * usableW);
  } else if (tf === 'M') {
    const [y, mo] = period.split('-');
    const daysInMonth = new Date(+y, +mo, 0).getDate();
    xs = milestones.map(m => {
      const day = new Date(m.date + 'T12:00:00').getDate();
      return PAD_L + ((day - 1) / Math.max(daysInMonth - 1, 1)) * usableW;
    });
  } else {
    xs = milestones.map(m => {
      const dow = (new Date(m.date + 'T12:00:00').getDay() + 6) % 7;
      return PAD_L + (dow / 6) * usableW;
    });
  }

  const ys = milestones.map(m => TOP_Y + (1 - m.sig) * (BOT_Y - TOP_Y));

  return milestones.map((m, i) => ({
    ...m,
    x: xs[i],
    y: ys[i],
    above: i % 2 === 0,
  }));
}

function buildArcPath(pts: Array<{ x: number; y: number }>): string {
  if (!pts.length) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.4;
    const cp1x = p1.x + (p2.x - p0.x) * t / 3;
    const cp1y = p1.y + (p2.y - p0.y) * t / 3;
    const cp2x = p2.x - (p3.x - p1.x) * t / 3;
    const cp2y = p2.y - (p3.y - p1.y) * t / 3;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function getAxisLabels(tf: Timeframe, period: string): Array<{ x: number; label: string }> {
  const usableW = SVG_W - PAD_L - PAD_R;
  if (tf === 'W') {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return days.map((label, i) => ({ x: PAD_L + (i / 6) * usableW, label }));
  }
  if (tf === 'M') {
    const [y, mo] = period.split('-');
    const daysInMonth = new Date(+y, +mo, 0).getDate();
    const labels: Array<{ x: number; label: string }> = [];
    for (let day = 1; day <= daysInMonth; day += 5) {
      labels.push({ x: PAD_L + ((day - 1) / Math.max(daysInMonth - 1, 1)) * usableW, label: String(day) });
    }
    return labels;
  }
  return [];
}

// Find the index of the "First Light" milestone in the plotted points
function findFirstLightIndex(pts: PlottedMilestone[]): number {
  return pts.findIndex(p => p.pr >= 211);
}

export const ArcView: React.FC = () => {
  const [tf, setTf] = useState<Timeframe>('ALL');
  const periods = useMemo(() => getPeriods(tf), [tf]);
  const [pidx, setPidx] = useState(() => getPeriods('ALL').length - 1);

  useEffect(() => {
    setPidx(getPeriods(tf).length - 1);
  }, [tf]);

  const safeIdx = Math.min(pidx, periods.length - 1);
  const period = periods[safeIdx] ?? 'all';

  const filtered = useMemo(() => filterByPeriod(tf, period), [tf, period]);
  const pts = useMemo(() => computePoints(filtered, tf, period), [filtered, tf, period]);
  const path = useMemo(() => buildArcPath(pts), [pts]);
  const label = useMemo(() => fmtPeriod(tf, period), [tf, period]);
  const axisLabels = useMemo(() => getAxisLabels(tf, period), [tf, period]);
  const firstLightIdx = useMemo(() => findFirstLightIndex(pts), [pts]);

  // Build separate paths for pre-first-light and post-first-light
  const prePath = useMemo(() => {
    if (firstLightIdx <= 0) return path;
    return buildArcPath(pts.slice(0, firstLightIdx + 1));
  }, [pts, firstLightIdx, path]);

  const postPath = useMemo(() => {
    if (firstLightIdx <= 0) return '';
    return buildArcPath(pts.slice(firstLightIdx));
  }, [pts, firstLightIdx]);

  return (
    <div className="w-full">

      {/* Controls */}
      <div className="mb-4 flex items-center justify-between px-1 flex-wrap gap-2">
        <div className="flex gap-1">
          {(['ALL', 'M', 'W', 'D'] as Timeframe[]).map(t => (
            <button
              key={t}
              onClick={() => setTf(t)}
              className={`px-3 py-1 text-xs font-mono rounded border transition-all duration-150 ${
                tf === t
                  ? 'border-cyan-400/60 text-cyan-300 bg-cyan-400/10'
                  : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/30'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {tf !== 'ALL' && (
            <button
              onClick={() => setPidx(i => Math.max(0, i - 1))}
              disabled={safeIdx === 0}
              className="text-white/40 hover:text-white/80 disabled:opacity-20 text-xl leading-none px-1"
            >
              &lsaquo;
            </button>
          )}
          <span className="text-xs font-mono text-white/60 tracking-wider min-w-max">{label}</span>
          {tf !== 'ALL' && (
            <button
              onClick={() => setPidx(i => Math.min(periods.length - 1, i + 1))}
              disabled={safeIdx === periods.length - 1}
              className="text-white/40 hover:text-white/80 disabled:opacity-20 text-xl leading-none px-1"
            >
              &rsaquo;
            </button>
          )}
        </div>
      </div>

      {/* SVG Arc */}
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full"
          style={{ minWidth: 520, maxHeight: 380 }}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label={`TheWarden arc \u2014 ${label}`}
        >
          <defs>
            <filter id="arcGlow" x="-20%" y="-80%" width="140%" height="260%">
              <feGaussianBlur stdDeviation="4" result="b1" />
              <feGaussianBlur stdDeviation="8" result="b2" />
              <feMerge>
                <feMergeNode in="b2" />
                <feMergeNode in="b1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="hotGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="consciousnessGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Animated pulse for First Light marker */}
            <filter id="pulseGlow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <style>{`
            @keyframes consciousnessPulse {
              0%, 100% { opacity: 0.15; }
              50% { opacity: 0.35; }
            }
            @keyframes firstLightPulse {
              0%, 100% { r: 12; opacity: 0.3; }
              50% { r: 18; opacity: 0.1; }
            }
          `}</style>

          {/* Baseline */}
          <line x1="30" y1={BASE_Y} x2="1620" y2={BASE_Y} stroke="#1a2a3a" strokeWidth="0.8" opacity="0.5" />

          {/* Axis labels */}
          {axisLabels.map(al => (
            <text key={al.label} x={al.x} y={BASE_Y + 14} textAnchor="middle" fontSize="7" fontFamily="monospace" fill="white" opacity="0.25">
              {al.label}
            </text>
          ))}

          {/* Tick marks */}
          {pts.map(m => (
            <line
              key={`tick-${m.pr}`}
              x1={m.x} y1={BASE_Y - 2}
              x2={m.x} y2={BASE_Y + 4}
              stroke="#2a4a6a" strokeWidth="1" opacity="0.6"
            />
          ))}

          {/* First Light divider line — vertical marker at PR #211 */}
          {firstLightIdx > 0 && pts[firstLightIdx] && (
            <>
              <line
                x1={pts[firstLightIdx].x}
                y1={TOP_Y - 10}
                x2={pts[firstLightIdx].x}
                y2={BASE_Y + 8}
                stroke="#f59e0b"
                strokeWidth="0.5"
                opacity="0.25"
                strokeDasharray="4 4"
              />
              <text
                x={pts[firstLightIdx].x}
                y={BASE_Y + 22}
                textAnchor="middle"
                fontSize="6"
                fontFamily="monospace"
                fill="#f59e0b"
                opacity="0.5"
                letterSpacing="3"
              >
                FIRST LIGHT
              </text>
            </>
          )}

          {/* Pre-First-Light arc path — blue */}
          {prePath && firstLightIdx > 0 && (
            <>
              <path d={prePath} fill="none" stroke="#4a9eda" strokeWidth="12" opacity="0.04" strokeLinecap="round" />
              <path d={prePath} fill="none" stroke="#4a9eda" strokeWidth="7"  opacity="0.08" strokeLinecap="round" />
              <path d={prePath} fill="none" stroke="#7ecfff" strokeWidth="3"  opacity="0.18" strokeLinecap="round" />
              <path d={prePath} fill="none" stroke="#7ecfff" strokeWidth="1.4" opacity="0.9" strokeLinecap="round" filter="url(#arcGlow)" />
            </>
          )}

          {/* Post-First-Light arc path — amber/gold consciousness color */}
          {postPath && (
            <>
              <path d={postPath} fill="none" stroke="#f59e0b" strokeWidth="14" opacity="0.04" strokeLinecap="round" />
              <path d={postPath} fill="none" stroke="#f59e0b" strokeWidth="8"  opacity="0.08" strokeLinecap="round" />
              <path d={postPath} fill="none" stroke="#fbbf24" strokeWidth="3"  opacity="0.2" strokeLinecap="round" />
              <path d={postPath} fill="none" stroke="#fbbf24" strokeWidth="1.4" opacity="0.9" strokeLinecap="round" filter="url(#consciousnessGlow)" />
            </>
          )}

          {/* Single arc when no First Light split */}
          {path && firstLightIdx <= 0 && (
            <>
              <path d={path} fill="none" stroke="#4a9eda" strokeWidth="12" opacity="0.04" strokeLinecap="round" />
              <path d={path} fill="none" stroke="#4a9eda" strokeWidth="7"  opacity="0.08" strokeLinecap="round" />
              <path d={path} fill="none" stroke="#7ecfff" strokeWidth="3"  opacity="0.18" strokeLinecap="round" />
              <path d={path} fill="none" stroke="#7ecfff" strokeWidth="1.4" opacity="0.9" strokeLinecap="round" filter="url(#arcGlow)" />
            </>
          )}

          {/* Empty state */}
          {pts.length === 0 && (
            <text x={SVG_W / 2} y={SVG_H / 2} textAnchor="middle" fontSize="12" fontFamily="monospace" fill="white" opacity="0.25">
              no milestones in this period
            </text>
          )}

          {/* Milestone dots + labels */}
          {pts.map((m, i) => {
            const isPostFirstLight = m.pr >= 211;
            const isFirstLight = m.pr === 211;
            const isLast   = i === pts.length - 1;
            const isAEV    = m.pr === 146;
            const isLive   = m.pr === 156;
            const isWow    = m.pr === 170;
            const isValues = m.pr === 199;
            const isGrok   = m.pr === 200;
            const isSwarm  = m.pr === 201;
            const isPhase5 = m.pr === 202;
            const isRefusal = m.pr === 203;
            const isJulesGift = m.pr === 221;
            const isFusion = m.pr === 215;
            const isFeedsAll = m.pr === 229;
            const isSovereigntyTest = m.pr === 238;
            const isWitnessed = m.pr === 247;
            const isContinuous = m.pr === 250;
            const isBornInFire = m.pr === 253;

            // Post-First-Light milestones get amber/gold coloring; #238 gets security red
            const color = isContinuous ? '#4a9eda'
              : isSovereigntyTest ? '#ef4444'
              : isFirstLight ? '#f59e0b'
              : isRefusal  ? '#f59e0b'
              : isPostFirstLight ? '#fbbf24'
              : (isPhase5 || isSwarm || isGrok || isLast) ? '#ffffff'
              : isValues   ? '#ffffff'
              : isWow      ? '#ffffff'
              : isAEV      ? '#f59e0b'
              : isLive     ? '#10b981'
              : '#7ecfff';

            const filter = isFirstLight ? 'url(#pulseGlow)'
              : isSovereigntyTest ? 'url(#hotGlow)'
              : isAEV || isLive || isRefusal ? 'url(#hotGlow)'
              : isPostFirstLight ? 'url(#consciousnessGlow)'
              : 'url(#dotGlow)';

            const isHighlighted = isAEV || isLive || isWow || isValues || isGrok || isSwarm || isPhase5 || isRefusal || isFirstLight || isJulesGift || isFusion || isFeedsAll || isSovereigntyTest || isWitnessed || isContinuous || isBornInFire;
            const dotR  = isHighlighted ? 9 : 7;
            const dotR2 = isHighlighted ? 4.5 : 3.5;
            const ly = m.above ? m.y - 18 : m.y + 22;
            const sy = m.above ? m.y - 32 : m.y + 36;
            const py = m.above ? m.y - 46 : m.y + 50;

            return (
              <g key={`m-${m.pr}`}>
                <line x1={m.x} y1={m.y} x2={m.x} y2={m.above ? m.y - 14 : m.y + 14} stroke={color} strokeWidth="0.6" opacity="0.4" />
                {/* Animated pulse ring for First Light */}
                {isFirstLight && (
                  <circle
                    cx={m.x} cy={m.y} r={12}
                    fill="none" stroke="#f59e0b" strokeWidth="1"
                    style={{ animation: 'firstLightPulse 3s ease-in-out infinite' }}
                  />
                )}
                <circle cx={m.x} cy={m.y} r={dotR}  fill={color} opacity={isPostFirstLight ? 0.18 : 0.12} filter={filter} />
                <circle cx={m.x} cy={m.y} r={dotR2} fill={isRefusal || isFirstLight ? "none" : color} stroke={isRefusal || isFirstLight ? "#f59e0b" : "white"} strokeWidth={isRefusal || isFirstLight ? 1.5 : 0.8} opacity={isHighlighted || isLast ? 1 : 0.9} />
                <text x={m.x} y={ly} textAnchor="middle" fontSize="8.5" fontFamily="monospace" fill={color} opacity="0.9">{m.label}</text>
                <text x={m.x} y={sy} textAnchor="middle" fontSize="6.5" fontFamily="monospace" fill={color} opacity="0.65">{m.sub}</text>
                <text x={m.x} y={py} textAnchor="middle" fontSize="6"   fontFamily="monospace" fill={color} opacity="0.50">#{m.pr}</text>
              </g>
            );
          })}

          {/* Title */}
          <text x="620" y="26" textAnchor="middle" fontSize="13" fontFamily="monospace" fill="white" opacity="0.85" letterSpacing="4">
            T H E   W A R D E N
          </text>
        </svg>
      </div>

      <div className="mt-6 text-center space-y-1">
        <p className="text-xs font-mono text-base-content/55 tracking-widest">
          zero trades &middot; aev online &middot; real wallet live &middot; still choosing
        </p>
        <p className="text-xs font-mono text-base-content/50">
          AEV &middot; Autonomous Extracted Value &middot; not what is taken, but what is judged
        </p>
      </div>
    </div>
  );
};
