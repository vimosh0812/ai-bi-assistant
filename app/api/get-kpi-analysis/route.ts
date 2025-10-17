import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");
    
    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId parameter" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the KPI analysis for the file
    const { data, error } = await supabase
      .from("kpi_analyses")
      .select("*")
      .eq("file_id", fileId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: "No KPI analysis found" }, { status: 404 });
      }
      console.error("Error retrieving KPI analysis:", error);
      return NextResponse.json({ error: "Failed to retrieve KPI analysis" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      kpiAnalysis: data.analysis_data,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    });

  } catch (error) {
    console.error("Get KPI analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
