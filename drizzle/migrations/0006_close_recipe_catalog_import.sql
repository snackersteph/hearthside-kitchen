REVOKE INSERT ON public.recipes FROM anon, authenticated;
DROP POLICY "Recipe catalog initial import" ON public.recipes;
COMMENT ON TABLE public.recipes IS 'Shared recipe records. UI changes are projected from the append-only kitchen action log; deleted rows are retained for historical menu references.';
COMMENT ON TABLE public.residents IS 'Shared resident care records. UI changes are projected from the append-only kitchen action log; deleted rows are retained as tombstones.';