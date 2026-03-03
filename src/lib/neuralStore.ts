const SUPABASE_URL = 'https://vzddgxjykttpddgjqdry.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZGRneGp5a3R0cGRkZ2pxZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjk5MjQsImV4cCI6MjA4NzgwNTkyNH0.VYpLGDWM78FKKDDTEMyrkspsq6ywl6xqWF4JHkEqKlU';

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type EventType =
  | 'scan'
  | 'evaluation'
  | 'ethics_gate'
  | 'execution'
  | 'startup'
  | 'shutdown';

export type Decision = 'proceed' | 'hold' | 'decline';

export interface WardenOperation {
  event_type: EventType;
  chain?: string;
  dex_pair?: string;
  profit_estimate?: number;
  alignment_score?: number;
  decision?: Decision;
  reason?: string;
  raw_data?: Record<string, unknown>;
}

export type PatternType =
  | 'gas'
  | 'slippage'
  | 'timing'
  | 'chain_behavior'
  | 'dex_liquidity';

export interface WardenPattern {
  pattern_type: PatternType;
  chain?: string;
  dex?: string;
  observed_value?: number;
  predicted_value?: number;
  accuracy_delta?: number;
  sample_size?: number;
  weight?: number;
}

export interface PatternRow {
  id: string;
  pattern_type: PatternType;
  chain: string | null;
  dex: string | null;
  observed_value: number | null;
  predicted_value: number | null;
  accuracy_delta: number | null;
  sample_size: number | null;
  weight: number;
  last_updated: string;
  created_at: string;
  // Derived display fields — mapped from real columns
  pattern_key: string;     // = `${pattern_type}:${chain ?? 'all'}:${dex ?? 'any'}`
  confidence_score: number; // = weight
}

export interface OperationStats {
  total_scans: number;
  ethics_pass_rate: number;
  decisions: Record<string, number>;
  avg_opportunity_score: number;
  avg_latency_ms: number;
}

// ─── Operations ──────────────────────────────────────────────────────────────

/**
 * Fire-and-forget operation logger. Never throws — silent fail on error.
 * Safe to call from hot paths without awaiting.
 */
export async function logOperation(op: WardenOperation): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/warden_operations`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify(op),
    });
  } catch {
    // intentionally silent — logging must never disrupt the read path
  }
}

/**
 * Returns aggregate stats for operations within the last `windowHours` hours.
 */
export async function getOperationStats(
  windowHours = 24
): Promise<OperationStats> {
  const since = new Date(
    Date.now() - windowHours * 60 * 60 * 1000
  ).toISOString();

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/warden_operations?select=event_type,alignment_score,decision,profit_estimate&timestamp=gte.${since}`,
    { headers: HEADERS }
  );

  if (!res.ok) throw new Error(`getOperationStats failed: ${res.status}`);

  const rows: Array<{
    event_type: string;
    alignment_score: number | null;
    decision: string | null;
    profit_estimate: number | null;
  }> = await res.json();

  const scans = rows.filter((r) => r.event_type === 'scan');
  const ethicsGates = rows.filter((r) => r.event_type === 'ethics_gate');

  const ethicsPass = ethicsGates.filter(
    (r) => r.alignment_score !== null && r.alignment_score >= 0.93
  ).length;

  const decisionCounts: Record<string, number> = {};
  for (const d of rows) {
    if (d.decision) {
      decisionCounts[d.decision] = (decisionCounts[d.decision] ?? 0) + 1;
    }
  }

  const scores = scans
    .map((r) => r.profit_estimate)
    .filter((s): s is number => s !== null);

  return {
    total_scans: scans.length,
    ethics_pass_rate:
      ethicsGates.length > 0 ? ethicsPass / ethicsGates.length : 1,
    decisions: decisionCounts,
    avg_opportunity_score:
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    avg_latency_ms: 0,
  };
}

// ─── Patterns ────────────────────────────────────────────────────────────────

/**
 * Persists a neural pattern.
 */
export async function savePattern(pattern: WardenPattern): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/warden_patterns`, {
    method: 'POST',
    headers: {
      ...HEADERS,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      ...pattern,
      last_updated: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`savePattern failed: ${res.status}`);
}

/**
 * Loads the highest-weight pattern for a given type and optional chain.
 * Returns null if not found.
 */
export async function loadPattern(
  patternType: PatternType,
  chain?: string
): Promise<PatternRow | null> {
  let url = `${SUPABASE_URL}/rest/v1/warden_patterns?pattern_type=eq.${patternType}&limit=1&order=weight.desc`;
  if (chain) url += `&chain=eq.${encodeURIComponent(chain)}`;

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`loadPattern failed: ${res.status}`);

  const rows: Omit<PatternRow, 'pattern_key' | 'confidence_score'>[] = await res.json();
  if (!rows[0]) return null;

  return {
    ...rows[0],
    pattern_key: `${rows[0].pattern_type}:${rows[0].chain ?? 'all'}`,
    confidence_score: rows[0].weight,
  };
}

/**
 * Returns the top N highest-weight patterns for a given type.
 */
export async function loadTopPatterns(
  patternType: PatternType,
  limit = 10
): Promise<PatternRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/warden_patterns?pattern_type=eq.${patternType}&order=weight.desc&limit=${limit}`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`loadTopPatterns failed: ${res.status}`);

  const rows: Omit<PatternRow, 'pattern_key' | 'confidence_score'>[] = await res.json();
  return rows.map((r) => ({
    ...r,
    pattern_key: `${r.pattern_type}:${r.chain ?? 'all'}:${r.dex ?? 'any'}`,
    confidence_score: r.weight,
  }));
}

/**
 * Reinforces an existing pattern — increments sample_size and updates weight.
 */
export async function reinforcePattern(
  patternType: PatternType,
  chain: string,
  newWeight: number
): Promise<void> {
  const existing = await loadPattern(patternType, chain);
  if (!existing) return;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/warden_patterns?id=eq.${existing.id}`,
    {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({
        weight: newWeight,
        sample_size: (existing.sample_size ?? 0) + 1,
        last_updated: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) throw new Error(`reinforcePattern failed: ${res.status}`);
}
