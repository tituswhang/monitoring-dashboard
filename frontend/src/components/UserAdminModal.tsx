import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, Loader2, Lock, UserPlus, X } from "lucide-react";
import {
  deactivateUser,
  fetchUsers,
  inviteUser,
  updateUserRoles,
  type AppUser,
  type InviteUserResult,
} from "@/api/monitoring";
import { getCurrentUser, type AppRole } from "@/auth/auth";

const ROLES: { value: AppRole; label: string; hint: string }[] = [
  { value: "VIEWER", label: "Viewer", hint: "Read-only" },
  { value: "EDITOR", label: "Editor", hint: "Works cases: edit rows, comment, run queries" },
  { value: "ADMIN", label: "Admin", hint: "Everything, plus managing users" },
];

const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring";
const labelClass = "block text-xs font-medium text-muted-foreground mb-1";

export default function UserAdminModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyEmail, setBusyEmail] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState<string | undefined>(undefined);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("EDITOR");
  const [inviting, setInviting] = useState(false);
  const [invited, setInvited] = useState<InviteUserResult | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  const me = getCurrentUser()?.email?.toLowerCase();

  const reload = async () => {
    try {
      setUsers(await fetchUsers());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setSuccess(undefined);
    setInvited(undefined);
    setCopied(false);
    setInviting(true);
    try {
      const result = await inviteUser({
        email: email.trim(),
        name: name.trim() || undefined,
        roles: [inviteRole],
      });
      setInvited(result);
      setEmail("");
      setName("");
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setInviting(false);
    }
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRoleChange = async (user: AppUser, role: AppRole) => {
    setError(undefined);
    setSuccess(undefined);
    setBusyEmail(user.email);
    try {
      await updateUserRoles(user.email, [role]);
      setSuccess(`${user.email} is now ${role}.`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyEmail(undefined);
    }
  };

  const handleDeactivate = async (user: AppUser) => {
    setError(undefined);
    setSuccess(undefined);
    setBusyEmail(user.email);
    try {
      await deactivateUser(user.email);
      setSuccess(`${user.email} deactivated. They keep their login but no longer hold any role.`);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyEmail(undefined);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border bg-background shadow-xl mx-4">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-base font-semibold">Manage Users</h2>
          <button onClick={onClose} className="cursor-pointer rounded p-1 transition-colors hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <form onSubmit={handleInvite} className="space-y-3 rounded-md border bg-muted/30 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <UserPlus className="h-3.5 w-3.5" /> Give someone access
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="invite-email">Email</label>
                <input
                  id="invite-email"
                  type="email"
                  className={fieldClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  required
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="invite-name">Name <span className="font-normal">(optional)</span></label>
                <input
                  id="invite-name"
                  className={fieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="invite-role">Role</label>
                <select
                  id="invite-role"
                  className={`${fieldClass} cursor-pointer`}
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AppRole)}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {ROLES.find((r) => r.value === inviteRole)?.hint}. No account is created — they sign up
              themselves, and this role is waiting for them when they do.
            </p>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={inviting || !email.trim()}
                className="cursor-pointer rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {inviting ? "Granting…" : "Grant access"}
              </button>
            </div>
          </form>

          {invited && (
            <div className="mt-3 rounded-md border border-emerald-600/30 bg-emerald-600/5 p-3">
              <p className="flex items-start gap-1 text-xs text-emerald-600">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                {invited.alreadyInvited
                  ? `${invited.email} already had access — role set to ${invited.roles.join(", ")}.`
                  : `${invited.email} will be ${invited.roles.join(", ")} as soon as they sign in.`}
              </p>
              <p className="mt-2 mb-1 text-xs font-medium">Send them this link:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded border bg-background px-2 py-1 text-xs" title={invited.inviteUrl}>
                  {invited.inviteUrl}
                </code>
                <button
                  type="button"
                  onClick={() => void handleCopy(invited.inviteUrl)}
                  className="flex shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <Copy className="h-3 w-3" />{copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 flex items-start gap-1 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />{error}
            </p>
          )}
          {success && (
            <p className="mt-3 flex items-start gap-1 text-xs text-emerald-600">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />{success}
            </p>
          )}

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium">Existing users</p>
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">User</th>
                      <th className="px-3 py-2 text-left font-medium">Role</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isSelf = user.email.toLowerCase() === me;
                      const locked = user.bootstrapAdmin;
                      const busy = busyEmail === user.email;
                      return (
                        <tr key={user.email} className="border-t">
                          <td className="px-3 py-2">
                            <div className="font-medium">{user.name ?? user.email}</div>
                            {user.name && <div className="text-xs text-muted-foreground">{user.email}</div>}
                            {!user.active && (
                              <span className="text-xs text-muted-foreground">Deactivated</span>
                            )}
                            {user.active && !user.lastLoginAt && !user.bootstrapAdmin && (
                              <span className="text-xs text-amber-600">Invited — hasn't signed in yet</span>
                            )}
                            {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                          </td>
                          <td className="px-3 py-2">
                            {locked ? (
                              <span
                                className="flex items-center gap-1 text-xs text-muted-foreground"
                                title="Admin by configuration (AUTH_BOOTSTRAP_ADMINS) — change it there, not here"
                              >
                                <Lock className="h-3 w-3" /> Admin (config)
                              </span>
                            ) : (
                              <select
                                className={`${fieldClass} w-auto cursor-pointer py-1`}
                                value={user.roles[0] ?? "VIEWER"}
                                disabled={busy || !user.active}
                                onChange={(e) => void handleRoleChange(user, e.target.value as AppRole)}
                              >
                                {ROLES.map((r) => (
                                  <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {!locked && user.active && (
                              <button
                                onClick={() => void handleDeactivate(user)}
                                disabled={busy}
                                className="cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {busy ? "…" : "Deactivate"}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-3 py-6 text-center text-xs text-muted-foreground">
                          No users yet. Invite someone above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Role changes take effect within a couple of minutes — the user does not need to sign out.
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
