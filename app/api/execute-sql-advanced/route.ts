import { NextRequest, NextResponse } from "next/server";
import Database from 'better-sqlite3';

export async function POST(request: NextRequest) {
  let db: Database.Database | null = null;
  
  try {
    const { sqlQuery, data, headers } = await request.json();
    
    if (!sqlQuery || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: "Missing sqlQuery, data, or headers" }, { status: 400 });
    }

    console.log("Executing advanced SQL query:", sqlQuery);
    console.log("Processing", data.length, "rows of data");

    // Create in-memory SQLite database
    db = new Database(':memory:');
    
    // Enable JSON1 extension for JSON functions
    db.exec('PRAGMA enable_json1;');
    
    // Create table from CSV data
    const tableName = 'csv_data';
    const createTableResult = createTableFromData(db, tableName, data, headers);
    
    if (!createTableResult.success) {
      return NextResponse.json({ 
        error: "Failed to create table from CSV data", 
        details: createTableResult.error 
      }, { status: 400 });
    }

    // Execute the SQL query
    const results = executeSQLQuery(db, sqlQuery, tableName);
    
    console.log("SQL execution completed successfully");
    console.log("Results count:", results.length);

    return NextResponse.json({ 
      success: true, 
      results,
      query: sqlQuery,
      executionMethod: 'sqlite'
    });

  } catch (error) {
    console.error("Advanced SQL execution error:", error);
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

function createTableFromData(db: Database.Database, tableName: string, data: any[], headers: string[]): { success: boolean; error?: string } {
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

function executeSQLQuery(db: Database.Database, sqlQuery: string, tableName: string): any[] {
  try {
    // Replace any table references with our actual table name
    const processedQuery = sqlQuery.replace(/\bFROM\s+(\w+)/gi, `FROM "${tableName}"`);
    
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
