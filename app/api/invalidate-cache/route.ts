import { NextRequest, NextResponse } from "next/server";
import { invalidateFileCache } from '@/lib/sql-cache-utils';

export async function POST(request: NextRequest) {
  try {
    const { fileId, userId } = await request.json();
    
    if (!fileId || !userId) {
      return NextResponse.json({ error: "Missing fileId or userId" }, { status: 400 });
    }

    console.log(`Invalidating cache for file ${fileId} and user ${userId}`);
    
    await invalidateFileCache(fileId, userId);
    
    return NextResponse.json({ 
      success: true, 
      message: "Cache invalidated successfully" 
    });

  } catch (error) {
    console.error("Cache invalidation error:", error);
    return NextResponse.json(
      { error: "Failed to invalidate cache" },
      { status: 500 }
    );
  }
}
