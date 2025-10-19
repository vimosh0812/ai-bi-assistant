-- Create kpi_execution_results table to store executed SQL query results
CREATE TABLE IF NOT EXISTS kpi_execution_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  kpi_analysis_id UUID NOT NULL REFERENCES kpi_analyses(id) ON DELETE CASCADE,
  metric_name TEXT NOT NULL,
  metric_index INTEGER NOT NULL,
  sql_query TEXT NOT NULL,
  x_axis_query TEXT,
  y_axis_results JSONB,
  x_axis_results JSONB,
  execution_success BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_kpi_execution_results_kpi_analysis_id ON kpi_execution_results(kpi_analysis_id);
CREATE INDEX IF NOT EXISTS idx_kpi_execution_results_metric_name ON kpi_execution_results(metric_name);
CREATE INDEX IF NOT EXISTS idx_kpi_execution_results_created_at ON kpi_execution_results(created_at);

-- Add RLS policies
ALTER TABLE kpi_execution_results ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see execution results for their own KPI analyses
CREATE POLICY "Users can view their own execution results" ON kpi_execution_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM kpi_analyses 
      WHERE kpi_analyses.id = kpi_execution_results.kpi_analysis_id 
      AND kpi_analyses.user_id = auth.uid()
    )
  );

-- Policy: Users can insert execution results for their own KPI analyses
CREATE POLICY "Users can insert their own execution results" ON kpi_execution_results
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM kpi_analyses 
      WHERE kpi_analyses.id = kpi_execution_results.kpi_analysis_id 
      AND kpi_analyses.user_id = auth.uid()
    )
  );

-- Policy: Users can update execution results for their own KPI analyses
CREATE POLICY "Users can update their own execution results" ON kpi_execution_results
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM kpi_analyses 
      WHERE kpi_analyses.id = kpi_execution_results.kpi_analysis_id 
      AND kpi_analyses.user_id = auth.uid()
    )
  );

-- Policy: Users can delete execution results for their own KPI analyses
CREATE POLICY "Users can delete their own execution results" ON kpi_execution_results
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM kpi_analyses 
      WHERE kpi_analyses.id = kpi_execution_results.kpi_analysis_id 
      AND kpi_analyses.user_id = auth.uid()
    )
  );
