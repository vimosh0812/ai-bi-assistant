import { NextResponse } from "next/server";
import OpenAI from "openai";
import { OpenAIKPIAnalysis } from "@/types/kpi";

export const dynamic = 'force-dynamic';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Analyze column values to categorize them for better chart generation
function analyzeColumnValues(data: any[], headers: string[]) {
  const analysis: {
    [key: string]: {
      type: 'categorical' | 'continuous' | 'mixed' | 'many_values';
      uniqueValues: number;
      sampleValues: any[];
      isNumeric: boolean;
      isDate: boolean;
      isString: boolean;
      valueRange?: { min: any; max: any };
    }
  } = {};

  headers.forEach(header => {
    const values = data.map(row => row[header]).filter(val => 
      val !== null && val !== undefined && val !== ''
    );
    
    const uniqueValues = [...new Set(values)];
    const uniqueCount = uniqueValues.length;
    
    // Check if values are numeric
    const numericValues = values.filter(val => 
      typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))
    );
    const isNumeric = numericValues.length === values.length && values.length > 0;
    
    // Check if values are dates
    const dateValues = values.filter(val => 
      typeof val === 'string' && !isNaN(Date.parse(val))
    );
    const isDate = dateValues.length === values.length && values.length > 0;
    
    // Check if values are strings
    const isString = values.every(val => typeof val === 'string');
    
    // Determine column type
    let type: 'categorical' | 'continuous' | 'mixed' | 'many_values';
    if (uniqueCount <= 10 && !isNumeric) {
      type = 'categorical';
    } else if (isNumeric && uniqueCount > 10) {
      type = 'continuous';
    } else if (uniqueCount > 10) {
      type = 'many_values'; // Mark as having too many unique values
    } else {
      type = 'mixed';
    }
    
    // Get value range for numeric columns
    let valueRange;
    if (isNumeric && numericValues.length > 0) {
      const numValues = numericValues.map(val => 
        typeof val === 'number' ? val : Number(val)
      );
      valueRange = {
        min: Math.min(...numValues),
        max: Math.max(...numValues)
      };
    }
    
    analysis[header] = {
      type,
      uniqueValues: uniqueCount,
      sampleValues: uniqueValues.slice(0, 10), // First 10 unique values
      isNumeric,
      isDate,
      isString,
      valueRange
    };
  });
  
  return analysis;
}

export async function POST(req: Request) {
  try {
    const { headers, rows, fileId } = await req.json();
    
    if (!headers || !rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Missing headers or rows" }, { status: 400 });
    }

    // fileId is optional for this endpoint
    console.log("Generating KPI analysis for fileId:", fileId || "preview");

    // Take 20 rows for better analysis: first 2, last 2, and 16 random rows
    const filteredRows = rows.filter(r => Object.values(r).some(v => typeof v === "string" && v.trim() !== ""))
    
    let sampleRows = []
    
    if (filteredRows.length <= 20) {
      // If we have 20 or fewer rows, use all of them
      sampleRows = filteredRows
    } else {
      // Take first 2 rows
      sampleRows.push(...filteredRows.slice(0, 2))
      
      // Take last 2 rows
      sampleRows.push(...filteredRows.slice(-2))
      
      // Take 16 random rows from the middle
      const middleRows = filteredRows.slice(2, -2)
      const randomMiddleRows = middleRows
        .sort(() => 0.5 - Math.random())
        .slice(0, 16)
      
      sampleRows.push(...randomMiddleRows)
    }
    
    console.log(`Using ${sampleRows.length} rows for KPI analysis (first 2, last 2, and random middle rows)`);
    console.log(`Total dataset size: ${rows.length} rows`);
    console.log(`Sample data sent to OpenAI: ${sampleRows.length} rows`);

    // Analyze column values to help OpenAI understand data structure
    const columnAnalysis = analyzeColumnValues(sampleRows, headers);
    console.log("Column analysis:", columnAnalysis);

    const preview = sampleRows.map((row, i) => `${i + 1}. ${JSON.stringify(row)}`).join("\n");

    const prompt = `You are an expert data analyst and KPI specialist. 
    Analyze the provided dataset and generate comprehensive KPI analysis.
    
    Dataset Information:
    Headers: ${headers.join(", ")}
    Sample Data:
    ${preview}
    
    COLUMN ANALYSIS (Critical for chart generation):
    ${Object.entries(columnAnalysis).map(([column, analysis]) => {
      let analysisText = `- ${column}: ${analysis.type.toUpperCase()}`;
      analysisText += ` (${analysis.uniqueValues} unique values)`;
      
      if (analysis.type === 'categorical') {
        analysisText += ` - Perfect for X-axis labels. Sample values: [${analysis.sampleValues.join(', ')}]`;
      } else if (analysis.type === 'continuous') {
        analysisText += ` - Numeric data, good for Y-axis values`;
        if (analysis.valueRange) {
          analysisText += `. Range: ${analysis.valueRange.min} to ${analysis.valueRange.max}`;
        }
      } else if (analysis.type === 'many_values') {
        analysisText += ` - TOO MANY UNIQUE VALUES (${analysis.uniqueValues}) - DO NOT USE for X-axis labels`;
      } else if (analysis.type === 'mixed') {
        analysisText += ` - Mixed data type, use carefully`;
      }
      
      if (analysis.isDate) {
        analysisText += ` - DATE column, good for time-series analysis`;
      }
      
      return analysisText;
    }).join('\n')}
    
    CHART GENERATION RULES:
    - Use CATEGORICAL columns (≤10 unique values) for X-axis labels ONLY
    - Use CONTINUOUS columns (numeric, many values) for Y-axis values ONLY
    - Use DATE columns for time-series charts (LINE charts)
    - NEVER use MANY_VALUES columns (>10 unique values) for X-axis labels
    - Generate X-axis queries to get unique values from categorical columns only
    - Generate Y-axis queries to aggregate continuous columns by categorical groups
    - If no suitable categorical columns exist, create summary charts instead of grouped charts
    
    TIME-SERIES CHART RULES:
    - For DATE columns: Generate LINE charts with time on X-axis
    - Prioritize YEARLY analysis over monthly analysis to avoid redundancy
    - Only create monthly analysis if it provides significantly different insights
    - Use SQL functions: YEAR(date_column), MONTH(date_column)
    - Group by time periods and aggregate metrics
    - Focus on years primarily, months only when necessary for detailed trends
    
    PIE CHART RULES:
    - For CATEGORICAL columns (≤10 unique values): Generate PIE or DOUGHNUT charts
    - Focus on business context: distribution, market share, composition
    - Use COUNT() or SUM() for pie chart values
    - Create meaningful business titles
    
    IMPORTANT: Only generate KPIs that are actually applicable to this dataset. Do not force irrelevant metrics.
    
    For each KPI, provide:
    1. A SQL query that calculates the metric (use GROUP BY with categorical columns)
    2. A clear description of what the metric measures
    3. The most appropriate chart type based on data types:
       - BAR: categorical X-axis + continuous Y-axis
       - LINE: date/time X-axis + continuous Y-axis  
       - PIE/DOUGHNUT: categorical data with counts/percentages
       - SCATTER: two continuous variables
    4. Chart configuration with proper xAxis and yAxis column names
    5. X-axis query - SELECT DISTINCT [categorical_column] FROM data ORDER BY [categorical_column]
    
    POTENTIAL KPIs (only include if applicable to the data):
    1. CHURN ANALYSIS - Only if there are customer/user identifiers and time-based data
    2. ROI ANALYSIS - Only if there are financial columns (revenue, cost, profit, etc.)
    3. OTIF ANALYSIS - Only if there are delivery/shipping related columns
    4. REVENUE ANALYSIS - If there are revenue/sales columns
    5. GROWTH ANALYSIS - If there are time-series or growth indicators
    6. PERFORMANCE ANALYSIS - If there are performance metrics
    7. CUSTOMER ANALYSIS - If there are customer-related columns
    8. OPERATIONAL ANALYSIS - If there are operational metrics
    
    TIME-SERIES ANALYSIS REQUIREMENTS:
    - If DATE columns are found, prioritize YEARLY analysis for high-level trends
    - Only create monthly analysis if it reveals different patterns than yearly
    - Avoid creating both "Total Sales by Year" and "Total Sales by Month" - choose the most meaningful one
    - Use appropriate date functions in SQL (YEAR(), MONTH(), etc.)
    - Generate line charts for time-series data (years preferred, months only when necessary)
    
    PIE CHART REQUIREMENTS:
    - For CATEGORICAL columns (≤10 unique values), generate PIE or DOUGHNUT charts
    - Focus on business context: market share, distribution, composition
    - Examples: Product category distribution, Customer segment breakdown, Region analysis
    - Use meaningful business titles and descriptions
    
    Generate 6 relevant KPIs based on what makes sense for this specific dataset.
    Prioritize time-series analysis if date columns exist, and pie charts for categorical data.
    
    IMPORTANT: Avoid creating duplicate or redundant metrics. For example:
    - Don't create both "Total Sales by Year" and "Total Sales by Month" - choose the most meaningful one
    - Don't create multiple metrics that show the same data with different time granularities
    - Focus on unique insights and different aspects of the data
    
    Return a JSON object with this structure (only include applicable KPIs):
    {
      "metrics": [
        {
          "name": "Metric Name",
          "sqlQuery": "SELECT [categorical_column], SUM/COUNT/AVG([continuous_column]) as metric_value FROM data GROUP BY [categorical_column] ORDER BY metric_value DESC",
          "xAxisQuery": "SELECT DISTINCT [categorical_column] FROM data ORDER BY [categorical_column]",
          "description": "Clear description of what this metric measures",
          "chartType": "bar|line|pie|area|donut|scatter",
          "chartConfig": {
            "title": "Descriptive Chart Title",
            "xAxis": "[categorical_column_name]",
            "yAxis": "[continuous_column_name]", 
            "groupBy": "[categorical_column_name]",
               "colors": ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9"],
            "dataLabels": true
          },
          "category": "financial|operational|customer|growth|efficiency|churn|roi|otif"
        }
      ],
      "summary": "Overall summary of the KPI analysis and insights based on the data structure"
    }
    
    Important SQL Guidelines:
    - Use proper column names from the headers exactly as they appear
    - For X-axis queries: Use ONLY categorical columns (≤10 unique values) with SELECT DISTINCT
    - NEVER use columns with >10 unique values for X-axis labels
    - For Y-axis queries: Use GROUP BY with categorical columns and aggregate continuous columns
    - If no categorical columns exist, create summary queries without GROUP BY
    - Use appropriate aggregate functions:
      * COUNT(*) for counting records
      * SUM() for totaling numeric values  
      * AVG() for averaging numeric values
      * MAX()/MIN() for ranges
    - Always include ORDER BY for consistent results
    - Use proper column names in chartConfig.xAxis and chartConfig.yAxis
    - Make queries executable against the actual data structure
    - Include proper aliases for calculated fields (e.g., "as total_revenue")
    - For time-series: use date columns in ORDER BY for chronological order
    
    TIME-SERIES SQL GUIDELINES:
    - For yearly analysis: GROUP BY YEAR(date_column), ORDER BY YEAR(date_column)
    - For monthly analysis: GROUP BY YEAR(date_column), MONTH(date_column), ORDER BY YEAR, MONTH
    - Use date functions: YEAR(), MONTH(), DATE_FORMAT()
    - Prefer yearly analysis unless monthly reveals significantly different insights
    - Avoid creating redundant metrics - choose the most meaningful time granularity
    - Avoid daily granularity - focus on years primarily, months when necessary
    
    PIE CHART SQL GUIDELINES:
    - For categorical data: SELECT categorical_column, COUNT(*) as count FROM data GROUP BY categorical_column
    - For business context: SELECT category, SUM(value) as total FROM data GROUP BY category
    - Use meaningful business column names in results
    - Order by count/total DESC for better visualization`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert data analyst and KPI specialist with deep knowledge of business metrics and data visualization." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    // Print token usage
    console.log("OpenAI Token Usage:");
    console.log("- Prompt tokens:", completion.usage?.prompt_tokens || "N/A");
    console.log("- Completion tokens:", completion.usage?.completion_tokens || "N/A");
    console.log("- Total tokens:", completion.usage?.total_tokens || "N/A");

    const rawResponse = completion.choices[0]?.message?.content ?? "{}";
    console.log("OpenAI KPI Analysis raw response:", rawResponse);

    let parsed: OpenAIKPIAnalysis;
    try {
      // Clean up the response to ensure valid JSON
      const cleanedResponse = rawResponse
        .replace(/^```json\s*/, "")
        .replace(/```$/, "")
        .trim();
      
      parsed = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Failed to parse OpenAI KPI response:", parseError);
      console.log("Raw response that failed to parse:", rawResponse);
      
      // Return a fallback structure
      parsed = {
        metrics: [
          {
            name: "Data Overview",
            sqlQuery: "SELECT COUNT(*) as total_records FROM data",
            xAxisQuery: "SELECT DISTINCT 'Total Records' as label FROM data",
            description: "Basic data overview analysis",
            chartType: "bar",
            chartConfig: {
              title: "Data Overview",
              xAxis: "label",
              yAxis: "count",
              colors: ["#3B82F6"],
              dataLabels: true
            },
            category: "operational"
          }
        ],
        summary: "KPI analysis generated with fallback metrics due to parsing error."
      };
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("KPI Analysis error:", err);
    return NextResponse.json(
      { error: "Failed to generate KPI analysis" },
      { status: 500 }
    );
  }
}
