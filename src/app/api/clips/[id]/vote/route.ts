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
    const { voteType } = body;

    if (!voteType || (voteType !== "up" && voteType !== "down")) {
      return NextResponse.json(
        { error: "voteType must be 'up' or 'down'" },
        { status: 400 }
      );
    }

    await localDb.setVote(id, user.userId, voteType);

    // Get updated vote stats
    const voteStats = await localDb.getVotesForClip(id);

    return NextResponse.json({
      success: true,
      upvoteCount: voteStats.upvotes,
      downvoteCount: voteStats.downvotes,
      voteScore: voteStats.score,
    });
  } catch (error) {
    console.error("Vote error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to vote clip" },
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

    await localDb.setVote(id, user.userId, null);

    // Get updated vote stats
    const voteStats = await localDb.getVotesForClip(id);

    return NextResponse.json({
      success: true,
      upvoteCount: voteStats.upvotes,
      downvoteCount: voteStats.downvotes,
      voteScore: voteStats.score,
    });
  } catch (error) {
    console.error("Remove vote error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove vote" },
      { status: 500 }
    );
  }
}
