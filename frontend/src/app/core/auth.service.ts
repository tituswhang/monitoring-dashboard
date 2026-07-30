import { APP_BASE_HREF } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';

// ── Who the caller is, and what they may do ──────────────────────────────────
// Roles do not live in the token: the server resolves them from its own tables and
// reports them, along with the permissions they imply, from /v1/auth/me. That endpoint
// derives its answer from the very authorities the security filter chain enforces, so
// the UI cannot disagree with the server about what is allowed — it can only be out of
// date, which loadCurrentUser() fixes.
//
// In demo mode there is no server, so the same shape is resolved locally instead. See
// the demo-auth section below.

export type AppRole = 'ADMIN' | 'EDITOR' | 'VIEWER';
export type AppPermission = 'CASE_READ' | 'CASE_WRITE' | 'QUERY_MANAGE' | 'USER_MANAGE';

export interface CurrentUser {
  name: string | null;
  email: string | null;
  roles: AppRole[];
  permissions: AppPermission[];
}

const DEMO_AUTH_KEY = 'demo_authed';

/** The identity demo mode reports. ADMIN so every role-gated control is explorable. */
const DEMO_USER: CurrentUser = {
  name: 'Demo User',
  email: 'demo@example.com',
  roles: ['ADMIN'],
  permissions: ['CASE_READ', 'CASE_WRITE', 'QUERY_MANAGE', 'USER_MANAGE'],
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly baseHref = inject(APP_BASE_HREF, { optional: true }) ?? '/';

  /**
   * Was `import.meta.env.BASE_URL` in the Vite build. The dashboard may be served under a
   * `/dashboard` path while the API sits at the root, so that segment is stripped.
   */
  private readonly apiRoot = this.baseHref.replace(/\/dashboard\/?$/, '');
  private readonly authBase = `${this.apiRoot}/v1/auth`;

  private accessToken: string | null = null;

  // Module-level `let currentUser` in the React build. A signal here so role-gated
  // controls re-render when loadCurrentUser() resolves, rather than relying on the
  // caller to have awaited it before first paint.
  private readonly currentUserState = signal<CurrentUser | null>(null);

  readonly currentUser = this.currentUserState.asReadonly();
  readonly roles = computed(() => this.currentUserState()?.roles ?? []);
  readonly permissions = computed(() => this.currentUserState()?.permissions ?? []);

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getCurrentUser(): CurrentUser | null {
    return this.currentUserState();
  }

  hasRole(role: AppRole): boolean {
    return this.currentUserState()?.roles.includes(role) ?? false;
  }

  hasPermission(permission: AppPermission): boolean {
    return this.currentUserState()?.permissions.includes(permission) ?? false;
  }

  /** Fetches the caller's identity and roles. Call before rendering anything role-gated. */
  async loadCurrentUser(): Promise<CurrentUser | null> {
    if (this.isDemoMode()) {
      this.currentUserState.set(DEMO_USER);
      return DEMO_USER;
    }
    try {
      const res = await fetch(`${this.authBase}/me`, {
        credentials: 'include',
        headers: this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {},
      });
      if (!res.ok) {
        this.currentUserState.set(null);
        return null;
      }
      const user = (await res.json()) as CurrentUser;
      this.currentUserState.set(user);
      return user;
    } catch {
      this.currentUserState.set(null);
      return null;
    }
  }

  // ── Demo auth ──────────────────────────────────────────────────────────────
  // This build runs without a backend: the API client is served from in-memory mock
  // data, and there is no AWS Cognito user pool to authenticate against. Rather than
  // bypassing login entirely, we show a local demo login screen and remember the
  // session in sessionStorage (cleared when the tab closes). No credentials are
  // validated against anything — any non-empty username/password is accepted.
  //
  // Demo mode is the default precisely because the deployed demo is static. Setting
  // `authEnabled: true` in the environment restores the real Cognito flow, so the same
  // source drives both this demo and a backend-backed deployment.

  isDemoMode(): boolean {
    return !environment.authEnabled;
  }

  isDemoAuthed(): boolean {
    return sessionStorage.getItem(DEMO_AUTH_KEY) === 'true';
  }

  demoLogin(): void {
    sessionStorage.setItem(DEMO_AUTH_KEY, 'true');
  }

  demoLogout(): void {
    sessionStorage.removeItem(DEMO_AUTH_KEY);
    this.currentUserState.set(null);
  }

  async tryRefresh(): Promise<boolean> {
    try {
      const res = await fetch(`${this.authBase}/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = await res.json();
      this.accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    }
  }

  async getLoginUrl(): Promise<string> {
    const res = await fetch(`${this.authBase}/login`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to get login URL');
    return data.loginUrl;
  }

  async logout(): Promise<void> {
    try {
      const res = await fetch(`${this.authBase}/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        this.accessToken = null;
        this.currentUserState.set(null);
        window.location.href = data.logoutUrl;
      }
    } catch {
      this.accessToken = null;
      this.currentUserState.set(null);
      window.location.reload();
    }
  }
}
