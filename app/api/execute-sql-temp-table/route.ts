import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tempTableManager } from "@/lib/temp-table-manager";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { sqlQuery, fileId, xAxisQuery } = await request.json();
    
    if (!sqlQuery || !fileId) {
      return NextResponse.json({ error: "Missing sqlQuery or fileId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get file details to find the temporary table name and original headers
    const { data: fileData, error: fileError } = await supabase
      .from("files")
      .select("table_name, user_id, original_headers")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single();

    if (fileError || !fileData) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (!fileData.table_name) {
      return NextResponse.json({ 
        error: "No temporary table found for this file. Please re-upload the file." 
      }, { status: 400 });
    }

    console.log(`Executing SQL on temporary table: ${fileData.table_name}`);
    console.log(`Query: ${sqlQuery}`);
    console.log(`Original headers:`, fileData.original_headers);

    // Execute the main SQL query
    const yAxisResult = await tempTableManager.executeQueryOnTempTable(
      fileData.table_name,
      sqlQuery,
      fileData.original_headers
    );

    if (!yAxisResult.success) {
      return NextResponse.json({ 
        error: "Failed to execute SQL query", 
        details: yAxisResult.error 
      }, { status: 500 });
    }

    let xAxisResult = null;
    if (xAxisQuery) {
      console.log(`Executing X-axis query: ${xAxisQuery}`);
      
      const xAxisQueryResult = await tempTableManager.executeQueryOnTempTable(
        fileData.table_name,
        xAxisQuery,
        fileData.original_headers
      );

      if (xAxisQueryResult.success) {
        xAxisResult = xAxisQueryResult.results;
      } else {
        console.warn("X-axis query failed:", xAxisQueryResult.error);
        // Don't fail the entire request if X-axis query fails
      }
    }

    return NextResponse.json({ 
      success: true, 
      results: yAxisResult.results,
      xAxisResults: xAxisResult,
      query: sqlQuery,
      xAxisQuery: xAxisQuery || null,
      executionMethod: 'temp_table',
      rowCount: yAxisResult.results?.length || 0
    });

  } catch (error) {
    console.error("Temp table SQL execution error:", error);
    return NextResponse.json(
      { 
        error: "Failed to execute SQL query", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}
