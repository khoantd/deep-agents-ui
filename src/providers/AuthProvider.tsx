"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useSession, signIn as nextAuthSignIn, signOut as nextAuthSignOut } from "next-auth/react";
import { safeResponseJson } from "@/lib/jsonUtils";

interface User {
  id: string;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  email_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, name?: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  signInWithOAuth: (provider: "google" | "github") => Promise<void>;
  accessToken: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const THREAD_SERVICE_URL =
  process.env.NEXT_PUBLIC_THREAD_SERVICE_URL?.replace(/\/$/, "") || "http://localhost:8080";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Fetch user profile when session changes
  useEffect(() => {
    if (status === "loading") {
      setLoading(true);
      return;
    }

    if (status === "unauthenticated") {
      setUser(null);
      setAccessToken(null);
      setLoading(false);
      return;
    }

    if (session?.user && (session as any).accessToken) {
      const token = (session as any).accessToken;
      setAccessToken(token);

      // Fetch user profile from backend
      fetch(`${THREAD_SERVICE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then(async (res) => {
          if (res.ok) {
            const userData = await safeResponseJson<User>(res);
            if (userData) {
              setUser(userData);
              setLoading(false);
            } else {
              throw new Error("Failed to parse user data");
            }
          } else {
            throw new Error("Failed to fetch user");
          }
        })
        .catch(() => {
          setUser(null);
          setAccessToken(null);
          setLoading(false);
        });
    } else {
      setUser(null);
      setAccessToken(null);
      setLoading(false);
    }
  }, [session, status]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const result = await nextAuthSignIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        return { error: result.error };
      }

      return {};
    } catch (error) {
      return { error: "Failed to sign in" };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, name?: string) => {
    try {
      const response = await fetch(`${THREAD_SERVICE_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      if (!response.ok) {
        const error = await safeResponseJson<{ detail?: string }>(response, {});
        return { error: error?.detail || "Failed to sign up" };
      }

      // Auto sign in after signup
      return await signIn(email, password);
    } catch (error) {
      return { error: "Failed to sign up" };
    }
  }, [signIn]);

  const signOut = useCallback(async () => {
    await nextAuthSignOut({ redirect: false });
    setUser(null);
    setAccessToken(null);
  }, []);

  const signInWithOAuth = useCallback(async (provider: "google" | "github") => {
    await nextAuthSignIn(provider, { callbackUrl: "/" });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signIn,
        signUp,
        signOut,
        signInWithOAuth,
        accessToken,
      }}
    >
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

