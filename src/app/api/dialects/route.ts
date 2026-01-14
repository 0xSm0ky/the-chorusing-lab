import { NextRequest, NextResponse } from "next/server";
import { localDb } from "@/lib/local-database";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const language = searchParams.get("language");

    if (!language) {
      return NextResponse.json(
        { error: "Language parameter is required" },
        { status: 400 }
      );
    }

    // Get clips and extract unique dialects for the specified language
    const clips = await localDb.getClips({ language });
    
    // Extract unique dialects and sort them
    const dialects = Array.from(
      new Set(
        clips
          .map((clip) => clip.metadata.speakerDialect)
          .filter((dialect): dialect is string => !!dialect)
      )
    ).sort();

    return NextResponse.json({ dialects });
  } catch (error) {
    console.error("Get dialects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dialects" },
      { status: 500 }
    );
  }
}
