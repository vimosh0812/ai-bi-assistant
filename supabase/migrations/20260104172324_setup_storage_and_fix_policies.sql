-- ============================================
-- Fix infinite recursion policies and setup storage
-- ============================================

-- 1. Drop admin policies that cause infinite recursion
DROP POLICY IF EXISTS "folders_select_admin" ON public.folders;
DROP POLICY IF EXISTS "files_select_admin" ON public.files;

-- 2. Create csv-files storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('csv-files', 'csv-files', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Users can upload CSV files to their folder" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own CSV files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own CSV files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own CSV files" ON storage.objects;

-- 4. Create storage policies for csv-files bucket
-- Users can upload files to their own folder
CREATE POLICY "Users can upload CSV files to their folder"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'csv-files' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can view their own files
CREATE POLICY "Users can view their own CSV files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'csv-files' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can update their own files
CREATE POLICY "Users can update their own CSV files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'csv-files' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can delete their own files
CREATE POLICY "Users can delete their own CSV files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'csv-files' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
