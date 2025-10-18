// SQL utility functions for CSV data processing

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
