import { NextRequest, NextResponse } from "next/server";
import { localDb } from "@/lib/local-database";
import type { AudioMetadata } from "@/types/audio";

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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const clip = await localDb.getClipById(id);

    if (!clip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    // Add URL
    const clipWithUrl = {
      ...clip,
      url: `/api/files/${clip.filename}`,
    };

    return NextResponse.json({ clip: clipWithUrl });
  } catch (error) {
    console.error("Get clip error:", error);
    return NextResponse.json(
      { error: "Failed to get clip" },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { title, metadata } = body;

    // Validate required fields
    if (!title?.trim()) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    if (!metadata?.language) {
      return NextResponse.json(
        { error: "Language is required" },
        { status: 400 }
      );
    }

    // Get the clip first to check ownership
    const clip = await localDb.getClipById(id);

    if (!clip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    // Check if user owns this clip or is an admin
    const isUserAdmin = await localDb.isAdmin(user.userId);
    if (clip.uploadedBy !== user.userId && !isUserAdmin) {
      return NextResponse.json(
        { error: "Unauthorized to edit this clip" },
        { status: 403 }
      );
    }

    // Prepare clean metadata
    const cleanMetadata: AudioMetadata = {
      language: metadata.language,
      speakerGender: metadata.speakerGender || undefined,
      speakerAgeRange: metadata.speakerAgeRange || undefined,
      speakerDialect: metadata.speakerDialect?.trim() || undefined,
      transcript: metadata.transcript?.trim() || undefined,
      sourceUrl: metadata.sourceUrl?.trim() || undefined,
      tags: Array.isArray(metadata.tags)
        ? metadata.tags.filter(Boolean)
        : typeof metadata.tags === "string"
        ? metadata.tags
            .split(",")
            .map((tag: string) => tag.trim())
            .filter(Boolean)
        : [],
    };

    try {
      const updatedClip = await localDb.updateClip(
        id,
        {
          title: title.trim(),
          metadata: cleanMetadata,
        },
        user.userId
      );

      if (!updatedClip) {
        return NextResponse.json({ error: "Clip not found" }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        clip: updatedClip,
      });
    } catch (updateError: any) {
      console.error("Update clip error:", updateError);
      if (updateError.message?.includes("Not authorized")) {
        return NextResponse.json(
          { error: "Unauthorized to edit this clip" },
          { status: 403 }
        );
      }
      throw updateError;
    }
  } catch (error) {
    console.error("Update clip error:", error);
    return NextResponse.json(
      { error: "Failed to update clip" },
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

    // Get the clip first to check ownership
    const clip = await localDb.getClipById(id);

    if (!clip) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    // Check if user owns this clip or is an admin
    const isUserAdmin = await localDb.isAdmin(user.userId);
    if (clip.uploadedBy !== user.userId && !isUserAdmin) {
      return NextResponse.json(
        { error: "Unauthorized to delete this clip" },
        { status: 403 }
      );
    }

    // Delete from database (this also deletes the audio file)
    const deleted = await localDb.deleteClip(id, user.userId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Failed to delete clip" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Clip deleted successfully",
    });
  } catch (error: any) {
    console.error("Delete clip error:", error);
    if (error.message?.includes("Not authorized")) {
      return NextResponse.json(
        { error: "Unauthorized to delete this clip" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Failed to delete clip" },
      { status: 500 }
    );
  }
}
