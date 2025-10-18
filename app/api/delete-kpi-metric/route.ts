import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"


export async function DELETE(request: NextRequest) {
  try {
    const { fileId, metricIndex } = await request.json()

    if (!fileId || metricIndex === undefined) {
      return NextResponse.json(
        { error: "File ID and metric index are required" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Get the current KPI analysis
    const { data: fileData, error: fileError } = await supabase
      .from("files")
      .select("kpi_analysis_id")
      .eq("id", fileId)
      .single()

    if (fileError || !fileData?.kpi_analysis_id) {
      return NextResponse.json(
        { error: "File or KPI analysis not found" },
        { status: 404 }
      )
    }

    // Get the current KPI analysis data
    const { data: kpiData, error: kpiError } = await supabase
      .from("kpi_analyses")
      .select("analysis_data")
      .eq("id", fileData.kpi_analysis_id)
      .single()

    if (kpiError || !kpiData?.analysis_data) {
      return NextResponse.json(
        { error: "KPI analysis data not found" },
        { status: 404 }
      )
    }

    // Parse the JSONB data
    const analysisData = kpiData.analysis_data

    // Remove the metric at the specified index
    if (analysisData.metrics && Array.isArray(analysisData.metrics)) {
      if (metricIndex >= 0 && metricIndex < analysisData.metrics.length) {
        analysisData.metrics.splice(metricIndex, 1)
      } else {
        return NextResponse.json(
          { error: "Invalid metric index" },
          { status: 400 }
        )
      }
    } else {
      return NextResponse.json(
        { error: "Invalid KPI analysis structure" },
        { status: 400 }
      )
    }

    // Update the KPI analysis with the modified data
    const { error: updateError } = await supabase
      .from("kpi_analyses")
      .update({ analysis_data: analysisData })
      .eq("id", fileData.kpi_analysis_id)

    if (updateError) {
      console.error("Error updating KPI analysis:", updateError)
      return NextResponse.json(
        { error: "Failed to update KPI analysis" },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: "KPI metric deleted successfully",
      remainingMetrics: analysisData.metrics.length
    })

  } catch (error) {
    console.error("Error deleting KPI metric:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
