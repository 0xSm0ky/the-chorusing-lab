// Import/Export utility for local clips and audio files
// Handles zipping clips with their audio files and extracting them back

import * as fs from 'fs';
import * as path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import type { AudioClip } from '@/types/audio';
import { localDb, AUDIO_DIR } from '@/lib/local-database';

export interface ClipExportManifest {
  version: '1.0';
  exportedAt: string;
  clipCount: number;
  clips: Array<{
    clip: AudioClip;
    audioFilename: string;
  }>;
}

/**
 * Create an export package (ZIP) containing clips and their audio files
 */
export async function exportClipsAsZip(
  clipIds: string[],
  outputPath: string
): Promise<{ success: boolean; filePath: string; clipCount: number; error?: string }> {
  try {
    const archiver = require('archiver');
    
    // Get the clips from database
    const allClips = await localDb.getClips();
    const clipsToExport = allClips.filter((c: any) => clipIds.includes(c.id));

    if (clipsToExport.length === 0) {
      return {
        success: false,
        filePath: outputPath,
        clipCount: 0,
        error: 'No clips found to export',
      };
    }

    console.log('\n🎯 EXPORT START: Creating ZIP with', clipsToExport.length, 'clips');

    // Create ZIP file
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    return new Promise((resolve, reject) => {
      output.on('close', () => {
        console.log('✅ ZIP file created successfully');
        resolve({
          success: true,
          filePath: outputPath,
          clipCount: clipsToExport.length,
        });
      });

      archive.on('error', (err: any) => {
        console.error('❌ Archive error:', err);
        reject(err);
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

      // Create manifest object with proper structure
      const manifest: ClipExportManifest = {
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
    console.error('❌ Export error:', error);
    return {
      success: false,
      filePath: outputPath,
      clipCount: 0,
      error: String(error),
    };
  }
}

/**
 * Export clips as plain JSON (metadata only, no audio)
 */
export async function exportClipsAsJson(
  clipIds: string[]
): Promise<{ version: string; exportedAt: string; clips: AudioClip[] }> {
  const allClips = await localDb.getClips();
  const clipsToExport = allClips.filter((c: any) => clipIds.includes(c.id));

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    clips: clipsToExport,
  };
}

/**
 * Import clips from a ZIP file containing manifest.json and audio files
 */
export async function importClipsFromZip(
  zipFilePath: string
): Promise<{ success: boolean; importedCount: number; errors: string[] }> {
  const unzipper = require('unzipper');

  let importedCount = 0;
  const errors: string[] = [];

  try {
    const tempDir = path.join(process.cwd(), '.temp-import', `import-${Date.now()}`);

    // Ensure temp directory exists
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
    let manifest: ClipExportManifest | null = null;
    const manifestPath = path.join(tempDir, 'manifest.json');

    if (fs.existsSync(manifestPath)) {
      console.log('✅ Found manifest.json');
      const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
      console.log('📄 Raw manifest (first 300 chars):', manifestContent.substring(0, 300));

      const parsed = JSON.parse(manifestContent);

      if (Array.isArray(parsed)) {
        // manifest.json is a plain array of clip objects (old/simple format)
        console.log('⚠️  manifest.json is a plain array — converting to manifest structure');
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
        // Standard ClipExportManifest format: { version, clips: [{ clip, audioFilename }] }
        manifest = parsed as ClipExportManifest;
      } else {
        // Unknown object format — try to treat it as a single clip
        console.log('⚠️  manifest.json is an object but not standard format — wrapping');
        manifest = {
          version: '1.0',
          exportedAt: new Date().toISOString(),
          clipCount: 1,
          clips: [{ clip: parsed, audioFilename: parsed.filename }],
        };
      }

      console.log('📊 Parsed manifest:', {
        version: manifest?.version,
        clipCount: manifest?.clipCount,
        clipsIsArray: Array.isArray(manifest?.clips),
        clipsLength: manifest?.clips?.length,
      });
    } else {
      console.log('❌ manifest.json not found - checking for backward compatibility...');

      // Try to find clips.json for backward compatibility
      const clipsJsonPath = path.join(tempDir, 'clips.json');
      if (fs.existsSync(clipsJsonPath)) {
        console.log('⚠️  Found clips.json (old format) - importing as array');
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
          console.log('✅ Converted old format to new manifest structure');
        }
      }
    }

    if (!manifest) {
      console.error('❌ No valid manifest found in ZIP');
      const allFiles = fs.readdirSync(tempDir, { recursive: true });
      console.error('All files in ZIP:', allFiles);
      errors.push('Invalid export file: no manifest.json or clips.json found');
      return { success: false, importedCount: 0, errors };
    }

    // Validate manifest structure
    if (!manifest.clips || !Array.isArray(manifest.clips)) {
      console.error('❌ manifest.clips is not an array');
      console.error('   manifest.clips =', manifest.clips);
      console.error('   typeof =', typeof manifest.clips);
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
        const sourceAudioPath = path.join(tempDir, 'audio', item.audioFilename);
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

/**
 * Import clips from a JSON file (metadata only)
 */
export async function importClipsFromJson(
  jsonData: string
): Promise<{ success: boolean; importedCount: number; errors: string[] }> {
  let importedCount = 0;
  const errors: string[] = [];

  try {
    const data = JSON.parse(jsonData);
    const clipsArray = data.clips || data;

    if (!Array.isArray(clipsArray)) {
      errors.push('Invalid JSON format: expected array of clips');
      return { success: false, importedCount: 0, errors };
    }

    for (const clipData of clipsArray) {
      try {
        const { id, createdAt, updatedAt, ...cleanData } = clipData;
        await localDb.createClip(cleanData);
        importedCount++;
      } catch (error) {
        errors.push(`Failed to import clip: ${String(error)}`);
      }
    }

    return { success: importedCount > 0, importedCount, errors };
  } catch (error) {
    errors.push(`JSON parse error: ${String(error)}`);
    return { success: false, importedCount: 0, errors };
  }
}
