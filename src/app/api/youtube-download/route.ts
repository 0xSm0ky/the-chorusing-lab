import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execAsync = promisify(exec);

// Cookie file path — stored in project root
const COOKIES_PATH = path.join(process.cwd(), "youtube-cookies.txt");

// Build the yt-dlp base command, including cookies if the file exists
function getYtDlpBase(): string {
  let cmd = `yt-dlp --js-runtimes "node:/usr/bin/node"`;
  if (fs.existsSync(COOKIES_PATH)) {
    cmd += ` --cookies ${JSON.stringify(COOKIES_PATH)}`;
  }
  return cmd;
}

// Validate YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/shorts\/[\w-]+/,
    /^https?:\/\/(m\.)?youtube\.com\/watch\?v=[\w-]+/,
  ];
  return patterns.some((p) => p.test(url));
}

// Check if error is a bot/cookie issue
function isBotError(stderr: string): boolean {
  return stderr.includes("Sign in to confirm") || stderr.includes("not a bot") || stderr.includes("cookies");
}

// GET: Fetch video metadata (title, duration, thumbnail)
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  // Special: GET with ?status=cookies returns whether cookies are configured
  if (request.nextUrl.searchParams.get("status") === "cookies") {
    return NextResponse.json({ 
      hasCookies: fs.existsSync(COOKIES_PATH),
      cookiesPath: COOKIES_PATH,
    });
  }

  if (!url) {
    return NextResponse.json({ error: "Missing 'url' parameter" }, { status: 400 });
  }

  if (!isValidYouTubeUrl(url)) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  try {
    const ytdlp = getYtDlpBase();
    const { stdout } = await execAsync(
      `${ytdlp} --no-download --print "%(title)s" --print "%(duration)s" --print "%(thumbnail)s" --print "%(id)s" ${JSON.stringify(url)}`,
      { timeout: 30000 }
    );

    const lines = stdout.trim().split("\n");
    const title = lines[0] || "Unknown";
    const duration = parseFloat(lines[1]) || 0;
    const thumbnail = lines[2] || "";
    const videoId = lines[3] || "";

    return NextResponse.json({
      title,
      duration,
      thumbnail,
      videoId,
      url,
    });
  } catch (error: any) {
    console.error("yt-dlp metadata error:", error);
    const stderr = error.stderr || error.message || "";
    
    if (isBotError(stderr)) {
      const hasCookies = fs.existsSync(COOKIES_PATH);
      return NextResponse.json(
        { 
          error: hasCookies
            ? "YouTube rejected the cookies. They may be expired — try uploading fresh cookies."
            : "YouTube requires authentication for this video. Upload your YouTube cookies to continue.",
          needsCookies: true,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch video info. Check the URL and try again." },
      { status: 500 }
    );
  }
}

// POST: Download audio as mp3 and return the file
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { url, title: providedTitle } = body;

  if (!url) {
    return NextResponse.json({ error: "Missing 'url' in request body" }, { status: 400 });
  }

  if (!isValidYouTubeUrl(url)) {
    return NextResponse.json({ error: "Invalid YouTube URL" }, { status: 400 });
  }

  const tmpDir = os.tmpdir();
  const downloadId = `yt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputTemplate = path.join(tmpDir, `${downloadId}.%(ext)s`);

  try {
    const ytdlp = getYtDlpBase();

    // Download audio only, convert to mp3
    console.log(`📥 yt-dlp: Downloading audio from ${url}`);
    const { stdout, stderr } = await execAsync(
      `${ytdlp} -x --audio-format mp3 --audio-quality 0 -o ${JSON.stringify(outputTemplate)} --no-playlist --max-filesize 100M ${JSON.stringify(url)}`,
      { timeout: 300000 } // 5 minute timeout for longer videos
    );

    console.log("yt-dlp stdout:", stdout);
    if (stderr) console.log("yt-dlp stderr:", stderr);

    // Find the output file
    const mp3Path = path.join(tmpDir, `${downloadId}.mp3`);

    if (!fs.existsSync(mp3Path)) {
      // yt-dlp might have kept the original format, look for any file with our ID
      const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(downloadId));
      if (files.length === 0) {
        throw new Error("Download completed but output file not found");
      }
      // Use the first matching file
      const actualPath = path.join(tmpDir, files[0]);
      const audioBuffer = fs.readFileSync(actualPath);
      const ext = path.extname(files[0]).slice(1);

      let title = providedTitle || "youtube-audio";
      // Sanitize only characters that are invalid in filenames, keep unicode
      let safeTitle = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 200);

      // Cleanup
      try { fs.unlinkSync(actualPath); } catch { /* ignore */ }

      return new NextResponse(audioBuffer, {
        status: 200,
        headers: {
          "Content-Type": ext === "mp3" ? "audio/mpeg" : `audio/${ext}`,
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.${ext}`,
          "X-Audio-Title": encodeURIComponent(title),
        },
      });
    }

    const audioBuffer = fs.readFileSync(mp3Path);

    let title = providedTitle || "youtube-audio";
    let safeTitle = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 200);

    // Cleanup
    try { fs.unlinkSync(mp3Path); } catch { /* ignore */ }

    console.log(`✅ yt-dlp: Downloaded ${audioBuffer.length} bytes for "${title}"`);

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.mp3`,
        "X-Audio-Title": encodeURIComponent(title),
      },
    });
  } catch (error: any) {
    console.error("yt-dlp download error:", error);

    // Cleanup any partial files
    try {
      const files = fs.readdirSync(tmpDir).filter((f) => f.startsWith(downloadId));
      files.forEach((f) => {
        try { fs.unlinkSync(path.join(tmpDir, f)); } catch { /* ignore */ }
      });
    } catch { /* ignore */ }

    const stderr = error.stderr || error.message || "";

    if (isBotError(stderr)) {
      const hasCookies = fs.existsSync(COOKIES_PATH);
      return NextResponse.json(
        { 
          error: hasCookies
            ? "YouTube rejected the cookies. They may be expired — try uploading fresh cookies."
            : "YouTube requires authentication for this video. Upload your YouTube cookies to continue.",
          needsCookies: true,
        },
        { status: 403 }
      );
    }

    const message = error.message || "Download failed";
    if (message.includes("timeout")) {
      return NextResponse.json({ error: "Download timed out. Try a shorter video." }, { status: 504 });
    }
    if (message.includes("max-filesize")) {
      return NextResponse.json({ error: "Video is too large (max 100MB audio)." }, { status: 413 });
    }

    return NextResponse.json(
      { error: "Failed to download audio. The video may be unavailable or restricted." },
      { status: 500 }
    );
  }
}

// PUT: Upload YouTube cookies file (Netscape format)
export async function PUT(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let cookieText: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("cookies") as File | null;
      if (!file) {
        return NextResponse.json({ error: "No cookies file provided" }, { status: 400 });
      }
      cookieText = await file.text();
    } else {
      cookieText = await request.text();
    }

    if (!cookieText.trim()) {
      return NextResponse.json({ error: "Empty cookies file" }, { status: 400 });
    }

    // Basic validation: should look like Netscape cookie format
    const lines = cookieText.trim().split("\n");
    const dataLines = lines.filter((l) => !l.startsWith("#") && l.trim().length > 0);
    if (dataLines.length === 0) {
      return NextResponse.json({ error: "No cookie entries found in file. Make sure it's in Netscape/Mozilla cookie format." }, { status: 400 });
    }

    // Check that at least some lines have tab-separated fields (Netscape format)
    const validLines = dataLines.filter((l) => l.split("\t").length >= 6);
    if (validLines.length === 0) {
      return NextResponse.json({ error: "Invalid cookie format. Export cookies in Netscape/Mozilla format (use a browser extension like 'Get cookies.txt LOCALLY')." }, { status: 400 });
    }

    fs.writeFileSync(COOKIES_PATH, cookieText, "utf-8");
    console.log(`🍪 YouTube cookies saved: ${validLines.length} cookie entries`);

    return NextResponse.json({ 
      success: true, 
      message: `Cookies saved (${validLines.length} entries)`,
      cookieCount: validLines.length,
    });
  } catch (error: any) {
    console.error("Cookie upload error:", error);
    return NextResponse.json({ error: "Failed to save cookies" }, { status: 500 });
  }
}

// DELETE: Remove the cookies file
export async function DELETE() {
  try {
    if (fs.existsSync(COOKIES_PATH)) {
      fs.unlinkSync(COOKIES_PATH);
      console.log("🍪 YouTube cookies removed");
      return NextResponse.json({ success: true, message: "Cookies removed" });
    }
    return NextResponse.json({ success: true, message: "No cookies file to remove" });
  } catch (error: any) {
    console.error("Cookie delete error:", error);
    return NextResponse.json({ error: "Failed to remove cookies" }, { status: 500 });
  }
}
