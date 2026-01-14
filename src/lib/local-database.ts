// Local database layer - stores everything on disk as JSON files
// No cloud dependencies - fully offline operation

import fs from 'fs';
import path from 'path';
import type { AudioClip, AudioFilters, AudioSort, FilterPreferences } from '@/types/audio';

// Data directory in project root
const DATA_DIR = path.join(process.cwd(), 'local-data');
const CLIPS_FILE = path.join(DATA_DIR, 'clips.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const VOTES_FILE = path.join(DATA_DIR, 'votes.json');
const STARS_FILE = path.join(DATA_DIR, 'stars.json');
const DIALECTS_FILE = path.join(DATA_DIR, 'dialects.json');
const PREFERENCES_FILE = path.join(DATA_DIR, 'preferences.json');

// Audio files stored here
export const AUDIO_DIR = path.join(DATA_DIR, 'audio');

// Ensure directories exist
function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('📁 Created local-data directory');
  }
  if (!fs.existsSync(AUDIO_DIR)) {
    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    console.log('📁 Created audio directory');
  }
}

// Generic JSON file operations
function readJsonFile<T>(filePath: string, defaultValue: T): T {
  ensureDirectories();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDirectories();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error writing ${filePath}:`, error);
    throw error;
  }
}

// Types for local storage
interface LocalUser {
  id: string;
  email: string;
  username: string;
  password: string; // In production, this should be hashed
  isAdmin: boolean;
  createdAt: string;
}

interface LocalVote {
  clipId: string;
  usernameOrId: string;
  voteType: 'up' | 'down';
  createdAt: string;
}

interface LocalStar {
  clipId: string;
  userId: string;
  createdAt: string;
}

interface LocalDialect {
  id: string;
  language: string;
  dialect: string;
  createdAt: string;
}

// ============================================
// LOCAL DATABASE CLASS
// ============================================

class LocalDatabase {
  // ============================================
  // CLIPS
  // ============================================

  async getClips(
    filters: AudioFilters = {},
    sort: AudioSort = { field: 'createdAt', direction: 'desc' },
    options: { starredByUserId?: string; accessToken?: string } = {}
  ): Promise<AudioClip[]> {
    let clips = readJsonFile<AudioClip[]>(CLIPS_FILE, []);

    // Apply filters
    if (filters.language) {
      clips = clips.filter(c => c.metadata.language === filters.language);
    }
    if (filters.speakerGender) {
      clips = clips.filter(c => c.metadata.speakerGender === filters.speakerGender);
    }
    if (filters.speakerAgeRange) {
      clips = clips.filter(c => c.metadata.speakerAgeRange === filters.speakerAgeRange);
    }
    if (filters.speakerDialect) {
      clips = clips.filter(c => c.metadata.speakerDialect === filters.speakerDialect);
    }
    if (filters.uploadedBy) {
      clips = clips.filter(c => c.uploadedBy === filters.uploadedBy);
    }
    if (filters.tags && filters.tags.length > 0) {
      clips = clips.filter(c => 
        filters.tags!.some(tag => c.metadata.tags?.includes(tag))
      );
    }
    if (filters.speedFilter) {
      // Assuming charactersPerSecond is stored in extended clip data
      const speedRanges = {
        slow: { min: 0, max: 10 },
        medium: { min: 10, max: 15 },
        fast: { min: 15, max: Infinity }
      };
      const range = speedRanges[filters.speedFilter];
      clips = clips.filter(c => {
        const cps = (c as any).charactersPerSecond || 0;
        return cps >= range.min && cps < range.max;
      });
    }

    // Filter by starred
    if (options.starredByUserId) {
      const stars = readJsonFile<LocalStar[]>(STARS_FILE, []);
      const starredClipIds = new Set(
        stars.filter(s => s.userId === options.starredByUserId).map(s => s.clipId)
      );
      clips = clips.filter(c => starredClipIds.has(c.id));
    }

    // Sort
    clips.sort((a, b) => {
      let aVal: any, bVal: any;
      
      switch (sort.field) {
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'duration':
          aVal = a.duration;
          bVal = b.duration;
          break;
        case 'language':
          aVal = a.metadata.language;
          bVal = b.metadata.language;
          break;
        case 'createdAt':
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
          break;
        case 'voteScore':
          aVal = (a as any).voteScore || 0;
          bVal = (b as any).voteScore || 0;
          break;
        case 'difficulty':
          aVal = (a as any).difficulty || 0;
          bVal = (b as any).difficulty || 0;
          break;
        default:
          aVal = new Date(a.createdAt).getTime();
          bVal = new Date(b.createdAt).getTime();
      }

      if (sort.direction === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    return clips;
  }

  async getClipById(id: string): Promise<AudioClip | null> {
    const clips = readJsonFile<AudioClip[]>(CLIPS_FILE, []);
    return clips.find(c => c.id === id) || null;
  }

  async createClip(clip: Omit<AudioClip, 'id' | 'createdAt' | 'updatedAt'>): Promise<AudioClip> {
    const clips = readJsonFile<AudioClip[]>(CLIPS_FILE, []);
    
    const newClip: AudioClip = {
      ...clip,
      id: `clip-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    clips.push(newClip);
    writeJsonFile(CLIPS_FILE, clips);
    
    console.log('✅ Created clip:', newClip.id);
    return newClip;
  }

  async updateClip(id: string, updates: Partial<AudioClip>, userId?: string): Promise<AudioClip | null> {
    const clips = readJsonFile<AudioClip[]>(CLIPS_FILE, []);
    const index = clips.findIndex(c => c.id === id);
    
    if (index === -1) return null;
    
    // Check ownership (unless admin)
    if (userId && clips[index].uploadedBy !== userId) {
      const users = readJsonFile<LocalUser[]>(USERS_FILE, []);
      const user = users.find(u => u.id === userId);
      if (!user?.isAdmin) {
        throw new Error('Not authorized to update this clip');
      }
    }
    
    clips[index] = {
      ...clips[index],
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };
    
    writeJsonFile(CLIPS_FILE, clips);
    return clips[index];
  }

  async deleteClip(id: string, userId?: string): Promise<boolean> {
    const clips = readJsonFile<AudioClip[]>(CLIPS_FILE, []);
    const clip = clips.find(c => c.id === id);
    
    if (!clip) return false;
    
    // Check ownership (unless admin)
    if (userId && clip.uploadedBy !== userId) {
      const users = readJsonFile<LocalUser[]>(USERS_FILE, []);
      const user = users.find(u => u.id === userId);
      if (!user?.isAdmin) {
        throw new Error('Not authorized to delete this clip');
      }
    }
    
    // Delete audio file
    const audioPath = path.join(AUDIO_DIR, clip.filename);
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }
    
    // Remove from database
    const newClips = clips.filter(c => c.id !== id);
    writeJsonFile(CLIPS_FILE, newClips);
    
    // Remove related votes and stars
    const votes = readJsonFile<LocalVote[]>(VOTES_FILE, []);
    writeJsonFile(VOTES_FILE, votes.filter(v => v.clipId !== id));
    
    const stars = readJsonFile<LocalStar[]>(STARS_FILE, []);
    writeJsonFile(STARS_FILE, stars.filter(s => s.clipId !== id));
    
    console.log('✅ Deleted clip:', id);
    return true;
  }

  // ============================================
  // USERS
  // ============================================

  async getUser(identifier: string): Promise<LocalUser | null> {
    const users = readJsonFile<LocalUser[]>(USERS_FILE, this.getDefaultUsers());
    return users.find(u => u.id === identifier || u.email === identifier || u.username === identifier) || null;
  }

  async createUser(userData: Omit<LocalUser, 'id' | 'createdAt'>): Promise<LocalUser> {
    const users = readJsonFile<LocalUser[]>(USERS_FILE, this.getDefaultUsers());
    
    // Check if email or username exists
    if (users.find(u => u.email === userData.email)) {
      throw new Error('Email already exists');
    }
    if (users.find(u => u.username === userData.username)) {
      throw new Error('Username already exists');
    }
    
    const newUser: LocalUser = {
      ...userData,
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      createdAt: new Date().toISOString(),
    };
    
    users.push(newUser);
    writeJsonFile(USERS_FILE, users);
    
    return newUser;
  }

  async validateCredentials(email: string, password: string): Promise<LocalUser | null> {
    const users = readJsonFile<LocalUser[]>(USERS_FILE, this.getDefaultUsers());
    return users.find(u => u.email === email && u.password === password) || null;
  }

  private getDefaultUsers(): LocalUser[] {
    return [
      {
        id: 'test-user-id-12345',
        email: 'test@example.com',
        username: 'TestUser',
        password: 'password123',
        isAdmin: true,
        createdAt: new Date().toISOString(),
      }
    ];
  }

  // ============================================
  // VOTES
  // ============================================

  async getVotesForClip(clipId: string): Promise<{ upvotes: number; downvotes: number; score: number }> {
    const votes = readJsonFile<LocalVote[]>(VOTES_FILE, []);
    const clipVotes = votes.filter(v => v.clipId === clipId);
    
    const upvotes = clipVotes.filter(v => v.voteType === 'up').length;
    const downvotes = clipVotes.filter(v => v.voteType === 'down').length;
    
    return { upvotes, downvotes, score: upvotes - downvotes };
  }

  async getUserVote(clipId: string, usernameOrId: string): Promise<'up' | 'down' | null> {
    const votes = readJsonFile<LocalVote[]>(VOTES_FILE, []);
    const vote = votes.find(v => v.clipId === clipId && v.usernameOrId === usernameOrId);
    return vote?.voteType || null;
  }

  async setVote(clipId: string, usernameOrId: string, voteType: 'up' | 'down' | null): Promise<void> {
    const votes = readJsonFile<LocalVote[]>(VOTES_FILE, []);
    const existingIndex = votes.findIndex(v => v.clipId === clipId && v.usernameOrId === usernameOrId);
    
    if (voteType === null) {
      // Remove vote
      if (existingIndex !== -1) {
        votes.splice(existingIndex, 1);
      }
    } else if (existingIndex !== -1) {
      // Update vote
      votes[existingIndex].voteType = voteType;
    } else {
      // Add new vote
      votes.push({
        clipId,
        usernameOrId,
        voteType,
        createdAt: new Date().toISOString(),
      });
    }
    
    writeJsonFile(VOTES_FILE, votes);
  }

  // ============================================
  // STARS
  // ============================================

  async isStarred(clipId: string, userId: string): Promise<boolean> {
    const stars = readJsonFile<LocalStar[]>(STARS_FILE, []);
    return stars.some(s => s.clipId === clipId && s.userId === userId);
  }

  async toggleStar(clipId: string, userId: string): Promise<boolean> {
    const stars = readJsonFile<LocalStar[]>(STARS_FILE, []);
    const existingIndex = stars.findIndex(s => s.clipId === clipId && s.userId === userId);
    
    if (existingIndex !== -1) {
      stars.splice(existingIndex, 1);
      writeJsonFile(STARS_FILE, stars);
      return false;
    } else {
      stars.push({
        clipId,
        userId,
        createdAt: new Date().toISOString(),
      });
      writeJsonFile(STARS_FILE, stars);
      return true;
    }
  }

  // ============================================
  // DIFFICULTY RATINGS
  // ============================================

  async setDifficulty(clipId: string, usernameOrId: string, difficulty: number): Promise<void> {
    const clips = readJsonFile<AudioClip[]>(CLIPS_FILE, []);
    const clip = clips.find(c => c.id === clipId);
    
    if (clip) {
      // Store difficulty ratings in an extended property
      const ratings = (clip as any).difficultyRatings || {};
      ratings[usernameOrId] = difficulty;
      (clip as any).difficultyRatings = ratings;
      
      // Calculate average difficulty
      const values = Object.values(ratings) as number[];
      (clip as any).difficulty = values.reduce((a, b) => a + b, 0) / values.length;
      
      writeJsonFile(CLIPS_FILE, clips);
    }
  }

  // ============================================
  // DIALECTS
  // ============================================

  async getDialects(): Promise<LocalDialect[]> {
    return readJsonFile<LocalDialect[]>(DIALECTS_FILE, []);
  }

  async addDialect(language: string, dialect: string): Promise<LocalDialect> {
    const dialects = readJsonFile<LocalDialect[]>(DIALECTS_FILE, []);
    
    const existing = dialects.find(d => d.language === language && d.dialect === dialect);
    if (existing) return existing;
    
    const newDialect: LocalDialect = {
      id: `dialect-${Date.now()}`,
      language,
      dialect,
      createdAt: new Date().toISOString(),
    };
    
    dialects.push(newDialect);
    writeJsonFile(DIALECTS_FILE, dialects);
    
    return newDialect;
  }

  // ============================================
  // USER PREFERENCES
  // ============================================

  async getFilterPreferences(userId: string): Promise<FilterPreferences | null> {
    const allPrefs = readJsonFile<Record<string, FilterPreferences>>(PREFERENCES_FILE, {});
    return allPrefs[userId] || null;
  }

  async saveFilterPreferences(userId: string, preferences: FilterPreferences): Promise<void> {
    const allPrefs = readJsonFile<Record<string, FilterPreferences>>(PREFERENCES_FILE, {});
    allPrefs[userId] = preferences;
    writeJsonFile(PREFERENCES_FILE, allPrefs);
  }

  // ============================================
  // FILE OPERATIONS
  // ============================================

  async saveAudioFile(filename: string, buffer: Buffer): Promise<string> {
    ensureDirectories();
    const filePath = path.join(AUDIO_DIR, filename);
    fs.writeFileSync(filePath, buffer);
    return filename;
  }

  async deleteAudioFile(filename: string): Promise<void> {
    const filePath = path.join(AUDIO_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  getAudioFilePath(filename: string): string {
    return path.join(AUDIO_DIR, filename);
  }

  audioFileExists(filename: string): boolean {
    return fs.existsSync(path.join(AUDIO_DIR, filename));
  }

  // ============================================
  // ADMIN
  // ============================================

  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return user?.isAdmin || false;
  }
}

// Export singleton instance
export const localDb = new LocalDatabase();
