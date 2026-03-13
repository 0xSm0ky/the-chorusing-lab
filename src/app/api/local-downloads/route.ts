import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const storageDir = path.join(process.cwd(), "local-data", "downloads");
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

export async function GET() {
  try {
    const files = fs.readdirSync(storageDir)
      .filter((f) => fs.statSync(path.join(storageDir, f)).isFile())
      .map((f) => {
        const s = fs.statSync(path.join(storageDir, f));
        return {
          filename: f,
          size: s.size,
          mtime: s.mtime.getTime(),
          url: `/api/files/${encodeURIComponent(f)}`,
        };
      });
    return NextResponse.json({ files });
  } catch (err) {
    return NextResponse.json({ error: "Failed to list files" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("all") === "1") {
      const files = fs.readdirSync(storageDir).filter((f) => fs.statSync(path.join(storageDir, f)).isFile());
      files.forEach((f) => {
        try { fs.unlinkSync(path.join(storageDir, f)); } catch {}
      });
      return NextResponse.json({ success: true, deleted: files.length });
    }

    const body = await request.json();
    const filename = body?.filename;
    if (!filename) return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    const safe = path.basename(filename);
    const target = path.join(storageDir, safe);
    if (!fs.existsSync(target)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    fs.unlinkSync(target);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }
}

// POST used for import: { filename }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filename = body?.filename;
    if (!filename) return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    const safe = path.basename(filename);
    const src = path.join(storageDir, safe);
    if (!fs.existsSync(src)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const destDir = path.join(process.cwd(), "local-data", "audio");
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const dest = path.join(destDir, safe);
    fs.renameSync(src, dest);
    return NextResponse.json({ success: true, movedTo: `/api/files/${encodeURIComponent(safe)}` });
  } catch (err) {
    return NextResponse.json({ error: "Failed to import file" }, { status: 500 });
  }
}
