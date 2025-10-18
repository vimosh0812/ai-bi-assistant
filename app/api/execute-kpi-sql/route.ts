import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { fileId, userId, kpiAnalysis, csvData, headers } = await request.json();
    
    if (!fileId || !userId || !kpiAnalysis || !csvData || !headers) {
      return NextResponse.json({ 
        error: "Missing required parameters: fileId, userId, kpiAnalysis, csvData, headers" 
      }, { status: 400 });
    }

    console.log(`Executing SQL for ${kpiAnalysis.metrics.length} KPI metrics`);

    const supabase = await createClient();
    const updatedMetrics = [];

    // Execute SQL for each metric
    for (const metric of kpiAnalysis.metrics) {
      try {
        console.log(`Executing SQL for metric: ${metric.name}`);
        
        // Check if we already have execution results
        if (metric.executionResults && metric.executionResults.yAxisData.length > 0) {
          console.log(`Metric ${metric.name} already has execution results, skipping`);
          updatedMetrics.push(metric);
          continue;
        }

        // Execute Y-axis query (main data) - no cache, execute once and store
        const yAxisResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/execute-sql-unified`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            sqlQuery: metric.sqlQuery, 
            data: csvData, 
            headers: headers,
            method: 'auto',
            fileId,
            userId,
            useCache: false  // Don't use SQL cache, we're storing in JSONB
          }),
        });

        const yAxisResult = await yAxisResponse.json();
        
        if (!yAxisResult.success) {
          console.error(`Failed to execute Y-axis query for ${metric.name}:`, yAxisResult.error);
          // Add metric with error info
          updatedMetrics.push({
            ...metric,
            executionResults: {
              yAxisData: [],
              xAxisData: [],
              executionTime: 0,
              executionMethod: 'error',
              cached: false,
              lastExecuted: new Date().toISOString(),
              error: yAxisResult.error
            }
          });
          continue;
        }

        // Execute X-axis query if provided - no cache, execute once and store
        let xAxisData = [];
        if (metric.xAxisQuery) {
          const xAxisResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/execute-sql-unified`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              sqlQuery: metric.xAxisQuery, 
              data: csvData, 
              headers: headers,
              method: 'auto',
              fileId,
              userId,
              useCache: false  // Don't use SQL cache, we're storing in JSONB
            }),
          });

          const xAxisResult = await xAxisResponse.json();
          if (xAxisResult.success) {
            xAxisData = xAxisResult.results || [];
          }
        }

        // Create updated metric with execution results
        const updatedMetric = {
          ...metric,
          executionResults: {
            yAxisData: yAxisResult.results || [],
            xAxisData: xAxisData,
            executionTime: yAxisResult.executionTime ? parseInt(yAxisResult.executionTime.replace('ms', '')) : 0,
            executionMethod: yAxisResult.executionMethod || 'unknown',
            cached: yAxisResult.cached || false,
            lastExecuted: new Date().toISOString()
          }
        };

        updatedMetrics.push(updatedMetric);
        console.log(`Successfully executed SQL for ${metric.name}: ${yAxisResult.results?.length || 0} rows`);

      } catch (error) {
        console.error(`Error executing SQL for metric ${metric.name}:`, error);
        // Add metric with error info
        updatedMetrics.push({
          ...metric,
          executionResults: {
            yAxisData: [],
            xAxisData: [],
            executionTime: 0,
            executionMethod: 'error',
            cached: false,
            lastExecuted: new Date().toISOString(),
            error: error instanceof Error ? error.message : String(error)
          }
        });
      }
    }

    // Update the KPI analysis with execution results
    const updatedKpiAnalysis = {
      ...kpiAnalysis,
      metrics: updatedMetrics
    };

    // Store updated analysis in database
    const { error: updateError } = await supabase
      .from("kpi_analyses")
      .update({
        analysis_data: updatedKpiAnalysis,
        updated_at: new Date().toISOString(),
      })
      .eq("file_id", fileId)
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating KPI analysis with execution results:", updateError);
      return NextResponse.json({ 
        error: "Failed to update KPI analysis with execution results" 
      }, { status: 500 });
    }

    // Get the kpi_analysis_id to update the files table
    const { data: kpiData } = await supabase
      .from('kpi_analyses')
      .select('id')
      .eq('file_id', fileId)
      .eq('user_id', userId)
      .single();

    // Update the files table to mark as having KPI analysis
    const { error: fileUpdateError } = await supabase
      .from('files')
      .update({ 
        has_kpi_analysis: true,
        kpi_analysis_id: kpiData?.id || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', fileId)
      .eq('user_id', userId);

    if (fileUpdateError) {
      console.error("Error updating file with KPI analysis status:", fileUpdateError);
      // Don't fail the request, just log the error
    }

    console.log(`Successfully executed SQL for all KPI metrics and updated database`);

    return NextResponse.json({ 
      success: true, 
      kpiAnalysis: updatedKpiAnalysis,
      message: "KPI SQL execution completed successfully" 
    });

  } catch (error) {
    console.error("Execute KPI SQL error:", error);
    return NextResponse.json(
      { error: "Failed to execute KPI SQL queries" },
      { status: 500 }
    );
  }
}
