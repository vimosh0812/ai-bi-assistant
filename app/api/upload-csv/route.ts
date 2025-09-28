// /app/api/upload-csv/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerSideClient } from "@/lib/supabase/server";
import { parse } from "papaparse"; // Optional, for CSV validation

export async function POST(request: NextRequest) {
  try {
    const { fileName, description, csvText, folderId, aiSummary } = await request.json();
    const supabase = await createServerSideClient();

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

    const filePath = `${user.id}/${folderId}/${Date.now()}_${fileName}`;
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
        },
      ])
      .select()
      .single();

    if (insertError) {
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
