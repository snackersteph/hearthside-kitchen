CREATE TABLE public.recipes (id text PRIMARY KEY, data jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0, deleted boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT, INSERT ON public.recipes TO anon, authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared recipe catalog read" ON public.recipes FOR SELECT TO anon, authenticated USING (length(id) > 0);
CREATE POLICY "Recipe catalog initial import" ON public.recipes FOR INSERT TO anon, authenticated WITH CHECK (id = data->>'id' AND jsonb_typeof(data->'ingredients') = 'array' AND jsonb_typeof(data->'name') = 'string' AND jsonb_typeof(data->'allergens') = 'array');
CREATE TABLE public.residents (id text PRIMARY KEY, data jsonb NOT NULL, sort_order integer NOT NULL DEFAULT 0, deleted boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.residents TO anon, authenticated;
GRANT ALL ON public.residents TO service_role;
ALTER TABLE public.residents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shared resident catalog read" ON public.residents FOR SELECT TO anon, authenticated USING (length(id) > 0);
INSERT INTO public.residents(id, data, sort_order) SELECT r.value->>'id', r.value, r.ordinality::integer FROM public.kitchen_snapshot s CROSS JOIN LATERAL jsonb_array_elements(s.state->'residents') WITH ORDINALITY r(value, ordinality) WHERE s.id = 1;
INSERT INTO public.recipes(id, data, sort_order) SELECT r.value->>'id', r.value, r.ordinality::integer FROM public.kitchen_snapshot s CROSS JOIN LATERAL jsonb_array_elements(COALESCE(s.state->'recipes', '[]'::jsonb)) WITH ORDINALITY r(value, ordinality) WHERE s.id = 1;
CREATE FUNCTION public.project_kitchen_catalog_action() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE record_data jsonb; record_id text; action_type text := NEW.action->>'type';
BEGIN
IF action_type IN ('addRecipe', 'editRecipe') THEN
 record_data := NEW.action->'recipe'; record_id := record_data->>'id';
 IF record_id IS NOT NULL AND jsonb_typeof(record_data->'ingredients') = 'array' AND jsonb_typeof(record_data->'allergens') = 'array' AND jsonb_typeof(record_data->'name') = 'string' THEN
 INSERT INTO public.recipes(id, data, sort_order) VALUES(record_id, record_data, NEW.id::integer + 10000) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, deleted=false, updated_at=now();
 END IF;
ELSIF action_type = 'deleteRecipe' THEN
 UPDATE public.recipes SET deleted=true, updated_at=now() WHERE id=NEW.action->>'id';
ELSIF action_type IN ('addResident', 'updateResident') THEN
 record_data := NEW.action->'resident'; record_id := record_data->>'id';
 IF record_id IS NOT NULL AND jsonb_typeof(record_data->'name') = 'string' AND jsonb_typeof(record_data->'allergens') = 'array' AND jsonb_typeof(record_data->'diets') = 'array' THEN
 INSERT INTO public.residents(id, data, sort_order) VALUES(record_id, record_data, NEW.id::integer + 10000) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data, deleted=false, updated_at=now();
 END IF;
ELSIF action_type = 'deleteResident' THEN
 UPDATE public.residents SET deleted=true, updated_at=now() WHERE id=NEW.action->>'id';
END IF;
RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.project_kitchen_catalog_action() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER kitchen_catalog_projection AFTER INSERT ON public.kitchen_actions FOR EACH ROW EXECUTE FUNCTION public.project_kitchen_catalog_action();
-- Backfill saved UI edits in their original order without changing the action log.
DO $$ DECLARE a record; d jsonb; BEGIN
FOR a IN SELECT id, action FROM public.kitchen_actions ORDER BY id LOOP
 IF a.action->>'type' IN ('addRecipe','editRecipe') THEN
 d:=a.action->'recipe'; INSERT INTO public.recipes(id,data,sort_order) VALUES(d->>'id',d,a.id::integer+10000) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,deleted=false;
 ELSIF a.action->>'type'='deleteRecipe' THEN UPDATE public.recipes SET deleted=true WHERE id=a.action->>'id';
 ELSIF a.action->>'type' IN ('addResident','updateResident') THEN
 d:=a.action->'resident'; INSERT INTO public.residents(id,data,sort_order) VALUES(d->>'id',d,a.id::integer+10000) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,deleted=false;
 ELSIF a.action->>'type'='deleteResident' THEN UPDATE public.residents SET deleted=true WHERE id=a.action->>'id';
 END IF;
END LOOP;
END; $$;