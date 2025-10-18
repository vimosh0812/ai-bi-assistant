import { NextResponse } from "next/server";
import OpenAI from "openai";
import { OpenAIKPIAnalysis } from "@/types/kpi";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Analyze column values to categorize them for better chart generation
function analyzeColumnValues(data: any[], headers: string[]) {
  const analysis: {
    [key: string]: {
      type: 'categorical' | 'continuous' | 'mixed' | 'many_values' | 'year' | 'month' | 'day' | 'time';
      uniqueValues: number;
      sampleValues: any[];
      isNumeric: boolean;
      isDate: boolean;
      isString: boolean;
      valueRange?: { min: any; max: any };
      isPreprocessedDate?: boolean;
      originalDateColumn?: string;
    }
  } = {};

  // First pass: identify preprocessed date columns
  const dateColumnGroups: { [key: string]: string[] } = {};
  headers.forEach(header => {
    if (header.endsWith('_year')) {
      const baseColumn = header.replace('_year', '');
      if (!dateColumnGroups[baseColumn]) dateColumnGroups[baseColumn] = [];
      dateColumnGroups[baseColumn].push('year');
    } else if (header.endsWith('_month')) {
      const baseColumn = header.replace('_month', '');
      if (!dateColumnGroups[baseColumn]) dateColumnGroups[baseColumn] = [];
      dateColumnGroups[baseColumn].push('month');
    } else if (header.endsWith('_day')) {
      const baseColumn = header.replace('_day', '');
      if (!dateColumnGroups[baseColumn]) dateColumnGroups[baseColumn] = [];
      dateColumnGroups[baseColumn].push('day');
    } else if (header.endsWith('_time')) {
      const baseColumn = header.replace('_time', '');
      if (!dateColumnGroups[baseColumn]) dateColumnGroups[baseColumn] = [];
      dateColumnGroups[baseColumn].push('time');
    }
  });

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
    
    // Check if this is a preprocessed date column
    let isPreprocessedDate = false;
    let originalDateColumn = '';
    let dateType: 'year' | 'month' | 'day' | 'time' | undefined;
    
    if (header.endsWith('_year')) {
      isPreprocessedDate = true;
      originalDateColumn = header.replace('_year', '');
      dateType = 'year';
    } else if (header.endsWith('_month')) {
      isPreprocessedDate = true;
      originalDateColumn = header.replace('_month', '');
      dateType = 'month';
    } else if (header.endsWith('_day')) {
      isPreprocessedDate = true;
      originalDateColumn = header.replace('_day', '');
      dateType = 'day';
    } else if (header.endsWith('_time')) {
      isPreprocessedDate = true;
      originalDateColumn = header.replace('_time', '');
      dateType = 'time';
    }
    
    // Determine column type
    let type: 'categorical' | 'continuous' | 'mixed' | 'many_values' | 'year' | 'month' | 'day' | 'time';
    
    if (isPreprocessedDate) {
      type = dateType!;
    } else if (uniqueCount <= 10 && !isNumeric) {
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
      valueRange,
      isPreprocessedDate,
      originalDateColumn
    };
  });
  
  return { analysis, dateColumnGroups };
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
    const { analysis: columnAnalysis, dateColumnGroups } = analyzeColumnValues(sampleRows, headers);
    console.log("Column analysis:", columnAnalysis);
    console.log("Date column groups:", dateColumnGroups);

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
      } else if (analysis.type === 'year') {
        analysisText += ` - PREPROCESSED YEAR column (${analysis.uniqueValues} unique years) - PERFECT for year-wise analysis`;
        if (analysis.uniqueValues >= 2 && analysis.uniqueValues <= 5) {
          analysisText += ` - IDEAL for year-wise bar chart comparisons (2-5 years)`;
        } else if (analysis.uniqueValues > 5) {
          analysisText += ` - Good for line charts showing trends over many years`;
        }
      } else if (analysis.type === 'month') {
        analysisText += ` - PREPROCESSED MONTH column (${analysis.uniqueValues} unique months) - Perfect for monthly analysis`;
      } else if (analysis.type === 'day') {
        analysisText += ` - PREPROCESSED DAY column - Use for day-of-month analysis`;
      } else if (analysis.type === 'time') {
        analysisText += ` - PREPROCESSED TIME column - Use for hourly analysis`;
      }
      
      if (analysis.isDate) {
        analysisText += ` - DATE column, good for time-series analysis`;
      }
      
      if (analysis.isPreprocessedDate) {
        analysisText += ` - Part of preprocessed date group: ${analysis.originalDateColumn}`;
      }
      
      return analysisText;
    }).join('\n')}
    
    PREPROCESSED DATE COLUMNS AVAILABLE:
    ${Object.entries(dateColumnGroups).map(([baseColumn, types]) => {
      return `- ${baseColumn}: [${types.join(', ')}] - Use these for time-based analysis instead of raw date columns`;
    }).join('\n')}
    
    CHART GENERATION RULES:
    - Use CATEGORICAL columns (≤10 unique values) for X-axis labels ONLY
    - Use CONTINUOUS columns (numeric, many values) for Y-axis values ONLY
    - Use PREPROCESSED DATE columns (year, month, day, time) for time-based analysis
    - NEVER use MANY_VALUES columns (>10 unique values) for X-axis labels
    - Generate X-axis queries to get unique values from categorical columns only
    - Generate Y-axis queries to aggregate continuous columns by categorical groups
    - If no suitable categorical columns exist, create summary charts instead of grouped charts
    
    PREPROCESSED DATE COLUMN RULES (PRIORITY):
    - For YEAR columns with 2-5 unique values: Use BAR charts for year-wise comparisons
    - For YEAR columns with >5 unique values: Use LINE charts for trend analysis
    - For MONTH columns: Use BAR or LINE charts for monthly analysis
    - For DAY columns: Use BAR charts for day-of-month analysis
    - For TIME columns: Use BAR charts for hourly analysis
    - ALWAYS prefer preprocessed date columns over raw date columns
    - Use the original date column name in chart titles (e.g., "order_date_year" becomes "Order Date by Year")
    
    TIME-SERIES CHART RULES:
    - PRIORITY: Use preprocessed YEAR, MONTH, DAY columns instead of raw date columns
    - For YEAR columns: Generate yearly analysis with appropriate chart type based on unique count
    - For MONTH columns: Generate monthly analysis within years
    - For DAY columns: Generate day-of-month analysis
    - Create separate metrics for different time granularities
    - Focus on business-relevant time periods
    
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
    - If DATE columns are found, generate YEARLY and MONTHLY analysis
    - Create separate metrics for yearly trends and monthly breakdowns
    - Use appropriate date functions in SQL (YEAR(), MONTH(), etc.)
    - Generate line charts for time-series data (months/years only, not days)
    
    PIE CHART REQUIREMENTS:
    - For CATEGORICAL columns (≤10 unique values), generate PIE or DOUGHNUT charts
    - Focus on business context: market share, distribution, composition
    - Examples: Product category distribution, Customer segment breakdown, Region analysis
    - Use meaningful business titles and descriptions
    
    Generate 5-7 relevant KPIs based on what makes sense for this specific dataset.
    Prioritize time-series analysis if date columns exist, and pie charts for categorical data.
    
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
    
    PREPROCESSED DATE SQL GUIDELINES (PRIORITY):
    - For yearly analysis: GROUP BY [column_name]_year, ORDER BY [column_name]_year
    - For monthly analysis: GROUP BY [column_name]_year, [column_name]_month, ORDER BY [column_name]_year, [column_name]_month
    - For day analysis: GROUP BY [column_name]_day, ORDER BY [column_name]_day
    - For time analysis: GROUP BY [column_name]_time, ORDER BY [column_name]_time
    - Use the preprocessed columns directly - NO need for date functions
    - Create separate metrics for different time granularities
    - Focus on business-relevant time periods
    
    TIME-SERIES SQL GUIDELINES (FALLBACK):
    - For yearly analysis: GROUP BY YEAR(date_column), ORDER BY YEAR(date_column)
    - For monthly analysis: GROUP BY YEAR(date_column), MONTH(date_column), ORDER BY YEAR, MONTH
    - Use date functions: YEAR(), MONTH(), DATE_FORMAT()
    - Create separate metrics for yearly trends and monthly breakdowns
    - Avoid daily granularity - focus on months and years only
    
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
