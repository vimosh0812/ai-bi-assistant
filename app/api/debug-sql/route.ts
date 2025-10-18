import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'http://localhost:3000';
    const fullUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
    
    // Test internal API call
    let internalTest = "Not attempted";
    try {
      const testResponse = await fetch(`${fullUrl}/api/execute-sql-unified`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          sqlQuery: "SELECT COUNT(*) as count", 
          data: [{ test: 1 }], 
          headers: ["test"],
          method: 'simple'
        }),
      });
      
      if (testResponse.ok) {
        const result = await testResponse.json();
        internalTest = `Success: ${JSON.stringify(result)}`;
      } else {
        internalTest = `HTTP ${testResponse.status}: ${testResponse.statusText}`;
      }
    } catch (error) {
      internalTest = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return NextResponse.json({
      success: true,
      environment: {
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        VERCEL_URL: process.env.VERCEL_URL,
        NODE_ENV: process.env.NODE_ENV,
        baseUrl,
        fullUrl
      },
      internalTest,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
