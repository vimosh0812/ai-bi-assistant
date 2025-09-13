import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { tableName, headers, data, fileId } = await request.json()
    const supabase = await createClient()

    console.log("[v0] API received:", {
      tableName,
      headerCount: headers?.length,
      dataCount: data?.length,
      headers: headers,
      sampleData: data?.slice(0, 2),
    })

    // Verify user authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "No data to insert" }, { status: 400 })
    }

    // Create dynamic table for CSV data
    const sanitizedHeaders = headers.map((header: string) => header.toLowerCase().replace(/[^a-z0-9_]/g, "_"))

    // Build CREATE TABLE query
    const columnDefinitions = sanitizedHeaders.map((header: string) => `"${header}" TEXT`).join(", ")

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id SERIAL PRIMARY KEY,
        ${columnDefinitions},
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `

    console.log("[v0] Creating table with query:", createTableQuery)

    // Execute table creation
    const { error: createError } = await supabase.rpc("exec_sql", {
      sql: createTableQuery,
    })

    if (createError) {
      console.error("Error creating table:", createError)
      return NextResponse.json({ error: "Failed to create table" }, { status: 500 })
    }

    const insertData = data.map((row: any) => {
      const sanitizedRow: any = {}
      headers.forEach((header: string, index: number) => {
        const sanitizedHeader = header.toLowerCase().replace(/[^a-z0-9_]/g, "_")
        sanitizedRow[sanitizedHeader] = row[header] || ""
      })
      return sanitizedRow
    })

    console.log("[v0] Inserting data:", {
      rowCount: insertData.length,
      sampleRow: insertData[0],
    })

    const { error: insertError } = await supabase.from(tableName).insert(insertData)

    if (insertError) {
      console.error("Error inserting data:", insertError)
      return NextResponse.json(
        {
          error: "Failed to insert data",
          details: insertError.message,
        },
        { status: 500 },
      )
    }

    // Enable RLS on the new table
    const rlsQuery = `
      ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "${tableName}_policy" ON "${tableName}"
        FOR ALL USING (true);
    `

    await supabase.rpc("exec_sql", { sql: rlsQuery })

    console.log("[v0] Successfully stored CSV data:", {
      tableName,
      rowCount: data.length,
    })

    return NextResponse.json({
      success: true,
      tableName,
      rowCount: data.length,
    })
  } catch (error) {
    console.error("Error in store-csv API:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
