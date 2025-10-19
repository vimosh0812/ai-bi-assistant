import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { OpenAIKPIAnalysis } from "@/types/kpi";
import { tempTableManager } from "@/lib/temp-table-manager";

export const dynamic = 'force-dynamic';

// Helper function to execute and store KPI queries
async function executeAndStoreKPIQueries(
  tableName: string,
  originalHeaders: string[],
  kpiAnalysis: OpenAIKPIAnalysis,
  kpiAnalysisId: string
): Promise<any[]> {
  const supabase = await createClient();
  const executedResults = [];

  console.log(`Starting execution of ${kpiAnalysis.metrics.length} KPI queries on table: ${tableName}`);

  for (let i = 0; i < kpiAnalysis.metrics.length; i++) {
    const metric = kpiAnalysis.metrics[i];
    
    try {
      console.log(`\n--- Executing KPI ${i + 1}/${kpiAnalysis.metrics.length}: ${metric.name} ---`);
      console.log(`SQL Query: ${metric.sqlQuery}`);
      console.log(`X-Axis Query: ${metric.xAxisQuery || 'None'}`);

      // Execute main SQL query
      const yAxisResult = await tempTableManager.executeQueryOnTempTable(
        tableName,
        metric.sqlQuery,
        originalHeaders
      );

      if (!yAxisResult.success) {
        console.error(`❌ Failed to execute main query for ${metric.name}:`, yAxisResult.error);
        executedResults.push({
          metricName: metric.name,
          success: false,
          error: yAxisResult.error,
          yAxisResults: null,
          xAxisResults: null
        });
        continue;
      }

      console.log(`✅ Main query executed successfully, returned ${yAxisResult.results?.length || 0} rows`);
      console.log(`Y-Axis Results:`, yAxisResult.results?.slice(0, 3)); // Show first 3 results
      console.log(`Y-Axis Query Details:`, {
        originalQuery: metric.sqlQuery,
        resultCount: yAxisResult.results?.length || 0,
        sampleData: yAxisResult.results?.slice(0, 2)
      });

      // Execute X-axis query if available
      let xAxisResults = null;
      if (metric.xAxisQuery) {
        const xAxisResult = await tempTableManager.executeQueryOnTempTable(
          tableName,
          metric.xAxisQuery,
          originalHeaders
        );

        if (xAxisResult.success) {
          xAxisResults = xAxisResult.results;
          console.log(`✅ X-axis query executed successfully, returned ${xAxisResult.results?.length || 0} rows`);
          console.log(`X-Axis Results:`, xAxisResult.results?.slice(0, 3)); // Show first 3 results
          console.log(`X-Axis Query Details:`, {
            originalQuery: metric.xAxisQuery,
            resultCount: xAxisResult.results?.length || 0,
            sampleData: xAxisResult.results?.slice(0, 2)
          });
        } else {
          console.warn(`⚠️ X-axis query failed for ${metric.name}:`, xAxisResult.error);
          console.warn(`X-Axis Query Details:`, {
            originalQuery: metric.xAxisQuery,
            error: xAxisResult.error
          });
        }
      }

      // Store the executed results in the database
      const { data: executionData, error: executionError } = await supabase
        .from("kpi_execution_results")
        .insert([
          {
            kpi_analysis_id: kpiAnalysisId,
            metric_name: metric.name,
            metric_index: i,
            sql_query: metric.sqlQuery,
            x_axis_query: metric.xAxisQuery,
            y_axis_results: yAxisResult.results,
            x_axis_results: xAxisResults,
            execution_success: true,
            created_at: new Date().toISOString()
          }
        ])
        .select()
        .single();

      if (executionError) {
        console.error(`❌ Failed to store execution results for ${metric.name}:`, executionError);
      } else {
        console.log(`✅ Execution results stored for ${metric.name}`);
      }

      executedResults.push({
        metricName: metric.name,
        success: true,
        yAxisResults: yAxisResult.results,
        xAxisResults: xAxisResults,
        executionData: executionData
      });

    } catch (error) {
      console.error(`❌ Error executing KPI ${metric.name}:`, error);
      
      // Store failed execution results in database
      try {
        const { data: failedExecutionData, error: failedExecutionError } = await supabase
          .from("kpi_execution_results")
          .insert([
            {
              kpi_analysis_id: kpiAnalysisId,
              metric_name: metric.name,
              metric_index: i,
              sql_query: metric.sqlQuery,
              x_axis_query: metric.xAxisQuery,
              y_axis_results: null,
              x_axis_results: null,
              execution_success: false,
              created_at: new Date().toISOString()
            }
          ])
          .select()
          .single();

        if (failedExecutionError) {
          console.error(`❌ Failed to store failed execution results for ${metric.name}:`, failedExecutionError);
        } else {
          console.log(`📝 Failed execution results stored for ${metric.name}`);
        }
      } catch (dbError) {
        console.error(`❌ Database error storing failed execution for ${metric.name}:`, dbError);
      }
      
      executedResults.push({
        metricName: metric.name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        yAxisResults: null,
        xAxisResults: null
      });
    }
  }

  console.log(`\n--- KPI Execution Summary ---`);
  console.log(`Total metrics: ${kpiAnalysis.metrics.length}`);
  console.log(`Successful executions: ${executedResults.filter(r => r.success).length}`);
  console.log(`Failed executions: ${executedResults.filter(r => !r.success).length}`);

  return executedResults;
}

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

    // Execute SQL queries and store results before cleanup
    try {
      const { data: fileData } = await supabase
        .from("files")
        .select("table_name, original_headers")
        .eq("id", fileId)
        .single();

      if (fileData?.table_name) {
        console.log(`Executing SQL queries on temporary table: ${fileData.table_name}`);
        
        // Execute all SQL queries from the KPI analysis and store results
        const executedResults = await executeAndStoreKPIQueries(
          fileData.table_name,
          fileData.original_headers,
          kpiAnalysis,
          data.id
        );
        
        console.log(`Executed ${executedResults.length} SQL queries and stored results`);
        
        // Log final summary
        const successfulExecutions = executedResults.filter(r => r.success).length;
        const failedExecutions = executedResults.filter(r => !r.success).length;
        
        console.log("\n🎉 KPI Analysis Complete!");
        console.log(`📊 Total metrics processed: ${executedResults.length}`);
        console.log(`✅ Successful executions: ${successfulExecutions}`);
        console.log(`❌ Failed executions: ${failedExecutions}`);
        
        // Only delete table if we have at least one successful execution
        if (successfulExecutions > 0) {
          console.log(`🗑️ Cleaning up temporary table: ${fileData.table_name}`);
          const cleanupResult = await tempTableManager.dropTempTable(fileData.table_name);
          
          if (cleanupResult.success) {
            console.log("✅ Temporary table cleaned up successfully");
            
            // Update file record to remove table_name
            await supabase
              .from("files")
              .update({ table_name: null })
              .eq("id", fileId);
              
            console.log("✅ File record updated - table_name removed");
          } else {
            console.warn("⚠️ Failed to clean up temporary table:", cleanupResult.error);
          }
        } else {
          console.log("⚠️ No successful executions - keeping temporary table for debugging");
        }
        
        console.log("📈 Execution results stored in database");
        
        // Verify temporary table still exists and has data
        try {
          const { data: verifyData, error: verifyError } = await supabase.rpc('exec_sql_with_result', {
            query: `SELECT COUNT(*) as row_count FROM "${fileData.table_name}"`
          });
          
          if (verifyError) {
            console.warn("⚠️ Could not verify table data:", verifyError);
          } else {
            console.log(`🔍 Table verification: ${fileData.table_name} contains ${verifyData?.[0]?.row_count || 0} rows`);
            
            // Also check table structure
            const { data: structureData, error: structureError } = await supabase.rpc('exec_sql_with_result', {
              query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${fileData.table_name}' ORDER BY ordinal_position`
            });
            
            if (structureError) {
              console.warn("⚠️ Could not verify table structure:", structureError);
            } else {
              console.log(`🏗️ Table structure:`, structureData?.slice(0, 5)); // Show first 5 columns
            }
          }
        } catch (verifyErr) {
          console.warn("⚠️ Table verification failed:", verifyErr);
        }
        
        // Log detailed execution results for debugging
        console.log("\n📋 Detailed Execution Results:");
        executedResults.forEach((result, index) => {
          if (result.success) {
            console.log(`✅ KPI ${index + 1}: ${result.metricName}`);
            console.log(`   Y-Axis Results: ${result.yAxisResults?.length || 0} rows`);
            console.log(`   X-Axis Results: ${result.xAxisResults?.length || 0} rows`);
            console.log(`   Sample Y-Axis:`, result.yAxisResults?.slice(0, 2));
            console.log(`   Sample X-Axis:`, result.xAxisResults?.slice(0, 2));
          } else {
            console.log(`❌ KPI ${index + 1}: ${result.metricName} - ${result.error}`);
          }
        });
        
        // Clean up the temp table manager instance
        tempTableManager.cleanup();
      }
    } catch (executionError) {
      console.error("Error during SQL execution and cleanup:", executionError);
      // Don't fail the request if execution/cleanup fails
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
