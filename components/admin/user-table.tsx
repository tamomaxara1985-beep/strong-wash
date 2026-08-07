"use client";

import { Pencil, ShieldCheck, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUserRow } from "@/lib/queries/admin";

function errorMessage(body: { error?: string; fields?: Record<string, string> }): string {
  switch (body.error) {
    case "cannot_delete_self":
      return "You cannot delete the account you are signed in as.";
    case "cannot_delete_last_admin":
      return "That is the only admin account. Promote someone else first.";
    case "validation_failed":
      return body.fields?.name ? "Name must be at least 2 characters." : "Please check the fields.";
    case "forbidden":
    case "unauthenticated":
      return "Your session no longer has admin access. Sign in again.";
    default:
      return "That did not work. Please try again.";
  }
}

export function UserTable({ users, currentUserId }: { users: AdminUserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", phone: "", company: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(id: string) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!response.ok) {
        setError(errorMessage((await response.json().catch(() => ({}))) as never));
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("That did not work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(user: AdminUserRow) {
    if (
      !window.confirm(
        `Delete ${user.email}? Their quote requests are kept as business records but no longer linked to an account.`,
      )
    ) {
      return;
    }
    setBusy(user.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (!response.ok) {
        setError(errorMessage((await response.json().catch(() => ({}))) as never));
        return;
      }
      router.refresh();
    } catch {
      setError("That did not work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  if (!users.length) {
    return (
      <p className="bg-card text-muted-foreground rounded-lg border px-6 py-12 text-center text-sm">
        No accounts match.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p
          role="alert"
          className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {error}
        </p>
      ) : null}

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Account</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Contact</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Role</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Quotes</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Saved</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.id === currentUserId;
              return (
                <tr key={user.id} className="border-t align-top">
                  <td className="px-3 py-2">
                    {editing === user.id ? (
                      <Input
                        value={draft.name}
                        onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                        aria-label="Name"
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium">{user.name}</span>
                    )}
                    <span className="text-muted-foreground block text-xs">{user.email}</span>
                  </td>

                  <td className="px-3 py-2">
                    {editing === user.id ? (
                      <div className="flex flex-col gap-1.5">
                        <Input
                          value={draft.phone}
                          onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
                          aria-label="Phone"
                          placeholder="Phone"
                          className="h-8"
                        />
                        <Input
                          value={draft.company}
                          onChange={(event) => setDraft({ ...draft, company: event.target.value })}
                          aria-label="Company"
                          placeholder="Company"
                          className="h-8"
                        />
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {user.phone ?? "—"}
                        <br />
                        {user.company ?? "—"}
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-2">
                    {/* Read-only: roles are granted with `npm run set-role`, never
                        through the panel. */}
                    {user.role === "admin" ? (
                      <Badge className="gap-1">
                        <ShieldCheck aria-hidden className="size-3" />
                        admin
                      </Badge>
                    ) : (
                      <Badge variant="secondary">customer</Badge>
                    )}
                    {isSelf ? (
                      <span className="text-muted-foreground mt-1 block text-xs">you</span>
                    ) : null}
                  </td>

                  <td className="text-data px-3 py-2 text-right">{user.quoteCount}</td>
                  <td className="text-data px-3 py-2 text-right">{user.savedProducts}</td>

                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1.5">
                      {editing === user.id ? (
                        <>
                          <Button size="sm" disabled={busy === user.id} onClick={() => save(user.id)}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            <X aria-hidden className="size-4" />
                            <span className="sr-only">Cancel</span>
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditing(user.id);
                              setDraft({
                                name: user.name,
                                phone: user.phone ?? "",
                                company: user.company ?? "",
                              });
                            }}
                          >
                            <Pencil aria-hidden className="size-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            // Guarded server-side too; disabled here so the
                            // impossible action does not look available.
                            disabled={isSelf || busy === user.id}
                            title={isSelf ? "You cannot delete your own account" : undefined}
                            onClick={() => remove(user)}
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 aria-hidden className="size-3.5" />
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
