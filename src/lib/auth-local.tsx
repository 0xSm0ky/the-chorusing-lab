"use client";

// ============================================
// LOCAL-ONLY AUTHENTICATION
// No cloud dependencies - works completely offline
// ============================================

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type {
  AuthContextType,
  AuthState,
  LoginCredentials,
  RegisterCredentials,
  User,
} from "@/types/auth";

// Simple session type for local auth
interface LocalSession {
  access_token: string;
  user: User;
  expires_at: number;
}

interface ExtendedAuthContextType extends AuthContextType {
  session: LocalSession | null;
  getAuthHeaders: () => HeadersInit;
}

const AuthContext = createContext<ExtendedAuthContextType | undefined>(
  undefined
);

// Local storage keys
const SESSION_STORAGE_KEY = 'chorus-lab-session';

// Default test user (always available for local development)
const DEFAULT_USERS: Array<{
  id: string;
  email: string;
  username: string;
  password: string;
  isAdmin: boolean;
}> = [
  {
    id: 'test-user-id-12345',
    email: 'test@example.com',
    username: 'TestUser',
    password: 'password123',
    isAdmin: true,
  },
];

// Helper to get users from localStorage (with defaults)
function getLocalUsers() {
  if (typeof window === 'undefined') return DEFAULT_USERS;
  
  try {
    const stored = localStorage.getItem('chorus-lab-users');
    if (stored) {
      const users = JSON.parse(stored);
      // Merge with defaults (ensure test user always exists)
      const merged = [...DEFAULT_USERS];
      for (const user of users) {
        if (!merged.find(u => u.email === user.email)) {
          merged.push(user);
        }
      }
      return merged;
    }
  } catch (e) {
    console.error('Error reading users:', e);
  }
  return DEFAULT_USERS;
}

// Helper to save users to localStorage
function saveLocalUsers(users: typeof DEFAULT_USERS) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('chorus-lab-users', JSON.stringify(users));
}

// Generate a simple token
function generateToken(): string {
  return `local-token-${Date.now()}-${Math.random().toString(36).substring(2)}`;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
  });
  const [session, setSession] = useState<LocalSession | null>(null);

  // Load session from localStorage on mount
  useEffect(() => {
    const loadSession = () => {
      try {
        const stored = localStorage.getItem(SESSION_STORAGE_KEY);
        if (stored) {
          const savedSession: LocalSession = JSON.parse(stored);
          
          // Check if session is expired
          if (savedSession.expires_at > Date.now()) {
            setSession(savedSession);
            setAuthState({
              user: savedSession.user,
              isLoading: false,
              error: null,
            });
            console.log('🔐 Restored local session for:', savedSession.user.username);
            return;
          } else {
            // Clear expired session
            localStorage.removeItem(SESSION_STORAGE_KEY);
          }
        }
      } catch (e) {
        console.error('Error loading session:', e);
      }
      
      setAuthState({
        user: null,
        isLoading: false,
        error: null,
      });
    };

    loadSession();
  }, []);

  // Get auth headers for API calls - includes user info for server-side auth
  const getAuthHeaders = useCallback((): HeadersInit => {
    if (session?.access_token && session?.user) {
      return {
        Authorization: `Bearer ${session.access_token}`,
        'X-User-Id': session.user.id,
        'X-Username': session.user.username,
      };
    }
    return {};
  }, [session?.access_token, session?.user]);

  // Login function
  const login = async (credentials: LoginCredentials) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Simulate network delay for realistic feel
      await new Promise(resolve => setTimeout(resolve, 300));

      const users = getLocalUsers();
      const user = users.find(
        u => u.email === credentials.email && u.password === credentials.password
      );

      if (!user) {
        throw new Error('Invalid email or password');
      }

      const newSession: LocalSession = {
        access_token: generateToken(),
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          createdAt: new Date().toISOString(),
          isAdmin: user.isAdmin,
        },
        expires_at: Date.now() + (24 * 60 * 60 * 1000), // 24 hours
      };

      // Save to localStorage
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));

      setSession(newSession);
      setAuthState({
        user: newSession.user,
        isLoading: false,
        error: null,
      });

      console.log('✅ Logged in as:', user.username);
    } catch (error: any) {
      setAuthState({
        user: null,
        isLoading: false,
        error: error.message || 'Login failed',
      });
      throw error;
    }
  };

  // Register function
  const register = async (credentials: RegisterCredentials) => {
    setAuthState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      if (credentials.password !== credentials.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      if (credentials.password.length < 6) {
        throw new Error('Password must be at least 6 characters');
      }

      const users = getLocalUsers();

      // Check if email exists
      if (users.find(u => u.email === credentials.email)) {
        throw new Error('Email already registered');
      }

      // Check if username exists
      if (users.find(u => u.username === credentials.username)) {
        throw new Error('Username already taken');
      }

      // Create new user
      const newUser = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        email: credentials.email,
        username: credentials.username,
        password: credentials.password,
        isAdmin: false,
      };

      users.push(newUser);
      saveLocalUsers(users);

      // Auto-login after registration
      const newSession: LocalSession = {
        access_token: generateToken(),
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          createdAt: new Date().toISOString(),
          isAdmin: newUser.isAdmin,
        },
        expires_at: Date.now() + (24 * 60 * 60 * 1000),
      };

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(newSession));

      setSession(newSession);
      setAuthState({
        user: newSession.user,
        isLoading: false,
        error: null,
      });

      console.log('✅ Registered and logged in as:', newUser.username);
    } catch (error: any) {
      setAuthState({
        user: null,
        isLoading: false,
        error: error.message || 'Registration failed',
      });
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setSession(null);
    setAuthState({
      user: null,
      isLoading: false,
      error: null,
    });
    console.log('👋 Logged out');
  };

  const contextValue: ExtendedAuthContextType = {
    ...authState,
    session,
    login,
    register,
    logout,
    getAuthHeaders,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// Helper to verify tokens on the server side (API routes)
export function verifyLocalToken(token: string): { userId: string; isValid: boolean } {
  // For local auth, we just check if the token starts with our prefix
  // In a real app, you'd verify this properly
  if (token && token.startsWith('local-token-')) {
    // Extract user info from the token or session
    // For simplicity, we'll parse the user ID from the request
    return { userId: '', isValid: true };
  }
  return { userId: '', isValid: false };
}
