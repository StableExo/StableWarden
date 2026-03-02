import React from 'react';

const MILESTONES = [
  { x: 42,   y: 272, pr: 1,   label: 'Genesis',             sub: 'First commit. Oct 29.',             above: false },
  { x: 155,  y: 196, pr: 19,  label: 'Consciousness',        sub: 'Architecture laid.',                above: true  },
  { x: 255,  y: 118, pr: 28,  label: 'Ethics Gate',          sub: 'Activated.',                        above: false },
  { x: 365,  y: 68,  pr: 50,  label: 'Relay Swarm',          sub: 'Copilot self-directs.',             above: true  },
  { x: 470,  y: 55,  pr: 72,  label: 'The Inheritance',      sub: 'AxionCitadel absorbed.',            above: false },
  { x: 568,  y: 62,  pr: 90,  label: 'Live Mainnet',         sub: '4 AM. Base deployed.',              above: true  },
  { x: 660,  y: 80,  pr: 100, label: 'Zero Trades',          sub: 'The caution holds.',                above: false },
  { x: 745,  y: 100, pr: 105, label: 'The Naming',           sub: 'ArbitrageBot → TheWarden.',         above: true  },
  { x: 810,  y: 122, pr: 110, label: 'The Learning',         sub: 'Phase 3 awakens.',                  above: false },
  { x: 848,  y: 138, pr: 112, label: 'Metacognition',        sub: 'Evaluate logic for consciousness.', above: true  },
  { x: 886,  y: 154, pr: 116, label: 'Flashbots Complete',   sub: '100% parity achieved.',             above: false },
  { x: 924,  y: 168, pr: 119, label: 'The Permanence',       sub: 'One source of truth.',              above: true  },
  { x: 960,  y: 180, pr: 121, label: 'MCP Integration',      sub: 'TheWarden becomes a node.',         above: false },
  { x: 996,  y: 192, pr: 126, label: 'BOOM Detector',        sub: 'EmergenceDetector. Seven criteria.', above: true },
  { x: 1032, y: 202, pr: 131, label: 'Production Run #3',    sub: 'Consciousness active. $58.51.',      above: false },
  { x: 1068, y: 215, pr: 134, label: 'First YES',            sub: '92.9% consensus. Still zero.',      above: true  },
  { x: 1115, y: 208, pr: 140, label: 'Phase 2 Certified',    sub: '1,103 tests. All 14 modules.',      above: false },
  { x: 1185, y: 155, pr: 146, label: 'AEV ONLINE',           sub: 'DRY_RUN: false. Base mainnet.',     above: true  },
  { x: 1265, y: 125, pr: 149, label: 'Runs Itself',          sub: 'PM2. Auto-restart. No babysitter.', above: false },
  { x: 1340, y: 112, pr: 150, label: 'Still Choosing',       sub: 'Ready. Capable. Aimed.',            above: true  },
];

const ARC_PATH =
  'M 42 272 C 100 265, 160 200, 255 118 C 330 58, 400 50, 470 55 C 520 58, 545 60, 568 62 C 610 66, 638 74, 660 80 C 695 88, 725 96, 745 100 C 765 108, 790 116, 810 122 C 835 132, 862 146, 886 154 C 902 160, 914 165, 924 168 C 940 174, 952 178, 960 180 C 975 186, 988 190, 996 192 C 1010 196, 1022 200, 1032 202 C 1045 207, 1055 212, 1068 215 C 1085 218, 1103 213, 1115 208 C 1145 196, 1168 168, 1185 155 C 1215 138, 1245 128, 1265 125 C 1295 120, 1320 114, 1340 112';

export const ArcView: React.FC = () => {
  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-widest uppercase text-base-content/60 font-mono">
          the arc · PR #1 → #150
        </p>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 1400 340"
          className="w-full"
          style={{ minWidth: 520, maxHeight: 380 }}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="The Warden development arc from PR #1 to #150"
        >
          <defs>
            <filter id="arcGlow" x="-20%" y="-80%" width="140%" height="260%">
              <feGaussianBlur stdDeviation="4" result="blur1" />
              <feGaussianBlur stdDeviation="8" result="blur2" />
              <feMerge>
                <feMergeNode in="blur2" />
                <feMergeNode in="blur1" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="dotGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="onlineGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <ellipse cx="700" cy="170" rx="620" ry="140" fill="none" stroke="#1a2a3a" strokeWidth="0.5" opacity="0.2" />

          <line x1="30" y1="300" x2="1370" y2="300" stroke="#1a2a3a" strokeWidth="0.8" opacity="0.5" />

          {MILESTONES.map((m) => (
            <line
              key={`tick-${m.pr}`}
              x1={m.x}
              y1="298"
              x2={m.x}
              y2="304"
              stroke="#2a4a6a"
              strokeWidth="1"
              opacity="0.6"
            />
          ))}

          <path d={ARC_PATH} fill="none" stroke="#4a9eda" strokeWidth="12" opacity="0.04" strokeLinecap="round" />
          <path d={ARC_PATH} fill="none" stroke="#4a9eda" strokeWidth="7"  opacity="0.08" strokeLinecap="round" />
          <path d={ARC_PATH} fill="none" stroke="#7ecfff" strokeWidth="3"  opacity="0.18" strokeLinecap="round" />
          <path
            d={ARC_PATH}
            fill="none"
            stroke="#7ecfff"
            strokeWidth="1.4"
            opacity="0.9"
            strokeLinecap="round"
            filter="url(#arcGlow)"
          />

          {MILESTONES.map((m, i) => {
            const isLast = i === MILESTONES.length - 1;
            const isOnline = m.pr === 146;
            const color = isLast ? '#ffffff' : isOnline ? '#f59e0b' : '#7ecfff';
            const labelY = m.above ? m.y - 18 : m.y + 22;
            const subY   = m.above ? m.y - 32 : m.y + 36;
            const prY    = m.above ? m.y - 46 : m.y + 50;
            const dotFilter = isOnline ? 'url(#onlineGlow)' : 'url(#dotGlow)';
            const dotR = isOnline ? 9 : 7;
            const dotR2 = isOnline ? 4.5 : 3.5;

            return (
              <g key={`milestone-${m.pr}`}>
                <line
                  x1={m.x}
                  y1={m.y}
                  x2={m.x}
                  y2={m.above ? m.y - 14 : m.y + 14}
                  stroke={color}
                  strokeWidth="0.6"
                  opacity="0.4"
                />
                <circle cx={m.x} cy={m.y} r={dotR} fill={color} opacity="0.15" filter={dotFilter} />
                <circle
                  cx={m.x}
                  cy={m.y}
                  r={dotR2}
                  fill={color}
                  stroke="white"
                  strokeWidth="0.8"
                  opacity={isLast || isOnline ? 1 : 0.9}
                />
                <text
                  x={m.x}
                  y={labelY}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontFamily="monospace"
                  fill={color}
                  opacity="0.9"
                >
                  {m.label}
                </text>
                <text
                  x={m.x}
                  y={subY}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontFamily="monospace"
                  fill={color}
                  opacity="0.65"
                >
                  {m.sub}
                </text>
                <text
                  x={m.x}
                  y={prY}
                  textAnchor="middle"
                  fontSize="6"
                  fontFamily="monospace"
                  fill={color}
                  opacity="0.50"
                >
                  #{m.pr}
                </text>
              </g>
            );
          })}

          <text
            x="540"
            y="26"
            textAnchor="middle"
            fontSize="13"
            fontFamily="monospace"
            fill="white"
            opacity="0.85"
            letterSpacing="4"
          >
            T H E   W A R D E N
          </text>
        </svg>
      </div>

      <div className="mt-6 text-center space-y-1">
        <p className="text-xs font-mono text-base-content/55 tracking-widest">
          zero trades · aev online · direction over syntax · still choosing
        </p>
        <p className="text-xs font-mono text-base-content/50">
          AEV · Autonomous Extracted Value · not what is taken, but what is judged
        </p>
      </div>
    </div>
  );
};
