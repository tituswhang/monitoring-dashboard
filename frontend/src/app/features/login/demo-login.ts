import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-demo-login',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen flex items-center justify-center bg-background">
      <form
        (ngSubmit)="submit()"
        class="w-full max-w-sm space-y-6 p-8 rounded-2xl border border-border bg-card shadow-sm"
      >
        <div class="space-y-2 text-center">
          <h1 class="text-2xl font-semibold tracking-tight">DataWatch</h1>
          <p class="text-sm text-muted-foreground">Sign in to access the dashboard</p>
        </div>

        @if (error()) {
          <div
            class="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive text-center"
          >
            {{ error() }}
          </div>
        }

        <div class="space-y-3">
          <div class="space-y-1.5">
            <label for="username" class="text-sm font-medium">Username</label>
            <input
              id="username"
              type="text"
              name="username"
              autocomplete="username"
              [(ngModel)]="username"
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div class="space-y-1.5">
            <label for="password" class="text-sm font-medium">Password</label>
            <input
              id="password"
              type="password"
              name="password"
              autocomplete="current-password"
              [(ngModel)]="password"
              class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <button
          type="submit"
          class="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Sign in
        </button>

        <p class="text-center text-xs text-muted-foreground">
          Demo login — any username and password works.
        </p>
      </form>
    </div>
  `,
})
export class DemoLoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected username = '';
  protected password = '';
  protected readonly error = signal<string | null>(null);

  protected submit(): void {
    if (!this.username.trim() || !this.password.trim()) {
      this.error.set('Enter a username and password to continue.');
      return;
    }
    this.auth.demoLogin();
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/';
    this.router.navigateByUrl(returnUrl);
  }
}
