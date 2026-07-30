import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { NgIcon } from '@ng-icons/core';
import { AuthService, type AppRole } from '../../core/auth.service';
import { MonitoringService, type AppUser, type InviteUserResult } from '../../core/monitoring.service';

const ROLES: { value: AppRole; label: string; hint: string }[] = [
  { value: 'VIEWER', label: 'Viewer', hint: 'Read-only' },
  { value: 'EDITOR', label: 'Editor', hint: 'Works cases: edit rows, comment, run queries' },
  { value: 'ADMIN', label: 'Admin', hint: 'Everything, plus managing users' },
];

/**
 * User and role administration.
 *
 * Roles are assigned against this app's own tables, not Cognito groups, so everything
 * here takes effect without anyone visiting the AWS console.
 */
@Component({
  selector: 'app-user-admin-dialog',
  imports: [FormsModule, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-admin-dialog.html',
})
export class UserAdminDialogComponent {
  protected readonly ref = inject<MatDialogRef<UserAdminDialogComponent>>(MatDialogRef);
  private readonly api = inject(MonitoringService);
  private readonly auth = inject(AuthService);

  protected readonly roles = ROLES;
  protected readonly fieldClass =
    'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring';
  protected readonly labelClass = 'block text-xs font-medium text-muted-foreground mb-1';

  protected readonly users = signal<AppUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly busyEmail = signal<string | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly success = signal<string | undefined>(undefined);

  protected email = '';
  protected name = '';
  protected inviteRole: AppRole = 'EDITOR';
  protected readonly inviting = signal(false);
  protected readonly invited = signal<InviteUserResult | undefined>(undefined);
  protected readonly copied = signal(false);

  private readonly me = this.auth.getCurrentUser()?.email?.toLowerCase();

  protected readonly roleHint = computed(
    () => ROLES.find((r) => r.value === this.inviteRole)?.hint ?? '',
  );

  constructor() {
    void this.reload();
  }

  private async reload(): Promise<void> {
    try {
      this.users.set(await this.api.fetchUsers());
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected isSelf(user: AppUser): boolean {
    return user.email.toLowerCase() === this.me;
  }

  protected isBusy(user: AppUser): boolean {
    return this.busyEmail() === user.email;
  }

  protected roleOf(user: AppUser): AppRole {
    return user.roles[0] ?? 'VIEWER';
  }

  protected async invite(): Promise<void> {
    this.error.set(undefined);
    this.success.set(undefined);
    this.invited.set(undefined);
    this.copied.set(false);
    this.inviting.set(true);
    try {
      const result = await this.api.inviteUser({
        email: this.email.trim(),
        name: this.name.trim() || undefined,
        roles: [this.inviteRole],
      });
      this.invited.set(result);
      this.email = '';
      this.name = '';
      await this.reload();
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.inviting.set(false);
    }
  }

  protected async copy(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected async changeRole(user: AppUser, event: Event): Promise<void> {
    const role = (event.target as HTMLSelectElement).value as AppRole;
    this.error.set(undefined);
    this.success.set(undefined);
    this.busyEmail.set(user.email);
    try {
      await this.api.updateUserRoles(user.email, [role]);
      this.success.set(`${user.email} is now ${role}.`);
      await this.reload();
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busyEmail.set(undefined);
    }
  }

  protected async deactivate(user: AppUser): Promise<void> {
    this.error.set(undefined);
    this.success.set(undefined);
    this.busyEmail.set(user.email);
    try {
      await this.api.deactivateUser(user.email);
      this.success.set(
        `${user.email} deactivated. They keep their login but no longer hold any role.`,
      );
      await this.reload();
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busyEmail.set(undefined);
    }
  }
}
