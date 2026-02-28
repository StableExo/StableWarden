import React, { useEffect, useState } from 'react';
import { Header } from '../components/Header';
import { Timeline } from '../components/Timeline';
import { TimelineEntry, ProjectStats } from '../types';
import { fetchEntries } from '../lib/supabase';

const STATS: ProjectStats = {
  totalCommits: 1821,
  totalBranches: 524,
  firstCommitDate: 'October 29, 2025',
  latestActivity: 'February 27, 2026',
  contributors: 1,
};

export const RecordPage: React.FC = () => {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      {loading && (
        <div className="flex items-center justify-center py-20 text-base-content/40">
          <span className="loading loading-dots loading-md mr-3" />
          Loading the record...
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <span>Failed to load: {error}</span>
        </div>
      )}

      {!loading && !error && <Timeline entries={entries} />}

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
