import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// Analyze column values to categorize them (similar to KPI analysis)
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
      typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '')
    );
    const isNumeric = numericValues.length === values.length && values.length > 0;
    
    // Check if values are dates
    const dateValues = values.filter(val => {
      if (typeof val === 'string') {
        const parsed = Date.parse(val);
        return !isNaN(parsed);
      }
      return false;
    });
    const isDate = dateValues.length === values.length && values.length > 0;
    
    // Check if values are strings
    const isString = values.every(val => typeof val === 'string');
    
    // Determine column type
    // For numeric columns: if unique count is reasonable (like age ranges), it could still be categorical
    // But if it has many unique numeric values, it's continuous
    let type: 'categorical' | 'continuous' | 'mixed' | 'many_values';
    if (uniqueCount <= 10 && !isNumeric) {
      type = 'categorical';
    } else if (isNumeric) {
      // For numeric: if unique count > 10, it's continuous (like age 22-63 would be continuous)
      // But if unique count <= 10, it could be categorical (like rating 1-5)
      if (uniqueCount > 10) {
        type = 'continuous';
      } else {
        // Few unique numeric values - treat as categorical (e.g., rating scales)
        type = 'categorical';
      }
    } else if (uniqueCount > 10) {
      type = 'many_values';
    } else {
      type = 'mixed';
    }
    
    // Get value range for numeric columns - ALWAYS calculate for numeric data
    let valueRange;
    if (isNumeric && numericValues.length > 0) {
      const numValues = numericValues.map(val => 
        typeof val === 'number' ? val : Number(val)
      ).filter(v => !isNaN(v)); // Filter out NaN values
      if (numValues.length > 0) {
        valueRange = {
          min: Math.min(...numValues),
          max: Math.max(...numValues)
        };
      }
    } else if (numericValues.length > 0 && numericValues.length < values.length) {
      // Mixed numeric/string - still calculate range for numeric portion
      const numValues = numericValues.map(val => 
        typeof val === 'number' ? val : Number(val)
      ).filter(v => !isNaN(v));
      if (numValues.length > 0) {
        valueRange = {
          min: Math.min(...numValues),
          max: Math.max(...numValues)
        };
      }
    }
    
    // For categorical: store all unique values if <=15, otherwise store up to 15 samples
    const storedValues = uniqueCount <= 15 
      ? uniqueValues 
      : uniqueValues.slice(0, 15);
    
    analysis[header] = {
      type,
      uniqueValues: uniqueCount,
      sampleValues: storedValues, // All values if <=15, otherwise first 15
      isNumeric,
      isDate,
      isString,
      valueRange
    };
  });
  
  return analysis;
}

export async function POST(request: NextRequest) {
  try {
    const { message, fileId, tableName, messages } = await request.json();

    // Better error messages for missing fields
    if (!message) {
      return NextResponse.json({ error: "Missing required field: message" }, { status: 400 });
    }
    if (!fileId) {
      return NextResponse.json({ error: "Missing required field: fileId" }, { status: 400 });
    }

    const supabase = await createClient();

    // --- Authenticate User ---
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // --- Fetch File with Original Headers ---
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single();
    if (fileError || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    // Use table_name from file record if not provided in request (fallback)
    const actualTableName = tableName || file.table_name;
    if (!actualTableName) {
      console.error("Missing tableName. File data:", { 
        fileId: file.id, 
        fileName: file.name,
        table_name: file.table_name,
        hasTableName: !!file.table_name
      });
      return NextResponse.json({ 
        error: "This file doesn't have a database table yet. The temporary table may not have been created during upload. Please re-upload the file." 
      }, { status: 400 });
    }

    // We'll use database column names directly - no need for original headers mapping

    // --- Fetch Column Metadata (these are sanitized column names from DB) ---
    const { data: columnsData, error: columnsError } = await supabase.rpc("exec_sql_with_result", {
      query: `SELECT column_name, data_type, is_nullable 
              FROM information_schema.columns 
              WHERE table_name = '${actualTableName}' 
              AND column_name != 'id'
              ORDER BY ordinal_position`,
    });
    
    // exec_sql_with_result returns JSONB array directly
    const columns = columnsData && Array.isArray(columnsData) ? columnsData : [];
    
    if (columnsError) {
      console.error("Error fetching columns:", columnsError);
    }
    
    const columnTypes: Record<string, string> = {};
    const sanitizedColumnNames: string[] = []; // Sanitized names from DB
    
    if (columns) {
      columns.forEach((c: any) => {
        // c.column_name is sanitized
        const sanitizedName = c.column_name;
        columnTypes[sanitizedName] = c.data_type;
        sanitizedColumnNames.push(sanitizedName);
      });
    }
    
    // Also create reverse mapping for results
    const allSanitizedColumns = sanitizedColumnNames;

    // --- Fetch Table Data for Analysis ---
    // Use exec_sql_with_result which returns JSONB array directly
    const { data: countData, error: countError } = await supabase.rpc("exec_sql_with_result", {
      query: `SELECT COUNT(*) AS total FROM "${actualTableName}"`
    });
    
    let totalRows = 0;
    if (countData && Array.isArray(countData) && countData.length > 0) {
      const firstResult = countData[0];
      totalRows = firstResult?.total ?? 0;
    }
    
    if (countError) {
      console.error("Error counting rows:", countError);
    }
    
    console.log("📊 Table Info:", { 
      tableName: actualTableName, 
      totalRows, 
      countData,
      hasColumns: columns.length > 0,
      columnNames: sanitizedColumnNames
    });

    // --- Get Sample Data (only 5 rows for display) - needed for type classification ---
    const { data: sampleDataRaw, error: sampleError } = await supabase.rpc("exec_sql_with_result", {
      query: `SELECT * FROM "${actualTableName}" LIMIT 5`
    });
    
    const sampleDataArray = (sampleDataRaw && Array.isArray(sampleDataRaw)) ? sampleDataRaw : [];
    
    if (sampleError) {
      console.error("Error fetching sample data:", sampleError);
    }

    // --- Check if we have cached column analysis in files.ai_summary ---
    let columnAnalysis: any = {};
    let useCachedData = false;
    
    if (file.ai_summary && typeof file.ai_summary === 'object') {
      const cachedAnalysis = file.ai_summary as any;
      // Check if cached data is valid and matches current table structure
      if (cachedAnalysis.columnAnalysis && 
          cachedAnalysis.tableName === actualTableName &&
          cachedAnalysis.totalRows === totalRows &&
          Object.keys(cachedAnalysis.columnAnalysis).length === sanitizedColumnNames.length) {
        console.log("✅ Using cached column analysis from files.ai_summary");
        columnAnalysis = cachedAnalysis.columnAnalysis;
        useCachedData = true;
      }
    }
    
    // --- Calculate MIN/MAX and Unique Values from FULL TABLE using SQL (if not cached) ---
    // This ensures accurate min/max values and unique value counts regardless of table size
    const columnMinMax: Record<string, { min: number | null; max: number | null }> = {};
    const columnUniqueValues: Record<string, any[]> = {};
    const columnUniqueCounts: Record<string, number> = {};
    
    if (!useCachedData) {
      console.log("🔄 Calculating column analysis from full table...");
      
      for (const colName of sanitizedColumnNames) {
      try {
        // Get unique values count from full table
        const { data: uniqueCountData } = await supabase.rpc("exec_sql_with_result", {
          query: `SELECT COUNT(DISTINCT ${colName}) AS unique_count FROM "${actualTableName}" WHERE ${colName} IS NOT NULL AND ${colName} != ''`
        });
        
        if (uniqueCountData && Array.isArray(uniqueCountData) && uniqueCountData.length > 0) {
          columnUniqueCounts[colName] = Number(uniqueCountData[0]?.unique_count || 0);
        }
        
        // Get unique values if count <= 15 (for categorical columns)
        if (columnUniqueCounts[colName] <= 15) {
          const { data: uniqueValuesData } = await supabase.rpc("exec_sql_with_result", {
            query: `SELECT DISTINCT ${colName} AS value FROM "${actualTableName}" WHERE ${colName} IS NOT NULL AND ${colName} != '' ORDER BY ${colName}`
          });
          
          if (uniqueValuesData && Array.isArray(uniqueValuesData)) {
            columnUniqueValues[colName] = uniqueValuesData.map(row => row.value);
          }
        }
        
        // Try to get min/max for numeric columns
        const { data: minMaxData } = await supabase.rpc("exec_sql_with_result", {
          query: `SELECT MIN(CAST(${colName} AS NUMERIC)) AS min_val, MAX(CAST(${colName} AS NUMERIC)) AS max_val FROM "${actualTableName}" WHERE ${colName} IS NOT NULL AND ${colName} != '' AND CAST(${colName} AS NUMERIC) IS NOT NULL`
        });
        
        if (minMaxData && Array.isArray(minMaxData) && minMaxData.length > 0) {
          const result = minMaxData[0];
          if (result.min_val !== null && result.max_val !== null && !isNaN(result.min_val) && !isNaN(result.max_val)) {
            columnMinMax[colName] = {
              min: Number(result.min_val),
              max: Number(result.max_val)
            };
          }
        }
      } catch (err) {
        // Column might not be numeric, skip min/max but still try unique values
        console.log(`Column ${colName} min/max calculation failed, continuing...`);
      }
    }
    
    // --- Analyze Columns using sample data for type classification ---
    // Use sample data for type classification, but override with full table data
    const tempColumnAnalysis = analyzeColumnValues(sampleDataArray, sanitizedColumnNames);
    
    // Override with values from full table
    Object.keys(tempColumnAnalysis).forEach(colName => {
      // Override unique count from full table
      if (columnUniqueCounts[colName] !== undefined) {
        tempColumnAnalysis[colName].uniqueValues = columnUniqueCounts[colName];
      }
      
      // Override unique values if we have them from full table (for categorical <=15)
      if (columnUniqueValues[colName] && columnUniqueValues[colName].length > 0) {
        tempColumnAnalysis[colName].sampleValues = columnUniqueValues[colName];
      }
      
      // Override min/max with values from full table
      if (columnMinMax[colName]) {
        tempColumnAnalysis[colName].valueRange = columnMinMax[colName];
      }
    });
    
    columnAnalysis = tempColumnAnalysis;
    
    // --- Cache the analysis in files.ai_summary ---
    try {
      const analysisCache = {
        tableName: actualTableName,
        totalRows: totalRows,
        columnAnalysis: columnAnalysis,
        cachedAt: new Date().toISOString()
      };
      
      await supabase
        .from("files")
        .update({ ai_summary: analysisCache })
        .eq("id", fileId)
        .eq("user_id", user.id);
      
      console.log("💾 Cached column analysis to files.ai_summary");
    } catch (cacheError) {
      console.error("Failed to cache analysis:", cacheError);
      // Continue even if caching fails
    }
    }
    
    // Log analysis for debugging
    console.log("📊 Column Analysis:", {
      totalRows,
      sampleDataRows: sampleDataArray.length,
      columnsAnalyzed: Object.keys(columnAnalysis).length,
      columnNames: sanitizedColumnNames,
      minMaxFromFullTable: Object.keys(columnMinMax).length > 0 ? 'Yes' : 'No'
    });
    
    // Log detailed column analysis with min/max
    console.log("📊 Detailed Column Analysis:");
    Object.entries(columnAnalysis).forEach(([colName, analysis]: [string, any]) => {
      console.log(`  ${colName}:`);
      console.log(`    - Type: ${analysis.type}`);
      console.log(`    - Unique Values: ${analysis.uniqueValues}`);
      if (analysis.valueRange) {
        console.log(`    - MIN: ${analysis.valueRange.min}, MAX: ${analysis.valueRange.max} (from full table)`);
      }
      if (analysis.type === 'categorical' && analysis.sampleValues.length > 0) {
        console.log(`    - Values: [${analysis.sampleValues.slice(0, 15).join(', ')}${analysis.sampleValues.length > 15 ? '...' : ''}]`);
      }
    });

    // --- Detect User Intent: SQL needed or context-based answer ---
    const detectIntent = async (msg: string, conversationHistory: any[]) => {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
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
              content: `Analyze the user's message and determine if a SQL query is needed to answer it.
              
If the user is asking:
- Questions about data values, aggregations, counts, comparisons, filtering, grouping, sorting, calculations → Answer: "sql_needed"
- General questions, explanations, descriptions, greetings, asking what data is available → Answer: "context_only"

Return ONLY one word: "sql_needed" or "context_only"` 
            },
            ...conversationHistory.slice(-5), // Last 5 messages for context
            { role: "user", content: msg },
          ],
          max_tokens: 10,
          temperature: 0,
        }),
      });
      const data = await resp.json();
      
      // Log token usage for intent detection
      if (data.usage) {
        const cost = ((data.usage.prompt_tokens || 0) * 0.00015 / 1000) + ((data.usage.completion_tokens || 0) * 0.0006 / 1000);
        console.log("📊 [Token Usage] Intent Detection:");
        console.log(`   Prompt tokens: ${data.usage.prompt_tokens || 0}`);
        console.log(`   Completion tokens: ${data.usage.completion_tokens || 0}`);
        console.log(`   Total tokens: ${data.usage.total_tokens || 0}`);
        console.log(`   Estimated cost: $${cost.toFixed(6)}`);
      }
      
      return data.choices[0]?.message?.content?.trim().toLowerCase() || "sql_needed";
    };

    // Prepare conversation history properly
    const conversationHistory = (messages || []).slice(-20).map((msg: any) => ({
      role: msg.role || "user",
      content: msg.content || "",
    }));

    // Track intent detection tokens
    let intentTokens = { prompt: 0, completion: 0, total: 0, cost: 0 };
    const intent = await detectIntent(message, conversationHistory);
    const needsSQL = intent === "sql_needed";
    
    // Note: Intent detection tokens are logged inside detectIntent function

    // --- Build Enhanced System Prompt with Column Analysis (similar to KPI analysis) ---
    // Use database column names directly - match KPI analysis format
    const columnAnalysisText = Object.entries(columnAnalysis).map(([columnName, analysis]: [string, any]) => {
      let text = `- ${columnName}: ${analysis.type.toUpperCase()}`;
      text += ` (${analysis.uniqueValues} unique values)`;
      
      if (analysis.type === 'categorical') {
        // For categorical: show all unique values if <=15, otherwise show sample (already stored correctly)
        if (analysis.uniqueValues <= 15) {
          text += ` - Categorical data. ALL unique values: [${analysis.sampleValues.join(', ')}]`;
        } else {
          text += ` - Categorical data. Sample values (showing first 15 of ${analysis.uniqueValues}): [${analysis.sampleValues.join(', ')}]`;
        }
        text += ` - Perfect for grouping/categorization`;
      } else if (analysis.type === 'continuous') {
        text += ` - Numeric/Continuous data, good for aggregations and calculations`;
        // ALWAYS show min/max for continuous numeric columns
        if (analysis.valueRange) {
          text += ` - MIN value: ${analysis.valueRange.min}, MAX value: ${analysis.valueRange.max}`;
        } else if (analysis.isNumeric && analysis.sampleValues.length > 0) {
          // Calculate min/max from sample if not already calculated
          const numValues = analysis.sampleValues.map((v: any) => typeof v === 'number' ? v : Number(v)).filter((v: any) => !isNaN(v));
          if (numValues.length > 0) {
            text += ` - MIN value: ${Math.min(...numValues)}, MAX value: ${Math.max(...numValues)}`;
          }
        }
        text += ` - REQUIRES CAST("${columnName}" AS NUMERIC) for calculations`;
      } else if (analysis.type === 'many_values') {
        text += ` - TOO MANY UNIQUE VALUES (${analysis.uniqueValues}) - NOT suitable for grouping/X-axis labels`;
        if (analysis.isNumeric && analysis.valueRange) {
          text += ` - MIN value: ${analysis.valueRange.min}, MAX value: ${analysis.valueRange.max}`;
        }
      } else if (analysis.type === 'mixed') {
        text += ` - Mixed data type, use carefully`;
        if (analysis.isNumeric && analysis.valueRange) {
          text += ` - Contains numeric values with MIN: ${analysis.valueRange.min}, MAX: ${analysis.valueRange.max}`;
        }
      }
      
      if (analysis.isDate) {
        text += ` - DATE column, good for time-series analysis`;
      }
      
      return text;
    }).join('\n');
    
    // Create a preview of sample data similar to KPI analysis
    const sampleDataPreview = sampleDataArray.length > 0
      ? sampleDataArray.map((row, i) => `${i + 1}. ${JSON.stringify(row)}`).join("\n")
      : "No sample data available";

    const systemPrompt = `You are an expert data analyst assistant with access to PostgreSQL table "${actualTableName}".

Dataset Information:
- File Name: ${file.name}
- Description: ${file.description || "No description"}
- Total Rows: ${totalRows}
- Table Name: "${actualTableName}"

Column Information (Database Column Names):
${sanitizedColumnNames.length > 0 ? sanitizedColumnNames.map((colName: string) => {
  const col = columns?.find((col: any) => col.column_name === colName);
  return `- ${colName} (${col?.data_type || 'text'})`;
}).join('\n') : "No columns found"}

COLUMN ANALYSIS (Critical for understanding data structure - use this information accurately):
${columnAnalysisText || "No column analysis available - dataset may be empty"}

Sample Data (first 5 rows):
${sampleDataPreview}

⚠️ CRITICAL DATA TYPE WARNING:
All data in the database is stored as TEXT, so you MUST use CAST() functions for any numeric operations:
- Numeric columns need CAST(column_name AS NUMERIC) for calculations
- Always cast before performing SUM(), AVG(), MAX(), MIN(), or any arithmetic operations
- Examples: SUM(CAST(${sanitizedColumnNames[0] || 'column_name'} AS NUMERIC)), AVG(CAST(${sanitizedColumnNames[0] || 'column_name'} AS NUMERIC))
- REMINDER: Every time you write a numeric operation, ask yourself "Did I cast it to NUMERIC?"

IMPORTANT: When describing data:
- Provide professional, detailed, and insightful analysis
- Use the EXACT column names as shown above (NO markdown formatting like **column** or *column* - just use plain text: column)
- For numeric/continuous columns: Use the EXACT MIN and MAX values provided in the column analysis above
- For categorical columns: Use the EXACT unique values list provided (if <=15, all values are shown; if >15, sample is shown)
- Do NOT make up, guess, or infer data ranges - use ONLY the information provided in the COLUMN ANALYSIS section above
- Do NOT use markdown formatting (** or *) when mentioning column names - use plain text
- Verify your descriptions match the MIN/MAX values and unique values shown in the analysis
- If a column shows MIN: X and MAX: Y, those are the actual data values - use them exactly
- Write comprehensive, professional summaries that provide real insights, not just basic lists

DATABASE SYSTEM: You are generating PostgreSQL SQL queries - use PostgreSQL syntax and functions.
Table name in queries: "${actualTableName}"

SQL QUERY RULES:
- Column names should NOT be quoted (use: age, not "age")
- Table name MUST be quoted (use: "${actualTableName}", not ${actualTableName})
- Examples:
  - CORRECT: SELECT MIN(CAST(age AS NUMERIC)) FROM "${actualTableName}"
  - WRONG: SELECT MIN(CAST("age" AS NUMERIC)) FROM "${actualTableName}"
  - CORRECT: SELECT MAX(CAST(price_per_unit_unknown AS NUMERIC)) FROM "${actualTableName}"
  - WRONG: SELECT MAX(CAST("price_per_unit_unknown" AS NUMERIC)) FROM "${actualTableName}"

${needsSQL ? `The user's question requires a SQL query. Generate a PostgreSQL SQL query to answer it.

Available Columns:
${sanitizedColumnNames.map((col: string) => `- ${col}`).join('\n')}

Answer in JSON format:
{
  "sql": "SELECT ... FROM \"${actualTableName}\" ...",
  "explanation": "Brief explanation of what the query does and the answer",
  "needsSQL": true
}

CRITICAL SQL RULES:
- Column names: Use WITHOUT quotes (age, not "age")
- Table name: Use WITH quotes ("${actualTableName}")
- CAST syntax: CAST(column_name AS NUMERIC) - NO quotes around column_name
- Examples:
  * CORRECT: SELECT MIN(CAST(age AS NUMERIC)) FROM "${actualTableName}"
  * WRONG: SELECT MIN(CAST("age" AS NUMERIC)) FROM "${actualTableName}"
  * CORRECT: SELECT MAX(CAST(price_per_unit_unknown AS NUMERIC)) FROM "${actualTableName}"
- Use proper PostgreSQL syntax
- Return valid JSON only` : `The user's question can be answered from context without a SQL query.

Provide a professional, detailed, and insightful analysis. Don't just list facts - provide meaningful insights about the data structure, patterns, and what the data represents.

Answer in JSON format:
{
  "sql": null,
  "explanation": "Your answer based on the data context provided above",
  "needsSQL": false
}

Provide a helpful answer based on the column information, sample data, and analysis provided.`}`;

    // Log what we're sending to AI (especially min/max values)
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📤 [AI Request] Sending to OpenAI:");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("System Prompt (first 500 chars):", systemPrompt.substring(0, 500) + "...");
    console.log("\nColumn Analysis Summary:");
    Object.entries(columnAnalysis).forEach(([colName, analysis]: [string, any]) => {
      console.log(`  ${colName}:`);
      console.log(`    - Type: ${analysis.type}`);
      console.log(`    - Unique Values: ${analysis.uniqueValues}`);
      if (analysis.valueRange) {
        console.log(`    - MIN: ${analysis.valueRange.min}, MAX: ${analysis.valueRange.max}`);
      }
      if (analysis.type === 'categorical' && analysis.sampleValues.length > 0) {
        console.log(`    - Values: [${analysis.sampleValues.slice(0, 10).join(', ')}${analysis.sampleValues.length > 10 ? '...' : ''}]`);
      }
    });
    console.log("═══════════════════════════════════════════════════════════");

    // --- Call OpenAI for Answer ---
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: message },
        ],
        max_tokens: 1200,
        temperature: 0.3,
      }),
    });

    if (!openaiResp.ok) {
      const errorText = await openaiResp.text();
      console.error("OpenAI API error:", errorText);
      throw new Error("OpenAI API error");
    }

    const openaiData = await openaiResp.json();
    
    // Log token usage for main query
    let mainQueryTokens = { prompt: 0, completion: 0, total: 0, cost: 0 };
    if (openaiData.usage) {
      mainQueryTokens = {
        prompt: openaiData.usage.prompt_tokens || 0,
        completion: openaiData.usage.completion_tokens || 0,
        total: openaiData.usage.total_tokens || 0,
        cost: ((openaiData.usage.prompt_tokens || 0) * 0.00015 / 1000) + ((openaiData.usage.completion_tokens || 0) * 0.0006 / 1000)
      };
      console.log("📊 [Token Usage] Main Chat Query:");
      console.log(`   Prompt tokens: ${mainQueryTokens.prompt}`);
      console.log(`   Completion tokens: ${mainQueryTokens.completion}`);
      console.log(`   Total tokens: ${mainQueryTokens.total}`);
      console.log(`   Estimated cost: $${mainQueryTokens.cost.toFixed(6)}`);
    }

    let rawResponse = openaiData.choices[0]?.message?.content || "{}";
    rawResponse = rawResponse.replace(/^```json\s*/, "").replace(/```$/, "").trim();

    let parsed: { sql: string | null; explanation: string; needsSQL?: boolean; chartConfig?: any };
    let retryTokens = { prompt: 0, completion: 0, total: 0, cost: 0 };
    
    try {
      parsed = JSON.parse(rawResponse);
    } catch (parseError) {
      console.error("JSON parse error, attempting retry:", parseError);
      console.error("Raw response preview:", rawResponse.substring(0, 200));
      
      // Try multiple strategies to extract JSON
      let jsonFound = false;
      
      // Strategy 1: Try to find JSON object in the response
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
          jsonFound = true;
        } catch (e) {
          console.log("Strategy 1 failed, trying strategy 2...");
        }
      }
      
      // Strategy 2: Try to extract JSON from markdown code blocks
      if (!jsonFound) {
        const codeBlockMatch = rawResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          try {
            parsed = JSON.parse(codeBlockMatch[1]);
            jsonFound = true;
          } catch (e) {
            console.log("Strategy 2 failed, trying strategy 3...");
          }
        }
      }
      
      // Strategy 3: Use OpenAI to fix JSON (only if previous strategies failed)
      if (!jsonFound) {
        try {
          // Limit the response size to avoid token limits
          const truncatedResponse = rawResponse.length > 1500 
            ? rawResponse.substring(0, 1500) + "... [truncated]" 
            : rawResponse;
          
          const retryResp = await fetch("https://api.openai.com/v1/chat/completions", {
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
                  content: "You are a JSON extractor. Extract ONLY the JSON object from the user's message. Return ONLY valid JSON, nothing else. If there's no JSON, return {\"sql\": null, \"explanation\": \"Unable to parse response\", \"needsSQL\": false}" 
                },
                { 
                  role: "user", 
                  content: `Extract the JSON from this response: ${truncatedResponse}` 
                },
              ],
              max_tokens: 400,
              temperature: 0,
            }),
          });
          
          if (!retryResp.ok) {
            throw new Error("Retry request failed");
          }
          
          const retryData = await retryResp.json();
          
          // Log token usage for retry
          if (retryData.usage) {
            retryTokens = {
              prompt: retryData.usage.prompt_tokens || 0,
              completion: retryData.usage.completion_tokens || 0,
              total: retryData.usage.total_tokens || 0,
              cost: ((retryData.usage.prompt_tokens || 0) * 0.00015 / 1000) + ((retryData.usage.completion_tokens || 0) * 0.0006 / 1000)
            };
            console.log("📊 [Token Usage] JSON Retry:");
            console.log(`   Prompt tokens: ${retryTokens.prompt}`);
            console.log(`   Completion tokens: ${retryTokens.completion}`);
            console.log(`   Total tokens: ${retryTokens.total}`);
            console.log(`   Estimated cost: $${retryTokens.cost.toFixed(6)}`);
          }
          
          const retryContent = retryData.choices[0]?.message?.content?.trim() || "{}";
          const cleanedRetry = retryContent.replace(/^```json\s*/, "").replace(/```$/, "").trim();
          parsed = JSON.parse(cleanedRetry);
          jsonFound = true;
        } catch (retryError) {
          console.error("All JSON extraction strategies failed:", retryError);
          jsonFound = false;
        }
      }
      
      // Final fallback if all strategies fail
      if (!jsonFound) {
        parsed = {
          sql: needsSQL ? null : null,
          explanation: rawResponse.length > 300 
            ? rawResponse.substring(0, 300) + "... [response parsing failed, please rephrase your question]" 
            : (rawResponse || "I couldn't parse the response. Please try rephrasing your question."),
          needsSQL: needsSQL
        };
      }
    }

    // --- Fix SQL if generated ---
    if (parsed.sql) {
      let sqlQuery = parsed.sql;
      
      // Clean SQL
      sqlQuery = sqlQuery
        .replace(/^[\s\S]*?(SELECT[\s\S]*)$/i, "$1")
        .replace(/[`;]/g, "")
        .trim();

      // Remove quotes from column names - PostgreSQL column names don't need quotes unless they're reserved words
      // Table name should be quoted, but column names should NOT be quoted
      sanitizedColumnNames.forEach(colName => {
        // Remove quotes around column names
        const quotedRegex = new RegExp(`"${colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'gi');
        sqlQuery = sqlQuery.replace(quotedRegex, colName);
      });

      // Fix text aggregation - add CAST for numeric operations (column names should NOT be quoted)
      sqlQuery = sqlQuery.replace(
        /\b(SUM|AVG|MIN|MAX)\s*\(\s*"([a-zA-Z0-9_]+)"\s*\)/gi,
        (match, func, col) => {
          const colType = columnTypes[col];
          const analysis = columnAnalysis[col];
          if ((colType && colType.includes("text")) || (analysis && analysis.isNumeric)) {
            return `${func}(CAST(${col} AS NUMERIC))`; // Remove quotes from column name
          }
          return `${func}(${col})`; // Remove quotes even if no CAST needed
        }
      );

      // Handle unquoted column names - add CAST if needed
      sqlQuery = sqlQuery.replace(
        /\b(SUM|AVG|MIN|MAX)\s*\(\s*([a-zA-Z0-9_]+)\s*\)/gi,
        (match, func, col) => {
          // Check if this is a sanitized column name
          if (sanitizedColumnNames.includes(col)) {
          const colType = columnTypes[col];
            const analysis = columnAnalysis[col];
            if ((colType && colType.includes("text")) || (analysis && analysis.isNumeric)) {
              return `${func}(CAST(${col} AS NUMERIC))`; // No quotes around column name
            }
          }
          return match;
        }
      );

      // Also fix CAST statements that have quoted column names
      sqlQuery = sqlQuery.replace(
        /CAST\s*\(\s*"([a-zA-Z0-9_]+)"\s*AS\s*NUMERIC\s*\)/gi,
        (match, col) => {
          return `CAST(${col} AS NUMERIC)`; // Remove quotes from column name in CAST
        }
      );

      // Fix COUNT(DISTINCT *)
      if (sqlQuery.match(/COUNT\s*\(\s*DISTINCT\s*\*\s*\)/i)) {
        const rowExpr = `ROW(${sanitizedColumnNames.join(", ")})`; // No quotes around column names
        sqlQuery = sqlQuery.replace(/COUNT\s*\(\s*DISTINCT\s*\*\s*\)/gi, `COUNT(DISTINCT ${rowExpr})`);
      }

      // Ensure table name is properly quoted (but handle if already quoted)
      // Remove any existing quotes first, then add proper quotes
      const tableNameRegex = new RegExp(`["']?${actualTableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?`, "gi");
      sqlQuery = sqlQuery.replace(tableNameRegex, `"${actualTableName}"`);
      
      // Also handle FROM, JOIN, UPDATE, DELETE clauses
      sqlQuery = sqlQuery.replace(
        new RegExp(`(FROM|JOIN|UPDATE|INTO)\\s+["']?${actualTableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']?`, "gi"),
        `$1 "${actualTableName}"`
      );
      
      // Update parsed.sql with the processed query
      parsed.sql = sqlQuery;
    }

    // --- Execute SQL if generated ---
    let sqlResult = null;
    let sqlError = null;
    let chartData = null;

    if (parsed.sql) {
      try {
      const { data, error } = await supabase.rpc("exec_sql_with_result", { query: parsed.sql });
        if (error) {
          sqlError = error.message || "SQL execution failed";
          console.error("SQL execution error:", error);
        } else if (!data || (Array.isArray(data) && data.length === 0)) {
          sqlResult = [];
        } else {
          // exec_sql_with_result returns JSONB array directly
          sqlResult = Array.isArray(data) ? data : [];

          // Generate chart if requested and multiple rows
        if (parsed.chartConfig && Array.isArray(data) && data.length > 1) {
          const processedData = data.slice(0, 50);
          const firstRow = processedData[0] || {};
          const availableKeys = Object.keys(firstRow);

          const lowerKeyMap = availableKeys.reduce((acc, key) => {
            acc[key.toLowerCase()] = key;
            return acc;
          }, {} as Record<string, string>);

          if (parsed.chartConfig.xAxis) {
            const normalizedXAxis = lowerKeyMap[parsed.chartConfig.xAxis.toLowerCase()];
            if (normalizedXAxis) parsed.chartConfig.xAxis = normalizedXAxis;
          }
          if (parsed.chartConfig.yAxis) {
            const normalizedYAxis = lowerKeyMap[parsed.chartConfig.yAxis.toLowerCase()];
            if (normalizedYAxis) parsed.chartConfig.yAxis = normalizedYAxis;
          }

            chartData = { config: parsed.chartConfig, data: processedData };
          }
        }
      } catch (execError) {
        sqlError = execError instanceof Error ? execError.message : "SQL execution failed";
        console.error("SQL execution exception:", execError);
      }
    }

    // Calculate total token usage
    const totalTokens = {
      prompt: mainQueryTokens.prompt + retryTokens.prompt,
      completion: mainQueryTokens.completion + retryTokens.completion,
      total: mainQueryTokens.total + retryTokens.total,
      cost: mainQueryTokens.cost + retryTokens.cost
    };
    
    // Log summary
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📊 [Token Usage Summary] Complete Chat Request:");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`   Main Query:`);
    console.log(`     - Prompt tokens: ${mainQueryTokens.prompt}`);
    console.log(`     - Completion tokens: ${mainQueryTokens.completion}`);
    console.log(`     - Total: ${mainQueryTokens.total} tokens`);
      console.log(`     - Cost: $${mainQueryTokens.cost.toFixed(6)}`);
    if (retryTokens.total > 0) {
      console.log(`   JSON Retry:`);
      console.log(`     - Prompt tokens: ${retryTokens.prompt}`);
      console.log(`     - Completion tokens: ${retryTokens.completion}`);
      console.log(`     - Total: ${retryTokens.total} tokens`);
      console.log(`     - Cost: $${retryTokens.cost.toFixed(6)}`);
    }
    console.log(`   ───────────────────────────────────────────────────────`);
    console.log(`   Total (excluding intent detection): ${totalTokens.total} tokens`);
    console.log(`   Total estimated cost: $${totalTokens.cost.toFixed(6)}`);
    console.log(`   Intent: ${needsSQL ? "sql_needed" : "context_only"}`);
    console.log(`   SQL generated: ${parsed.sql ? "yes" : "no"}`);
    console.log("═══════════════════════════════════════════════════════════");

    return NextResponse.json({
      explanation: parsed.explanation || "No explanation provided",
      sql: parsed.sql || null,
      result: sqlResult,
      sqlError,
      chartData,
      intent: needsSQL ? "sql_needed" : "context_only",
      needsSQL: needsSQL,
      tokenUsage: {
        intentDetection: {
          prompt: mainQueryTokens.prompt > 0 ? 0 : 0, // Will be set from detectIntent
          completion: mainQueryTokens.completion > 0 ? 0 : 0,
          total: mainQueryTokens.total > 0 ? 0 : 0,
        },
        mainQuery: {
          prompt: mainQueryTokens.prompt,
          completion: mainQueryTokens.completion,
          total: mainQueryTokens.total,
        },
        retry: retryTokens.total > 0 ? {
          prompt: retryTokens.prompt,
          completion: retryTokens.completion,
          total: retryTokens.total,
        } : null,
        total: {
          prompt: totalTokens.prompt,
          completion: totalTokens.completion,
          total: totalTokens.total,
          estimatedCost: totalTokens.cost,
        }
      }
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ 
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}
