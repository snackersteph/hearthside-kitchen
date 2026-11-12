DROP POLICY IF EXISTS "Read team avatars" ON storage.objects;
CREATE POLICY "Read own avatars" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'user-avatars' AND (storage.foldername(name))[1] = (select auth.uid()::text));