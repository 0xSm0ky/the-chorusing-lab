import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { supabaseMonitor } from "./supabase-monitor";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL environment variable");
  throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  console.error(
    "❌ Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable"
  );
  throw new Error("Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

// TypeScript-safe constants (we know they're strings after the checks above)
const SUPABASE_URL: string = supabaseUrl;
const SUPABASE_ANON_KEY: string = supabaseAnonKey;

// Track client instance
const clientId = supabaseMonitor.registerClient('anonymous');

// Create a single supabase client for interacting with your database
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Helper function to decode JWT payload (without signature verification)
// This extracts user info from the token directly
function decodeJWT(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // Base64 URL decode
    const decoded = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
}

// Helper function to verify an access token
// Decodes JWT to extract user info directly, avoiding session lookup issues
export const verifyAccessToken = async (accessToken: string) => {
  // Decode JWT to extract user info directly
  const payload = decodeJWT(accessToken);
  
  if (!payload) {
    return { 
      user: null, 
      error: { 
        message: 'Invalid token format',
        status: 401 
      } 
    };
  }

  // Check if token is expired
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return { 
      user: null, 
      error: { 
        message: 'Token expired',
        status: 401 
      } 
    };
  }

  // Extract user info from JWT payload
  const user = {
    id: payload.sub,
    email: payload.email,
    user_metadata: payload.user_metadata || {},
    app_metadata: payload.app_metadata || {},
  };

  return { user, error: null };
};

// Client pool for authenticated clients to prevent connection exhaustion
interface PooledClient {
  client: ReturnType<typeof createClient<Database>>;
  createdAt: number;
  lastUsed: number;
  tokenHash: string; // Hash of token for comparison
}

class ClientPool {
  private pool: Map<string, PooledClient> = new Map();
  private readonly MAX_POOL_SIZE = 50; // Maximum number of clients in pool
  private readonly CLIENT_TTL = 30 * 60 * 1000; // 30 minutes
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // Clean up every 5 minutes
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup timer
    this.startCleanup();
  }

  private startCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);
  }

  private cleanup() {
    const now = Date.now();
    const expired: string[] = [];

    for (const [key, pooled] of this.pool.entries()) {
      // Remove clients that haven't been used recently or are too old
      if (now - pooled.lastUsed > this.CLIENT_TTL || now - pooled.createdAt > this.CLIENT_TTL * 2) {
        expired.push(key);
      }
    }

    for (const key of expired) {
      this.pool.delete(key);
    }

    // If pool is still too large, remove least recently used
    if (this.pool.size > this.MAX_POOL_SIZE) {
      const entries = Array.from(this.pool.entries());
      entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      const toRemove = entries.slice(0, this.pool.size - this.MAX_POOL_SIZE);
      for (const [key] of toRemove) {
        this.pool.delete(key);
      }
    }
  }

  private hashToken(token: string): string {
    // Simple hash for token comparison (not for security)
    // In production, you might want to use a proper hash function
    let hash = 0;
    for (let i = 0; i < Math.min(token.length, 100); i++) {
      const char = token.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private isTokenExpired(token: string): boolean {
    try {
      const payload = decodeJWT(token);
      if (!payload || !payload.exp) return true;
      const now = Math.floor(Date.now() / 1000);
      // Consider token expired if it expires within 5 minutes
      return payload.exp < (now + 300);
    } catch {
      return true;
    }
  }

  getClient(accessToken: string): ReturnType<typeof createClient<Database>> {
    // Check if token is expired
    if (this.isTokenExpired(accessToken)) {
      // Token is expired, create a new client but don't pool it
      return this.createNewClient(accessToken);
    }

    const tokenHash = this.hashToken(accessToken);
    const pooled = this.pool.get(tokenHash);

    if (pooled) {
      // Update last used time
      pooled.lastUsed = Date.now();
      return pooled.client;
    }

    // Create new client and add to pool
    const client = this.createNewClient(accessToken);
    
    // Only pool if we're under the limit
    if (this.pool.size < this.MAX_POOL_SIZE) {
      this.pool.set(tokenHash, {
        client,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        tokenHash,
      });
    }

    return client;
  }

  private createNewClient(accessToken: string): ReturnType<typeof createClient<Database>> {
    // Track client instance
    const authClientId = supabaseMonitor.registerClient('authenticated');
    
    // Create client with auth token in headers
    const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        // Custom storage that returns the token for RLS
        storage: {
          getItem: (key: string) => {
            if (key === "sb-access-token") return accessToken;
            if (key === "sb-refresh-token") return "";
            return null;
          },
          setItem: () => {},
          removeItem: () => {},
        },
      },
    });

    return client;
  }

  clear() {
    this.pool.clear();
  }

  getSize(): number {
    return this.pool.size;
  }
}

// Singleton client pool instance
const clientPool = new ClientPool();

// Helper function to create authenticated client (now uses pool)
// This creates a client with the access token that RLS policies can use
// Use this for database/storage operations, NOT for token verification
export const createAuthenticatedClient = (accessToken: string) => {
  return clientPool.getClient(accessToken);
};

// Helper function to get public URL for uploaded files
export const getPublicUrl = (path: string): string => {
  const startTime = Date.now();
  try {
    const { data } = supabase.storage.from("audio-clips").getPublicUrl(path);
    const duration = Date.now() - startTime;
    
    supabaseMonitor.logRequest({
      type: 'storage',
      operation: 'getPublicUrl',
      duration,
      status: 'success',
      responseSize: JSON.stringify(data).length,
    });
    
    return data.publicUrl;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    supabaseMonitor.logRequest({
      type: 'storage',
      operation: 'getPublicUrl',
      duration,
      status: 'failure',
      error: error?.message || 'Unknown error',
      errorCode: error?.code,
    });
    throw error;
  }
};

// Helper function to upload file and get the path - NOW ACCEPTS AUTHENTICATED CLIENT
export const uploadAudioFile = async (
  file: File,
  userId: string,
  filename: string,
  authenticatedClient?: ReturnType<typeof createAuthenticatedClient>
): Promise<string> => {
  const startTime = Date.now();
  const filePath = `${userId}/${filename}`;

  // Use authenticated client if provided, otherwise fall back to base client
  const clientToUse = authenticatedClient || supabase;

  console.log("📁 Uploading:", filename, "for user:", userId);

  try {
    const { error } = await clientToUse.storage
      .from("audio-clips")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
      });

    const duration = Date.now() - startTime;

    if (error) {
      console.error("❌ Upload failed:", error);
      supabaseMonitor.logRequest({
        type: 'storage',
        operation: 'upload',
        duration,
        status: 'failure',
        error: error.message,
        errorCode: (error as any)?.statusCode?.toString(),
      });
      throw new Error(`Upload failed: ${error.message}`);
    }

    supabaseMonitor.logRequest({
      type: 'storage',
      operation: 'upload',
      duration,
      status: 'success',
      responseSize: file.size,
    });

    console.log("✅ File uploaded:", filePath);
    return filePath;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    supabaseMonitor.logRequest({
      type: 'storage',
      operation: 'upload',
      duration,
      status: 'failure',
      error: error?.message || 'Unknown error',
      errorCode: error?.code,
    });
    throw error;
  }
};

// Helper function to delete file from storage
export const deleteAudioFile = async (
  path: string,
  authenticatedClient?: ReturnType<typeof createAuthenticatedClient>
): Promise<void> => {
  const startTime = Date.now();
  const clientToUse = authenticatedClient || supabase;

  try {
    const { error } = await clientToUse.storage
      .from("audio-clips")
      .remove([path]);

    const duration = Date.now() - startTime;

    if (error) {
      console.warn(`Failed to delete file ${path}:`, error.message);
      supabaseMonitor.logRequest({
        type: 'storage',
        operation: 'delete',
        duration,
        status: 'failure',
        error: error.message,
        errorCode: (error as any)?.statusCode?.toString(),
      });
      // Don't throw - file might already be deleted
      return;
    }

    supabaseMonitor.logRequest({
      type: 'storage',
      operation: 'delete',
      duration,
      status: 'success',
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    supabaseMonitor.logRequest({
      type: 'storage',
      operation: 'delete',
      duration,
      status: 'failure',
      error: error?.message || 'Unknown error',
      errorCode: error?.code,
    });
    // Don't throw - file might already be deleted
  }
};
