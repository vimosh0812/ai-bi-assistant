import { NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { headers, rows, preprocessingSteps } = await req.json();
    if (!headers || !rows || !Array.isArray(rows)) {
      return NextResponse.json({ error: "Missing headers or rows" }, { status: 400 });
    }

    // Take up to 5 random non-empty rows
    const sampleRows = [...rows]
      .filter(r => Object.values(r).some(v => typeof v === "string" && v.trim() !== ""))
      .sort(() => 0.5 - Math.random())
      .slice(0, 5);

    const preview = sampleRows.map((row, i) => `${i + 1}. ${JSON.stringify(row)}`).join("\n");

    // Include preprocessing steps info in the prompt
    const preprocessingNote = preprocessingSteps && preprocessingSteps.length
      ? `Note: The following preprocessing has already been applied to the dataset:\n- ${preprocessingSteps.join("\n- ")}`
      : "";

    const prompt = `You are a data analyst assistant.
You are given CSV headers and a few sample rows.
Provide a high-level human-readable summary of what this dataset seems to represent.
Do not assume column types or units. Do not mention values in the rows. Plain text only.

${preprocessingNote}

Additionally:
- Identify columns that likely contain email addresses and return them as a list.
- Identify columns that contain or indicate currency. Only mark a column as currency if:
  1) The column name explicitly suggests money (e.g., amount, price, cost, total), OR
  2) The values contain currency symbols (e.g., $, ₹, €, PKR, INR).
- Do NOT treat numeric columns without monetary indicators as currency (for example, Quantity or Count should NOT be currency).
- For each currency column, include the detected currency name or symbol (e.g., "Amount (USD)", "Price ($)", "Total (INR)").
- Do NOT treat numeric columns like Quantity, Count, or Units as currency even if other columns contain currency symbols.
- Suggest modified headers where currency columns should be renamed as 'column_name (currency name or symbol)' for clarity.
- Optionally, describe how numeric conversion can be applied to currency columns.

Return a JSON object like this:
{
  "summary": "High-level description of dataset including preprocessing notes",
  "emailColumns": ["column1", "column2"],
  "currencyColumns": [
    { "name": "column3", "currency": "USD" },
    { "name": "column4", "currency": "INR" }
  ],
  "modifiedHeaders": ["col1", "col2 (currency name or symbol)", "col3"]
}

Headers: ${headers.join(", ")}
Sample Rows:
${preview}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful data analyst assistant." },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const rawResponse = completion.choices[0]?.message?.content ?? "{}";

    let parsed: {
      summary: string;
      emailColumns: string[];
      currencyColumns: string[];
      modifiedHeaders: string[];
    } = { summary: "No summary", emailColumns: [], currencyColumns: [], modifiedHeaders: headers };
    console.log("AI Summary raw response:", rawResponse);
    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      console.warn("Failed to parse AI JSON, returning raw text summary.");
      parsed.summary = rawResponse;
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error("AI Summary error:", err);
    return NextResponse.json(
      { summary: "Failed to generate AI summary", emailColumns: [], currencyColumns: [], modifiedHeaders: [] },
      { status: 500 }
    );
  }
}
