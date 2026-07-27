import { useState } from "react";
import { getLoginUrl } from "@/auth/auth";

export default function LoginPage({ error }: { error?: string }) {
  const [loading, setLoading] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setSignInError(null);
    try {
      const url = await getLoginUrl();
      window.location.href = url;
    } catch (e) {
      setSignInError(e instanceof Error ? e.message : "Failed to initiate login");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-2xl border border-border bg-card shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Monitoring Dashboard</h1>
          <p className="text-sm text-muted-foreground">Sign in to access the dashboard</p>
        </div>

        {(error || signInError) && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive text-center">
            {signInError
              ? signInError
              : error === "invalid_state"
              ? "Login session expired. Please try again."
              : error === "auth_failed"
              ? "Authentication failed. Please try again."
              : "An error occurred. Please try again."}
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {loading ? "Redirecting…" : "Sign in with Cognito"}
        </button>
      </div>
    </div>
  );
}
