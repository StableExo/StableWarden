import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/', label: 'TERMINAL', icon: '▸' },
  { path: '/pulse', label: 'PULSE', icon: '◉' },
  { path: '/record', label: 'RECORD', icon: '◈' },
];

export const Nav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;

  return (
    <>
      <style>{`
        @keyframes navGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.05), 0 4px 20px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 30px rgba(245, 158, 11, 0.1), 0 4px 20px rgba(0,0,0,0.5); }
        }
        @keyframes pulseIcon {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
      <nav
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 font-mono flex items-center gap-1"
        style={{
          background: 'rgba(8, 8, 8, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '6px 8px',
          animation: 'navGlow 6s ease-in-out infinite',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = currentPath === item.path;
          const isPulse = item.path === '/pulse';
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all duration-300"
              style={{
                background: isActive ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                color: isActive ? '#f59e0b' : 'rgba(255,255,255,0.35)',
                fontSize: '11px',
                letterSpacing: '0.15em',
                cursor: 'pointer',
                border: 'none',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)';
                  (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }
              }}
            >
              <span
                style={{
                  fontSize: isPulse ? '10px' : '9px',
                  animation: isPulse && isActive ? 'pulseIcon 2s ease-in-out infinite' : 'none',
                }}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );
};
