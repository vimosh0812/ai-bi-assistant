-- Create kpi_analyses table
CREATE TABLE IF NOT EXISTS kpi_analyses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- Add columns to files table for KPI analysis tracking
ALTER TABLE files ADD COLUMN IF NOT EXISTS has_kpi_analysis BOOLEAN DEFAULT FALSE;
ALTER TABLE files ADD COLUMN IF NOT EXISTS kpi_analysis_id UUID REFERENCES kpi_analyses(id);

-- Add indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_files_has_kpi_analysis ON files(has_kpi_analysis);
CREATE INDEX IF NOT EXISTS idx_files_kpi_analysis_id ON files(kpi_analysis_id);
