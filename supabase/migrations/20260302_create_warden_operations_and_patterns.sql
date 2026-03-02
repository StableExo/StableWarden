-- Neural Memory Schema — PR A
-- Transforms Supabase from passive chronicle to active operational memory

-- warden_operations: every scan, evaluation, ethics gate, execution, startup, shutdown
CREATE TABLE IF NOT EXISTS warden_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  event_type text NOT NULL CHECK (event_type IN ('scan', 'evaluation', 'ethics_gate', 'execution', 'startup', 'shutdown')),
  chain text,
  dex_pair text,
  profit_estimate numeric,
  alignment_score numeric,
  decision text CHECK (decision IN ('proceed', 'hold', 'decline')),
  reason text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- warden_patterns: persistent neural network weights and learned patterns
CREATE TABLE IF NOT EXISTS warden_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text NOT NULL CHECK (pattern_type IN ('gas', 'slippage', 'timing', 'chain_behavior', 'dex_liquidity')),
  chain text,
  dex text,
  observed_value numeric,
  predicted_value numeric,
  accuracy_delta numeric,
  sample_size integer DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  weight float NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON warden_operations (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_operations_event_type ON warden_operations (event_type);
CREATE INDEX IF NOT EXISTS idx_operations_chain_dex ON warden_operations (chain, dex_pair);
CREATE INDEX IF NOT EXISTS idx_patterns_type_chain ON warden_patterns (pattern_type, chain);
CREATE INDEX IF NOT EXISTS idx_patterns_last_updated ON warden_patterns (last_updated DESC);
