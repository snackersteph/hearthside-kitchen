DROP POLICY IF EXISTS "Shared kitchen compact" ON public.kitchen_snapshot;
REVOKE UPDATE ON public.kitchen_snapshot FROM anon, authenticated;
DROP POLICY IF EXISTS "Shared kitchen read" ON public.kitchen_snapshot;
CREATE POLICY "Shared kitchen read" ON public.kitchen_snapshot FOR SELECT TO anon, authenticated USING (id = 1);
DROP POLICY IF EXISTS "Shared actions read" ON public.kitchen_actions;
CREATE POLICY "Shared actions read" ON public.kitchen_actions FOR SELECT TO anon, authenticated USING (id > 0);
DROP POLICY IF EXISTS "Shared actions append" ON public.kitchen_actions;
CREATE POLICY "Shared actions append" ON public.kitchen_actions FOR INSERT TO anon, authenticated
WITH CHECK (
  client_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND jsonb_typeof(action) = 'object'
  AND jsonb_typeof(action->'type') = 'string'
  AND (action->>'type') <> 'load'
  AND acted_at BETWEEN now() - interval '10 minutes' AND now() + interval '10 minutes'
);