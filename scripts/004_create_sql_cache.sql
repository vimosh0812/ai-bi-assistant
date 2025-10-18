-- Create SQL query cache table
CREATE TABLE IF NOT EXISTS sql_query_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sql_query TEXT NOT NULL,
  query_hash TEXT NOT NULL, -- SHA256 hash of the query for fast lookup
  execution_method TEXT NOT NULL, -- 'simple', 'sqlite', 'duckdb', 'unified'
  results JSONB NOT NULL,
  execution_time_ms INTEGER NOT NULL,
  row_count INTEGER NOT NULL,
  data_hash TEXT NOT NULL, -- Hash of the input data to detect changes
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sql_cache_file_id ON sql_query_cache(file_id);
CREATE INDEX IF NOT EXISTS idx_sql_cache_user_id ON sql_query_cache(user_id);
CREATE INDEX IF NOT EXISTS idx_sql_cache_query_hash ON sql_query_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_sql_cache_data_hash ON sql_query_cache(data_hash);
CREATE INDEX IF NOT EXISTS idx_sql_cache_created_at ON sql_query_cache(created_at);

-- Composite index for fast cache lookups
CREATE INDEX IF NOT EXISTS idx_sql_cache_lookup ON sql_query_cache(file_id, query_hash, data_hash);

-- Add RLS policies
ALTER TABLE sql_query_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own cached queries
CREATE POLICY "Users can view their own SQL cache" ON sql_query_cache
  FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert their own SQL cache entries
CREATE POLICY "Users can insert their own SQL cache" ON sql_query_cache
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own SQL cache entries
CREATE POLICY "Users can update their own SQL cache" ON sql_query_cache
  FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Users can delete their own SQL cache entries
CREATE POLICY "Users can delete their own SQL cache" ON sql_query_cache
  FOR DELETE USING (auth.uid() = user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_sql_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on cache changes
CREATE TRIGGER sql_cache_updated_at
  BEFORE UPDATE ON sql_query_cache
  FOR EACH ROW
  EXECUTE FUNCTION update_sql_cache_updated_at();

-- Function to clean up old cache entries (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_sql_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM sql_query_cache 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add cache invalidation trigger when file data changes
CREATE OR REPLACE FUNCTION invalidate_sql_cache_on_file_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete all cache entries for this file when it's updated
  DELETE FROM sql_query_cache WHERE file_id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to invalidate cache when file is updated
CREATE TRIGGER invalidate_cache_on_file_update
  AFTER UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION invalidate_sql_cache_on_file_update();
