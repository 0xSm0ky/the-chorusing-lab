// API utilities for local-only mode
// Handles token verification and user extraction for API routes

interface LocalUser {
  id: string;
  email: string;
  username: string;
  isAdmin: boolean;
}

// Parse user info from Authorization header for local mode
// Token format: "local-token-{timestamp}-{random}" 
// User info is sent in X-User-Info header as base64 JSON
export function getLocalUserFromRequest(request: Request): LocalUser | null {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  
  // Check if it's a local token
  if (!token.startsWith('local-token-')) {
    return null;
  }
  
  // Get user info from X-User-Info header (set by client)
  const userInfoHeader = request.headers.get('X-User-Info');
  if (userInfoHeader) {
    try {
      const decoded = Buffer.from(userInfoHeader, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch (e) {
      console.error('Failed to parse X-User-Info header:', e);
    }
  }
  
  // Fallback: extract user ID from token if possible
  // For now, we'll just validate the token exists
  return null;
}

// Simple response helpers
export function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}
