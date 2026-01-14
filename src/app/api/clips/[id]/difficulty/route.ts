import { NextRequest, NextResponse } from "next/server";
import { localDb } from "@/lib/local-database";

export const dynamic = "force-dynamic";

// Helper to parse user from local token
function getUserFromToken(request: NextRequest): { userId: string; username: string } | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  
  const token = authHeader.substring(7);
  if (!token.startsWith("local-token-")) {
    return null;
  }
  
  const userId = request.headers.get("X-User-Id");
  const username = request.headers.get("X-Username") || "Unknown";
  
  if (userId) {
    return { userId, username };
  }
  
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const user = getUserFromToken(request);

    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { rating } = body;

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5 || !Number.isInteger(rating)) {
      return NextResponse.json(
        { error: "Rating must be an integer between 1 and 5" },
        { status: 400 }
      );
    }

    await localDb.setDifficulty(id, user.userId, rating);

    // Get the updated clip to return new difficulty average
    const clip = await localDb.getClipById(id);

    return NextResponse.json({
      success: true,
      rating: (clip as any)?.difficulty || rating,
      count: Object.keys((clip as any)?.difficultyRatings || {}).length,
    });
  } catch (error) {
    console.error("Difficulty rating error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to rate clip difficulty" },
      { status: 500 }
    );
  }
}
