import React from 'react';
import { TimelineEntry } from '../types';
import { EntryCard } from './EntryCard';

interface TimelineProps {
  entries: TimelineEntry[];
}

export const Timeline: React.FC<TimelineProps> = ({ entries }) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm text-base-content/40 uppercase tracking-widest font-semibold">
          Timeline
        </h2>
        <span className="text-xs text-base-content/30">
          {entries.length} of 1,821 entries documented
        </span>
      </div>

      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-base-content/10" />
        <div className="space-y-6">
          {entries.map((entry) => (
            <div key={entry.id} className="relative pl-10">
              <div className="absolute left-1.5 top-6 w-3 h-3 rounded-full bg-primary border-2 border-base-100 z-10" />
              <EntryCard entry={entry} />
            </div>
          ))}

          <div className="relative pl-10">
            <div className="absolute left-1.5 top-3 w-3 h-3 rounded-full bg-base-content/20 border-2 border-base-100 z-10" />
            <div className="bg-base-200/50 rounded-lg p-4 border border-dashed border-base-content/10">
              <p className="text-sm text-base-content/30 text-center">
                {1821 - entries.length} more entries to document...
              </p>
              <p className="text-xs text-base-content/20 text-center mt-1">
                The record grows with every commit.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
