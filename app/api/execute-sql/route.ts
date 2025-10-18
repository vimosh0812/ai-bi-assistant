import { NextRequest, NextResponse } from "next/server";
import { executeSimpleSQL } from "@/lib/sql-utils";

export async function POST(request: NextRequest) {
  try {
    const { sqlQuery, data, headers } = await request.json();
    
    if (!sqlQuery || !data || !Array.isArray(data)) {
      return NextResponse.json({ error: "Missing sqlQuery, data, or headers" }, { status: 400 });
    }

    // console.log("Executing SQL query:", sqlQuery);
    // console.log("On data with headers:");
    console.log("Total rows being processed:", data.length);

    // Simple SQL-like query execution for CSV data
    const results = executeSimpleSQL(sqlQuery, data, headers);
    
    console.log("SQL execution results:");

    return NextResponse.json({ 
      success: true, 
      results,
      query: sqlQuery
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