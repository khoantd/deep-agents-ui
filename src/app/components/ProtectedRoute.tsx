"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { LoginDialog } from "./LoginDialog";
import { SignupDialog } from "./SignupDialog";
import { LandingPage } from "./LandingPage";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      // Don't auto-open login dialog, let user explore landing page first
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginDialog
          open={showLogin}
          onOpenChange={setShowLogin}
          onSwitchToSignup={() => {
            setShowLogin(false);
            setShowSignup(true);
          }}
        />
        <SignupDialog
          open={showSignup}
          onOpenChange={setShowSignup}
          onSwitchToLogin={() => {
            setShowSignup(false);
            setShowLogin(true);
          }}
        />
        <LandingPage
          onSignIn={() => setShowLogin(true)}
          onSignUp={() => setShowSignup(true)}
        />
      </>
    );
  }

  return <>{children}</>;
}

