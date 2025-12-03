import { NextResponse } from "next/server";
import OpenAI from "openai";
import { filterIdColumns, filterIdColumnsFromData } from "@/lib/utils";


const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { headers, rows, preprocessingSteps } = await req.json();
    if (!headers || !rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Missing headers or rows" }, { status: 400 });
    }

    // Filter out 'id' columns first (conflicts with PRIMARY KEY)
    const { filteredHeaders: headersWithoutId, idColumnsRemoved } = filterIdColumns(headers);
    const filteredData = filterIdColumnsFromData(rows, headers, headersWithoutId);
    
    if (idColumnsRemoved.length > 0) {
      console.log(`⚠️ Removed ${idColumnsRemoved.length} 'id' column(s) from summary generation:`, idColumnsRemoved);
    }

    // Take up to 3 random non-empty rows (reduced for token efficiency)
    const sampleRows = [...filteredData]
      .filter(r => Object.values(r).some(v => typeof v === "string" && v.trim() !== ""))
      .sort(() => 0.5 - Math.random())
      .slice(0, 3);

    const preview = sampleRows.map((row, i) => `${i + 1}. ${JSON.stringify(row)}`).join("\n");

    const prompt = `Analyze CSV headers and sample rows. Return JSON only:
{
  "personalColumns": [
    { "name": "column1", "type": "email|mobile|address|firstname|lastname|customername" }
  ],
  "currencyColumns": [
    { "name": "column2", "currency": "USD|INR|EUR|etc" }
  ],
  "dateColumns": [
    { "name": "column3", "separator": "/", "format": "dmy|mdy|ymd|dmy_text|mdy_text" }
  ],
  "modifiedHeaders": ["col1", "col2 (currency)", "col3"],
  "importantColumns": ["col4"],
  "irrelevantColumns": ["col5"],
  "redundantColumns": ["col6"]
}

Rules:
- personalColumns: email, mobile, address, firstname, lastname, customer names
- Do NOT mark country, city, state, province, region, postal code, or zip code as personalColumns (these are location data, not personal privacy data)
- currencyColumns: only if name suggests money (amount/price/cost/total) OR values contain $/₹/€/PKR/INR symbols
- Do NOT mark Quantity/Count/Units as currency
- dateColumns: columns that contain date/time values. For each date column, identify:
  * separator: the character separating date parts (/, -, ., |, space, comma)
  * format: dmy (day-month-year), mdy (month-day-year), ymd (year-month-day), dmy_text (day month year with text month like "23 Nov 2025"), mdy_text (month day year with text month like "Nov 23 2025")
  Examples: "23 Nov 2025" → separator: " ", format: "dmy_text"; "11/10/2025" → separator: "/", format: "mdy"; "11.12.2025" → separator: ".", format: "dmy"
- redundantColumns: Identify ALL columns that duplicate information already present in other columns. Examples:
  * Postal code when city AND country exist
  * Full address when street, city, state, country exist separately
  * Full name when firstname AND lastname exist separately
  * Customer name when firstname AND lastname exist
  * Full date when Date_year, Date_month, Date_day exist separately
  * Timestamp when date components exist
  * Total/Grand Total when individual item/line/detail columns exist that can be summed
  * Any duplicate columns (same data, different names, case-insensitive)
  * Any column that can be derived/calculated from other columns
- modifiedHeaders: add currency symbol to currency column names
- importantColumns: exclude redundant columns
- irrelevantColumns: include redundant columns AND any column named "id" (case-insensitive) - these are automatically filtered out to avoid database conflicts

Headers: ${headersWithoutId.join(", ")}
${idColumnsRemoved.length > 0 ? `\n⚠️ Note: The following 'id' column(s) were removed to avoid conflicts: ${idColumnsRemoved.join(", ")}` : ''}
Samples: ${preview}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Return JSON only. No explanations." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 800, // Increased to handle larger responses
    });

    // Print token usage
    console.log("OpenAI Token Usage:");
    console.log("- Prompt tokens:", completion.usage?.prompt_tokens || "N/A");
    console.log("- Completion tokens:", completion.usage?.completion_tokens || "N/A");
    console.log("- Total tokens:", completion.usage?.total_tokens || "N/A");
    console.log("- Finish reason:", completion.choices[0]?.finish_reason || "N/A");

    let rawResponse = completion.choices[0]?.message?.content ?? "{}";
    const finishReason = completion.choices[0]?.finish_reason;
    
    // Check if response was truncated
    if (finishReason === "length") {
      console.warn("⚠️ Response was truncated due to max_tokens limit. Attempting to fix incomplete JSON...");
    }

    let parsed: {
      personalColumns: Array<{ name: string; type: string }>;
      currencyColumns: Array<{ name: string; currency: string }>;
      dateColumns: Array<{ name: string; separator?: string; format?: string }>;
      modifiedHeaders: string[];
      importantColumns: string[];
      irrelevantColumns: string[];
      redundantColumns: string[];
    } = { 
      personalColumns: [], 
      currencyColumns: [],
      dateColumns: [],
      modifiedHeaders: headers,
      importantColumns: [],
      irrelevantColumns: [],
      redundantColumns: []
    };
    
    console.log("AI Analysis raw response:", rawResponse);
    
    // Clean the response - remove markdown code blocks and extra text
    try {
      // Remove markdown code blocks
      rawResponse = rawResponse
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      
      // Try to extract JSON if there's extra text
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        rawResponse = jsonMatch[0];
      }
    } catch (cleanError) {
      console.warn("Error cleaning response, using raw:", cleanError);
    }
    
    // Attempt to fix incomplete JSON if truncated
    const fixIncompleteJSON = (jsonStr: string): string => {
      try {
        // Try parsing first - if it works, return as is
        JSON.parse(jsonStr);
        return jsonStr;
      } catch {
        // If parsing fails, try to fix common truncation issues
        let fixed = jsonStr.trim();
        
        // Count open and close braces/brackets
        const openBraces = (fixed.match(/\{/g) || []).length;
        const closeBraces = (fixed.match(/\}/g) || []).length;
        const openBrackets = (fixed.match(/\[/g) || []).length;
        const closeBrackets = (fixed.match(/\]/g) || []).length;
        
        // Close unclosed arrays
        for (let i = 0; i < openBrackets - closeBrackets; i++) {
          fixed += "]";
        }
        
        // Close unclosed objects
        for (let i = 0; i < openBraces - closeBraces; i++) {
          fixed += "}";
        }
        
        // Remove trailing comma before closing brackets/braces
        fixed = fixed.replace(/,\s*([}\]])/g, "$1");
        
        return fixed;
      }
    };
    
    try {
      // Try to parse - if it fails, attempt to fix incomplete JSON
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(rawResponse);
      } catch (parseError) {
        // If parsing fails, try to fix incomplete JSON
        console.warn("Initial JSON parse failed, attempting to fix incomplete JSON...");
        const fixedResponse = fixIncompleteJSON(rawResponse);
        try {
          parsedResponse = JSON.parse(fixedResponse);
          console.log("✅ Successfully fixed incomplete JSON");
        } catch (fixError) {
          // If fixing didn't work, throw the original error
          throw parseError;
        }
      }
      
      // Use AI-identified redundant columns directly
      const redundantColumns = parsedResponse.redundantColumns || [];
      
      // Remove redundant columns from importantColumns
      parsedResponse.importantColumns = (parsedResponse.importantColumns || []).filter(
        (col: string) => !redundantColumns.includes(col)
      );
      
      // Add redundant columns to irrelevantColumns if not already there
      parsedResponse.irrelevantColumns = [
        ...new Set([
          ...(parsedResponse.irrelevantColumns || []),
          ...redundantColumns
        ])
      ];
      
      parsed = {
        personalColumns: parsedResponse.personalColumns || [],
        currencyColumns: parsedResponse.currencyColumns || [],
        dateColumns: parsedResponse.dateColumns || [],
        modifiedHeaders: parsedResponse.modifiedHeaders || headers,
        importantColumns: parsedResponse.importantColumns || [],
        irrelevantColumns: parsedResponse.irrelevantColumns || [],
        redundantColumns: redundantColumns
      };
      
      console.log(`🔍 AI Redundancy detection: Found ${redundantColumns.length} redundant columns:`, redundantColumns);
    } catch (parseError) {
      console.warn("Failed to parse AI JSON, using defaults. Error:", parseError);
      console.warn("Raw response that failed:", rawResponse);
      // Continue with defaults - pipeline should work normally
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("AI Analysis error:", err);
    return NextResponse.json(
      { personalColumns: [], currencyColumns: [], dateColumns: [], modifiedHeaders: [], importantColumns: [], irrelevantColumns: [], redundantColumns: [] },
      { status: 500 }
    );
  }
}
