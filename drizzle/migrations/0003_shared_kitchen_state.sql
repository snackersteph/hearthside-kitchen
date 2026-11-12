CREATE TABLE public.kitchen_snapshot (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  state jsonb NOT NULL,
  through_action_id bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.kitchen_actions (
  id bigserial PRIMARY KEY,
  client_id text NOT NULL CHECK (char_length(client_id) <= 64),
  action jsonb NOT NULL CHECK (pg_column_size(action) < 4000000),
  acted_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.kitchen_snapshot TO anon, authenticated;
GRANT SELECT, INSERT ON public.kitchen_actions TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.kitchen_actions_id_seq TO anon, authenticated;
GRANT ALL ON public.kitchen_snapshot, public.kitchen_actions TO service_role;
ALTER TABLE public.kitchen_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared kitchen read" ON public.kitchen_snapshot FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared kitchen seed" ON public.kitchen_snapshot FOR INSERT TO anon, authenticated WITH CHECK (id = 1);
CREATE POLICY "Shared kitchen compact" ON public.kitchen_snapshot FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (id = 1);
CREATE POLICY "Shared actions read" ON public.kitchen_actions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Shared actions append" ON public.kitchen_actions FOR INSERT TO anon, authenticated WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.kitchen_actions;