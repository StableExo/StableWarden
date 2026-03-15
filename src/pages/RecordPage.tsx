import React, { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { Timeline } from '../components/Timeline';
import { PhaseMap } from '../components/PhaseMap';
import { ArcView } from '../components/ArcView';
import { TimelineEntry, ProjectStats } from '../types';
import { fetchEntries } from '../lib/supabase';
import { Network, List, GitBranch } from 'lucide-react';
import { Nav } from '../components/Nav';

type ViewMode = 'phases' | 'chronicle' | 'arc';

interface RecordPageProps {
  defaultView?: ViewMode;
}

export const RecordPage: React.FC<RecordPageProps> = ({ defaultView = 'phases' }) => {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>(defaultView);

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

  const stats: ProjectStats = useMemo(() => {
    const prEntries = entries.filter((e) => e.isPR);
    const latestDate =
      entries.length > 0
        ? new Date(entries[entries.length - 1].date).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : '—';
    return {
      totalEntries: entries.length,
      totalPRs: prEntries.length,
      firstCommitDate: 'October 29, 2025',
      latestActivity: latestDate,
      contributors: 1,
    };
  }, [entries]);

  return (
    <div className="min-h-screen bg-base-100">
      <main className="p-6 max-w-3xl mx-auto" id="main-content">
        <a
          href="#/"
          className="inline-block mb-4 text-sm text-base-content/60 hover:text-base-content/80 transition-colors"
        >
          &larr; Back
        </a>

        <Header stats={stats} />

        <div className="divider divider-start text-base-content/50 text-xs tracking-widest uppercase mb-6">
          Witness &middot; Document &middot; Verify &middot; Remember
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-2 mb-8" role="tablist" aria-label="View options">
          <button
            role="tab"
            aria-selected={view === 'phases'}
            onClick={() => setView('phases')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              view === 'phases'
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-base-200/50 border-base-content/10 text-base-content/60 hover:text-base-content/80'
            }`}
          >
            <Network size={14} />
            Phase Map
          </button>
          <button
            role="tab"
            aria-selected={view === 'chronicle'}
            onClick={() => setView('chronicle')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              view === 'chronicle'
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-base-200/50 border-base-content/10 text-base-content/60 hover:text-base-content/80'
            }`}
          >
            <List size={14} />
            Chronicle
          </button>
          <button
            role="tab"
            aria-selected={view === 'arc'}
            onClick={() => setView('arc')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
              view === 'arc'
                ? 'bg-primary/10 border-primary/40 text-primary'
                : 'bg-base-200/50 border-base-content/10 text-base-content/60 hover:text-base-content/80'
            }`}
          >
            <GitBranch size={14} />
            The Arc
          </button>
        </div>

        {loading && view !== 'arc' && (
          <div className="flex items-center justify-center py-20 text-base-content/60">
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

        <div className="mt-12 pb-24 text-center">
          <p className="text-xs text-base-content/50">
            StableWarden &mdash; Built by StableExo &middot; Verified by TheWarden
          </p>
          <p className="text-xs text-base-content/45 mt-1">
            The transparent AI development record.
          </p>
        </div>
      </main>
      <Nav />
    </div>
  );
};
