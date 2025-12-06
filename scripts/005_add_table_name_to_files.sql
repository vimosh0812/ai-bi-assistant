-- Add table_name column to files table for temporary table tracking
ALTER TABLE files ADD COLUMN IF NOT EXISTS table_name TEXT;

-- Add index for table_name column
CREATE INDEX IF NOT EXISTS idx_files_table_name ON files(table_name);

-- Add constraint to ensure table_name follows our naming pattern if provided
ALTER TABLE files ADD CONSTRAINT check_table_name_pattern 
CHECK (table_name IS NULL OR table_name ~ '^temp_data_[a-f0-9_]+_[a-f0-9_]+_[0-9]+$');
