"use client";

import { Inter } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "@/providers/theme-provider";
import { AuthProvider } from "@/providers/AuthProvider";
import { useEffect } from "react";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// Global error handler for unhandled errors
function GlobalErrorHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      if (error instanceof SyntaxError || error?.message?.includes("JSON.parse") || error?.message?.includes("bad escaped")) {
        console.warn(
          "[Global Error Handler] Caught JSON parsing error:",
          error.message,
          "This may be due to invalid escape sequences in streaming data."
        );
        // Prevent the error from crashing the app
        event.preventDefault();
      }
    };

    // Handle unhandled errors
    const handleError = (event: ErrorEvent) => {
      const error = event.error;
      if (error instanceof SyntaxError || error?.message?.includes("JSON.parse") || error?.message?.includes("bad escaped")) {
        console.warn(
          "[Global Error Handler] Caught JSON parsing error:",
          error.message,
          "This may be due to invalid escape sequences in streaming data."
        );
        // Prevent the error from showing in console as unhandled
        event.preventDefault();
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    };
  }, []);

  return <>{children}</>;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <body
        className={inter.className}
        suppressHydrationWarning
      >
        <SessionProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <AuthProvider>
              <GlobalErrorHandler>
                <NuqsAdapter>{children}</NuqsAdapter>
                <Toaster />
              </GlobalErrorHandler>
            </AuthProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
