import React, { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { Timeline } from '../components/Timeline';
import { PhaseMap } from '../components/PhaseMap';
import { ArcView } from '../components/ArcView';
import { TimelineEntry, ProjectStats } from '../types';
import { fetchEntries } from '../lib/supabase';
import { Network, List, GitBranch } from 'lucide-react';

const STATS: ProjectStats = {
  totalCommits: 1821,
  totalBranches: 524,
  firstCommitDate: 'October 29, 2025',
  latestActivity: 'March 1, 2026',
  contributors: 1,
};

type ViewMode = 'phases' | 'chronicle' | 'arc';

export const RecordPage: React.FC = () => {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('phases');

  useEffect(() => {
    fetchEntries()
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="min-h-screen bg-base-100 p-6 max-w-3xl mx-auto">
      <a
        href="#/"
        className="inline-block mb-4 text-sm text-base-content/40 hover:text-base-content/70 transition-colors"
      >
        ← Back
      </a>

      <Header stats={STATS} />

      <div className="divider divider-start text-base-content/20 text-xs tracking-widest uppercase mb-6">
        Witness · Document · Verify · Remember
      </div>

      {/* View Toggle */}
      <div className="flex items-center gap-2 mb-8">
        <button
          onClick={() => setView('phases')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            view === 'phases'
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'bg-base-200/50 border-base-content/10 text-base-content/40 hover:text-base-content/70'
          }`}
        >
          <Network size={14} />
          Phase Map
        </button>
        <button
          onClick={() => setView('chronicle')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            view === 'chronicle'
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'bg-base-200/50 border-base-content/10 text-base-content/40 hover:text-base-content/70'
          }`}
        >
          <List size={14} />
          Chronicle
        </button>
        <button
          onClick={() => setView('arc')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
            view === 'arc'
              ? 'bg-primary/10 border-primary/40 text-primary'
              : 'bg-base-200/50 border-base-content/10 text-base-content/40 hover:text-base-content/70'
          }`}
        >
          <GitBranch size={14} />
          The Arc
        </button>
      </div>

      {loading && view !== 'arc' && (
        <div className="flex items-center justify-center py-20 text-base-content/40">
          <span className="loading loading-dots loading-md mr-3" />
          Loading the record...
        </div>
      )}

      {error && view !== 'arc' && (
        <div className="alert alert-error">
          <span>Failed to load: {error}</span>
        </div>
      )}

      {!loading && !error && view === 'phases' && <PhaseMap entries={entries} />}
      {!loading && !error && view === 'chronicle' && <Timeline entries={entries} />}
      {view === 'arc' && <ArcView />}

      <div className="mt-12 pb-8 text-center">
        <p className="text-xs text-base-content/20">
          StableWarden — Built by StableExo · Verified by TheWarden
        </p>
        <p className="text-xs text-base-content/15 mt-1">
          The transparent AI development record.
        </p>
      </div>
    </div>
  );
};
