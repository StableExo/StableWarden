import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileCode, Plus, Minus, Hash } from 'lucide-react';
import { TimelineEntry } from '../types';

interface EntryCardProps {
  entry: TimelineEntry;
}

const SIGNIFICANCE_STYLES: Record<string, string> = {
  foundation: 'border-l-primary bg-primary/5',
  major: 'border-l-secondary bg-secondary/5',
  minor: 'border-l-info bg-info/5',
  patch: 'border-l-base-content/20 bg-base-200',
};

const SIGNIFICANCE_LABELS: Record<string, { text: string; className: string }> = {
  foundation: { text: 'FOUNDATION', className: 'badge-primary' },
  major: { text: 'MAJOR', className: 'badge-secondary' },
  minor: { text: 'MINOR', className: 'badge-info' },
  patch: { text: 'PATCH', className: 'badge-ghost' },
};

export const EntryCard: React.FC<EntryCardProps> = ({ entry }) => {
  const [expanded, setExpanded] = useState(true);
  const sig = SIGNIFICANCE_LABELS[entry.significance];

  return (
    <div className={`border-l-4 rounded-lg p-5 ${SIGNIFICANCE_STYLES[entry.significance]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`badge badge-sm ${sig.className}`}>{sig.text}</span>
            <span className="text-xs text-base-content/40 font-mono flex items-center gap-1">
              <Hash size={10} className="opacity-60" />
              {entry.commitHash}
            </span>
          </div>
          <h3 className="text-lg font-bold text-base-content">{entry.title}</h3>
          <p className="text-sm text-base-content/50 mt-0.5">{entry.date}</p>
        </div>
        <button className="btn btn-ghost btn-sm btn-square" onClick={() => setExpanded(!expanded)}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      <p className="text-sm text-base-content/60 mt-3 font-mono bg-base-300/50 rounded px-3 py-2">
        {entry.description}
      </p>

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-base-content/60">
              <FileCode size={14} className="opacity-60" />
              <span className="font-mono">{entry.filesChanged.toLocaleString()}</span>
              <span>files</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-success">
              <Plus size={14} className="opacity-60" />
              <span className="font-mono">{entry.linesAdded.toLocaleString()}</span>
            </div>
            {entry.linesRemoved > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-error">
                <Minus size={14} className="opacity-60" />
                <span className="font-mono">{entry.linesRemoved.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-base-content/40 uppercase tracking-wider mb-2">
              Capabilities Introduced
            </p>
            <div className="flex flex-wrap gap-2">
              {entry.capabilities.map((cap, i) => (
                <span key={i} className="bg-base-200 rounded-full px-3 py-1 text-sm text-base-content/80 flex items-center gap-1.5">
                  <span>{cap.icon}</span>
                  {cap.label}
                </span>
              ))}
            </div>
          </div>

          <div className="border-t border-base-content/10 pt-4">
            <p className="text-xs text-base-content/40 uppercase tracking-wider mb-2">
              The Record
            </p>
            <p className="text-sm text-base-content/70 italic leading-relaxed">
              "{entry.narrative}"
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
