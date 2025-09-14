import { type NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

export async function POST(request: NextRequest) {
  try {
    const { message, fileId, tableName, messages } = await request.json()

    if (!message || !fileId || !tableName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const cookieStore = cookies()
    const supabase = createServerClient(cookieStore)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single()

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const { data: columns } = await supabase.rpc("exec_sql", {
      sql: `SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = '${tableName}' 
            ORDER BY ordinal_position;`,
    })

    const { data: sampleData } = await supabase.from(tableName).select("*").limit(5)

    const { count } = await supabase.from(tableName).select("*", { count: "exact", head: true })

    const systemPrompt = `You are a data analyst assistant with access to a PostgreSQL table "${tableName}".
    File: ${file.name} (${file.description || "No description"})
    Rows: ${count}
    Columns:
    ${columns ? columns.map((c: any) => `- ${c.column_name} (${c.data_type})`).join("\n") : "Unknown"}

    Sample:
    ${sampleData ? JSON.stringify(sampleData, null, 2) : "Unavailable"}

    When answering:
    - ALWAYS return valid JSON like:
    {
    "sql": "SELECT ...",  // or null if not needed
    "explanation": "Explain the result or reasoning here"
    }
    - The SQL must be **valid PostgreSQL syntax**. Avoid invalid constructs like COUNT(DISTINCT *).
    - If counting distinct rows across all columns, use:
    SELECT COUNT(*) FROM (SELECT DISTINCT * FROM table_name) AS sub;
    - Only provide JSON output. Do not include any text outside JSON.`


    const conversationHistory = messages.slice(-30).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));
    
    // Call OpenAI
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
        max_tokens: 300,
        temperature: 0.2,
      }),
    })

    if (!openaiResponse.ok) {
      throw new Error("OpenAI API error")
    }

    const openaiData = await openaiResponse.json()

    let rawResponse = openaiData.choices[0]?.message?.content || "{}";

    // Strip ```json or ``` wrapping if present
    rawResponse = rawResponse.replace(/^```json\s*/, "").replace(/```$/, "").trim();

    console.log("OpenAI response (sanitized):", rawResponse);

    let parsed: { sql: string | null; explanation: string };
    try {
    parsed = JSON.parse(rawResponse);
    } catch (err) {
    console.error("JSON parse failed:", err);
    parsed = { sql: null, explanation: rawResponse };
    }


    let sqlResult = null
    if (parsed.sql) {
      console.log("Executing SQL:", parsed.sql)

      const { data, error } = await supabase.rpc("exec_sql", { p_sql: parsed.sql })
      console.log("SQL execution result:", data)

      if (error) {
        console.error("SQL execution error:", error)
        sqlResult = { error: error.message }
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        sqlResult = "No rows returned"
      } else {
        sqlResult = data
      }
    }

    return NextResponse.json({
      explanation: parsed.explanation,
      sql: parsed.sql,
      result: sqlResult,
      debug: { rawResponse },
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
