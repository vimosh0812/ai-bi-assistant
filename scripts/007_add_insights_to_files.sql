-- Add insights column to files table for storing AI-generated insights documents
ALTER TABLE files ADD COLUMN IF NOT EXISTS insights TEXT;

-- Add index for insights column (optional, for full-text search if needed)
-- CREATE INDEX IF NOT EXISTS idx_files_insights ON files USING gin(to_tsvector('english', insights));

