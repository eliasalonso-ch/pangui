CREATE POLICY "Workspace members can upload logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'workspace-logos');

CREATE POLICY "Workspace logos are public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'workspace-logos');

CREATE POLICY "Workspace members can update logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'workspace-logos');

CREATE POLICY "Workspace members can delete logos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'workspace-logos');;
