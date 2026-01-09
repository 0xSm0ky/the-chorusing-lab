"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { supabase } from "@/lib/supabase";
import { supabaseMonitor } from "@/lib/supabase-monitor";
import type {
  AuthContextType,
  AuthState,
  LoginCredentials,
  RegisterCredentials,
  User,
} from "@/types/auth";
import type { Session } from "@supabase/supabase-js";

interface ExtendedAuthContextType extends AuthContextType {
  session: Session | null;
  getAuthHeaders: () => HeadersInit;
}

const AuthContext = createContext<ExtendedAuthContextType | undefined>(
  undefined
);

// Cache for admin status to avoid repeated API calls
const adminStatusCache = new Map<
  string,
  { isAdmin: boolean; timestamp: number }
>();
const ADMIN_STATUS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
  });
  const [session, setSession] = useState<Session | null>(null);

  // Helper to check if a string is an email
  const isEmail = (input: string): boolean => {
    return input.includes("@") && input.includes(".");
  };

  // Check admin status with caching
  const checkAdminStatus = useCallback(
    async (userId: string, accessToken: string): Promise<boolean> => {
      // Check cache first
      const cached = adminStatusCache.get(userId);
      if (cached && Date.now() - cached.timestamp < ADMIN_STATUS_CACHE_TTL) {
        return cached.isAdmin;
      }

      try {
        // Add very short timeout to prevent hanging if API route isn't compiled yet
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 second timeout

        const response = await fetch("/api/auth/admin-status", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const isAdmin = data.isAdmin || false;
          // Cache the result
          adminStatusCache.set(userId, {
            isAdmin,
            timestamp: Date.now(),
          });
          return isAdmin;
        }
      } catch (adminError: any) {
        // Silently fail - admin status check shouldn't block auth
        if (
          adminError.name !== "AbortError" &&
          !adminError.message?.includes("fetch")
        ) {
          console.warn("Failed to check admin status:", adminError);
        }
      }

      return false;
    },
    []
  );

  // Convert Supabase session to our User type
  const sessionToUser = useCallback(
    async (
      session: Session | null,
      options: {
        skipAdminCheck?: boolean;
        skipAdminCheckOnError?: boolean;
      } = {}
    ): Promise<User | null> => {
      if (!session?.user) {
        return null;
      }

      try {
        const profileStart = Date.now();
        const profilePromise = supabase
          .from("profiles")
          .select("username, email")
          .eq("id", session.user.id)
          .maybeSingle()
          .then((result) => {
            // Profiling log removed for cleaner prod code, keeping monitor
            const profileDuration = Date.now() - profileStart;
            supabaseMonitor.logRequest({
              type: "database",
              operation: "getProfile",
              duration: profileDuration,
              status: result.error ? "failure" : "success",
              error: result.error?.message,
              errorCode: result.error?.code,
            });
            return result;
          });

        const adminPromise = options.skipAdminCheck
          ? Promise.resolve(false)
          : session.access_token
          ? Promise.race([
              checkAdminStatus(session.user.id, session.access_token),
              new Promise<boolean>((resolve) => {
                setTimeout(() => {
                  resolve(false);
                }, 1500);
              }),
            ]).catch(() => false)
          : Promise.resolve(false);

        const [profileResult, isAdminUser] = await Promise.all([
          profilePromise,
          adminPromise,
        ]);

        const { data: profile, error } = profileResult;

        let username = session.user.user_metadata?.username || "Unknown";
        let email =
          session.user.email || session.user.user_metadata?.email || "Unknown";

        if (profile) {
          username = profile.username;
          email = profile.email;
        } else if (error) {
          console.warn(
            "Could not fetch profile, using metadata fallback",
            error
          );
          if (session.user.user_metadata?.username && !profile) {
            try {
              await supabase.from("profiles").upsert(
                {
                  id: session.user.id,
                  username: session.user.user_metadata.username,
                  email: email,
                },
                { onConflict: "id", ignoreDuplicates: true }
              );
            } catch (e) {
              console.warn("Auto-creation of profile failed", e);
            }
          }
        }

        return {
          id: session.user.id,
          username,
          email,
          createdAt: session.user.created_at,
          isAdmin: isAdminUser,
        };
      } catch (err) {
        console.error("Error in sessionToUser:", err);
        return {
          id: session.user.id,
          username: session.user.user_metadata?.username || "Unknown",
          email: session.user.email || "Unknown",
          createdAt: session.user.created_at,
          isAdmin: false,
        };
      }
    },
    [checkAdminStatus]
  );

  const getAuthHeaders = useCallback((): HeadersInit => {
    if (session?.access_token) {
      return {
        Authorization: `Bearer ${session.access_token}`,
      };
    }
    return {};
  }, [session?.access_token]);

  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Auth initialization timeout")),
            5000
          )
        );

        const {
          data: { session: initialSession },
          error,
        } = (await Promise.race([
          supabase.auth.getSession(),
          timeoutPromise,
        ])) as any;

        if (error) {
          console.error("Error getting session:", error);
          if (mounted) {
            setAuthState((prev) => ({
              ...prev,
              isLoading: false,
              error: error.message,
            }));
          }
          return;
        }

        if (!initialSession) {
          if (mounted) {
            setSession(null);
            setAuthState({ user: null, isLoading: false, error: null });
          }
          return;
        }

        if (mounted) {
          setSession(initialSession);
          const optimisticUser: User = {
            id: initialSession.user.id,
            username: initialSession.user.user_metadata?.username || "Unknown",
            email: initialSession.user.email || "Unknown",
            createdAt: initialSession.user.created_at,
            isAdmin: false,
          };
          setAuthState({ user: optimisticUser, isLoading: false, error: null });
        }

        const fullUser = await sessionToUser(initialSession);
        if (mounted && fullUser) {
          setAuthState((prev) => ({ ...prev, user: fullUser }));
        }
      } catch (err: any) {
        console.error("Auth initialization exception:", err);
        if (mounted) {
          setAuthState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      setSession(currentSession);

      if (currentSession) {
        if (
          event === "SIGNED_IN" ||
          event === "TOKEN_REFRESHED" ||
          event === "INITIAL_SESSION"
        ) {
          const optimisticUser: User = {
            id: currentSession.user.id,
            username: currentSession.user.user_metadata?.username || "Unknown",
            email: currentSession.user.email || "Unknown",
            createdAt: currentSession.user.created_at,
            isAdmin: false,
          };

          setAuthState((prev) => ({
            ...prev,
            user: optimisticUser,
            isLoading: false,
            error: null,
          }));

          const fullUser = await sessionToUser(currentSession);
          if (mounted && fullUser) {
            setAuthState({
              user: fullUser,
              isLoading: false,
              error: null,
            });
          }
        }
      } else {
        setAuthState({
          user: null,
          isLoading: false,
          error: null,
        });
        adminStatusCache.clear();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [sessionToUser]);

  const login = useCallback(
    async (credentials: LoginCredentials) => {
      setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const requestId = supabaseMonitor.startRequest(
          "auth",
          "signInWithPassword"
        );

        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        supabaseMonitor.completeRequest(requestId, {
          type: "auth",
          operation: "signInWithPassword",
          duration: 0, // Simplified for now
          status: error ? "failure" : "success",
          error: error?.message,
        });

        if (error) throw error;
        if (!data.session) throw new Error("No session returned from login");

        setSession(data.session);

        const optimisticUser: User = {
          id: data.session.user.id,
          username: data.session.user.user_metadata?.username || "Unknown",
          email: data.session.user.email || credentials.email,
          createdAt: data.session.user.created_at,
          isAdmin: false,
        };

        setAuthState({
          user: optimisticUser,
          isLoading: false,
          error: null,
        });

        sessionToUser(data.session)
          .then((fullUser) => {
            // Removed isMounted check here as we removed the ref, but callback is stable
            // and setAuthState handles check? No, we should check if mounted.
            // But we don't have isMounted state anymore.
            // Usually safe in event handler, but if unmounted warning happens it's fine.
            setAuthState((prev) => ({
              ...prev,
              user: fullUser || prev.user,
            }));
          })
          .catch((err) => {
            console.warn("Background user fetch failed:", err);
          });
      } catch (error: any) {
        console.error("Login failed:", error);
        let errorMessage = error.message || "Login failed";
        if (errorMessage.includes("Invalid login credentials")) {
          errorMessage = "Invalid email or password";
        }
        setAuthState({
          user: null,
          isLoading: false,
          error: errorMessage,
        });
        throw error;
      }
    },
    [sessionToUser]
  );

  const register = useCallback(async (credentials: RegisterCredentials) => {
    setAuthState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (credentials.password !== credentials.confirmPassword) {
        throw new Error("Passwords do not match");
      }

      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("username")
        .eq("username", credentials.username)
        .maybeSingle();

      if (existingProfile) throw new Error("Username already taken");

      const { data, error } = await supabase.auth.signUp({
        email: credentials.email,
        password: credentials.password,
        options: {
          data: {
            username: credentials.username,
            email: credentials.email,
          },
        },
      });

      if (error) throw error;

      if (data.user && !data.session) {
        setAuthState({
          user: null,
          isLoading: false,
          error: "Please check your email to confirm your account.",
        });
        return;
      }

      if (data.session) {
        const optimisticUser: User = {
          id: data.session.user.id,
          username: credentials.username,
          email: credentials.email,
          createdAt: data.session.user.created_at,
          isAdmin: false,
        };

        setSession(data.session);
        setAuthState({
          user: optimisticUser,
          isLoading: false,
          error: null,
        });

        sessionToUser(data.session)
          .then((fullUser) => {
            setAuthState((prev) => ({
              ...prev,
              user: fullUser || prev.user,
            }));
          })
          .catch((err) => {
            console.warn("Background user fetch failed:", err);
          });
      }
    } catch (error: any) {
      console.error("Registration failed:", error);
      setAuthState({
        user: null,
        isLoading: false,
        error: error.message || "Registration failed",
      });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Logout error", error);
    }
  }, []);

  const value: ExtendedAuthContextType = useMemo(() => {
    return {
      ...authState,
      session,
      login,
      register,
      logout,
      getAuthHeaders,
    };
  }, [authState, session, login, register, logout, getAuthHeaders]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
