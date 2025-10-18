import { NextRequest, NextResponse } from "next/server";
import Database from 'better-sqlite3';
import { getCachedResults, storeCachedResults } from '@/lib/sql-cache-utils';

export async function POST(request: NextRequest) {
  try {
    const { sqlQuery, data, headers, method = 'auto', fileId, userId, useCache = true } = await request.json();
    
    if (!sqlQuery || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: "Missing sqlQuery, data, or headers" }, { status: 400 });
    }

    console.log("Executing unified SQL query:", sqlQuery);
    console.log("Processing", data.length, "rows of data");

    // Check cache first if fileId and userId are provided and caching is enabled
    if (useCache && fileId && userId) {
      console.log("Checking cache for query...");
      const cacheResult = await getCachedResults(fileId, userId, sqlQuery, data, headers);
      
      if (cacheResult.found && cacheResult.data) {
        console.log("Cache hit! Returning cached results");
        return NextResponse.json({ 
          success: true, 
          results: cacheResult.data.results,
          query: sqlQuery,
          executionMethod: cacheResult.data.execution_method,
          executionTime: "0ms (cached)",
          rowCount: cacheResult.data.row_count,
          cached: true
        });
      }
      console.log("Cache miss, executing query...");
    }

    // Determine the best execution method
    let executionMethod = determineExecutionMethod(sqlQuery, data.length, method);
    console.log("Selected execution method:", executionMethod);

    let results: any[] = [];
    let executionTime = 0;
    const startTime = Date.now();

    try {
      switch (executionMethod) {
        case 'sqlite':
          results = await executeWithSQLite(sqlQuery, data, headers);
          break;
        case 'simple':
          results = await executeWithSimple(sqlQuery, data, headers);
          break;
        default:
          throw new Error(`Unknown execution method: ${executionMethod}`);
      }
      
      executionTime = Date.now() - startTime;
      
      // Store results in cache if fileId and userId are provided
      if (useCache && fileId && userId) {
        console.log("Storing results in cache...");
        await storeCachedResults(
          fileId, 
          userId, 
          sqlQuery, 
          data, 
          headers, 
          results, 
          executionMethod, 
          executionTime
        );
      }
      
      return NextResponse.json({ 
        success: true, 
        results,
        query: sqlQuery,
        executionMethod,
        executionTime: `${executionTime}ms`,
        rowCount: results.length,
        cached: false
      });

    } catch (error) {
      console.error(`Error with ${executionMethod}:`, error);
      
      // Fallback to simple method if advanced methods fail
      if (executionMethod !== 'simple') {
        console.log("Falling back to simple execution method");
        try {
          results = await executeWithSimple(sqlQuery, data, headers);
          executionTime = Date.now() - startTime;
          
          // Store results in cache if fileId and userId are provided
          if (useCache && fileId && userId) {
            console.log("Storing fallback results in cache...");
            await storeCachedResults(
              fileId, 
              userId, 
              sqlQuery, 
              data, 
              headers, 
              results, 
              'simple (fallback)', 
              executionTime
            );
          }
          
          return NextResponse.json({ 
            success: true, 
            results,
            query: sqlQuery,
            executionMethod: 'simple (fallback)',
            executionTime: `${executionTime}ms`,
            rowCount: results.length,
            warning: 'Advanced method failed, used simple fallback',
            cached: false
          });
        } catch (fallbackError) {
          console.error("Fallback execution also failed:", fallbackError);
          throw error; // Throw original error
        }
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error("Unified SQL execution error:", error);
    let errMsg = "Failed to execute SQL query";
    let details = undefined;
    if (error instanceof Error) {
      details = error.message;
    } else if (typeof error === "string") {
      details = error;
    }
    return NextResponse.json(
      { error: errMsg, ...(details && { details }) },
      { status: 500 }
    );
  }
}

function determineExecutionMethod(sqlQuery: string, dataLength: number, method: string): string {
  // If method is explicitly specified, use it
  if (method !== 'auto') {
    return method;
  }

  const upperQuery = sqlQuery.toUpperCase();
  
  // For very large datasets, prefer SQLite
  if (dataLength > 10000) {
    return 'sqlite';
  }
  
  // For complex analytical queries, prefer SQLite
  if (upperQuery.includes('WINDOW') || 
      upperQuery.includes('PARTITION BY') || 
      upperQuery.includes('RANK()') ||
      upperQuery.includes('ROW_NUMBER()') ||
      upperQuery.includes('LAG(') ||
      upperQuery.includes('LEAD(') ||
      upperQuery.includes('CASE WHEN') ||
      upperQuery.includes('UNION') ||
      upperQuery.includes('CTE') ||
      upperQuery.includes('WITH ')) {
    return 'sqlite';
  }
  
  // For queries with multiple JOINs, prefer SQLite
  const joinCount = (upperQuery.match(/\bJOIN\b/g) || []).length;
  if (joinCount > 2) {
    return 'sqlite';
  }
  
  // For simple queries on small datasets, use simple method
  if (dataLength < 1000 && 
      (upperQuery.includes('SELECT') && !upperQuery.includes('GROUP BY') && !upperQuery.includes('ORDER BY'))) {
    return 'simple';
  }
  
  // Default to SQLite for balanced performance
  return 'sqlite';
}


async function executeWithSQLite(sqlQuery: string, data: any[], headers: string[]): Promise<any[]> {
  let db: Database.Database | null = null;
  
  try {
    // Create in-memory SQLite database
    db = new Database(':memory:');
    
    // Enable JSON1 extension for JSON functions
    db.exec('PRAGMA enable_json1;');
    
    // Create table from CSV data
    const tableName = 'csv_data';
    const createTableResult = createTableFromDataSQLite(db, tableName, data, headers);
    
    if (!createTableResult.success) {
      throw new Error(createTableResult.error || "Failed to create table from CSV data");
    }

    // Execute the SQL query
    const results = executeSQLQuerySQLite(db, sqlQuery, tableName);
    return results;

  } finally {
    // Clean up database connection
    if (db) {
      try {
        db.close();
      } catch (closeError) {
        console.error("Error closing database:", closeError);
      }
    }
  }
}

async function executeWithSimple(sqlQuery: string, data: any[], headers: string[]): Promise<any[]> {
  // Import and use the simple SQL execution logic
  const { executeSimpleSQL } = await import('@/lib/sql-utils');
  return executeSimpleSQL(sqlQuery, data, headers);
}


// SQLite helper functions
function createTableFromDataSQLite(db: Database.Database, tableName: string, data: any[], headers: string[]): { success: boolean; error?: string } {
  try {
    if (data.length === 0) {
      return { success: false, error: "No data provided" };
    }

    // Get column names and types from first row
    const firstRow = data[0];
    const columns = Object.keys(firstRow);
    
    // Determine column types
    const columnDefs = columns.map(col => {
      const sampleValue = firstRow[col];
      let sqlType = 'TEXT'; // Default to TEXT
      
      if (sampleValue !== null && sampleValue !== undefined) {
        if (typeof sampleValue === 'number') {
          if (Number.isInteger(sampleValue)) {
            sqlType = 'INTEGER';
          } else {
            sqlType = 'REAL';
          }
        } else if (typeof sampleValue === 'boolean') {
          sqlType = 'INTEGER'; // SQLite doesn't have boolean, use INTEGER
        } else if (sampleValue instanceof Date || (typeof sampleValue === 'string' && !isNaN(Date.parse(sampleValue)))) {
          sqlType = 'TEXT'; // Store dates as TEXT
        }
      }
      
      // Sanitize column name for SQL
      const sanitizedCol = col.replace(/[^a-zA-Z0-9_]/g, '_');
      return `"${sanitizedCol}" ${sqlType}`;
    });

    // Create table
    const createTableSQL = `CREATE TABLE "${tableName}" (${columnDefs.join(', ')})`;
    console.log("Creating table with SQL:", createTableSQL);
    db.exec(createTableSQL);

    // Prepare insert statement
    const placeholders = columns.map(() => '?').join(', ');
    const insertSQL = `INSERT INTO "${tableName}" (${columns.map(col => `"${col.replace(/[^a-zA-Z0-9_]/g, '_')}"`).join(', ')}) VALUES (${placeholders})`;
    const insertStmt = db.prepare(insertSQL);

    // Insert data in batches for better performance
    const batchSize = 1000;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const insertMany = db.transaction((rows: any[]) => {
        for (const row of rows) {
          const values = columns.map(col => {
            const value = row[col];
            // Convert boolean to integer for SQLite
            if (typeof value === 'boolean') {
              return value ? 1 : 0;
            }
            return value;
          });
          insertStmt.run(...values);
        }
      });
      insertMany(batch);
    }

    console.log(`Successfully created table with ${data.length} rows`);
    return { success: true };

  } catch (error) {
    console.error("Error creating table from CSV data:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
}

function executeSQLQuerySQLite(db: Database.Database, sqlQuery: string, tableName: string): any[] {
  try {
    // Preprocess the SQL query to fix common issues
    const processedQuery = preprocessSQLQuery(sqlQuery, tableName);
    
    console.log("Executing processed query:", processedQuery);
    
    // Execute the query
    const stmt = db.prepare(processedQuery);
    const results = stmt.all();
    
    // Convert results to plain objects
    return results.map((row: any) => {
      const obj: any = {};
      for (const [key, value] of Object.entries(row)) {
        obj[key] = value;
      }
      return obj;
    });

  } catch (error) {
    console.error("Error executing SQL query:", error);
    throw new Error(`SQL execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function preprocessSQLQuery(sqlQuery: string, tableName: string): string {
  let processedQuery = sqlQuery;
  
  // Replace table references with our actual table name
  processedQuery = processedQuery.replace(/\bFROM\s+(\w+)/gi, `FROM "${tableName}"`);
  
  // Replace MySQL/PostgreSQL date functions with SQLite equivalents FIRST
  // YEAR() function replacement
  processedQuery = processedQuery.replace(/YEAR\s*\(\s*([^)]+)\s*\)/gi, (match, field) => {
    return `CAST(SUBSTR(${field}, 1, 4) AS INTEGER)`;
  });
  
  // MONTH() function replacement
  processedQuery = processedQuery.replace(/MONTH\s*\(\s*([^)]+)\s*\)/gi, (match, field) => {
    return `CAST(SUBSTR(${field}, 6, 2) AS INTEGER)`;
  });
  
  // DAY() function replacement
  processedQuery = processedQuery.replace(/DAY\s*\(\s*([^)]+)\s*\)/gi, (match, field) => {
    return `CAST(SUBSTR(${field}, 9, 2) AS INTEGER)`;
  });
  
  // QUARTER() function replacement
  processedQuery = processedQuery.replace(/QUARTER\s*\(\s*([^)]+)\s*\)/gi, (match, field) => {
    return `CAST((CAST(SUBSTR(${field}, 6, 2) AS INTEGER) - 1) / 3 + 1 AS INTEGER)`;
  });
  
  // Fix specific column names with spaces - be more targeted
  // Handle "Units Sold" -> "Units_Sold" pattern
  processedQuery = processedQuery.replace(/\bUnits\s+Sold\b/gi, '"Units_Sold"');
  
  // Handle other common column name patterns with spaces
  processedQuery = processedQuery.replace(/\bProduct\s+Name\b/gi, '"Product_Name"');
  processedQuery = processedQuery.replace(/\bUnits\s+Returned\b/gi, '"Units_Returned"');
  processedQuery = processedQuery.replace(/\bDate\s+year\b/gi, '"Date_year"');
  processedQuery = processedQuery.replace(/\bDate\s+month\b/gi, '"Date_month"');
  processedQuery = processedQuery.replace(/\bDate\s+day\b/gi, '"Date_day"');
  
  return processedQuery;
}
