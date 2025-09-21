import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { message, fileId, tableName, messages } = await request.json();

    if (!message || !fileId || !tableName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = await createClient();

    // --- Authenticate User ---
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // --- Fetch File ---
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single();
    if (fileError || !file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    // --- Fetch Column Metadata ---
    const { data: columns } = await supabase.rpc("exec_sql", {
      p_sql: `SELECT column_name, data_type, is_nullable 
              FROM information_schema.columns 
              WHERE table_name = '${tableName}' 
              ORDER BY ordinal_position`,
    });
    const columnTypes: Record<string, string> = {};
    const columnNames: string[] = [];
    if (columns) {
      columns.forEach((c: any) => {
        columnTypes[c.column_name] = c.data_type;
        columnNames.push(c.column_name);
      });
    }

    // --- Detect User Intent ---
    const detectIntent = async (msg: string) => {
      const resp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Classify user intent into one of: ['preprocess','query']" },
            { role: "user", content: msg },
          ],
          max_tokens: 10,
          temperature: 0,
        }),
      });
      const data = await resp.json();
      return data.choices[0]?.message?.content?.trim().toLowerCase() || "query";
    };
    const intent = await detectIntent(message);

    // --- Generate Preprocessing SQL if Needed ---
    let preprocessingSQL: string | null = null;
    if (intent === "preprocess") {
      const preprocessPrompt = `Convert this user instruction into a valid PostgreSQL SELECT statement.
- Table: "${tableName}"
- Available columns: ${columnNames.join(", ")}
- Only select columns that make sense based on the instruction.
- Do NOT use EXCEPT.
- Return ONLY SQL, no explanations or markdown.
User instruction: "${message}"`;

      const prepResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: preprocessPrompt }],
          max_tokens: 300,
          temperature: 0.2,
        }),
      });

      let rawSQL = (await prepResp.json()).choices[0]?.message?.content?.trim();
      if (!rawSQL) throw new Error("Failed to generate preprocessing SQL");

      // --- Clean SQL: remove backticks, semicolons, and extra whitespace ---
      preprocessingSQL = rawSQL
        .replace(/^[\s\S]*?(SELECT[\s\S]*)$/i, "$1") // Keep only first SELECT
        .replace(/[`;]/g, "") // Remove backticks and semicolons
        .trim();

      // --- Wrap in subquery alias ---
      preprocessingSQL = `(${preprocessingSQL}) AS sub`;
    }

    // --- Fetch Sample Data ---
    const sampleQuery = preprocessingSQL ? `SELECT * FROM ${preprocessingSQL} LIMIT 5` : `SELECT * FROM ${tableName} LIMIT 5`;
    const { data: sampleData } = await supabase.rpc("exec_sql", { p_sql: sampleQuery });
    const { data: countData } = await supabase.rpc("exec_sql", { p_sql: `SELECT COUNT(*) AS total FROM ${tableName}` });
    const count = countData?.[0]?.total ?? 0;

    // --- System Prompt for OpenAI ---
    const systemPrompt = `You are a data analyst assistant with access to PostgreSQL table "${tableName}".
File: ${file.name} (${file.description || "No description"})
Rows: ${count}
Columns:
${columns ? columns.map((c: any) => `- ${c.column_name} (${c.data_type})`).join("\n") : "Unknown"}
Sample:
${sampleData ? JSON.stringify(sampleData, null, 2) : "Unavailable"}

Answer ONLY in JSON like:
{
  "sql": "SELECT ...", 
  "explanation": "Short answer",
  "chartConfig": {
    "type": "bar|line|pie|area",
    "title": "Chart Title",
    "xAxis": "column_name",
    "yAxis": "column_name",
    "groupBy": "column_name"
  }
}
- CAST text to numeric if aggregating.
- Only output valid JSON.`;

    const conversationHistory = messages.slice(-30).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

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
        max_tokens: 400,
        temperature: 0.2,
      }),
    });

    if (!openaiResp.ok) throw new Error("OpenAI API error");

    let rawResponse = (await openaiResp.json()).choices[0]?.message?.content || "{}";
    rawResponse = rawResponse.replace(/^```json\s*/, "").replace(/```$/, "").trim();

    let parsed: { sql: string | null; explanation: string; chartConfig?: any };
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      const retryResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Return ONLY valid JSON." },
            { role: "user", content: `Convert this to valid JSON: ${rawResponse}` },
          ],
          max_tokens: 300,
          temperature: 0,
        }),
      });
      const retryData = await retryResp.json();
      const retryContent = retryData.choices[0]?.message?.content?.trim() || "{}";
      parsed = JSON.parse(retryContent);
    }

    // --- Fix text aggregation ---
    if (parsed.sql) {
      parsed.sql = parsed.sql.replace(
        /\b(SUM|AVG|MIN|MAX)\s*\(\s*([a-zA-Z0-9_]+)\s*\)/gi,
        (match, func, col) => {
          const colType = columnTypes[col];
          if (colType && colType.includes("text")) return `${func}(${col}::numeric)`;
          return match;
        }
      );

      // --- Fix COUNT(DISTINCT *) ---
      if (parsed.sql.match(/COUNT\s*\(\s*DISTINCT\s*\*\s*\)/i)) {
        const rowExpr = `ROW(${columnNames.join(", ")})`;
        parsed.sql = parsed.sql.replace(/COUNT\s*\(\s*DISTINCT\s*\*\s*\)/gi, `COUNT(DISTINCT ${rowExpr})`);
      }

      // Replace tableName with preprocessing subquery if exists
      if (preprocessingSQL) {
        parsed.sql = parsed.sql.replace(new RegExp(`\\b${tableName}\\b`, "gi"), preprocessingSQL);
      }
    }

    // --- Execute SQL ---
    let sqlResult = null;
    let sqlError = null;
    let chartData = null;

    if (parsed.sql) {
      const { data, error } = await supabase.rpc("exec_sql", { p_sql: parsed.sql });
      if (error) sqlError = error.message || "SQL execution failed";
      else if (!data || (Array.isArray(data) && data.length === 0)) sqlResult = "No rows returned";
      else {
        sqlResult = data;

        // Generate chart only if requested and multiple rows
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

          if (parsed.chartConfig.type === "pie") {
            parsed.chartConfig.xAxis =
              parsed.chartConfig.xAxis ||
              availableKeys.find((k) => typeof firstRow[k] === "string") ||
              availableKeys[0];
            parsed.chartConfig.yAxis =
              parsed.chartConfig.yAxis ||
              availableKeys.find((k) => typeof firstRow[k] === "number") ||
              availableKeys[1];
          }

          chartData = { config: parsed.chartConfig, data: processedData };
        }
      }
    }

    return NextResponse.json({
      explanation: parsed.explanation,
      sql: parsed.sql,
      result: sqlResult,
      sqlError,
      chartData,
      debug: { rawResponse },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
