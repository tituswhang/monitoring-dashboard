import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex items-center justify-center bg-background">
      <div
        class="w-full max-w-sm space-y-6 p-8 rounded-2xl border border-border bg-card shadow-sm"
      >
        <div class="space-y-2 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">Monitoring Dashboard</h1>
          <p class="text-sm text-muted-foreground">Sign in to access the dashboard</p>
        </div>

        @if (message(); as msg) {
          <div
            class="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive text-center"
          >
            {{ msg }}
          </div>
        }

        <button
          type="button"
          (click)="signIn()"
          [disabled]="loading()"
          class="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {{ loading() ? 'Redirecting…' : 'Sign in with Cognito' }}
        </button>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);

  /** Bound from the `error` query param by `withComponentInputBinding()`. */
  readonly error = input<string | undefined>(undefined);

  protected readonly loading = signal(false);
  protected readonly signInError = signal<string | null>(null);

  protected readonly message = computed(() => {
    const own = this.signInError();
    if (own) return own;
    switch (this.error()) {
      case undefined:
        return null;
      case 'invalid_state':
        return 'Login session expired. Please try again.';
      case 'auth_failed':
        return 'Authentication failed. Please try again.';
      default:
        return 'An error occurred. Please try again.';
    }
  });

  protected async signIn(): Promise<void> {
    this.loading.set(true);
    this.signInError.set(null);
    try {
      window.location.href = await this.auth.getLoginUrl();
    } catch (e) {
      this.signInError.set(e instanceof Error ? e.message : 'Failed to initiate login');
      this.loading.set(false);
    }
  }
}
