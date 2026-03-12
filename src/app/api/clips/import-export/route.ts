import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  exportClipsAsZip,
  exportClipsAsJson,
  importClipsFromZip,
  importClipsFromJson,
} from '@/lib/clip-import-export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// GET - Export clips (handles ZIP and JSON export formats)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clipIds = searchParams.getAll('clipIds');
    const format = searchParams.get('format') || 'zip';

    if (!clipIds || clipIds.length === 0) {
      return NextResponse.json(
        { error: 'No clip IDs provided' },
        { status: 400 }
      );
    }

    if (format === 'json') {
      // Export as JSON (metadata only)
      const data = await exportClipsAsJson(clipIds);
      return NextResponse.json(data, {
        headers: {
          'Content-Disposition': `attachment; filename="clips-export-${Date.now()}.json"`,
        },
      });
    } else if (format === 'zip') {
      // Export as ZIP (with audio files)
      const tempFile = path.join(os.tmpdir(), `clips-export-${Date.now()}.zip`);
      const result = await exportClipsAsZip(clipIds, tempFile);

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const fileBuffer = await readFile(tempFile);
      
      // Cleanup temp file
      try {
        await unlink(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="clips-export-${Date.now()}.zip"`,
        },
      });
    } else {
      return NextResponse.json(
        { error: 'Unsupported format. Use "json" or "zip"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Export failed',
      },
      { status: 500 }
    );
  }
}

// POST - Import clips
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const fileBuffer = await file.arrayBuffer();
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'zip') {
      // Import from ZIP
      const tempFile = path.join(os.tmpdir(), `clips-import-${Date.now()}.zip`);
      await writeFile(tempFile, Buffer.from(fileBuffer));

      const result = await importClipsFromZip(tempFile);

      // Cleanup temp file
      try {
        await unlink(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }

      return NextResponse.json({
        success: result.success,
        importedCount: result.importedCount,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } else if (extension === 'json') {
      // Import from JSON
      const text = await file.text();
      const jsonData = JSON.parse(text);

      const result = await importClipsFromJson(jsonData);

      return NextResponse.json({
        success: result.success,
        importedCount: result.importedCount,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } else {
      return NextResponse.json(
        { error: 'Unsupported file format. Use .zip or .json' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Import failed',
      },
      { status: 500 }
    );
  }
}
