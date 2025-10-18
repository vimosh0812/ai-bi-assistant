-- Clean up SQL cache related database objects
-- This script removes triggers and functions that reference the deleted sql_query_cache table

-- Drop triggers first
DROP TRIGGER IF EXISTS sql_cache_updated_at ON sql_query_cache;
DROP TRIGGER IF EXISTS trigger_delete_old_sql_cache ON sql_query_cache;
DROP TRIGGER IF EXISTS trigger_invalidate_file_sql_cache ON files;

-- Drop functions
DROP FUNCTION IF EXISTS update_sql_cache_updated_at();
DROP FUNCTION IF EXISTS cleanup_old_sql_cache();
DROP FUNCTION IF EXISTS invalidate_sql_cache_on_file_update();

-- Note: The sql_query_cache table should already be dropped
-- If it still exists, uncomment the line below:
-- DROP TABLE IF EXISTS sql_query_cache CASCADE;
