import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OpenAIKPIAnalysis } from "@/types/kpi";

export async function POST(request: NextRequest) {
  try {
    const { fileId, kpiAnalysis } = await request.json();
    
    if (!kpiAnalysis) {
      return NextResponse.json({ error: "Missing kpiAnalysis" }, { status: 400 });
    }

    // If no fileId provided, we'll store it as a preview analysis
    if (!fileId) {
      console.log("Storing preview KPI analysis (no fileId provided)");
      return NextResponse.json({ 
        success: true, 
        message: "Preview KPI analysis generated successfully",
        preview: true
      });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Store the KPI analysis in the database
    console.log("💾 Storing KPI analysis for fileId:", fileId);
    console.log("📊 Analysis data to store:", JSON.stringify(kpiAnalysis, null, 2));
    
    const { data, error } = await supabase
      .from("kpi_analyses")
      .insert([
        {
          file_id: fileId,
          user_id: user.id,
          analysis_data: kpiAnalysis,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error storing KPI analysis:", error);
      return NextResponse.json({ error: "Failed to store KPI analysis" }, { status: 500 });
    }

    // Also update the file record with KPI analysis status
    const { error: updateError } = await supabase
      .from("files")
      .update({
        has_kpi_analysis: true,
        kpi_analysis_id: data.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", fileId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error updating file with KPI analysis:", updateError);
      // Don't fail the request, just log the error
    }

    return NextResponse.json({ 
      success: true, 
      kpiAnalysisId: data.id,
      message: "KPI analysis stored successfully" 
    });

  } catch (error) {
    console.error("Store KPI analysis error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
