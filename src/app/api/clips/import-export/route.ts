import { NextRequest, NextResponse } from 'next/server';
import { writeFile, unlink, readFile } from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { createReadStream } from 'fs';
import { localDb, AUDIO_DIR } from '@/lib/local-database';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Inline ZIP import implementation
 * Handles audio-only ZIPs by auto-generating clip metadata from filenames
 */
async function importFromZip(zipFilePath: string): Promise<{
  success: boolean;
  importedCount: number;
  errors: string[];
}> {
  const unzipper = require('unzipper');
  let importedCount = 0;
  const errors: string[] = [];

  try {
    const tempDir = path.join(process.cwd(), '.temp-import', `import-${Date.now()}`);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    console.log('\n📦 IMPORT START: Extracting ZIP...');
    console.log('📂 Source:', zipFilePath);
    console.log('📂 Destination:', tempDir);

    // Extract ZIP
    await new Promise<void>((resolve, reject) => {
      createReadStream(zipFilePath)
        .pipe(unzipper.Extract({ path: tempDir }))
        .on('close', () => {
          console.log('✅ ZIP extraction complete');
          resolve();
        })
        .on('error', (err: any) => {
          console.error('❌ ZIP extraction error:', err);
          reject(err);
        });
    });

    // List files in extracted directory
    const filesInTemp = fs.readdirSync(tempDir);
    console.log('📋 Files extracted:', filesInTemp);

    // Try to find and read manifest
    let manifest: any = null;
    const manifestPath = path.join(tempDir, 'manifest.json');

    if (fs.existsSync(manifestPath)) {
      console.log('✅ Found manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      const parsed = JSON.parse(manifestContent);

      if (Array.isArray(parsed)) {
        manifest = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          clipCount: parsed.length,
          clips: parsed.map((clip: any) => ({
            clip,
            audioFilename: clip.filename,
          })),
        };
      } else if (parsed.clips && Array.isArray(parsed.clips)) {
        manifest = parsed;
      } else {
        manifest = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          clipCount: 1,
          clips: [{ clip: parsed, audioFilename: parsed.filename }],
        };
      }
    } else {
      console.log('❌ manifest.json not found - checking for audio files...');

      // Fallback: look for clips.json (old format)
      const clipsJsonPath = path.join(tempDir, 'clips.json');
      if (fs.existsSync(clipsJsonPath)) {
        console.log('⚠️  Found clips.json (old format)');
        const clipsContent = fs.readFileSync(clipsJsonPath, 'utf-8');
        const clipsArray = JSON.parse(clipsContent);

        if (Array.isArray(clipsArray)) {
          manifest = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            clipCount: clipsArray.length,
            clips: clipsArray.map((clip: any) => ({
              clip,
              audioFilename: clip.filename,
            })),
          };
          console.log('✅ Converted old format to manifest structure');
        }
      }

      // Last resort: scan for audio files recursively and auto-generate clips
      if (!manifest) {
        const audioFiles: Array<{ fullPath: string; relPath: string }> = [];

        // Recursively scan tempDir for audio files
        function scanForAudioFiles(dir: string, relativePath: string = ''): void {
          const entries = fs.readdirSync(dir);
          for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const relPath = relativePath ? path.join(relativePath, entry) : entry;

            if (fs.statSync(fullPath).isDirectory()) {
              // Recurse into subdirectories
              scanForAudioFiles(fullPath, relPath);
            } else {
              // Check if it's an audio file
              const lower = entry.toLowerCase();
              if (
                lower.endsWith('.mp3') ||
                lower.endsWith('.wav') ||
                lower.endsWith('.m4a') ||
                lower.endsWith('.ogg')
              ) {
                audioFiles.push({
                  fullPath,
                  relPath,
                });
              }
            }
          }
        }

        scanForAudioFiles(tempDir);

        if (audioFiles.length === 0) {
          const allFiles = fs.readdirSync(tempDir, { recursive: true } as any);
          console.error('All files in ZIP:', allFiles);
          errors.push('Invalid export file: no manifest.json/clips.json or audio files found');
          return { success: false, importedCount: 0, errors };
        }

        console.log('📥 No manifest found, auto-creating clips from audio files:', audioFiles.length, 'files');

        manifest = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          clipCount: audioFiles.length,
          clips: audioFiles.map((audioFile) => {
            const baseTitle = path.basename(audioFile.relPath, path.extname(audioFile.relPath));
            const clip: any = {
              title: baseTitle,
              duration: 0,
              filename: path.basename(audioFile.relPath),
              originalFilename: path.basename(audioFile.relPath),
              fileSize: 0,
              metadata: {
                language: 'unknown',
                speakerGender: 'other',
                speakerAgeRange: 'adult',
                speakerDialect: 'unknown',
                transcript: '',
                sourceUrl: '',
                tags: [],
              },
            };

            return {
              clip,
              audioFilename: audioFile.relPath,
              audioFullPath: audioFile.fullPath,
            };
          }),
        };

        console.log('✅ Auto-generated manifest from audio files:', {
          clipCount: manifest.clipCount,
        });
      }
    }

    if (!manifest) {
      console.error('❌ No valid manifest found in ZIP');
      const allFiles = fs.readdirSync(tempDir, { recursive: true } as any);
      console.error('All files in ZIP:', allFiles);
      errors.push('Invalid export file: no manifest.json or clips.json found');
      return { success: false, importedCount: 0, errors };
    }

    if (!manifest.clips || !Array.isArray(manifest.clips)) {
      console.error('❌ manifest.clips is not an array');
      errors.push('Invalid manifest format: clips is not an array');
      return { success: false, importedCount: 0, errors };
    }

    console.log('🔄 Importing', manifest.clips.length, 'clips...');

    // Import each clip
    for (const item of manifest.clips) {
      try {
        const { id, createdAt, updatedAt, ...clipData } = item.clip;
        const newClip = await localDb.createClip(clipData);
        console.log('  ✅ Imported:', newClip.title);

        // Copy audio file if it exists
        let sourceAudioPath: string;

        // Check if audioFullPath is provided (from recursive scan)
        if (item.audioFullPath && fs.existsSync(item.audioFullPath)) {
          sourceAudioPath = item.audioFullPath;
        } else {
          // Try standard locations
          sourceAudioPath = path.join(tempDir, 'audio', item.audioFilename);
          if (!fs.existsSync(sourceAudioPath)) {
            // Try root of tempDir
            sourceAudioPath = path.join(tempDir, item.audioFilename);
          }
        }

        const destAudioPath = path.join(AUDIO_DIR, newClip.filename);

        if (fs.existsSync(sourceAudioPath)) {
          fs.copyFileSync(sourceAudioPath, destAudioPath);
          console.log('     📁 Audio copied');
        }

        importedCount++;
      } catch (error) {
        console.error('  ❌ Import failed:', error);
        errors.push(`Failed to import clip: ${String(error)}`);
      }
    }

    console.log('✅ IMPORT COMPLETE:', importedCount, 'clips imported');

    // Cleanup temp directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log('🧹 Cleaned up temp directory');
    } catch (cleanupError) {
      console.warn('⚠️  Could not clean up temp directory:', cleanupError);
    }

    return { success: importedCount > 0, importedCount, errors };
  } catch (error) {
    console.error('❌ Import error:', error);
    errors.push(`Import failed: ${String(error)}`);
    return { success: false, importedCount, errors };
  }
}

// GET - Export clips (handles ZIP export)
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const clipIds = searchParams.getAll('clipIds');

    if (!clipIds || clipIds.length === 0) {
      return NextResponse.json({ error: 'No clip IDs provided' }, { status: 400 });
    }

    // Export as ZIP (with audio files)
    const archiver = require('archiver');
    const tempFile = path.join(os.tmpdir(), `clips-export-${Date.now()}.zip`);

    // Get the clips from database
    const allClips = await localDb.getClips();
    const clipsToExport = allClips.filter((c: any) => clipIds.includes(c.id));

    if (clipsToExport.length === 0) {
      return NextResponse.json({ error: 'No clips found to export' }, { status: 400 });
    }

    console.log('\n🎯 EXPORT START: Creating ZIP with', clipsToExport.length, 'clips');

    // Create ZIP file
    const output = fs.createWriteStream(tempFile);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise<Response>((resolve) => {
      output.on('close', async () => {
        console.log('✅ ZIP file created successfully');

        const fileBuffer = await readFile(tempFile);

        // Cleanup temp file
        try {
          await unlink(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }

        resolve(
          new NextResponse(fileBuffer, {
            headers: {
              'Content-Type': 'application/zip',
              'Content-Disposition': `attachment; filename="clips-export-${Date.now()}.zip"`,
            },
          })
        );
      });

      archive.on('error', (err: any) => {
        console.error('❌ Archive error:', err);
        resolve(
          NextResponse.json({ error: 'Failed to create ZIP' }, { status: 500 })
        );
      });

      archive.pipe(output);

      // Add audio files to /audio folder in ZIP
      console.log('📦 Adding', clipsToExport.length, 'audio files to ZIP...');
      for (const clip of clipsToExport) {
        const audioPath = path.join(AUDIO_DIR, clip.filename);
        if (fs.existsSync(audioPath)) {
          archive.file(audioPath, { name: `audio/${clip.filename}` });
        }
      }

      // Create manifest object
      const manifest: any = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        clipCount: clipsToExport.length,
        clips: clipsToExport.map((clip: any) => ({
          clip: clip,
          audioFilename: clip.filename,
        })),
      };

      console.log('📝 Adding manifest.json...');
      const manifestJson = JSON.stringify(manifest, null, 2);
      archive.append(Buffer.from(manifestJson, 'utf-8'), { name: 'manifest.json' });

      console.log('🔄 Finalizing ZIP archive...');
      archive.finalize();
    });
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
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileBuffer = await file.arrayBuffer();
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (extension === 'zip') {
      // Import from ZIP
      const tempFile = path.join(os.tmpdir(), `clips-import-${Date.now()}.zip`);
      await writeFile(tempFile, Buffer.from(fileBuffer));

      const result = await importFromZip(tempFile);

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
    } else {
      return NextResponse.json(
        { error: 'Unsupported file format. Use .zip' },
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
