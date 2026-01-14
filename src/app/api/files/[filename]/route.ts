import { NextRequest, NextResponse } from 'next/server';
import { AUDIO_DIR } from '@/lib/local-database';
import fs from 'fs';
import path from 'path';

// Get MIME type from extension
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'ogg': 'audio/ogg',
    'webm': 'audio/webm',
  };
  return mimeTypes[ext || ''] || 'application/octet-stream';
}

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    let { filename } = params;
    
    // Decode URL-encoded filename
    try {
      filename = decodeURIComponent(filename);
    } catch (decodeError) {
      // Use raw filename if decoding fails
    }
    
    // Basic security check - prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    // Build the file path
    const filePath = path.join(AUDIO_DIR, filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read file and return it
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(filename);
    
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': fileBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
      },
    });
    
  } catch (error) {
    console.error('File serving error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}