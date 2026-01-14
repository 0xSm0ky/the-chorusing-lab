import { NextRequest, NextResponse } from 'next/server';
import { localDb, AUDIO_DIR } from '@/lib/local-database';
import type { AudioMetadata } from '@/types/audio';
import fs from 'fs';
import path from 'path';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for local storage
const SUPPORTED_FORMATS = ['mp3', 'wav', 'm4a', 'ogg', 'webm'];

function generateUniqueFilename(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  const extension = originalName.split('.').pop()?.toLowerCase() || '';
  const baseName = originalName.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\-_]/g, '_');
  return `${timestamp}-${random}-${baseName}.${extension}`;
}

function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB.`;
  }

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !SUPPORTED_FORMATS.includes(extension)) {
    return `Unsupported format. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`;
  }

  return null;
}

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
  
  // For local auth, user info is passed in X-User-Id header
  const userId = request.headers.get("X-User-Id");
  const username = request.headers.get("X-Username") || "Unknown";
  
  if (userId) {
    return { userId, username };
  }
  
  return null;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Local upload request received');
    
    // Get user from auth header
    const user = getUserFromToken(request);
    if (!user) {
      console.error('❌ No authentication provided');
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    console.log('✅ User authenticated:', user.username);

    // Parse form data
    const formData = await request.formData();
    
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const durationStr = formData.get('duration') as string;
    const language = formData.get('language') as string;
    const speakerGender = formData.get('speakerGender') as string;
    const speakerAgeRange = formData.get('speakerAgeRange') as string;
    const speakerDialect = formData.get('speakerDialect') as string;
    const transcript = formData.get('transcript') as string;
    const sourceUrl = formData.get('sourceUrl') as string;
    const tags = formData.get('tags') as string;

    console.log('📝 Processing upload:', title, `(${file?.size} bytes)`);

    // Validate required fields
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!title?.trim()) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    if (!language?.trim()) {
      return NextResponse.json(
        { error: 'Language is required' },
        { status: 400 }
      );
    }

    // Validate file
    const fileValidationError = validateFile(file);
    if (fileValidationError) {
      return NextResponse.json(
        { error: fileValidationError },
        { status: 400 }
      );
    }

    // Get duration from form data
    let duration: number = 0;
    if (durationStr && !isNaN(Number(durationStr)) && Number(durationStr) > 0) {
      duration = Number(durationStr);
    }

    // Validate speaker age range if provided
    const validAgeRanges = ['teen', 'younger-adult', 'adult', 'senior'];
    if (speakerAgeRange && !validAgeRanges.includes(speakerAgeRange)) {
      return NextResponse.json(
        { error: 'Invalid speaker age range' },
        { status: 400 }
      );
    }

    // Validate speaker gender if provided
    const validGenders = ['male', 'female', 'other'];
    if (speakerGender && !validGenders.includes(speakerGender)) {
      return NextResponse.json(
        { error: 'Invalid speaker gender' },
        { status: 400 }
      );
    }

    // Generate unique filename
    const filename = generateUniqueFilename(file.name);

    try {
      // Save file locally
      console.log('📤 Saving file locally...');
      
      // Ensure audio directory exists
      if (!fs.existsSync(AUDIO_DIR)) {
        fs.mkdirSync(AUDIO_DIR, { recursive: true });
      }
      
      // Convert file to buffer and save
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const filePath = path.join(AUDIO_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      
      console.log('✅ File saved successfully:', filePath);

      // Prepare metadata
      const metadata: AudioMetadata = {
        language: language.trim(),
        speakerGender: speakerGender as any || undefined,
        speakerAgeRange: speakerAgeRange as any || undefined,
        speakerDialect: speakerDialect || undefined,
        transcript: transcript || undefined,
        sourceUrl: sourceUrl || undefined,
        tags: tags ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : [],
      };

      // Save to local database
      console.log('💾 Saving clip metadata to database...');
      
      const audioClip = await localDb.createClip({
        title: title.trim(),
        duration,
        filename,
        originalFilename: file.name,
        fileSize: file.size,
        metadata,
        uploadedBy: user.userId,
      });

      console.log('✅ Upload complete:', audioClip.title);

      return NextResponse.json({
        success: true,
        clip: audioClip,
      });

    } catch (uploadError) {
      console.error('💥 Upload process failed:', uploadError);
      throw uploadError;
    }

  } catch (error) {
    console.error('❌ Upload error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }
}
