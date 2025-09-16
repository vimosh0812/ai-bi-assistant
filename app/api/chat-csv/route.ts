import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const { message, fileId, tableName, messages } = await request.json()

    if (!message || !fileId || !tableName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = await createClient()

    // 🔑 Get user & validate
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 🔑 Get file metadata
    const { data: file, error: fileError } = await supabase
      .from("files")
      .select("*")
      .eq("id", fileId)
      .eq("user_id", user.id)
      .single()

    if (fileError || !file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    // 🔑 Get schema info (column names & types)
    const { data: columns } = await supabase.rpc("exec_sql", {
      p_sql: `SELECT column_name, data_type, is_nullable 
              FROM information_schema.columns 
              WHERE table_name = '${tableName}' 
              ORDER BY ordinal_position`,
    })

    const columnTypes: Record<string, string> = {}
    if (columns) {
      columns.forEach((c: any) => (columnTypes[c.column_name] = c.data_type))
    }

    // Get sample data & row count (for context)
    const { data: sampleData } = await supabase.from(tableName).select("*").limit(5)
    const { count } = await supabase.from(tableName).select("*", { count: "exact", head: true })

    // Build system prompt
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
        "explanation": "Short, concise answer",
        "chartConfig": {
          "type": "bar|line|pie|area",
          "title": "Chart Title",
          "xAxis": "column_name",
          "yAxis": "column_name",
          "groupBy": "column_name" // optional
        }
      }
    - SQL must be valid PostgreSQL.
    - CAST text columns to numeric if aggregating (SUM, AVG, MIN, MAX).
    - Only output JSON. No markdown, no extra commentary.`

    const conversationHistory = messages.slice(-30).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }))

    // 🔑 Step 1: Call OpenAI
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
        max_tokens: 400,
        temperature: 0.2,
      }),
    })

    if (!openaiResponse.ok) {
      throw new Error("OpenAI API error")
    }

    let rawResponse = (await openaiResponse.json()).choices[0]?.message?.content || "{}"
    rawResponse = rawResponse.replace(/^```json\s*/, "").replace(/```$/, "").trim()

    console.log("OpenAI response (sanitized):", rawResponse)

    // 🔑 Step 2: Parse or Retry
    let parsed: { sql: string | null; explanation: string; chartConfig?: any }
    try {
      parsed = JSON.parse(rawResponse)
    } catch (err) {
      console.warn("JSON parse failed. Retrying with strict JSON format.")

      const retryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Return ONLY valid JSON. No explanations, no markdown." },
            { role: "user", content: `Convert this to valid JSON: ${rawResponse}` },
          ],
          max_tokens: 300,
          temperature: 0,
        }),
      })

      const retryData = await retryResponse.json()
      const retryContent = retryData.choices[0]?.message?.content?.trim() || "{}"
      parsed = JSON.parse(retryContent)
    }

    // 🔑 Step 3: Auto-cast numeric aggregations if needed
    if (parsed.sql) {
      parsed.sql = parsed.sql.replace(
        /\b(SUM|AVG|MIN|MAX)\s*\(\s*([a-zA-Z0-9_]+)\s*\)/gi,
        (match, func, col) => {
          const colType = columnTypes[col]
          if (colType && colType.includes("text")) {
            return `${func}(${col}::numeric)`
          }
          return match
        }
      )
    }

    let sqlResult = null
    let sqlError = null
    let chartData = null

    // 🔑 Step 4: Execute SQL & normalize chart config
    if (parsed.sql) {
      console.log("Executing SQL:", parsed.sql)

      const { data, error } = await supabase.rpc("exec_sql", { p_sql: parsed.sql })
      console.log("SQL execution result:", data)

      if (error) {
        console.error("SQL execution error:", error)
        sqlError = error.message || "SQL execution failed"
      } else if (!data || (Array.isArray(data) && data.length === 0)) {
        sqlResult = "No rows returned"
      } else {
        sqlResult = data

        if (parsed.chartConfig && Array.isArray(data)) {
          const processedData = data.slice(0, 50)
          const firstRow = processedData[0] || {}
          const availableKeys = Object.keys(firstRow)

          // Normalize xAxis/yAxis to match actual keys
          const lowerKeyMap = availableKeys.reduce((acc, key) => {
            acc[key.toLowerCase()] = key
            return acc
          }, {} as Record<string, string>)

          if (parsed.chartConfig.xAxis) {
            const normalizedXAxis = lowerKeyMap[parsed.chartConfig.xAxis.toLowerCase()]
            if (normalizedXAxis) parsed.chartConfig.xAxis = normalizedXAxis
          }

          if (parsed.chartConfig.yAxis) {
            const normalizedYAxis = lowerKeyMap[parsed.chartConfig.yAxis.toLowerCase()]
            if (normalizedYAxis) parsed.chartConfig.yAxis = normalizedYAxis
          }

          // Auto-detect for pie charts
          if (parsed.chartConfig.type === "pie") {
            const categoryField =
              parsed.chartConfig.xAxis ||
              availableKeys.find((k) => typeof firstRow[k] === "string") ||
              availableKeys[0]
            const valueField =
              parsed.chartConfig.yAxis ||
              availableKeys.find((k) => typeof firstRow[k] === "number") ||
              availableKeys[1]

            parsed.chartConfig.xAxis = categoryField
            parsed.chartConfig.yAxis = valueField
          }

          chartData = {
            config: parsed.chartConfig,
            data: processedData,
          }
        }
      }
    }

    return NextResponse.json({
      explanation: parsed.explanation,
      sql: parsed.sql,
      result: sqlResult,
      sqlError: sqlError,
      chartData: chartData,
      debug: { rawResponse },
    })
  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
