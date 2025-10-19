// /app/api/upload-csv/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parse } from "papaparse"; // Optional, for CSV validation
import { tempTableManager } from "@/lib/temp-table-manager";

// Force dynamic rendering
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { fileName, description, csvText, folderId, aiSummary } = await request.json();
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.log("User authenticated:", user.id);

    if (!csvText || csvText.trim() === "") {
      return NextResponse.json({ error: "CSV content is empty" }, { status: 400 });
    }

    const parsed = parse(csvText, { header: true, skipEmptyLines: true });
    const headers = parsed.meta.fields || [];
    const csvData = parsed.data;

    const filePath = `${user.id}/${folderId}/${Date.now()}_${fileName}.csv`;
    console.log("Uploading CSV to path:", filePath);
    const { error: uploadError } = await supabase.storage
      .from("csv-files")
      .upload(filePath, new Blob([csvText], { type: "text/csv" }), {
        upsert: true,
      });
    console.log("Upload response:", { uploadError });
    if (uploadError) {
      return NextResponse.json({ error: "Failed to upload CSV", details: uploadError }, { status: 500 });
    }
    console.log("CSV uploaded successfully");

    // Create temporary table for SQL queries
    console.log("Creating temporary table for SQL queries...");
    console.log("CSV data sample:", {
      totalRows: csvData.length,
      headers: headers.slice(0, 5),
      firstRow: csvData[0] ? Object.keys(csvData[0]).slice(0, 5) : 'No data',
      firstRowValues: csvData[0] ? Object.values(csvData[0]).slice(0, 3) : 'No data'
    });
    
    const tempTableResult = await tempTableManager.createTempTable(
      csvData,
      headers,
      "", // We'll get the fileId after inserting the file record
      user.id
    );

    if (!tempTableResult.success) {
      console.error("Failed to create temporary table:", tempTableResult.error);
      // Continue without temporary table - we can still store the file
      console.log("Continuing without temporary table...");
    } else {
      console.log("Temporary table created successfully:", tempTableResult.tableName);
    }

    const { data: newFile, error: insertError } = await supabase
      .from("files")
      .insert([
        {
          name: fileName,
          description,
          folder_id: folderId,
          user_id: user.id,
          storage_path: filePath,
          original_headers: headers,
          ai_summary: aiSummary || null,
          table_name: tempTableResult.success ? tempTableResult.tableName : null,
        },
      ])
      .select()
      .single();

    if (insertError) {
      // Clean up temporary table if file insertion fails
      if (tempTableResult.success) {
        await tempTableManager.dropTempTable(tempTableResult.tableName!);
      }
      return NextResponse.json({ error: "Failed to save file metadata", details: insertError }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      file: newFile,
      headers,
      rowCount: parsed.data.length,
    });
  } catch (err) {
    console.error("Upload CSV API error:", err);
    return NextResponse.json(
      { error: "Internal server error", details: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
