import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
  request: Request,
  { params }: { params?: Promise<{ tableName?: string, page?: string; limit?: string }> },
) {
  try {
    if (!params) {
      return NextResponse.json({ error: "Parameters are required" }, { status: 400 })
    }
    const { tableName: tableNameValue, page: pageValue, limit: limitValue } = await params;
    const tableName = tableNameValue;
    const page = pageValue ? Number.parseInt(pageValue) : 1;
    const limit = limitValue ? Number.parseInt(limitValue) : 10;

    if (!tableName) {
      return NextResponse.json({ error: "Table name is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Verify user authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get total count
    const { count, error: countError } = await supabase.from(tableName).select("*", { count: "exact", head: true })

    if (countError) {
      console.error("Error getting count:", countError)
      return NextResponse.json({ error: "Failed to get data count" }, { status: 500 })
    }

    // Get paginated data
    const offset = (page - 1) * limit
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .range(offset, offset + limit - 1)
      .order("id", { ascending: true })

    if (error) {
      console.error("Error fetching data:", error)
      return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 })
    }

    // Get column information
    const columns =
      data && data.length > 0 ? Object.keys(data[0]).filter((key) => key !== "id" && key !== "created_at") : []

    return NextResponse.json({
      data: data || [],
      columns,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })
  } catch (error) {
    console.error("Error in get-csv-data API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
