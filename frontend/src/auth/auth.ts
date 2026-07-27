const apiRoot = import.meta.env.BASE_URL.replace(/\/dashboard\/?$/, "");
const AUTH_BASE = `${apiRoot}/v1/auth`;

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

// ── Who the caller is, and what they may do ──────────────────────────────────
// Roles do not live in the token: the server resolves them from its own tables and
// reports them, along with the permissions they imply, from /v1/auth/me. That endpoint
// derives its answer from the very authorities the security filter chain enforces, so
// the UI cannot disagree with the server about what is allowed — it can only be out of
// date, which loadCurrentUser() fixes.
//
// In demo mode there is no server, so the same shape is resolved locally instead. See
// the demo-auth section below.

export type AppRole = "ADMIN" | "EDITOR" | "VIEWER";
export type AppPermission = "CASE_READ" | "CASE_WRITE" | "QUERY_MANAGE" | "USER_MANAGE";

export interface CurrentUser {
  name: string | null;
  email: string | null;
  roles: AppRole[];
  permissions: AppPermission[];
}

let currentUser: CurrentUser | null = null;

/** Fetches the caller's identity and roles. Call before rendering anything role-gated. */
export async function loadCurrentUser(): Promise<CurrentUser | null> {
  if (isDemoMode()) {
    currentUser = DEMO_USER;
    return currentUser;
  }
  try {
    const res = await fetch(`${AUTH_BASE}/me`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) {
      currentUser = null;
      return null;
    }
    currentUser = (await res.json()) as CurrentUser;
    return currentUser;
  } catch {
    currentUser = null;
    return null;
  }
}

export function getCurrentUser(): CurrentUser | null {
  return currentUser;
}

export function hasRole(role: AppRole): boolean {
  return currentUser?.roles.includes(role) ?? false;
}

export function hasPermission(permission: AppPermission): boolean {
  return currentUser?.permissions.includes(permission) ?? false;
}

// ── Demo auth ────────────────────────────────────────────────────────────────
// This build runs without a backend: the API client is served from in-memory mock
// data, and there is no AWS Cognito user pool to authenticate against. Rather than
// bypassing login entirely, we show a local demo login screen and remember the
// session in sessionStorage (cleared when the tab closes). No credentials are
// validated against anything — any non-empty username/password is accepted.
//
// Demo mode is the default precisely because the deployed demo is static. Setting
// VITE_AUTH_ENABLED="true" at build time restores the real Cognito flow, so the same
// source drives both this demo and a backend-backed deployment.

const DEMO_AUTH_KEY = "demo_authed";

/** The identity demo mode reports. ADMIN so every role-gated control is explorable. */
const DEMO_USER: CurrentUser = {
  name: "Demo User",
  email: "demo@example.com",
  roles: ["ADMIN"],
  permissions: ["CASE_READ", "CASE_WRITE", "QUERY_MANAGE", "USER_MANAGE"],
};

export function isDemoMode(): boolean {
  return import.meta.env.VITE_AUTH_ENABLED !== "true";
}

export function isDemoAuthed(): boolean {
  return sessionStorage.getItem(DEMO_AUTH_KEY) === "true";
}

export function demoLogin(): void {
  sessionStorage.setItem(DEMO_AUTH_KEY, "true");
}

export function demoLogout(): void {
  sessionStorage.removeItem(DEMO_AUTH_KEY);
  currentUser = null;
}

export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${AUTH_BASE}/refresh`, { method: "POST", credentials: "include" });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

export async function getLoginUrl(): Promise<string> {
  const res = await fetch(`${AUTH_BASE}/login`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to get login URL");
  return data.loginUrl;
}

export async function logout(): Promise<void> {
  try {
    const res = await fetch(`${AUTH_BASE}/logout`, { method: "POST", credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      accessToken = null;
      currentUser = null;
      window.location.href = data.logoutUrl;
    }
  } catch {
    accessToken = null;
    currentUser = null;
    window.location.reload();
  }
}
