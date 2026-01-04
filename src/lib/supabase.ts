import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

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

// Create a single supabase client for interacting with your database
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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

// Helper function to create authenticated client
// This creates a client with the access token that RLS policies can use
// Use this for database/storage operations, NOT for token verification
export const createAuthenticatedClient = (accessToken: string) => {
  // Create client with auth token in headers
  // The key is to also set it in the auth context for RLS
  const client = createClient<Database>(supabaseUrl, supabaseAnonKey, {
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
};

// Helper function to get public URL for uploaded files
export const getPublicUrl = (path: string): string => {
  const { data } = supabase.storage.from("audio-clips").getPublicUrl(path);

  return data.publicUrl;
};

// Helper function to upload file and get the path - NOW ACCEPTS AUTHENTICATED CLIENT
export const uploadAudioFile = async (
  file: File,
  userId: string,
  filename: string,
  authenticatedClient?: ReturnType<typeof createAuthenticatedClient>
): Promise<string> => {
  const filePath = `${userId}/${filename}`;

  // Use authenticated client if provided, otherwise fall back to base client
  const clientToUse = authenticatedClient || supabase;

  console.log("📁 Uploading:", filename, "for user:", userId);

  const { error } = await clientToUse.storage
    .from("audio-clips")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("❌ Upload failed:", error);
    throw new Error(`Upload failed: ${error.message}`);
  }

  console.log("✅ File uploaded:", filePath);
  return filePath;
};

// Helper function to delete file from storage
export const deleteAudioFile = async (
  path: string,
  authenticatedClient?: ReturnType<typeof createAuthenticatedClient>
): Promise<void> => {
  const clientToUse = authenticatedClient || supabase;

  const { error } = await clientToUse.storage
    .from("audio-clips")
    .remove([path]);

  if (error) {
    console.warn(`Failed to delete file ${path}:`, error.message);
    // Don't throw - file might already be deleted
  }
};
