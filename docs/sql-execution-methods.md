# SQL Execution Methods for CSV Data

This document explains the different methods available for executing SQL queries on CSV data in the AI BI Platform.

## Overview

The platform now supports multiple SQL execution methods, each optimized for different use cases:

1. **Simple Method** (Original) - Basic regex-based parsing
2. **SQLite Method** - Full SQL support with in-memory database
3. **DuckDB Method** - Advanced analytical database
4. **Unified Method** - Automatically selects the best method

## Method Comparison

| Feature | Simple | SQLite | DuckDB | Unified |
|---------|--------|--------|--------|---------|
| **SQL Support** | Basic | Full | Advanced | Auto-selected |
| **Performance** | Fast (small data) | Good | Excellent | Optimized |
| **Complex Queries** | Limited | Full | Advanced | Full |
| **Memory Usage** | Low | Medium | Medium | Optimized |
| **Setup Complexity** | None | Medium | Medium | None |

## Available Endpoints

### 1. Simple Method (Original)
- **Endpoint**: `/api/execute-sql`
- **Use Case**: Simple queries on small datasets
- **Features**: SELECT, COUNT, SUM, AVG, GROUP BY
- **Limitations**: No JOINs, subqueries, or complex functions

### 2. SQLite Method
- **Endpoint**: `/api/execute-sql-advanced`
- **Use Case**: Full SQL support with good performance
- **Features**: 
  - All standard SQL operations
  - JOINs, subqueries, CTEs
  - JSON functions
  - Window functions (basic)
- **Best For**: Medium datasets with complex queries

### 3. DuckDB Method
- **Endpoint**: `/api/execute-sql-duckdb`
- **Use Case**: Advanced analytics and large datasets
- **Features**:
  - Advanced analytical functions
  - Window functions (RANK, ROW_NUMBER, LAG, LEAD)
  - Time series functions
  - Optimized for analytical workloads
- **Best For**: Large datasets and complex analytics

### 4. Unified Method (Recommended)
- **Endpoint**: `/api/execute-sql-unified`
- **Use Case**: Automatic method selection
- **Features**:
  - Automatically chooses the best method
  - Fallback to simple method if advanced fails
  - Performance optimization
  - Error handling and recovery

## Usage Examples

### Basic Query
```javascript
const response = await fetch('/api/execute-sql-unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sqlQuery: 'SELECT * FROM data LIMIT 10',
    data: csvData,
    headers: Object.keys(csvData[0]),
    method: 'auto' // or 'sqlite', 'duckdb', 'simple'
  })
});
```

### Complex Analytical Query
```javascript
const response = await fetch('/api/execute-sql-unified', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sqlQuery: `
      SELECT 
        category,
        COUNT(*) as count,
        AVG(price) as avg_price,
        RANK() OVER (ORDER BY COUNT(*) DESC) as rank
      FROM data 
      WHERE price > 100
      GROUP BY category
      ORDER BY count DESC
    `,
    data: csvData,
    headers: Object.keys(csvData[0])
  })
});
```

## Method Selection Logic

The unified method automatically selects the best execution method based on:

1. **Dataset Size**:
   - < 1,000 rows: Simple method
   - 1,000 - 100,000 rows: SQLite method
   - > 100,000 rows: DuckDB method

2. **Query Complexity**:
   - Window functions → DuckDB
   - Multiple JOINs → SQLite
   - Simple SELECT → Simple method

3. **Analytical Features**:
   - Time series functions → DuckDB
   - Advanced aggregations → DuckDB
   - Standard SQL → SQLite

## Performance Characteristics

### Simple Method
- **Pros**: Fast startup, low memory usage
- **Cons**: Limited SQL support, poor performance on large datasets
- **Best For**: Quick queries on small datasets

### SQLite Method
- **Pros**: Full SQL support, good performance, reliable
- **Cons**: Higher memory usage, slower for analytical queries
- **Best For**: Complex queries on medium datasets

### DuckDB Method
- **Pros**: Excellent analytical performance, advanced functions
- **Cons**: Higher memory usage, more complex setup
- **Best For**: Large datasets and analytical workloads

## Error Handling

All methods include comprehensive error handling:

1. **Primary Method Failure**: Falls back to simple method
2. **Data Type Issues**: Automatic type conversion
3. **Query Syntax Errors**: Detailed error messages
4. **Memory Issues**: Graceful degradation

## Migration Guide

To migrate from the old simple method to the new unified method:

1. **Update API calls**:
   ```javascript
   // Old
   fetch('/api/execute-sql', ...)
   
   // New
   fetch('/api/execute-sql-unified', ...)
   ```

2. **Add method parameter** (optional):
   ```javascript
   body: JSON.stringify({
     sqlQuery,
     data,
     headers,
     method: 'auto' // or specific method
   })
   ```

3. **Handle new response format**:
   ```javascript
   const result = await response.json();
   console.log('Execution method:', result.executionMethod);
   console.log('Execution time:', result.executionTime);
   console.log('Results:', result.results);
   ```

## Best Practices

1. **Use the unified method** for most cases
2. **Specify method explicitly** only when you know the requirements
3. **Monitor execution time** for performance optimization
4. **Handle fallback scenarios** gracefully
5. **Use appropriate query complexity** for your data size

## Troubleshooting

### Common Issues

1. **"Method not found" error**: Ensure you're using the correct endpoint
2. **Memory issues**: Try the simple method for very large datasets
3. **Query syntax errors**: Check SQL syntax against the chosen method's capabilities
4. **Type conversion errors**: Ensure data types are compatible

### Debug Information

The unified method returns debug information:
```javascript
{
  "success": true,
  "results": [...],
  "query": "SELECT * FROM data",
  "executionMethod": "duckdb",
  "executionTime": "45ms",
  "rowCount": 1000
}
```

This helps you understand which method was used and how long it took to execute.
