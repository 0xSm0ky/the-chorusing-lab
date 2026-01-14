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

    const isNowStarred = await localDb.toggleStar(id, user.userId);

    return NextResponse.json({
      success: true,
      isStarred: isNowStarred,
      message: isNowStarred ? "Clip starred" : "Clip unstarred",
    });
  } catch (error) {
    console.error("Star toggle error:", error);
    return NextResponse.json(
      { error: "Failed to toggle star" },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Check if currently starred, and if so, toggle off
    const isStarred = await localDb.isStarred(id, user.userId);
    if (isStarred) {
      await localDb.toggleStar(id, user.userId);
    }

    return NextResponse.json({
      success: true,
      message: "Clip unstarred",
    });
  } catch (error) {
    console.error("Unstar error:", error);
    return NextResponse.json(
      { error: "Failed to unstar clip" },
      { status: 500 }
    );
  }
}