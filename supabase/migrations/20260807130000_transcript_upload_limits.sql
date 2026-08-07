-- Konsistenz-Audit 07.08.2026, Punkt 1 (U1): der transcripts-Bucket hatte im
-- Gegensatz zu card-images (20260728250000_card_image_limits.sql) weder
-- file_size_limit noch eine MIME-Whitelist -- ein direkter Aufruf der
-- Storage-API (unter Umgehung der App) könnte beliebig große Dateien mit
-- beliebigem Typ hochladen. Gleiches Muster wie bei card-images: 10 MB,
-- PDF (Normalfall) plus die gängigen Fotoformate (falls jemand statt eines
-- PDFs ein Foto des Notenausdrucks hochlädt).
update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
where id = 'transcripts';
