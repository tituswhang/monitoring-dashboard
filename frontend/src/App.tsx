import { useEffect, useState } from "react";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import DemoLoginPage from "./pages/DemoLoginPage";
import { isDemoAuthed, isDemoMode, loadCurrentUser, tryRefresh } from "./auth/auth";

type Page = "loading" | "login" | "demo-login" | "dashboard";

function getErrorParam(): string | undefined {
  return new URLSearchParams(window.location.search).get("error") ?? undefined;
}

export default function App() {
  const [page, setPage] = useState<Page>("loading");
  const [error, setError] = useState<string | undefined>(undefined);

  // The dashboard gates controls on the caller's roles, and those now come from the server
  // rather than from the token, so they must be loaded before it renders — otherwise the first
  // paint would hide admin controls from an admin and then pop them in.
  useEffect(() => {
    if (isDemoMode()) {
      if (!isDemoAuthed()) {
        setPage("demo-login");
        return;
      }
      loadCurrentUser().then(() => setPage("dashboard"));
      return;
    }

    const urlError = getErrorParam();
    if (urlError) {
      setError(urlError);
      setPage("login");
      return;
    }

    tryRefresh()
      .then(async (ok) => {
        if (ok) await loadCurrentUser();
        return ok;
      })
      .then((ok) => setPage(ok ? "dashboard" : "login"));
  }, []);

  if (page === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (page === "demo-login") {
    return <DemoLoginPage onLogin={() => loadCurrentUser().then(() => setPage("dashboard"))} />;
  }

  if (page === "login") {
    return <LoginPage error={error} />;
  }

  return <DashboardPage />;
}
