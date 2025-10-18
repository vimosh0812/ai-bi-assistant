import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

export interface CacheEntry {
  id: string;
  file_id: string;
  user_id: string;
  sql_query: string;
  query_hash: string;
  execution_method: string;
  results: any[];
  execution_time_ms: number;
  row_count: number;
  data_hash: string;
  created_at: string;
  updated_at: string;
}

export interface CacheResult {
  found: boolean;
  data?: CacheEntry;
  executionTime?: number;
}

/**
 * Generate a hash for the SQL query to use as cache key
 */
export function generateQueryHash(sqlQuery: string): string {
  return crypto.createHash('sha256').update(sqlQuery.trim().toLowerCase()).digest('hex');
}

/**
 * Generate a hash for the input data to detect changes
 */
export function generateDataHash(data: any[], headers: string[]): string {
  const dataString = JSON.stringify({
    data: data.slice(0, 100), // Only hash first 100 rows for performance
    headers: headers.sort(),
    rowCount: data.length
  });
  return crypto.createHash('sha256').update(dataString).digest('hex');
}

/**
 * Check if cached results exist for the given query and data
 */
export async function getCachedResults(
  fileId: string,
  userId: string,
  sqlQuery: string,
  data: any[],
  headers: string[]
): Promise<CacheResult> {
  try {
    const supabase = await createClient();
    
    const queryHash = generateQueryHash(sqlQuery);
    const dataHash = generateDataHash(data, headers);
    
    const { data: cacheEntry, error } = await supabase
      .from('sql_query_cache')
      .select('*')
      .eq('file_id', fileId)
      .eq('user_id', userId)
      .eq('query_hash', queryHash)
      .eq('data_hash', dataHash)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !cacheEntry) {
      return { found: false };
    }
    
    return {
      found: true,
      data: cacheEntry as CacheEntry,
      executionTime: 0 // Cache hit means instant response
    };
  } catch (error) {
    console.error('Error checking cache:', error);
    return { found: false };
  }
}

/**
 * Store SQL execution results in cache
 */
export async function storeCachedResults(
  fileId: string,
  userId: string,
  sqlQuery: string,
  data: any[],
  headers: string[],
  results: any[],
  executionMethod: string,
  executionTimeMs: number
): Promise<void> {
  try {
    const supabase = await createClient();
    
    const queryHash = generateQueryHash(sqlQuery);
    const dataHash = generateDataHash(data, headers);
    
    const { error } = await supabase
      .from('sql_query_cache')
      .insert({
        file_id: fileId,
        user_id: userId,
        sql_query: sqlQuery,
        query_hash: queryHash,
        execution_method: executionMethod,
        results: results,
        execution_time_ms: executionTimeMs,
        row_count: results.length,
        data_hash: dataHash
      });
    
    if (error) {
      console.error('Error storing cache:', error);
    }
  } catch (error) {
    console.error('Error storing cache:', error);
  }
}

/**
 * Invalidate cache for a specific file
 */
export async function invalidateFileCache(fileId: string, userId: string): Promise<void> {
  try {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from('sql_query_cache')
      .delete()
      .eq('file_id', fileId)
      .eq('user_id', userId);
    
    if (error) {
      console.error('Error invalidating cache:', error);
    }
  } catch (error) {
    console.error('Error invalidating cache:', error);
  }
}

/**
 * Clean up old cache entries (older than 30 days)
 */
export async function cleanupOldCache(): Promise<number> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase.rpc('cleanup_old_sql_cache');
    
    if (error) {
      console.error('Error cleaning up cache:', error);
      return 0;
    }
    
    return data || 0;
  } catch (error) {
    console.error('Error cleaning up cache:', error);
    return 0;
  }
}

/**
 * Get cache statistics for a user
 */
export async function getCacheStats(userId: string): Promise<{
  totalEntries: number;
  totalSize: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}> {
  try {
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('sql_query_cache')
      .select('created_at, row_count')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    
    if (error || !data) {
      return { totalEntries: 0, totalSize: 0, oldestEntry: null, newestEntry: null };
    }
    
    const totalEntries = data.length;
    const totalSize = data.reduce((sum: number, entry: any) => sum + entry.row_count, 0);
    const oldestEntry = data.length > 0 ? data[0].created_at : null;
    const newestEntry = data.length > 0 ? data[data.length - 1].created_at : null;
    
    return { totalEntries, totalSize, oldestEntry, newestEntry };
  } catch (error) {
    console.error('Error getting cache stats:', error);
    return { totalEntries: 0, totalSize: 0, oldestEntry: null, newestEntry: null };
  }
}
