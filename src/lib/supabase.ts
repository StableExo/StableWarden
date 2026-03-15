import { TimelineEntry } from '../types';

const SUPABASE_URL = 'https://vzddgxjykttpddgjqdry.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZGRneGp5a3R0cGRkZ2pxZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjk5MjQsImV4cCI6MjA4NzgwNTkyNH0.VYpLGDWM78FKKDDTEMyrkspsq6ywl6xqWF4JHkEqKlU';

type DbSignificance =
  | 'foundation' | 'major' | 'minor' | 'patch'
  | 'critical' | 'high' | 'medium' | 'low';

const SIGNIFICANCE_MAP: Record<string, TimelineEntry['significance']> = {
  critical: 'foundation',
  high: 'major',
  medium: 'minor',
  low: 'patch',
  foundation: 'foundation',
  major: 'major',
  minor: 'minor',
  patch: 'patch',
};

function normalizeSignificance(s: DbSignificance): TimelineEntry['significance'] {
  return SIGNIFICANCE_MAP[s] ?? 'minor';
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

export async function fetchEntries(): Promise<TimelineEntry[]> {
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
