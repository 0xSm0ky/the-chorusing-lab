import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    const accessToken = authHeader.substring(7);
    
    // Verify token using standard client (no custom storage)
    const { user, error } = await verifyAccessToken(accessToken);

    if (error || !user) {
      return NextResponse.json({ isAdmin: false }, { status: 200 });
    }

    const adminStatus = isAdmin(user.id);

    return NextResponse.json({
      isAdmin: adminStatus,
    });
  } catch (error) {
    console.error("Admin status check error:", error);
    return NextResponse.json({ isAdmin: false }, { status: 200 });
  }
}
