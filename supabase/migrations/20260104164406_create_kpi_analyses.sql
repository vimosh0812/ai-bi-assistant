-- Create folders table
CREATE TABLE IF NOT EXISTS public.folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for folders
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON public.folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_created_at ON public.folders(created_at);

-- Enable Row Level Security for folders
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own folders
CREATE POLICY "folders_select_own" ON public.folders
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Admins can view all folders
CREATE POLICY "folders_select_admin" ON public.folders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Users can insert their own folders
CREATE POLICY "folders_insert_own" ON public.folders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own folders
CREATE POLICY "folders_update_own" ON public.folders
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own folders
CREATE POLICY "folders_delete_own" ON public.folders
  FOR DELETE USING (auth.uid() = user_id);

-- Create trigger to update updated_at on folder changes
CREATE TRIGGER folders_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create files table
CREATE TABLE IF NOT EXISTS public.files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  folder_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path TEXT,
  table_name VARCHAR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tableau_workbook_id TEXT,
  embed_url TEXT,
  connected_to_tableau BOOLEAN DEFAULT FALSE,
  ai_summary TEXT,
  original_headers TEXT,
  storage_path TEXT,
  connected_to_looker_studio BOOLEAN DEFAULT FALSE,
  insights TEXT,
  google_sheets_id TEXT,
  has_kpi_analysis BOOLEAN DEFAULT FALSE
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_files_user_id ON public.files(user_id);
CREATE INDEX IF NOT EXISTS idx_files_folder_id ON public.files(folder_id);
CREATE INDEX IF NOT EXISTS idx_files_table_name ON public.files(table_name);
CREATE INDEX IF NOT EXISTS idx_files_created_at ON public.files(created_at);
CREATE INDEX IF NOT EXISTS idx_files_has_kpi_analysis ON public.files(has_kpi_analysis);

-- Enable Row Level Security
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own files
CREATE POLICY "files_select_own" ON public.files
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Admins can view all files
CREATE POLICY "files_select_admin" ON public.files
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Users can insert their own files
CREATE POLICY "files_insert_own" ON public.files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own files
CREATE POLICY "files_update_own" ON public.files
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own files
CREATE POLICY "files_delete_own" ON public.files
  FOR DELETE USING (auth.uid() = user_id);

-- Create kpi_analyses table
CREATE TABLE IF NOT EXISTS kpi_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create trigger to update updated_at on file changes
CREATE TRIGGER files_updated_at
  BEFORE UPDATE ON public.files
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_kpi_analyses_file_id ON kpi_analyses(file_id);
CREATE INDEX IF NOT EXISTS idx_kpi_analyses_user_id ON kpi_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_kpi_analyses_created_at ON kpi_analyses(created_at);

-- Add RLS policies
ALTER TABLE kpi_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own KPI analyses
CREATE POLICY "Users can view their own KPI analyses" ON kpi_analyses
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own KPI analyses
CREATE POLICY "Users can insert their own KPI analyses" ON kpi_analyses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own KPI analyses
CREATE POLICY "Users can update their own KPI analyses" ON kpi_analyses
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own KPI analyses
CREATE POLICY "Users can delete their own KPI analyses" ON kpi_analyses
  FOR DELETE USING (auth.uid() = user_id);

-- Create trigger to update updated_at on kpi_analyses changes
CREATE TRIGGER kpi_analyses_updated_at
  BEFORE UPDATE ON kpi_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Add kpi_analysis_id column to files table now that kpi_analyses exists
ALTER TABLE public.files ADD COLUMN IF NOT EXISTS kpi_analysis_id UUID REFERENCES public.kpi_analyses(id) ON DELETE SET NULL;

-- Add index for the new column
CREATE INDEX IF NOT EXISTS idx_files_kpi_analysis_id ON public.files(kpi_analysis_id);
