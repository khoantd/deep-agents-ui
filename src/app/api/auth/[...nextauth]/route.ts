import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { safeResponseJson } from "@/lib/jsonUtils";

const THREAD_SERVICE_URL =
  process.env.NEXT_PUBLIC_THREAD_SERVICE_URL?.replace(/\/$/, "") || "http://localhost:8080";

// Get the base URL for OAuth callbacks
// NextAuth will use this to construct the callback URL
const baseUrl = process.env.AUTH_URL || process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true, // Required for NextAuth v5
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const response = await fetch(`${THREAD_SERVICE_URL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!response.ok) {
            return null;
          }

          const data = await safeResponseJson<{
            user: { id: string; email: string; name?: string; avatar_url?: string };
            access_token: string;
          }>(response);
          
          if (!data || !data.user) {
            return null;
          }
          
          return {
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            image: data.user.avatar_url,
            accessToken: data.access_token,
          };
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      // Handle credentials login - user already has backend token
      if (user && (user as any).accessToken) {
        token.id = user.id;
        token.accessToken = (user as any).accessToken;
        return token;
      }

      // Handle OAuth providers - sync with backend
      if (account && user && (account.provider === "google" || account.provider === "github")) {
        // Only process on initial OAuth sign-in (when both account and user are present)
        // Check if we've already synced this OAuth account
        if (!token.accessToken || token.oauthProvider !== account.provider) {
          try {
            // Extract OAuth user info from NextAuth
            const providerUserId = account.providerAccountId || user.id;
            const email = user.email || "";
            const name = user.name || null;
            const avatarUrl = user.image || null;

            // Sync OAuth user with backend (if available)
            // Use a timeout to prevent hanging if backend is down
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

            try {
              const backendResponse = await fetch(`${THREAD_SERVICE_URL}/auth/oauth/sync`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  provider: account.provider,
                  provider_user_id: providerUserId,
                  email: email,
                  name: name,
                  avatar_url: avatarUrl,
                }),
                signal: controller.signal,
              });

              clearTimeout(timeoutId);

              if (backendResponse.ok) {
                const backendData = await safeResponseJson<{
                  user: { id: string };
                  access_token: string;
                }>(backendResponse);
                if (backendData && backendData.user) {
                  token.id = backendData.user.id;
                  token.accessToken = backendData.access_token;
                  token.oauthProvider = account.provider;
                } else {
                  console.warn("Backend OAuth sync returned invalid data. Continuing with NextAuth session.");
                  token.id = user.id;
                  token.oauthProvider = account.provider;
                }
              } else {
                const errorText = await backendResponse.text();
                console.warn(
                  `Backend OAuth sync failed (${backendResponse.status}): ${errorText}. Continuing with NextAuth session.`,
                );
                // Fallback: use NextAuth user info if backend sync fails
                token.id = user.id;
                token.oauthProvider = account.provider;
              }
            } catch (fetchError: any) {
              clearTimeout(timeoutId);
              if (fetchError.name === "AbortError") {
                console.warn("Backend OAuth sync timed out. Backend may be unavailable. Continuing with NextAuth session.");
              } else if (fetchError.code === "ECONNREFUSED") {
                console.warn(
                  `Backend thread service is not running at ${THREAD_SERVICE_URL}. OAuth authentication will work, but backend features will be unavailable.`,
                );
              } else {
                console.warn("Backend OAuth sync error:", fetchError.message);
              }
              // Fallback: use NextAuth user info if backend is unavailable
              token.id = user.id;
              token.oauthProvider = account.provider;
            }
          } catch (error) {
            console.error("Unexpected error during OAuth sync:", error);
            // Fallback: use NextAuth user info
            token.id = user.id;
            token.oauthProvider = account.provider;
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session as any).accessToken = token.accessToken as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
});

export const { GET, POST } = handlers;

