-- N5: uploadCardImage() only validated size/type client-side (kf-supabase.js)
-- -- trivially bypassed by anyone calling the storage API directly instead
-- of going through the app. Supabase Storage buckets support these limits
-- natively; setting them here makes the restriction actually enforced by
-- the storage service itself, not just politely requested by the client.
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'card-images';
