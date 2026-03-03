import { useEffect, useState, useCallback } from 'react';
import { getOperationStats, loadTopPatterns, OperationStats, PatternRow } from './neuralStore';

export interface NeuralStatsState {
  stats: OperationStats | null;
  topPatterns: PatternRow[];
  loading: boolean;
  error: string | null;
}

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls warden_operations and warden_patterns on a 30s interval.
 * Safe to mount before any data exists — returns nulls until data arrives.
 */
export function useNeuralStats(windowHours = 24): NeuralStatsState {
  const [stats, setStats] = useState<OperationStats | null>(null);
  const [topPatterns, setTopPatterns] = useState<PatternRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        getOperationStats(windowHours),
        loadTopPatterns('gas', 3),
      ]);
      setStats(s);
      setTopPatterns(p);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'neural fetch failed');
    } finally {
      setLoading(false);
    }
  }, [windowHours]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, topPatterns, loading, error };
}
