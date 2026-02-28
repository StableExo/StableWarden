import React, { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { Timeline } from './components/Timeline';
import { TimelineEntry, ProjectStats } from './types';

const SUPABASE_URL = 'https://vzddgxjykttpddgjqdry.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZGRneGp5a3R0cGRkZ2pxZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjk5MjQsImV4cCI6MjA4NzgwNTkyNH0.VYpLGDWM78FKKDDTEMyrkspsq6ywl6xqWF4JHkEqKlU';

type DbSignificance = 'foundation' | 'major' | 'minor' | 'patch' | 'high';

function normalizeSignificance(s: DbSignificance): TimelineEntry['significance'] {
  if (s === 'high') return 'major';
  if (['foundation', 'major', 'minor', 'patch'].includes(s))
    return s as TimelineEntry['significance'];
  return 'minor';
}

function mapRow(row: Record<string, unknown>): TimelineEntry {
  const caps = (row.capabilities as string[] | null) ?? [];
  return {
    id: row.id as number,
    date: (row.date as string) ?? '',
    commitHash: (row.commit_hash as string) ?? '',
    isPR: (row.is_pr as boolean) ?? false,
    prNumber: (row.pr_number as number | undefined) ?? undefined,
    title: (row.title as string) ?? '',
    description: (row.message as string) ?? '',
    filesChanged: (row.files_changed as number) ?? 0,
    linesAdded: (row.lines_added as number) ?? 0,
    linesRemoved: (row.lines_removed as number) ?? 0,
    author: (row.author as string) ?? 'StableExo',
    narrative: (row.narrative as string) ?? '',
    significance: normalizeSignificance(row.significance as DbSignificance),
    capabilities: caps.map((cap: string) => {
      const match = cap.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u);
      if (match) {
        return { icon: match[0].trim(), label: cap.slice(match[0].length) };
      }
      return { icon: '◈', label: cap };
    }),
  };
}

const STATS: ProjectStats = {
  totalCommits: 1821,
  totalBranches: 524,
  firstCommitDate: 'October 29, 2025',
  latestActivity: 'February 27, 2026',
  contributors: 1,
};

async function fetchEntries(): Promise<TimelineEntry[]> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/warden_entries?select=*&order=entry_number.asc`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    }
  );
  if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
  const rows: Record<string, unknown>[] = await response.json();
  return rows.map(mapRow);
}

const App: React.FC = () => {
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

export default App;
