-- Enable RLS on all three tables
ALTER TABLE public.warden_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warden_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warden_patterns ENABLE ROW LEVEL SECURITY;

-- warden_entries: public read-only (the chronicle is public)
CREATE POLICY "public can read entries"
  ON public.warden_entries FOR SELECT
  TO anon, authenticated
  USING (true);

-- warden_operations: public read, anon insert (TheWarden logs via anon key)
CREATE POLICY "public can read operations"
  ON public.warden_operations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon can log operations"
  ON public.warden_operations FOR INSERT
  TO anon
  WITH CHECK (true);

-- warden_patterns: public read, anon insert + update (neural weight persistence)
CREATE POLICY "public can read patterns"
  ON public.warden_patterns FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon can save patterns"
  ON public.warden_patterns FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon can update patterns"
  ON public.warden_patterns FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
