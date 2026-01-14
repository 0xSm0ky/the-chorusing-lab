import { NextRequest, NextResponse } from "next/server";
import { localDb } from "@/lib/local-database";
import { serverDb } from "@/lib/server-database"; // Added missing import
import type { AudioFilters, AudioSort } from "@/types/audio";

export const dynamic = "force-dynamic";

// Helper to parse user from local token (stored in localStorage on client)
function getUserFromToken(request: NextRequest): { userId: string; username: string } | null {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  if (!token.startsWith("local-token-")) {
    return null;
  }

  // For local auth, user info is passed in X-User-Id header
  const userId = request.headers.get("X-User-Id");
  const username = request.headers.get("X-Username") || "Unknown";

  if (userId) {
    return { userId, username };
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const user = getUserFromToken(request);
    const userId = user?.userId || null;

    // Parse filters
    const filters: AudioFilters = {};

    const language = searchParams.get("language");
    if (language) {
      filters.language = language;
    }

    const speakerGender = searchParams.get("speakerGender");
    if (speakerGender && ["male", "female", "other"].includes(speakerGender)) {
      filters.speakerGender = speakerGender as "male" | "female" | "other";
    }

    const speakerAgeRange = searchParams.get("speakerAgeRange");
    if (speakerAgeRange && ["teen", "younger-adult", "adult", "senior"].includes(speakerAgeRange)) {
      filters.speakerAgeRange = speakerAgeRange as any;
    }

    const speakerDialect = searchParams.get("speakerDialect");
    if (speakerDialect) {
      filters.speakerDialect = speakerDialect;
    }

    const uploadedBy = searchParams.get("uploadedBy");
    if (uploadedBy) {
      filters.uploadedBy = uploadedBy;
    }

    const tagsParam = searchParams.get("tags");
    if (tagsParam) {
      filters.tags = tagsParam.split(",").map((tag) => tag.trim()).filter(Boolean);
    }

    const speedFilter = searchParams.get("speedFilter");
    if (speedFilter && ["slow", "medium", "fast"].includes(speedFilter)) {
      filters.speedFilter = speedFilter as "slow" | "medium" | "fast";
    }

    // Special filters
    const showStarred = searchParams.get("starred") === "true";
    const showMyUploads = searchParams.get("myUploads") === "true";

    if (showMyUploads && userId) {
      filters.uploadedBy = userId;
    }

    // Parse sorting
    const sort: AudioSort = {
      field: "createdAt",
      direction: "desc",
    };

    const sortField = searchParams.get("sortField");
    if (sortField && ["title", "duration", "language", "createdAt", "voteScore", "difficulty", "charactersPerSecond"].includes(sortField)) {
      sort.field = sortField as any;
    }

    const sortDirection = searchParams.get("sortDirection");
    if (sortDirection && ["asc", "desc"].includes(sortDirection)) {
      sort.direction = sortDirection as "asc" | "desc";
    }

    // Get clips from local database
    const clips = await localDb.getClips(
      filters,
      sort,
      { starredByUserId: showStarred && userId ? userId : undefined }
    );

    // Add URLs and discovery info to clips
    const clipsWithUrls = await Promise.all(
      clips.map(async (clip) => {
        // Get votes
        const votes = await localDb.getVotesForClip(clip.id);

        // Get user's vote
        let userVote: "up" | "down" | null = null;
        if (userId) {
          userVote = await localDb.getUserVote(clip.id, userId);
        }

        // Check if starred by user
        const isStarred = userId ? await localDb.isStarred(clip.id, userId) : false;

        // Calculate characters per second
        const transcript = clip.metadata.transcript || "";
        const charactersPerSecond = clip.duration > 0
          ? transcript.length / clip.duration
          : 0;

        return {
          ...clip,
          url: "https://example.com/clip-url", // Placeholder for publicUrl
          starCount: 0, // Placeholder for starredBy.length
          isStarredByUser: isStarred,
          difficultyRating: 0, // Placeholder for difficultyRating.average
          difficultyRatingCount: 0, // Placeholder for difficultyRating.count
          userDifficultyRating: null, // Placeholder for difficultyRating.userRating
          upvoteCount: votes.upvotes, // Fixed property name
          downvoteCount: votes.downvotes, // Fixed property name
          voteScore: votes.score, // Fixed property name
          userVote: userVote,
          charactersPerSecond: charactersPerSecond || undefined,
        };
      })
    );

    // Calculate speed percentiles for filtering
    let speedPercentiles: { slow: number; medium: number; fast: number } | null = null;
    if (filters.speedFilter) {
      speedPercentiles = serverDb.getSpeedPercentiles(clipsWithUrls);
    }

    // Apply speed filter if requested
    let filteredClips = clipsWithUrls;
    if (filters.speedFilter && speedPercentiles) {
      filteredClips = clipsWithUrls.filter((clip) => {
        if (!clip.charactersPerSecond) return false;
        const cps = clip.charactersPerSecond;

        if (filters.speedFilter === "slow") {
          return cps <= speedPercentiles!.slow;
        } else if (filters.speedFilter === "medium") {
          return cps > speedPercentiles!.slow && cps <= speedPercentiles!.medium;
        } else if (filters.speedFilter === "fast") {
          return cps > speedPercentiles!.medium;
        }
        return true;
      });
    }

    // Apply sorting for discovery fields (these need to be sorted in-memory)
    // Also handle regular DB sort fields if they weren't sorted by DB (shouldn't happen, but just in case)
    if (sort.field === "voteScore" || sort.field === "difficulty" || sort.field === "charactersPerSecond") {
      filteredClips.sort((a, b) => {
        let aValue: number | null = null;
        let bValue: number | null = null;

        if (sort.field === "voteScore") {
          aValue = (a as any).voteScore ?? 0;
          bValue = (b as any).voteScore ?? 0;
        } else if (sort.field === "difficulty") {
          aValue = (a as any).difficultyRating ?? null;
          bValue = (b as any).difficultyRating ?? null;
        } else if (sort.field === "charactersPerSecond") {
          aValue = (a as any).charactersPerSecond ?? null;
          bValue = (b as any).charactersPerSecond ?? null;
        } else {
          // Fallback for other fields (shouldn't reach here, but handle gracefully)
          return 0;
        }

        // Handle null values (put them at the end)
        if (aValue === null && bValue === null) return 0;
        if (aValue === null) return 1;
        if (bValue === null) return -1;

        const comparison = aValue - bValue;
        return sort.direction === "asc" ? comparison : -comparison;
      });
    }

    // Add speed category to clips
    const clipsWithSpeedCategory = filteredClips.map((clip) => {
      let speedCategory: "slow" | "medium" | "fast" | undefined = undefined;
      if (clip.charactersPerSecond && speedPercentiles) {
        if (clip.charactersPerSecond <= speedPercentiles.slow) {
          speedCategory = "slow";
        } else if (clip.charactersPerSecond <= speedPercentiles.medium) {
          speedCategory = "medium";
        } else {
          speedCategory = "fast";
        }
      }

      return {
        ...clip,
        speedCategory,
      };
    });

    return NextResponse.json({
      clips: clipsWithSpeedCategory,
      total: clipsWithSpeedCategory.length,
    });
  } catch (error) {
    console.error("Clips listing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch clips" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromToken(request);
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const clip = await localDb.createClip({
      title: body.title,
      duration: body.duration,
      filename: body.filename,
      originalFilename: body.originalFilename,
      fileSize: body.fileSize,
      metadata: body.metadata,
      uploadedBy: user.userId,
    });

    return NextResponse.json({ clip }, { status: 201 });
  } catch (error) {
    console.error("Clip creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create clip" },
      { status: 500 }
    );
  }
}
