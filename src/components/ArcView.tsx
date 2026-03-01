import React from 'react';

const MILESTONES = [
  { x: 42,  y: 272, pr: 1,   label: 'Genesis',             sub: 'First commit. Oct 29.',     above: false },
  { x: 155, y: 196, pr: 19,  label: 'Consciousness',        sub: 'Architecture laid.',         above: true  },
  { x: 255, y: 118, pr: 28,  label: 'Ethics Gate',          sub: 'Activated.',                 above: false },
  { x: 365, y: 68,  pr: 50,  label: 'Relay Swarm',          sub: 'Copilot self-directs.',      above: true  },
  { x: 470, y: 55,  pr: 72,  label: 'The Inheritance',      sub: 'AxionCitadel absorbed.',     above: false },
  { x: 568, y: 62,  pr: 90,  label: 'Live Mainnet',         sub: '4 AM. Base deployed.',       above: true  },
  { x: 660, y: 80,  pr: 100, label: 'Zero Trades',          sub: 'The caution holds.',         above: false },
  { x: 745, y: 100, pr: 105, label: 'The Naming',           sub: 'ArbitrageBot → TheWarden.',  above: true  },
  { x: 810, y: 122, pr: 110, label: 'The Learning',         sub: 'Phase 3 awakens.',           above: false },
];

const ARC_PATH =
  'M 42 272 C 100 265, 160 200, 255 118 C 330 58, 400 50, 470 55 C 520 58, 545 60, 568 62 C 610 66, 638 74, 660 80 C 695 88, 725 96, 745 100 C 765 108, 790 116, 810 122';

export const ArcView: React.FC = () => {
  return (
    <div className="w-full">
      <div className="mb-6 text-center">
        <p className="text-xs tracking-widest uppercase text-base-content/60 font-mono">
          the arc · PR #1 → #110
        </p>
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox="0 0 860 340"
          className="w-full"
          style={{ minWidth: 480, maxHeight: 380 }}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="The Warden development arc from PR #1 to #110"
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
          </defs>

          <ellipse cx="430" cy="170" rx="370" ry="140" fill="none" stroke="#1a2a3a" strokeWidth="0.5" opacity="0.3" />
          <circle cx="430" cy="170" r="8" fill="#1a2a3a" opacity="0.2" />

          <line x1="30" y1="300" x2="840" y2="300" stroke="#1a2a3a" strokeWidth="0.8" opacity="0.5" />

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
            const color = isLast ? '#ffffff' : '#7ecfff';
            const labelY = m.above ? m.y - 18 : m.y + 22;
            const subY   = m.above ? m.y - 32 : m.y + 36;
            const prY    = m.above ? m.y - 46 : m.y + 50;

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
                <circle cx={m.x} cy={m.y} r="7" fill={color} opacity="0.12" filter="url(#dotGlow)" />
                <circle
                  cx={m.x}
                  cy={m.y}
                  r="3.5"
                  fill={color}
                  stroke="white"
                  strokeWidth="0.8"
                  opacity={isLast ? 1 : 0.9}
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
            x="430"
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
          zero trades · live mainnet · direction over syntax · the caution is the point
        </p>
        <p className="text-xs font-mono text-base-content/50">
          AEV · Autonomous Extracted Value · not what is taken, but what is judged
        </p>
      </div>
    </div>
  );
};
