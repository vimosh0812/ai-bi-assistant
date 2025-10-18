import { NextRequest, NextResponse } from "next/server";
import { executeSimpleSQL } from "@/lib/sql-utils";
import { getCachedResults, storeCachedResults } from '@/lib/sql-cache-utils';

export async function POST(request: NextRequest) {
  try {
    const { sqlQuery, data, headers, fileId, userId, useCache = true } = await request.json();
    
    if (!sqlQuery || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: "Missing sqlQuery, data, or headers" }, { status: 400 });
    }

    console.log("Total rows being processed:", data.length);

    // Check cache first if fileId and userId are provided and caching is enabled
    if (useCache && fileId && userId) {
      console.log("Checking cache for simple SQL query...");
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
      console.log("Cache miss, executing simple query...");
    }

    const startTime = Date.now();
    
    // Simple SQL-like query execution for CSV data
    const results = executeSimpleSQL(sqlQuery, data, headers);
    
    const executionTime = Date.now() - startTime;
    
    // Store results in cache if fileId and userId are provided
    if (useCache && fileId && userId) {
      console.log("Storing simple SQL results in cache...");
      await storeCachedResults(
        fileId, 
        userId, 
        sqlQuery, 
        data, 
        headers, 
        results, 
        'simple', 
        executionTime
      );
    }
    
    console.log("SQL execution results:");

    return NextResponse.json({ 
      success: true, 
      results,
      query: sqlQuery,
      executionMethod: 'simple',
      executionTime: `${executionTime}ms`,
      rowCount: results.length,
      cached: false
    });

  } catch (error) {
    console.error("SQL execution error:", error);
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