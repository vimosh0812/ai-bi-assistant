import { NextResponse } from "next/server";
import OpenAI from "openai";
import { OpenAIKPIAnalysis } from "@/types/kpi";
import { filterIdColumns, filterIdColumnsFromData } from "@/lib/utils";

// Force dynamic rendering
export const dynamic = 'force-dynamic'

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

    // Filter out 'id' columns first (conflicts with PRIMARY KEY)
    const { filteredHeaders: headersWithoutId, idColumnsRemoved } = filterIdColumns(headers);
    const filteredData = filterIdColumnsFromData(rows, headers, headersWithoutId);
    
    if (idColumnsRemoved.length > 0) {
      console.log(`⚠️ Removed ${idColumnsRemoved.length} 'id' column(s) from KPI analysis:`, idColumnsRemoved);
    }

    // Take 20 rows for better analysis: first 2, last 2, and 16 random rows
    const filteredRows = filteredData.filter(r => Object.values(r).some(v => typeof v === "string" && v.trim() !== ""))
    
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
    // IMPORTANT: Use ALL rows for unique values calculation, not just sample rows
    // Use filtered headers (without 'id' columns)
    const columnAnalysis = analyzeColumnValues(filteredRows, headersWithoutId);
    console.log("Column analysis (calculated from ALL rows):", columnAnalysis);

    const preview = sampleRows.map((row, i) => `${i + 1}. ${JSON.stringify(row)}`).join("\n");

    // Sanitize headers to match database column names (lowercase with underscores)
    // Use filtered headers (without 'id' columns)
    const sanitizedHeaders = headersWithoutId.map((header: string) => 
      header.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    );
    
    const prompt = `You are an expert data analyst and KPI specialist. 
    Analyze the provided dataset and generate comprehensive KPI analysis.
    
    Dataset Information:
    Headers: ${headersWithoutId.join(", ")}
    Database Column Names: ${sanitizedHeaders.join(", ")}
    ${idColumnsRemoved.length > 0 ? `\n⚠️ Note: The following 'id' column(s) were removed to avoid conflicts: ${idColumnsRemoved.join(", ")}` : ''}
    Sample Data:
    ${preview}
    
    COLUMN ANALYSIS (Critical for chart generation):
    ${Object.entries(columnAnalysis).map(([column, analysis], index) => {
      const sanitizedColumn = sanitizedHeaders[index] || column.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
      let analysisText = `- ${column} (${sanitizedColumn}): ${analysis.type.toUpperCase()}`;
      analysisText += ` (${analysis.uniqueValues} unique values)`;
      
      if (analysis.type === 'categorical') {
        analysisText += ` - Perfect for X-axis labels. Sample values: [${analysis.sampleValues.join(', ')}]`;
      } else if (analysis.type === 'continuous') {
        analysisText += ` - Numeric data, good for Y-axis values`;
        if (analysis.valueRange) {
          analysisText += `. Range: ${analysis.valueRange.min} to ${analysis.valueRange.max}`;
        }
        analysisText += ` - REQUIRES CAST(${sanitizedColumn} AS NUMERIC) for calculations`;
      } else if (analysis.type === 'many_values') {
        analysisText += ` - TOO MANY UNIQUE VALUES (${analysis.uniqueValues}) - DO NOT USE for X-axis labels`;
      } else if (analysis.type === 'mixed') {
        analysisText += ` - Mixed data type, use carefully`;
      }
      
      if (analysis.isDate) {
        analysisText += ` - DATE column, good for time-series analysis - Use preprocessed Date_year, Date_month, Date_day columns with CAST(column AS NUMERIC)`;
      }
      
      return analysisText;
    }).join('\n')}
    
    ⚠️ CRITICAL DATA TYPE WARNING:
    All data in the database is stored as TEXT, so you MUST use CAST() functions for any numeric operations:
    - Numeric columns need CAST(column_name AS NUMERIC) for calculations
    - Date columns are preprocessed as separate columns: Date_year, Date_month, Date_day (cast as NUMERIC)
    - Always cast before performing SUM(), AVG(), MAX(), MIN(), or any arithmetic operations
    - Examples: SUM(CAST(Price AS NUMERIC)), AVG(CAST(Revenue AS NUMERIC)), CAST(Date_year AS NUMERIC)
    - Date examples: GROUP BY CAST(Date_year AS NUMERIC), ORDER BY CAST(Date_year AS NUMERIC)
    - REMINDER: Every time you write a numeric operation, ask yourself "Did I cast it to NUMERIC?"
    
    DATABASE SYSTEM: You are generating PostgreSQL SQL queries - use PostgreSQL syntax and functions.
    
    COLUMN NAME MAPPING:
    - Use the "Database Column Names" (sanitized versions) in your SQL queries
    - Original headers are for reference only - use sanitized names in SQL
    - Example: "Payment Method" becomes "payment_method" in SQL queries
    - Example: "Total Revenue" becomes "total_revenue" in SQL queries
    
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
    - Use LINE charts when there are MORE THAN 3 months OR MORE THAN 3 years of data
    - Use BAR charts when there are 3 or fewer time periods (for better readability)
    - For monthly data with 4+ months: Use LINE chart to show continuous trend
    - For yearly data with 4+ years: Use LINE chart to show continuous trend
    - For 2-3 months or 2-3 years: Use BAR chart for better comparison
    - Prioritize YEARLY analysis over monthly analysis to avoid redundancy
    - Only create monthly analysis if it provides significantly different insights
    - Use SQL functions: YEAR(date_column), MONTH(date_column)
    - Group by time periods and aggregate metrics
    - Focus on years primarily, months only when necessary for detailed trends
    
    OLAP (Online Analytical Processing) FEATURES:
    - For monthly data spanning multiple months, consider QUARTER-based aggregation (Q1, Q2, Q3, Q4)
    - Quarter aggregation provides better trend visualization for longer time periods
    - Use quarter queries when you have 6+ months of data to show quarterly trends
    - Format quarter labels as "2021 Q1", "2021 Q2", etc.
    - Quarter SQL: GROUP BY year, CASE WHEN month <= 3 THEN 1 WHEN month <= 6 THEN 2 WHEN month <= 9 THEN 3 ELSE 4 END
    - Quarter aggregation helps identify seasonal patterns and business cycles
    
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
    
    IMPORTANT: All numeric calculations MUST use CAST() functions since data is stored as TEXT:
    - Use SUM(CAST(Price AS NUMERIC)) instead of SUM(Price)
    - Use AVG(CAST(Revenue AS NUMERIC)) instead of AVG(Revenue)
    - Use CAST(Date_year AS NUMERIC), CAST(Date_month AS NUMERIC), CAST(Date_day AS NUMERIC) for date operations
    - REMEMBER: Always cast numeric columns to NUMERIC type for any mathematical operations
    
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
    REMEMBER: Always use CAST(column AS NUMERIC) for any numeric operations!
    REMEMBER: Generate PostgreSQL SQL queries - use PostgreSQL syntax and functions!
    REMEMBER: Use sanitized column names (lowercase with underscores) in SQL queries!
    {
      "metrics": [
        {
          "name": "Metric Name",
          "sqlQuery": "SELECT [sanitized_categorical_column], SUM(CAST([sanitized_continuous_column] AS NUMERIC)) as metric_value FROM data GROUP BY [sanitized_categorical_column] ORDER BY metric_value DESC",
          "xAxisQuery": "SELECT DISTINCT [sanitized_categorical_column] FROM data ORDER BY [sanitized_categorical_column]",
          "description": "Clear description of what this metric measures",
          "chartType": "bar|line|pie|area|donut|scatter",
          "chartConfig": {
            "title": "Descriptive Chart Title",
            "xAxis": "[categorical_column_name]",
            "yAxis": "[continuous_column_name]", 
            "groupBy": "[categorical_column_name]",
            "dataLabels": true
          },
          NOTE: Do NOT include "colors" in chartConfig - colors are automatically applied by the system based on chart type.
          "category": "financial|operational|customer|growth|efficiency|churn|roi|otif"
        }
      ],
      "summary": "Overall summary of the KPI analysis and insights based on the data structure"
    }
    
    Important SQL Guidelines (PostgreSQL):
    - Use sanitized column names from "Database Column Names" in your SQL queries
    - For X-axis queries: Use ONLY categorical columns (≤10 unique values) with SELECT DISTINCT
    - NEVER use columns with >10 unique values for X-axis labels
    - For Y-axis queries: Use GROUP BY with categorical columns and aggregate continuous columns
    - If no categorical columns exist, create summary queries without GROUP BY
    - Use appropriate PostgreSQL aggregate functions:
      * COUNT(*) for counting records
      * SUM() for totaling numeric values  
      * AVG() for averaging numeric values
      * MAX()/MIN() for ranges
    - Always include ORDER BY for consistent results
    - Use sanitized column names in chartConfig.xAxis and chartConfig.yAxis
    - Make queries executable against the actual data structure
    - Include proper aliases for calculated fields (e.g., "as total_revenue")
    - For time-series: use date columns in ORDER BY for chronological order
    - Use PostgreSQL syntax: CAST(column AS NUMERIC), column::NUMERIC, etc.
    - CRITICAL: Always use sanitized column names (lowercase with underscores) in SQL queries
    
    CRITICAL: All data is stored as TEXT in the database, so you MUST cast numeric columns:
    - For calculations: CAST(column_name AS NUMERIC) or column_name::NUMERIC
    - For aggregations: SUM(CAST(column_name AS NUMERIC)) or SUM(column_name::NUMERIC)
    - For comparisons: WHERE CAST(column_name AS NUMERIC) > 100
    - For date operations: Use preprocessed date columns (Date_year, Date_month, Date_day) as NUMERIC
    - ALWAYS REMEMBER: When you see numeric values, immediately think CAST(column AS NUMERIC)
    - Examples:
      * SUM(CAST(Price AS NUMERIC)) instead of SUM(Price)
      * AVG(CAST(Revenue AS NUMERIC)) instead of AVG(Revenue)
      * WHERE CAST(Age AS NUMERIC) > 18 instead of WHERE Age > 18
      * SUM(CAST(Price AS NUMERIC) * CAST(Quantity AS NUMERIC)) for calculations
      * AVG(CAST(Salary AS NUMERIC)) for averages
      * MAX(CAST(Revenue AS NUMERIC)) for maximum values
      * MIN(CAST(Cost AS NUMERIC)) for minimum values
      * For dates: CAST(Date_year AS NUMERIC), CAST(Date_month AS NUMERIC), CAST(Date_day AS NUMERIC)
    
    TIME-SERIES SQL GUIDELINES (PostgreSQL with preprocessed date columns):
    - For yearly analysis: GROUP BY CAST(Date_year AS NUMERIC), ORDER BY CAST(Date_year AS NUMERIC)
    - For monthly analysis: GROUP BY CAST(Date_year AS NUMERIC), CAST(Date_month AS NUMERIC), ORDER BY CAST(Date_year AS NUMERIC), CAST(Date_month AS NUMERIC)
    - For quarterly analysis (OLAP): 
      SELECT CAST(Date_year AS NUMERIC) as year,
             CASE 
               WHEN CAST(Date_month AS NUMERIC) <= 3 THEN 1
               WHEN CAST(Date_month AS NUMERIC) <= 6 THEN 2
               WHEN CAST(Date_month AS NUMERIC) <= 9 THEN 3
               ELSE 4
             END as quarter,
             SUM(CAST(value_column AS NUMERIC)) as total_value
      FROM data
      GROUP BY CAST(Date_year AS NUMERIC), 
               CASE 
                 WHEN CAST(Date_month AS NUMERIC) <= 3 THEN 1
                 WHEN CAST(Date_month AS NUMERIC) <= 6 THEN 2
                 WHEN CAST(Date_month AS NUMERIC) <= 9 THEN 3
                 ELSE 4
               END
      ORDER BY year, quarter
    - For daily analysis: GROUP BY CAST(Date_year AS NUMERIC), CAST(Date_month AS NUMERIC), CAST(Date_day AS NUMERIC)
    - Use preprocessed columns: Date_year, Date_month, Date_day (all stored as TEXT, cast to NUMERIC)
    - Use PostgreSQL date functions when needed: EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
    - Prefer yearly analysis unless monthly reveals significantly different insights
    - Use quarterly aggregation when you have 6+ months of data for better trend visualization
    - Avoid creating redundant metrics - choose the most meaningful time granularity
    - Avoid daily granularity - focus on years primarily, months/quarters when necessary
    
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

    // Log token usage
    const inputTokens = completion.usage?.prompt_tokens || 0;
    const totalTokens = completion.usage?.total_tokens || 0;
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
