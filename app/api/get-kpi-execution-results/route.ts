import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const kpiAnalysisId = searchParams.get('kpiAnalysisId');
    const metricIndex = searchParams.get('metricIndex');
    
    if (!kpiAnalysisId) {
      return NextResponse.json({ error: "Missing kpiAnalysisId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build query
    let query = supabase
      .from("kpi_execution_results")
      .select("*")
      .eq("kpi_analysis_id", kpiAnalysisId)
      .eq("execution_success", true);

    // Filter by metric index if provided
    if (metricIndex !== null) {
      query = query.eq("metric_index", parseInt(metricIndex));
    }

    const { data: results, error } = await query.order("metric_index");

    if (error) {
      console.error("Error fetching execution results:", error);
      return NextResponse.json({ error: "Failed to fetch execution results" }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      results: results || [],
      count: results?.length || 0
    });

  } catch (error) {
    console.error("Get KPI execution results error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
