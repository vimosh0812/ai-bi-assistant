import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { tableName, headers, data, fileId } = await request.json();
    const supabase = await createClient();

    console.log("API received:", {
      tableName,
      headerCount: headers?.length,
      dataCount: data?.length,
      sampleData: data?.slice(0, 2),
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[auth] Unauthorized", authError);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!data || data.length === 0) {
      console.warn("[validation] No data provided");
      return NextResponse.json({ error: "No data to insert" }, { status: 400 });
    }

    const sanitizedHeaders = headers.map((h: string) =>
      h.toLowerCase().replace(/[^a-z0-9_]/g, "_")
    );

    const columnDefinitions = sanitizedHeaders.map((h: any) => `"${h}" TEXT`).join(", ");

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        id SERIAL PRIMARY KEY,
        ${columnDefinitions},
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `;

    console.log("Create table query:", createTableQuery);

    // 4️⃣ Execute CREATE TABLE
    const { error: createError } = await supabase.rpc("exece_sql", {
      sql: createTableQuery,
    });
    if (createError) {
      console.error("[sql] Create table failed:", createError);
      return NextResponse.json({ error: "Failed to create table", details: createError }, { status: 500 });
    }

    const insertData = data.map((row: any) => {
      const sanitizedRow: any = {};
      headers.forEach((header: string) => {
        const key = header.toLowerCase().replace(/[^a-z0-9_]/g, "_");
        sanitizedRow[key] = row[header] ?? null;
      });
      return sanitizedRow;
    });

    console.log("Insert preview:", { rowCount: insertData.length, sampleRow: insertData[0] });

    const { error: insertError } = await supabase.from(tableName).insert(insertData);
    if (insertError) {
      console.error("[sql] Insert failed:", insertError);
      return NextResponse.json({ error: "Failed to insert data", details: insertError }, { status: 500 });
    }

    const rlsQuery = `
      ALTER TABLE "${tableName}" ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "${tableName}_policy" ON "${tableName}"
        FOR ALL USING (true)
    `;

    const { error: rlsError } = await supabase.rpc("exece_sql", { sql: rlsQuery });
    if (rlsError) {
      console.error("[sql] Enable RLS failed:", rlsError);
      return NextResponse.json({ error: "Failed to enable RLS", details: rlsError }, { status: 500 });
    }

    console.log("CSV stored successfully:", { tableName, rowCount: data.length });

    return NextResponse.json({
      success: true,
      tableName,
      rowCount: data.length,
    });
  } catch (error) {
    console.error("[api] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
