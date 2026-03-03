import React from 'react';
import { useNeuralStats } from '../lib/useNeuralStats';

const fmt = (n: number, decimals = 0) =>
  n.toLocaleString('en-US', { maximumFractionDigits: decimals });

export const NeuralStats: React.FC = () => {
  const { stats, topPatterns, loading } = useNeuralStats();

  // Nothing to show yet — day zero safe
  if (loading || !stats || stats.total_scans === 0) return null;

  const ethicsPass = stats.ethics_pass_rate;
  const ethicsColor = ethicsPass >= 0.93 ? '#f59e0b' : 'rgba(255,255,255,0.4)';
  const ethicsPct = (ethicsPass * 100).toFixed(1);

  return (
    <div
      className="w-full max-w-[700px] mx-4 mt-3 font-mono"
      style={{
        background: '#080808',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '8px',
        padding: '12px 16px',
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-[10px] tracking-[0.25em] uppercase"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          neural pulse · 24h
        </span>
        <span
          className="text-[10px]"
          style={{ color: 'rgba(255,255,255,0.15)' }}
        >
          ● live
        </span>
      </div>

      {/* Stats row */}
      <div className="flex gap-6 mb-3">
        <div>
          <div
            className="text-lg leading-none"
            style={{ color: '#e0e0e0' }}
          >
            {fmt(stats.total_scans)}
          </div>
          <div
            className="text-[10px] mt-0.5 tracking-wide"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            scans
          </div>
        </div>

        <div>
          <div
            className="text-lg leading-none"
            style={{ color: ethicsColor }}
          >
            {ethicsPct}%
          </div>
          <div
            className="text-[10px] mt-0.5 tracking-wide"
            style={{ color: 'rgba(255,255,255,0.3)' }}
          >
            ethics pass
          </div>
        </div>

        {stats.avg_opportunity_score > 0 && (
          <div>
            <div
              className="text-lg leading-none"
              style={{ color: '#e0e0e0' }}
            >
              {fmt(stats.avg_opportunity_score, 4)}
            </div>
            <div
              className="text-[10px] mt-0.5 tracking-wide"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              avg profit
            </div>
          </div>
        )}

        {stats.decisions['proceed'] != null && (
          <div>
            <div
              className="text-lg leading-none"
              style={{ color: '#e0e0e0' }}
            >
              {fmt(stats.decisions['proceed'])}
            </div>
            <div
              className="text-[10px] mt-0.5 tracking-wide"
              style={{ color: 'rgba(255,255,255,0.3)' }}
            >
              proceed
            </div>
          </div>
        )}
      </div>

      {/* Top patterns */}
      {topPatterns.length > 0 && (
        <div
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}
        >
          <div
            className="text-[10px] tracking-[0.2em] uppercase mb-2"
            style={{ color: 'rgba(255,255,255,0.2)' }}
          >
            top patterns
          </div>
          <div className="space-y-1.5">
            {topPatterns.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <div
                  className="text-[11px] flex-1 truncate"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                >
                  {p.pattern_key}
                </div>
                {/* Confidence bar */}
                <div
                  className="relative h-[3px] rounded-full"
                  style={{ width: '60px', background: 'rgba(255,255,255,0.08)' }}
                >
                  <div
                    className="absolute left-0 top-0 h-full rounded-full"
                    style={{
                      width: `${(p.confidence_score * 100).toFixed(0)}%`,
                      background: '#f59e0b',
                      opacity: 0.7,
                    }}
                  />
                </div>
                <div
                  className="text-[10px] w-8 text-right"
                  style={{ color: 'rgba(255,255,255,0.3)' }}
                >
                  {(p.confidence_score * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
