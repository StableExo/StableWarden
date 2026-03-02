const SUPABASE_URL = 'https://vzddgxjykttpddgjqdry.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6ZGRneGp5a3R0cGRkZ2pxZHJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyMjk5MjQsImV4cCI6MjA4NzgwNTkyNH0.VYpLGDWM78FKKDDTEMyrkspsq6ywl6xqWF4JHkEqKlU';

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type OperationType =
  | 'scan'
  | 'ethics_gate'
  | 'decision'
  | 'execution'
  | 'error';

export type DecisionOutcome =
  | 'approved'
  | 'rejected'
  | 'deferred'
  | 'escalated'
  | null;

export interface WardenOperation {
  operation_type: OperationType;
  session_id?: string;
  chain?: string;
  token_address?: string;
  opportunity_score?: number;
  ethics_score?: number;
  decision_outcome?: DecisionOutcome;
  execution_success?: boolean;
  gas_used?: number;
  profit_wei?: string;
  latency_ms?: number;
  metadata?: Record<string, unknown>;
}

export type PatternType =
  | 'mev_opportunity'
  | 'ethics_signature'
  | 'market_condition'
  | 'execution_profile';

export interface WardenPattern {
  pattern_type: PatternType;
  pattern_key: string;
  confidence_score: number;
  occurrence_count?: number;
  last_seen?: string;
  pattern_data?: Record<string, unknown>;
}

export interface PatternRow extends WardenPattern {
  id: number;
  first_seen: string;
  last_seen: string;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
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
    `${SUPABASE_URL}/rest/v1/warden_operations?select=operation_type,ethics_score,decision_outcome,opportunity_score,latency_ms&timestamp=gte.${since}`,
    { headers: HEADERS }
  );

  if (!res.ok) throw new Error(`getOperationStats failed: ${res.status}`);

  const rows: Array<{
    operation_type: string;
    ethics_score: number | null;
    decision_outcome: string | null;
    opportunity_score: number | null;
    latency_ms: number | null;
  }> = await res.json();

  const scans = rows.filter((r) => r.operation_type === 'scan');
  const ethicsGates = rows.filter((r) => r.operation_type === 'ethics_gate');
  const decisions = rows.filter((r) => r.operation_type === 'decision');

  const ethicsPass = ethicsGates.filter(
    (r) => r.ethics_score !== null && r.ethics_score >= 0.93
  ).length;

  const decisionCounts: Record<string, number> = {};
  for (const d of decisions) {
    const outcome = d.decision_outcome ?? 'unknown';
    decisionCounts[outcome] = (decisionCounts[outcome] ?? 0) + 1;
  }

  const scores = scans
    .map((r) => r.opportunity_score)
    .filter((s): s is number => s !== null);
  const latencies = rows
    .map((r) => r.latency_ms)
    .filter((l): l is number => l !== null);

  return {
    total_scans: scans.length,
    ethics_pass_rate:
      ethicsGates.length > 0 ? ethicsPass / ethicsGates.length : 1,
    decisions: decisionCounts,
    avg_opportunity_score:
      scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    avg_latency_ms:
      latencies.length > 0
        ? latencies.reduce((a, b) => a + b, 0) / latencies.length
        : 0,
  };
}

// ─── Patterns ────────────────────────────────────────────────────────────────

/**
 * Persists a neural pattern. Upserts on (pattern_type, pattern_key).
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
      last_seen: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error(`savePattern failed: ${res.status}`);
}

/**
 * Loads a specific pattern by type and key. Returns null if not found.
 */
export async function loadPattern(
  patternType: PatternType,
  patternKey: string
): Promise<PatternRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/warden_patterns?pattern_type=eq.${patternType}&pattern_key=eq.${encodeURIComponent(patternKey)}&limit=1`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`loadPattern failed: ${res.status}`);
  const rows: PatternRow[] = await res.json();
  return rows[0] ?? null;
}

/**
 * Returns the top N highest-confidence patterns for a given type.
 */
export async function loadTopPatterns(
  patternType: PatternType,
  limit = 10
): Promise<PatternRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/warden_patterns?pattern_type=eq.${patternType}&order=confidence_score.desc&limit=${limit}`,
    { headers: HEADERS }
  );
  if (!res.ok) throw new Error(`loadTopPatterns failed: ${res.status}`);
  return res.json();
}

/**
 * Reinforces an existing pattern — increments occurrence_count,
 * updates confidence_score, and bumps last_seen.
 */
export async function reinforcePattern(
  patternType: PatternType,
  patternKey: string,
  newConfidence: number
): Promise<void> {
  // Load current state first
  const existing = await loadPattern(patternType, patternKey);
  if (!existing) return;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/warden_patterns?id=eq.${existing.id}`,
    {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({
        confidence_score: newConfidence,
        occurrence_count: existing.occurrence_count + 1,
        last_seen: new Date().toISOString(),
      }),
    }
  );
  if (!res.ok) throw new Error(`reinforcePattern failed: ${res.status}`);
}
