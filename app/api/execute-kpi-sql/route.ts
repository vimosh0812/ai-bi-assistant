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
    
    // First, collect all metrics that need SQL execution
    const metricsToExecute = kpiAnalysis.metrics.filter((metric: any) => 
      !metric.executionResults || 
      !metric.executionResults.yAxisData || 
      metric.executionResults.yAxisData.length === 0
    );

    if (metricsToExecute.length === 0) {
      console.log("All metrics already have execution results, no SQL execution needed");
      return NextResponse.json({ 
        success: true, 
        kpiAnalysis: kpiAnalysis,
        message: "All KPI metrics already have cached execution results" 
      });
    }

    console.log(`Executing SQL for ${metricsToExecute.length} metrics that need processing`);

    // Execute all SQL operations in parallel using Promise.all
    const executionPromises = metricsToExecute.map(async (metric: any) => {
      try {
        console.log(`Executing SQL for metric: ${metric.name}`);

        // Execute Y-axis query (main data) - no cache, execute once and store
        let yAxisResult;
        try {
          // Try internal API call first
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
          const fullUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
          const yAxisResponse = await fetch(`${fullUrl}/api/execute-sql-unified`, {
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

          if (!yAxisResponse.ok) {
            throw new Error(`HTTP ${yAxisResponse.status}: ${yAxisResponse.statusText}`);
          }

          yAxisResult = await yAxisResponse.json();
        } catch (fetchError) {
          console.error(`Fetch failed for Y-axis query ${metric.name}:`, fetchError);
          console.log(`Attempted URL: /api/execute-sql-unified`);
          console.log(`Environment variables - NEXT_PUBLIC_APP_URL: ${process.env.NEXT_PUBLIC_APP_URL}, VERCEL_URL: ${process.env.VERCEL_URL}`);
          
          // Fallback: Execute SQL directly using the simple function
          try {
            const { executeSimpleSQL } = await import('@/lib/sql-utils');
            
            console.log(`Using direct simple execution for ${metric.name}`);
            
            const results = executeSimpleSQL(metric.sqlQuery, csvData, headers);
            
            yAxisResult = {
              success: true,
              results: results,
              executionMethod: 'simple (fallback)',
              executionTime: '0ms'
            };
          } catch (directError) {
            console.error(`Direct execution also failed for ${metric.name}:`, directError);
            yAxisResult = {
              success: false,
              error: `Fetch failed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}. Direct execution failed: ${directError instanceof Error ? directError.message : String(directError)}`
            };
          }
        }
        
        if (!yAxisResult.success) {
          console.error(`Failed to execute Y-axis query for ${metric.name}:`, yAxisResult.error);
          // Return metric with error info
          return {
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
          };
        }

        // Execute X-axis query if provided - no cache, execute once and store
        let xAxisData = [];
        if (metric.xAxisQuery) {
          try {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
            const fullUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
            const xAxisResponse = await fetch(`${fullUrl}/api/execute-sql-unified`, {
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

            if (!xAxisResponse.ok) {
              throw new Error(`HTTP ${xAxisResponse.status}: ${xAxisResponse.statusText}`);
            }

            const xAxisResult = await xAxisResponse.json();
            if (xAxisResult.success) {
              xAxisData = xAxisResult.results || [];
            }
          } catch (fetchError) {
            console.error(`Fetch failed for X-axis query ${metric.name}:`, fetchError);
            
            // Fallback: Execute SQL directly
            try {
              const { executeSimpleSQL } = await import('@/lib/sql-utils');
              
              const results = executeSimpleSQL(metric.xAxisQuery, csvData, headers);
              xAxisData = results || [];
            } catch (directError) {
              console.error(`Direct X-axis execution also failed for ${metric.name}:`, directError);
              xAxisData = [];
            }
          }
        }

        // Return updated metric with execution results
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

        console.log(`Successfully executed SQL for ${metric.name}: ${yAxisResult.results?.length || 0} rows`);
        return updatedMetric;

      } catch (error) {
        console.error(`Error executing SQL for metric ${metric.name}:`, error);
        // Return metric with error info
        return {
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
        };
      }
    });

    // Wait for ALL SQL operations to complete
    console.log(`Waiting for all ${executionPromises.length} SQL operations to complete...`);
    const executedMetrics = await Promise.all(executionPromises);
    console.log(`All SQL operations completed!`);

    // Combine executed metrics with already cached metrics
    const updatedMetrics = kpiAnalysis.metrics.map((originalMetric: any) => {
      const executedMetric = executedMetrics.find((executed: any) => executed.name === originalMetric.name);
      return executedMetric || originalMetric;
    });

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
