import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = 'force-dynamic';

interface KPIMetricAnalysis {
  name: string;
  sqlQuery: string;
  xAxisQuery: string;
  description: string;
  chartType: string;
  chartConfig: {
    title: string;
    xAxis?: string;
    yAxis?: string;
    groupBy?: string;
    colors?: string[];
    dataLabels?: boolean;
  };
  category: string;
}

interface OpenAIKPIAnalysis {
  metrics: KPIMetricAnalysis[];
  summary: string;
}

interface ExecutionResult {
  id: string;
  metric_name: string;
  metric_index: number;
  sql_query: string;
  x_axis_query: string | null;
  y_axis_results: any;
  x_axis_results: any;
  execution_success: boolean;
}

// Helper function to map sanitized column names to original headers
function mapToOriginalHeader(sanitizedName: string, originalHeaders: string[]): string {
  // Safety check: ensure originalHeaders is an array
  if (!Array.isArray(originalHeaders)) {
    console.warn("⚠️ [mapToOriginalHeader] originalHeaders is not an array:", typeof originalHeaders, originalHeaders);
    return sanitizedName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  const normalized = sanitizedName.toLowerCase().replace(/_/g, ' ');
  
  const exactMatch = originalHeaders.find(h => 
    h.toLowerCase().replace(/[^a-z0-9]/g, ' ') === normalized
  );
  if (exactMatch) return exactMatch;
  
  const partialMatch = originalHeaders.find(h => 
    h.toLowerCase().includes(normalized) || normalized.includes(h.toLowerCase())
  );
  if (partialMatch) return partialMatch;
  
  return sanitizedName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export async function POST(request: NextRequest) {
  try {
    const { fileId } = await request.json();
    
    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId parameter" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Get file information with original headers
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Check if KPI analysis exists
    if (!file.has_kpi_analysis || !file.kpi_analysis_id) {
      return NextResponse.json({ 
        error: "KPI analysis not found. Please generate KPI analysis first." 
      }, { status: 400 });
    }

    // 2. Get KPI analysis data
    const { data: kpiAnalysisData, error: kpiError } = await supabase
      .from("kpi_analyses")
      .select("*")
      .eq("id", file.kpi_analysis_id)
      .eq("user_id", user.id)
      .single();

    if (kpiError || !kpiAnalysisData) {
      return NextResponse.json({ error: "KPI analysis not found" }, { status: 404 });
    }

    const kpiAnalysis = kpiAnalysisData.analysis_data as OpenAIKPIAnalysis;

    // 3. Get execution results (Y-axis data)
    const { data: executionResults, error: execError } = await supabase
      .from("kpi_execution_results")
      .select("*")
      .eq("kpi_analysis_id", file.kpi_analysis_id)
      .eq("execution_success", true)
      .order("metric_index");

    if (execError) {
      console.error("Error fetching execution results:", execError);
      return NextResponse.json({ 
        error: "Failed to fetch execution results" 
      }, { status: 500 });
    }

    // 4. Get original headers from file
    // Ensure originalHeaders is always an array
    let originalHeaders: string[] = [];
    if (file.original_headers) {
      if (Array.isArray(file.original_headers)) {
        originalHeaders = file.original_headers;
      } else if (typeof file.original_headers === 'string') {
        // If it's a string, try to parse it as JSON
        try {
          const parsed = JSON.parse(file.original_headers);
          originalHeaders = Array.isArray(parsed) ? parsed : [];
        } catch {
          // If parsing fails, treat as comma-separated string
          originalHeaders = file.original_headers.split(',').map((h: string) => h.trim()).filter((h: string) => h.length > 0);
        }
      }
    }
    
    console.log("🔵 [Generate Insights] Original headers:", originalHeaders);
    console.log("🔵 [Generate Insights] Original headers type:", typeof file.original_headers);
    console.log("🔵 [Generate Insights] Original headers is array:", Array.isArray(originalHeaders));

    // 5. Map execution results to metrics with original headers
    const resultsMap = new Map<number, ExecutionResult>();
    (executionResults || []).forEach(result => {
      resultsMap.set(result.metric_index, result);
    });

    // Prepare data for OpenAI - Include ALL KPI analysis data and ALL execution results
    const metricsWithData = kpiAnalysis.metrics.map((metric, index) => {
      const executionResult = resultsMap.get(index);
      const yAxisData = executionResult?.y_axis_results || [];
      const xAxisData = executionResult?.x_axis_results || [];
      
      // Map column names to original headers
      const originalXAxis = metric.chartConfig.xAxis 
        ? mapToOriginalHeader(metric.chartConfig.xAxis, originalHeaders)
        : metric.chartConfig.xAxis || 'Category';
      
      const originalYAxis = metric.chartConfig.yAxis
        ? mapToOriginalHeader(metric.chartConfig.yAxis, originalHeaders)
        : metric.chartConfig.yAxis || 'Value';

      // Combine x-axis and y-axis data for complete context
      // If xAxisData exists, merge it with yAxisData
      let combinedData = yAxisData;
      if (xAxisData && xAxisData.length > 0 && yAxisData && yAxisData.length > 0) {
        // If both exist, combine them into a single array of objects
        combinedData = yAxisData.map((yItem: any, idx: number) => {
          const xItem = xAxisData[idx];
          if (xItem && typeof xItem === 'object' && typeof yItem === 'object') {
            return { ...xItem, ...yItem };
          }
          return yItem;
        });
      }

      return {
        name: metric.name,
        description: metric.description,
        category: metric.category,
        chartType: metric.chartType,
        xAxis: originalXAxis,
        yAxis: originalYAxis,
        // Include ALL data, not just 50 rows
        yAxisData: yAxisData, // All y-axis results
        xAxisData: xAxisData, // All x-axis results
        combinedData: combinedData, // Combined data for better context
        dataCount: yAxisData.length, // Total number of data points
        sqlQuery: metric.sqlQuery,
        xAxisQuery: metric.xAxisQuery || null,
        // Include full chart config
        chartConfig: metric.chartConfig
      };
    });

    console.log("🔵 [Generate Insights] Prepared metricsWithData:", {
      totalMetrics: metricsWithData.length,
      sampleMetric: metricsWithData[0] ? {
        name: metricsWithData[0].name,
        yAxisDataCount: Array.isArray(metricsWithData[0].yAxisData) ? metricsWithData[0].yAxisData.length : 0,
        xAxisDataCount: Array.isArray(metricsWithData[0].xAxisData) ? metricsWithData[0].xAxisData.length : 0,
        combinedDataCount: Array.isArray(metricsWithData[0].combinedData) ? metricsWithData[0].combinedData.length : 0
      } : null
    });

    // 6. Send to OpenAI to generate professional insights document
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const prompt = `You are an expert Business Analyst and Data Insights specialist. Your task is to ANALYZE ALL the provided KPI data together and generate OVERALL INSIGHTS, not per-metric breakdowns.

IMPORTANT FORMATTING REQUIREMENTS:
- This document will be exported as an A4 PDF (210mm × 297mm)
- Consider page height (297mm) and margins (20mm top/bottom, 15mm left/right) when structuring content
- Keep sections concise to fit within A4 page constraints
- Use clear headings and subheadings for readability
- Format tables and lists to be print-friendly
- Ensure content flows logically across pages

Dataset Information:
- File Name: ${file.name}
- Description: ${file.description || 'No description provided'}
- Generated Date: ${formattedDate}
- Total Metrics: ${kpiAnalysis.metrics.length}

Original Column Headers (for reference):
${JSON.stringify(originalHeaders, null, 2)}

Executive Summary from KPI Analysis:
${kpiAnalysis.summary || 'No summary provided'}

KPI Metrics with ALL Data (including all execution results):
${JSON.stringify(metricsWithData, null, 2)}

Note: Each metric includes:
- yAxisData: All Y-axis execution results (complete dataset)
- xAxisData: All X-axis execution results (if available)
- combinedData: Combined X and Y axis data for complete context
- All KPI analysis metadata (name, description, category, chartType, chartConfig, SQL queries)

CRITICAL INSTRUCTIONS - Generate OVERALL INSIGHTS:

1. DO NOT create separate sections for each metric. Instead, ANALYZE ALL DATA TOGETHER:
   - Look at the complete picture across all metrics
   - Identify overarching patterns, trends, and relationships
   - Find connections and correlations between different metrics
   - Calculate overall statistics, averages, and distributions
   - Identify the most significant findings across the entire dataset

2. Generate OVERALL INSIGHTS:
   - Key Findings: What are the 5-7 most important insights when looking at ALL the data together?
   - Overall Trends: What patterns emerge when analyzing all metrics collectively?
   - Performance Overview: Which areas are performing well overall? Which need attention?
   - Data Relationships: How do different metrics relate to each other? What correlations exist?
   - Statistical Summary: Overall statistics, distributions, and key numbers across all data
   - Business Implications: What does the complete data picture tell us about the business?
   - Strategic Recommendations: High-level, actionable recommendations based on the overall analysis

3. Structure the Document:
   - Executive Summary: 2-3 paragraphs synthesizing the most critical overall findings
   - Overall Data Analysis: Deep analysis of all data together (not per metric)
   - Key Insights: Top insights discovered from analyzing all metrics collectively
   - Business Implications: What the overall data means for the business
   - Strategic Recommendations: Prioritized action items based on overall findings
   - Supporting Data: Include key data points/tables only to support your insights (not as primary content)

4. Format Requirements:
   - Professional Business Analyst report style
   - Clean, well-structured HTML with embedded CSS
   - A4 PDF format (210mm × 297mm) with proper margins (20mm top/bottom, 15mm left/right)
   - Print-friendly formatting optimized for A4 page size
   - Use original column names (not sanitized database names)
   - Format numbers with proper thousand separators and decimal places
   - Use visual hierarchy (headings, subheadings, bullet points)
   - Keep content concise to fit A4 pages - avoid excessive length
   - Note: All charts and detailed tables will be included in an Annex section at the end

5. Writing Style:
   - Write like a senior Business Analyst presenting to executives
   - Be concise but comprehensive
   - Use data-driven language ("The overall data shows...", "Analysis across all metrics reveals...")
   - Focus on "So what?" - why does this matter?
   - Provide actionable, strategic recommendations
   - Think holistically - what's the big picture?

IMPORTANT: 
- DO NOT create separate sections for each metric
- DO analyze all data together to find overall patterns and insights
- DO provide a comprehensive, holistic view of what the data tells us
- The document should be INSIGHT-DRIVEN with overall analysis, not a metric-by-metric breakdown

Return ONLY the HTML document, no markdown code blocks, no explanations before or after. Start with <!DOCTYPE html> and end with </html>.`;

    console.log("📤 Sending KPI data to OpenAI for insights document generation...");

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert Business Analyst specializing in data insights and professional report generation. Generate comprehensive, well-formatted HTML documents with embedded CSS for data insights reports."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 4000,
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI API error:", errorText);
      return NextResponse.json({ 
        error: "Failed to generate insights document",
        details: errorText
      }, { status: 500 });
    }

    const openaiData = await openaiResponse.json();
    const insightsDocument = openaiData.choices?.[0]?.message?.content || "";

    if (!insightsDocument || insightsDocument.trim() === "") {
      return NextResponse.json({ 
        error: "OpenAI returned empty response" 
      }, { status: 500 });
    }

    // Clean up the response (remove markdown code blocks if any)
    let cleanedDocument = insightsDocument
      .replace(/^```html\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    // 7. Store the insights document in files.insights column
    const { error: updateError } = await supabase
      .from("files")
      .update({ insights: cleanedDocument })
      .eq("id", fileId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("Error storing insights document:", updateError);
      return NextResponse.json({ 
        error: "Failed to store insights document",
        details: updateError.message
      }, { status: 500 });
    }

    console.log("✅ Insights document generated and stored successfully");

    // 8. Return the document
    return NextResponse.json({
      success: true,
      message: "Insights document generated and stored successfully",
      document: cleanedDocument,
      fileName: file.name
    });

  } catch (error) {
    console.error("Generate insights document error:", error);
    return NextResponse.json(
      { 
        error: "Internal server error", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve stored insights document
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get('fileId');
    const format = searchParams.get('format') || 'html'; // 'html' or 'json'
    
    if (!fileId) {
      return NextResponse.json({ error: "Missing fileId parameter" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get file with insights
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("id, name, insights")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single();

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    if (!file.insights || file.insights.trim() === '') {
      return NextResponse.json({ 
        success: false,
        error: "Insights document not found. Please generate it first.",
        document: null
      }, { status: 200 }); // Return 200 with success: false instead of 404
    }

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        fileName: file.name,
        document: file.insights
      });
    }

    // Return HTML document
    return new NextResponse(file.insights, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="insights-${file.name.replace(/[^a-z0-9]/gi, '_')}.html"`
      }
    });

  } catch (error) {
    console.error("Get insights document error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
