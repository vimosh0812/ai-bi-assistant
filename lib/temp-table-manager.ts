import { createClient } from "@/lib/supabase/server";
import { filterIdColumns, filterIdColumnsFromData } from "@/lib/utils";

export interface TempTableInfo {
  tableName: string;
  fileId: string;
  userId: string;
  createdAt: Date;
}

export class TempTableManager {
  private supabase: any;

  constructor() {
    this.supabase = null; // Will be initialized when needed
  }

  private async getSupabase() {
    if (!this.supabase) {
      this.supabase = await createClient();
    }
    return this.supabase;
  }

  /**
   * Generate a unique table name for temporary tables
   * Format: temp_data_{userId}_{fileId}_{timestamp}
   */
  generateTableName(userId: string, fileId: string): string {
    const timestamp = Date.now();
    const sanitizedUserId = userId.replace(/-/g, '_');
    const sanitizedFileId = fileId.replace(/-/g, '_');
    return `temp_data_${sanitizedUserId}_${sanitizedFileId}_${timestamp}`;
  }

  /**
   * Create a temporary table from CSV data
   */
  async createTempTable(
    data: any[],
    headers: string[],
    fileId: string,
    userId: string
  ): Promise<{ success: boolean; tableName?: string; error?: string }> {
    try {
      const supabase = await this.getSupabase();
      const tableName = this.generateTableName(userId, fileId);

      if (!data || data.length === 0) {
        return { success: false, error: "No data provided" };
      }

      if (!headers || headers.length === 0) {
        return { success: false, error: "No headers provided" };
      }

      // Filter out 'id' column if it exists (conflicts with SERIAL PRIMARY KEY)
      // Use utility function for consistent filtering across the codebase
      const { filteredHeaders, idColumnsRemoved } = filterIdColumns(headers);
      
      if (filteredHeaders.length === 0) {
        return { success: false, error: "No valid headers after filtering (all headers were 'id')" };
      }
      
      // Filter data to match filtered headers
      const filteredData = filterIdColumnsFromData(data, headers, filteredHeaders);

      // Create table with dynamic columns based on filtered headers
      const sanitizedHeaders = filteredHeaders.map(header => this.sanitizeColumnName(header));
      
      // Check for duplicate sanitized headers
      const uniqueSanitizedHeaders = [...new Set(sanitizedHeaders)];
      if (uniqueSanitizedHeaders.length !== sanitizedHeaders.length) {
        console.warn(`⚠️ Duplicate sanitized headers detected, using unique set`);
        console.warn(`   Original: ${sanitizedHeaders.length}, Unique: ${uniqueSanitizedHeaders.length}`);
      }
      
      const columnDefinitions = uniqueSanitizedHeaders.map(header => `"${header}" TEXT`).join(', ');

      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS "${tableName}" (
          id SERIAL PRIMARY KEY,
          ${columnDefinitions}
        )
      `;

      console.log(`📊 Creating temporary table: ${tableName}`);
      console.log(`   Original headers (${headers.length}):`, headers.slice(0, 5));
      console.log(`   Filtered headers (${filteredHeaders.length}):`, filteredHeaders.slice(0, 5));
      console.log(`   Sanitized headers (${uniqueSanitizedHeaders.length}):`, uniqueSanitizedHeaders.slice(0, 5));
      console.log(`   Data rows: ${data.length}`);
      console.log(`   Table structure: ${createTableQuery}`);

      // Execute table creation using the custom function
      const { data: createResult, error: createError } = await supabase.rpc('create_temp_table', {
        table_name: tableName,
        column_definitions: columnDefinitions
      });

      if (createError) {
        console.error("❌ Error creating table:", createError);
        return { success: false, error: `Failed to create table: ${createError.message}` };
      }

      // Check if the RPC function returned success
      // The RPC function returns TRUE on success, FALSE on failure
      if (createResult === false || createResult === null || createResult === undefined) {
        console.error("❌ Table creation RPC returned false/null - table may not have been created");
        console.error(`   RPC result: ${createResult}`);
        return { success: false, error: `Table creation RPC returned ${createResult}` };
      }

      console.log(`✅ Table creation RPC succeeded (returned: ${createResult})`);

      // Verify the table exists by checking if it's in the information_schema
      const { data: tableExists, error: checkError } = await supabase.rpc('exec_sql_with_result', {
        query: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        `
      });

      if (checkError) {
        console.warn("⚠️ Could not verify table existence:", checkError);
      } else if (!tableExists || tableExists.length === 0 || !tableExists[0]?.table_name) {
        console.error(`❌ Table ${tableName} was not found in information_schema after creation`);
        return { success: false, error: `Table was not created - verification failed` };
      } else {
        console.log(`✅ Verified: Table ${tableName} exists in database`);
      }

      // Verify table structure by checking columns
      const { data: columnData, error: columnError } = await supabase.rpc('exec_sql_with_result', {
        query: `
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
          ORDER BY ordinal_position
        `
      });

      if (columnError) {
        console.warn("⚠️ Could not verify table structure:", columnError);
      } else {
        console.log(`✅ Table structure verified: ${columnData?.length || 0} columns found`);
        console.log(`   Columns:`, columnData?.slice(0, 10).map((c: any) => `${c.column_name} (${c.data_type})`).join(', '));
      }

      // Insert data in batches to avoid memory issues
      const batchSize = 1000;
      const batches = [];
      
      for (let i = 0; i < filteredData.length; i += batchSize) {
        batches.push(filteredData.slice(i, i + batchSize));
      }

      console.log(`Inserting ${filteredData.length} rows in ${batches.length} batches`);

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        // Transform the batch data to use sanitized column names
        // Only include filtered headers (excluding 'id' column)
        const transformedBatch = batch.map(row => {
          const transformedRow: any = {};
          filteredHeaders.forEach(header => {
            const sanitizedHeader = this.sanitizeColumnName(header);
            // Only add if it's in our unique sanitized headers list
            if (uniqueSanitizedHeaders.includes(sanitizedHeader)) {
              transformedRow[sanitizedHeader] = row[header];
            }
          });
          return transformedRow;
        });
        
        console.log(`Processing batch ${i + 1}/${batches.length}:`, {
          batchSize: batch.length,
          originalHeaders: headers.slice(0, 5),
          filteredHeaders: filteredHeaders.slice(0, 5),
          sanitizedHeaders: uniqueSanitizedHeaders.slice(0, 5),
          sampleRow: batch[0] ? Object.keys(batch[0]).slice(0, 5) : 'No data',
          sampleData: batch[0] ? Object.values(batch[0]).slice(0, 3) : 'No data',
          transformedSample: transformedBatch[0] ? Object.keys(transformedBatch[0]).slice(0, 5) : 'No data'
        });
        
        // Use a different approach - insert data using a custom function
        // Pass the transformed batch with sanitized column names
        const { error: insertError } = await supabase.rpc('insert_temp_data_json', {
          table_name: tableName,
          data_json: transformedBatch
        });

        if (insertError) {
          console.error(`Error inserting batch ${i + 1}:`, insertError);
          console.error(`Batch data sample:`, transformedBatch.slice(0, 2));
          console.error(`Table name:`, tableName);
          // Clean up the table if insertion fails
          await this.dropTempTable(tableName);
          return { success: false, error: `Failed to insert data: ${insertError.message}` };
        }

        console.log(`Inserted batch ${i + 1}/${batches.length} (${batch.length} rows) successfully`);
      }

      // Verify data was inserted by counting rows
      console.log(`🔍 Verifying data insertion for table: ${tableName}`);
      const { data: countData, error: countError } = await supabase.rpc('exec_sql_with_result', {
        query: `SELECT COUNT(*) as row_count FROM "${tableName}"`
      });

      if (countError) {
        console.error("❌ Could not verify row count:", countError);
        return { success: false, error: `Failed to verify data insertion: ${countError.message}` };
      } else {
        const actualRowCount = countData?.[0]?.row_count || 0;
        const expectedRowCount = data.length;
        console.log(`📊 Row count verification:`);
        console.log(`   Expected: ${expectedRowCount} rows`);
        console.log(`   Actual: ${actualRowCount} rows`);
        
        if (actualRowCount !== expectedRowCount) {
          console.warn(`⚠️ Row count mismatch! Expected ${expectedRowCount} but found ${actualRowCount}`);
          // Don't fail here, but log the warning
        } else {
          console.log(`✅ Row count matches expected value`);
        }
      }

      // Final verification: Try to select a sample row
      const { data: sampleData, error: sampleError } = await supabase.rpc('exec_sql_with_result', {
        query: `SELECT * FROM "${tableName}" LIMIT 1`
      });

      if (sampleError) {
        console.warn("⚠️ Could not fetch sample row:", sampleError);
      } else {
        console.log(`✅ Sample row verification: Successfully retrieved sample data`);
        if (sampleData && sampleData.length > 0) {
          console.log(`   Sample row keys:`, Object.keys(sampleData[0]).slice(0, 5).join(', '));
        }
      }

      console.log(`🎉 Successfully created and verified temporary table: ${tableName}`);
      console.log(`   Total rows inserted: ${data.length}`);
      console.log(`   Table ready for SQL queries`);

      return { success: true, tableName };

    } catch (error) {
      console.error("Error creating temporary table:", error);
      return { 
        success: false, 
        error: `Failed to create temporary table: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Execute SQL query on temporary table
   */
  async executeQueryOnTempTable(
    tableName: string,
    sqlQuery: string,
    originalHeaders?: string[]
  ): Promise<{ success: boolean; results?: any[]; error?: string }> {
    try {
      const supabase = await this.getSupabase();

      console.log(`Executing query on table ${tableName}`);
      console.log(`Original query:`, sqlQuery);
      console.log(`Original headers:`, originalHeaders);
      console.log(`Headers type:`, typeof originalHeaders, Array.isArray(originalHeaders));

      // Replace table references in the query with our temporary table name and map column names
      const processedQuery = this.preprocessSQLQuery(sqlQuery, tableName, originalHeaders);

      console.log(`Processed query:`, processedQuery);

      const { data, error } = await supabase.rpc('exec_sql_with_result', {
        query: processedQuery
      });

      if (error) {
        console.error("Error executing query:", error);
        return { success: false, error: `Query execution failed: ${error.message}` };
      }

      console.log(`Query executed successfully, returned ${data?.length || 0} rows`);

      return { success: true, results: data || [] };

    } catch (error) {
      console.error("Error executing query on temporary table:", error);
      return { 
        success: false, 
        error: `Query execution failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Drop temporary table
   */
  async dropTempTable(tableName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = await this.getSupabase();

      const dropQuery = `DROP TABLE IF EXISTS "${tableName}"`;
      
      console.log(`Dropping temporary table: ${tableName}`);

      const { error } = await supabase.rpc('drop_temp_table', {
        table_name: tableName
      });

      if (error) {
        console.error("Error dropping table:", error);
        return { success: false, error: `Failed to drop table: ${error.message}` };
      }

      console.log(`Successfully dropped temporary table: ${tableName}`);
      return { success: true };

    } catch (error) {
      console.error("Error dropping temporary table:", error);
      return { 
        success: false, 
        error: `Failed to drop table: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Clean up the temp table manager instance
   */
  cleanup(): void {
    console.log("🧹 Cleaning up TempTableManager instance");
    this.supabase = null;
  }

  /**
   * Clean up old temporary tables (older than 24 hours)
   */
  async cleanupOldTempTables(): Promise<{ success: boolean; cleanedCount?: number; error?: string }> {
    try {
      const supabase = await this.getSupabase();

      // Find tables that match our naming pattern and are older than 24 hours
      const cleanupQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_name LIKE 'temp_data_%' 
        AND table_name ~ 'temp_data_[a-f0-9_]+_[a-f0-9_]+_[0-9]+$'
        AND table_name NOT IN (
          SELECT DISTINCT table_name 
          FROM information_schema.tables 
          WHERE table_name LIKE 'temp_data_%'
          AND table_name ~ 'temp_data_[a-f0-9_]+_[a-f0-9_]+_[0-9]+$'
          AND table_name IN (
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name LIKE 'temp_data_%'
          )
        )
      `;

      // For now, we'll implement a simple cleanup based on table name timestamp
      // In a production environment, you might want to track table creation times
      const { data: tables, error } = await supabase.rpc('exec_sql', {
        query: `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_name LIKE 'temp_data_%'
          AND table_name ~ 'temp_data_[a-f0-9_]+_[a-f0-9_]+_[0-9]+$'
        `
      });

      if (error) {
        console.error("Error finding temporary tables:", error);
        return { success: false, error: `Failed to find temporary tables: ${error.message}` };
      }

      let cleanedCount = 0;
      const now = Date.now();
      const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

      for (const table of tables || []) {
        const tableName = table.table_name;
        const timestampMatch = tableName.match(/_(\d+)$/);
        
        if (timestampMatch) {
          const tableTimestamp = parseInt(timestampMatch[1]);
          if (tableTimestamp < twentyFourHoursAgo) {
            const dropResult = await this.dropTempTable(tableName);
            if (dropResult.success) {
              cleanedCount++;
            }
          }
        }
      }

      console.log(`Cleaned up ${cleanedCount} old temporary tables`);
      return { success: true, cleanedCount };

    } catch (error) {
      console.error("Error cleaning up temporary tables:", error);
      return { 
        success: false, 
        error: `Cleanup failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * Sanitize column names for SQL safety
   * This must match the sanitization used in generate-kpi-analysis/route.ts
   */
  private sanitizeColumnName(columnName: string): string {
    return columnName
      .toLowerCase()
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/[^a-z0-9_]/g, '') // Remove all non-alphanumeric chars except underscore
      .replace(/_+/g, '_') // Collapse multiple underscores into one
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .replace(/^[0-9]/, 'col_$&'); // Prefix numeric columns with 'col_'
  }

  /**
   * Build INSERT query for batch data
   */
  private buildInsertQuery(tableName: string, headers: string[], data: any[]): string {
    const sanitizedHeaders = headers.map(h => `"${this.sanitizeColumnName(h)}"`);
    const columns = sanitizedHeaders.join(', ');
    
    const values = data.map(row => {
      const rowValues = headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) {
          return 'NULL';
        }
        // Escape single quotes and wrap in quotes
        const escapedValue = String(value).replace(/'/g, "''");
        return `'${escapedValue}'`;
      }).join(', ');
      return `(${rowValues})`;
    }).join(', ');

    return `INSERT INTO "${tableName}" (${columns}) VALUES ${values}`;
  }

  /**
   * Build INSERT query for a single row
   */
  private buildSingleRowInsertQuery(tableName: string, headers: string[], row: any): string {
    const sanitizedHeaders = headers.map(h => `"${this.sanitizeColumnName(h)}"`);
    const columns = sanitizedHeaders.join(', ');
    
    const rowValues = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return 'NULL';
      }
      // Escape single quotes and wrap in quotes
      const escapedValue = String(value).replace(/'/g, "''");
      return `'${escapedValue}'`;
    }).join(', ');

    return `INSERT INTO "${tableName}" (${columns}) VALUES (${rowValues})`;
  }

  /**
   * Preprocess SQL query to use correct table name and sanitized column names
   */
  private preprocessSQLQuery(sqlQuery: string, tableName: string, originalHeaders?: string[]): string {
    let processedQuery = sqlQuery;

    // Replace common table references with our temporary table name
    processedQuery = processedQuery.replace(/\bFROM\s+(\w+)/gi, `FROM "${tableName}"`);
    processedQuery = processedQuery.replace(/\bJOIN\s+(\w+)/gi, `JOIN "${tableName}"`);
    processedQuery = processedQuery.replace(/\bUPDATE\s+(\w+)/gi, `UPDATE "${tableName}"`);
    processedQuery = processedQuery.replace(/\bDELETE\s+FROM\s+(\w+)/gi, `DELETE FROM "${tableName}"`);

    // Handle table references in WHERE clauses
    processedQuery = processedQuery.replace(/\b(\w+)\.(\w+)/gi, (match, table, column) => {
      if (table.toLowerCase() === 'data' || table.toLowerCase() === 'csv_data') {
        return `"${tableName}".${column}`;
      }
      return match;
    });

    // If we have original headers, map them to sanitized column names
    if (originalHeaders && Array.isArray(originalHeaders)) {
      originalHeaders.forEach(originalHeader => {
        const sanitizedHeader = this.sanitizeColumnName(originalHeader);
        // Replace column references in the query
        const columnRegex = new RegExp(`\\b${originalHeader}\\b`, 'gi');
        processedQuery = processedQuery.replace(columnRegex, `"${sanitizedHeader}"`);
      });
    }

    return processedQuery;
  }
}

// Export singleton instance
export const tempTableManager = new TempTableManager();
