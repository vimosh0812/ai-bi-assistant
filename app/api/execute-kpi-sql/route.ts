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

        // Execute Y-axis query (main data) - execute directly instead of HTTP request
        let yAxisResult;
        try {
          // Import the unified SQL execution function directly
          const sqlUtils = await import('@/lib/sql-utils');
          const executeWithSQLite = sqlUtils.executeWithSQLite;
          const executeWithSimple = sqlUtils.executeWithSimple;
          
          console.log(`Executing Y-axis query directly for ${metric.name}`);
          
          // Determine execution method (same logic as execute-sql-unified)
          const dataLength = csvData.length;
          const upperQuery = metric.sqlQuery.toUpperCase();
          let executionMethod = 'simple';
          
          // For very large datasets, prefer SQLite
          if (dataLength > 10000) {
            executionMethod = 'sqlite';
          }
          
          // For complex analytical queries, prefer SQLite
          if (upperQuery.includes('WINDOW') || 
              upperQuery.includes('PARTITION BY') || 
              upperQuery.includes('RANK()') ||
              upperQuery.includes('ROW_NUMBER()') ||
              upperQuery.includes('LAG(') ||
              upperQuery.includes('LEAD(') ||
              upperQuery.includes('CASE WHEN') ||
              upperQuery.includes('UNION') ||
              upperQuery.includes('CTE') ||
              upperQuery.includes('WITH ')) {
            executionMethod = 'sqlite';
          }
          
          // For queries with multiple JOINs, prefer SQLite
          const joinCount = (upperQuery.match(/\bJOIN\b/g) || []).length;
          if (joinCount > 2) {
            executionMethod = 'sqlite';
          }
          
          // For simple queries on small datasets, use simple method
          if (dataLength < 1000 && 
              (upperQuery.includes('SELECT') && !upperQuery.includes('GROUP BY') && !upperQuery.includes('ORDER BY'))) {
            executionMethod = 'simple';
          }
          
          const startTime = Date.now();
          let results: any[] = [];
          
          try {
            if (executionMethod === 'sqlite') {
              results = await executeWithSQLite(metric.sqlQuery, csvData, headers);
            } else {
              results = await executeWithSimple(metric.sqlQuery, csvData, headers);
            }
          } catch (sqlError) {
            // Fallback to simple method if advanced methods fail
            if (executionMethod !== 'simple') {
              console.log(`Falling back to simple execution for ${metric.name}`);
              results = await executeWithSimple(metric.sqlQuery, csvData, headers);
              executionMethod = 'simple (fallback)';
            } else {
              throw sqlError;
            }
          }
          
          const executionTime = Date.now() - startTime;
          
          yAxisResult = {
            success: true,
            results: results,
            executionMethod: executionMethod,
            executionTime: `${executionTime}ms`,
            cached: false
          };
          
        } catch (directError) {
          console.error(`Direct execution failed for ${metric.name}:`, directError);
          yAxisResult = {
            success: false,
            error: `Direct execution failed: ${directError instanceof Error ? directError.message : String(directError)}`
          };
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

        // Execute X-axis query if provided - execute directly instead of HTTP request
        let xAxisData = [];
        if (metric.xAxisQuery) {
          try {
            console.log(`Executing X-axis query directly for ${metric.name}`);
            
            // Import the unified SQL execution function directly
            const sqlUtils = await import('@/lib/sql-utils');
            const executeWithSQLite = sqlUtils.executeWithSQLite;
            const executeWithSimple = sqlUtils.executeWithSimple;
            
            // Determine execution method (same logic as execute-sql-unified)
            const dataLength = csvData.length;
            const upperQuery = metric.xAxisQuery.toUpperCase();
            let executionMethod = 'simple';
            
            // For very large datasets, prefer SQLite
            if (dataLength > 10000) {
              executionMethod = 'sqlite';
            }
            
            // For complex analytical queries, prefer SQLite
            if (upperQuery.includes('WINDOW') || 
                upperQuery.includes('PARTITION BY') || 
                upperQuery.includes('RANK()') ||
                upperQuery.includes('ROW_NUMBER()') ||
                upperQuery.includes('LAG(') ||
                upperQuery.includes('LEAD(') ||
                upperQuery.includes('CASE WHEN') ||
                upperQuery.includes('UNION') ||
                upperQuery.includes('CTE') ||
                upperQuery.includes('WITH ')) {
              executionMethod = 'sqlite';
            }
            
            // For queries with multiple JOINs, prefer SQLite
            const joinCount = (upperQuery.match(/\bJOIN\b/g) || []).length;
            if (joinCount > 2) {
              executionMethod = 'sqlite';
            }
            
            // For simple queries on small datasets, use simple method
            if (dataLength < 1000 && 
                (upperQuery.includes('SELECT') && !upperQuery.includes('GROUP BY') && !upperQuery.includes('ORDER BY'))) {
              executionMethod = 'simple';
            }
            
            let results: any[] = [];
            
            try {
              if (executionMethod === 'sqlite') {
                results = await executeWithSQLite(metric.xAxisQuery, csvData, headers);
              } else {
                results = await executeWithSimple(metric.xAxisQuery, csvData, headers);
              }
            } catch (sqlError) {
              // Fallback to simple method if advanced methods fail
              if (executionMethod !== 'simple') {
                console.log(`Falling back to simple execution for X-axis ${metric.name}`);
                results = await executeWithSimple(metric.xAxisQuery, csvData, headers);
              } else {
                throw sqlError;
              }
            }
            
            xAxisData = results || [];
            
          } catch (directError) {
            console.error(`Direct X-axis execution failed for ${metric.name}:`, directError);
            xAxisData = [];
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
