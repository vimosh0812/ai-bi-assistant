// SQL utility functions for CSV data processing
import Database from 'better-sqlite3';

// Advanced SQL-like query executor for CSV data
export function executeSimpleSQL(query: string, data: any[], headers: string[]): any[] {
  const upperQuery = query.toUpperCase().trim();
  
  try {
    // Preprocess the query to fix common issues
    const processedQuery = preprocessSimpleSQLQuery(query);
    
    // Handle SELECT queries with GROUP BY
    if (upperQuery.includes('SELECT') && upperQuery.includes('GROUP BY')) {
      return executeGroupByQuery(processedQuery, data, headers);
    }
    
    // Handle SELECT queries
    if (upperQuery.startsWith('SELECT')) {
      return executeSelectQuery(processedQuery, data, headers);
    }
    
    // Handle COUNT queries
    if (upperQuery.startsWith('COUNT')) {
      return executeCountQuery(processedQuery, data, headers);
    }
    
    // Handle SUM queries
    if (upperQuery.startsWith('SUM')) {
      return executeSumQuery(processedQuery, data, headers);
    }
    
    // Handle AVG queries
    if (upperQuery.startsWith('AVG')) {
      return executeAvgQuery(processedQuery, data, headers);
    }
    
    // Default: return first 10 rows
    return data.slice(0, 10);
  } catch (error) {
    console.error("SQL execution error:", error);
    return [{ error: "Failed to execute query", query }];
  }
}

function preprocessSimpleSQLQuery(query: string): string {
  let processedQuery = query;
  
  // Fix column names with spaces by replacing with underscores
  // This handles cases like "Units Sold" -> "Units_Sold"
  processedQuery = processedQuery.replace(/\b([A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*)\b/g, (match) => {
    // Only replace if it's not already quoted and contains a space
    if (!match.startsWith('"') && !match.endsWith('"') && match.includes(' ')) {
      return match.replace(/\s+/g, '_');
    }
    return match;
  });
  
  return processedQuery;
}

function executeSelectQuery(query: string, data: any[], headers: string[]): any[] {
  // Parse SELECT query
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (!selectMatch) return data.slice(0, 10);
  
  const selectFields = selectMatch[1].split(',').map(field => field.trim());
  
  // Handle DISTINCT
  if (selectFields[0].toUpperCase().includes('DISTINCT')) {
    const fieldName = selectFields[0].replace(/DISTINCT\s+/i, '').trim();
    const uniqueValues = [...new Set(data.map(row => row[fieldName]))];
    return uniqueValues.map(value => ({ [fieldName]: value }));
  }
  
  // Handle specific fields
  const results = data.map(row => {
    const result: any = {};
    selectFields.forEach(field => {
      if (field === '*') {
        // Select all fields
        Object.keys(row).forEach(key => {
          result[key] = row[key];
        });
      } else {
        // Select specific field
        result[field] = row[field];
      }
    });
    return result;
  });
  
  return results.slice(0, 50); // Limit results
}

function executeCountQuery(query: string, data: any[], headers: string[]): any[] {
  // Parse COUNT query
  const countMatch = query.match(/COUNT\((.+?)\)/i);
  if (!countMatch) return [{ count: data.length }];
  
  const fieldName = countMatch[1].trim();
  
  if (fieldName === '*') {
    return [{ count: data.length }];
  }
  
  // Count non-null values in specific field
  const nonNullCount = data.filter(row => 
    row[fieldName] !== null && 
    row[fieldName] !== undefined && 
    row[fieldName] !== ''
  ).length;
  
  return [{ count: nonNullCount }];
}

function executeSumQuery(query: string, data: any[], headers: string[]): any[] {
  // Parse SUM query
  const sumMatch = query.match(/SUM\((.+?)\)/i);
  if (!sumMatch) return [{ sum: 0 }];
  
  const fieldName = sumMatch[1].trim();
  
  const sum = data.reduce((total, row) => {
    const value = row[fieldName];
    const numValue = typeof value === 'number' ? value : 
                    typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : 0;
    return total + numValue;
  }, 0);
  
  return [{ sum }];
}

function executeAvgQuery(query: string, data: any[], headers: string[]): any[] {
  // Parse AVG query
  const avgMatch = query.match(/AVG\((.+?)\)/i);
  if (!avgMatch) return [{ avg: 0 }];
  
  const fieldName = avgMatch[1].trim();
  
  const validValues = data
    .map(row => {
      const value = row[fieldName];
      return typeof value === 'number' ? value : 
             typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : null;
    })
    .filter(val => val !== null);
  
  const avg = validValues.length > 0 ? 
    validValues.reduce((sum, val) => sum + val, 0) / validValues.length : 0;
  
  return [{ avg }];
}

function executeGroupByQuery(query: string, data: any[], headers: string[]): any[] {
  // Parse GROUP BY query
  const groupByMatch = query.match(/GROUP BY\s+(.+?)(?:\s+ORDER BY|$)/i);
  if (!groupByMatch) return data.slice(0, 10);
  
  const groupByField = groupByMatch[1].trim();
  
  // Parse SELECT fields
  const selectMatch = query.match(/SELECT\s+(.+?)\s+FROM/i);
  if (!selectMatch) return data.slice(0, 10);
  
  const selectFields = selectMatch[1].split(',').map(field => field.trim());
  
  // Group data by the specified field
  const groupedData: { [key: string]: any[] } = {};
  data.forEach(row => {
    let groupValue = row[groupByField];
    
    // Handle date functions for quarterly analysis
    if (groupByField.toUpperCase().includes('YEAR(') || groupByField.toUpperCase().includes('QUARTER(')) {
      const dateField = groupByField.match(/YEAR\((.+?)\)|QUARTER\((.+?)\)/i);
      if (dateField) {
        const actualDateField = dateField[1] || dateField[2];
        const dateValue = row[actualDateField];
        if (dateValue) {
          const date = new Date(dateValue);
          if (groupByField.toUpperCase().includes('YEAR(')) {
            groupValue = date.getFullYear();
          } else if (groupByField.toUpperCase().includes('QUARTER(')) {
            groupValue = Math.ceil((date.getMonth() + 1) / 3);
          }
        }
      }
    }
    
    const groupKey = groupValue !== null && groupValue !== undefined ? 
      String(groupValue) : 'null';
    
    if (!groupedData[groupKey]) {
      groupedData[groupKey] = [];
    }
    groupedData[groupKey].push(row);
  });
  
  // Process each group
  const results: any[] = [];
  Object.keys(groupedData).forEach(groupKey => {
    const groupRows = groupedData[groupKey];
    const result: any = {};
    
    // Add group field
    result[groupByField] = groupKey === 'null' ? null : groupKey;
    
    // Process select fields
    selectFields.forEach(field => {
      if (field.toUpperCase().includes('COUNT')) {
        const countMatch = field.match(/COUNT\((.+?)\)/i);
        if (countMatch) {
          const countField = countMatch[1].trim();
          if (countField === '*') {
            result[field.replace(/COUNT\((.+?)\)/i, 'count')] = groupRows.length;
          } else {
            const nonNullCount = groupRows.filter(row => 
              row[countField] !== null && 
              row[countField] !== undefined && 
              row[countField] !== ''
            ).length;
            result[field.replace(/COUNT\((.+?)\)/i, 'count')] = nonNullCount;
          }
        }
      } else if (field.toUpperCase().includes('SUM')) {
        const sumMatch = field.match(/SUM\((.+?)\)/i);
        if (sumMatch) {
          const sumField = sumMatch[1].trim();
          const sum = groupRows.reduce((total, row) => {
            const value = row[sumField];
            const numValue = typeof value === 'number' ? value : 
                            typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : 0;
            return total + numValue;
          }, 0);
          result[field.replace(/SUM\((.+?)\)/i, 'sum')] = sum;
        }
      } else if (field.toUpperCase().includes('AVG')) {
        const avgMatch = field.match(/AVG\((.+?)\)/i);
        if (avgMatch) {
          const avgField = avgMatch[1].trim();
          const validValues = groupRows
            .map(row => {
              const value = row[avgField];
              return typeof value === 'number' ? value : 
                     typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : null;
            })
            .filter(val => val !== null);
          
          const avg = validValues.length > 0 ? 
            validValues.reduce((sum, val) => sum + val, 0) / validValues.length : 0;
          result[field.replace(/AVG\((.+?)\)/i, 'avg')] = avg;
        }
      } else if (field.toUpperCase().includes('MAX')) {
        const maxMatch = field.match(/MAX\((.+?)\)/i);
        if (maxMatch) {
          const maxField = maxMatch[1].trim();
          const max = Math.max(...groupRows.map(row => {
            const value = row[maxField];
            return typeof value === 'number' ? value : 
                   typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : -Infinity;
          }));
          result[field.replace(/MAX\((.+?)\)/i, 'max')] = max === -Infinity ? null : max;
        }
      } else if (field.toUpperCase().includes('MIN')) {
        const minMatch = field.match(/MIN\((.+?)\)/i);
        if (minMatch) {
          const minField = minMatch[1].trim();
          const min = Math.min(...groupRows.map(row => {
            const value = row[minField];
            return typeof value === 'number' ? value : 
                   typeof value === 'string' && !isNaN(Number(value)) ? Number(value) : Infinity;
          }));
          result[field.replace(/MIN\((.+?)\)/i, 'min')] = min === Infinity ? null : min;
        }
      } else {
        // Regular field
        result[field] = groupRows[0][field];
      }
    });
    
    results.push(result);
  });
  
  // Handle ORDER BY
  const orderByMatch = query.match(/ORDER BY\s+(.+?)$/i);
  if (orderByMatch) {
    const orderField = orderByMatch[1].trim();
    const isDesc = orderField.toUpperCase().includes('DESC');
    const cleanField = orderField.replace(/\s+(ASC|DESC)/i, '');
    
    results.sort((a, b) => {
      const aVal = a[cleanField];
      const bVal = b[cleanField];
      
      if (aVal === bVal) return 0;
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      const comparison = aVal < bVal ? -1 : 1;
      return isDesc ? -comparison : comparison;
    });
  }
  
  return results;
}

// SQLite-based SQL execution for complex queries
export async function executeWithSQLite(sqlQuery: string, data: any[], headers: string[]): Promise<any[]> {
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

// Simple SQL execution (alias for executeSimpleSQL)
export async function executeWithSimple(sqlQuery: string, data: any[], headers: string[]): Promise<any[]> {
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
