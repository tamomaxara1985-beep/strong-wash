import { UserTable } from "@/components/admin/user-table";
import { requireAdminPage } from "@/lib/auth/guard";
import { listUsers } from "@/lib/queries/admin";

export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  // The layout already gates this tree; called again here for the current admin's
  // id, and because a page that authorises itself cannot be reached another way.
  const admin = await requireAdminPage();

  const { q } = await searchParams;
  const search = typeof q === "string" ? q : undefined;
  const users = await listUsers(search);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Users</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {users.length} account{users.length === 1 ? "" : "s"}. Names and contact
            details are editable; roles are not — use{" "}
            <code className="text-data">npm run set-role</code>.
          </p>
        </div>
        <form method="get" className="flex items-center gap-2">
          <label htmlFor="user-search" className="sr-only">
            Search accounts
          </label>
          <input
            id="user-search"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Email, name or company…"
            className="border-input bg-background focus-visible:border-primary h-9 rounded-md border px-3 text-sm outline-none"
          />
          <button
            type="submit"
            className="bg-brand-black h-9 rounded-md px-3 text-sm font-semibold text-white"
          >
            Search
          </button>
        </form>
      </header>

      <UserTable users={users} currentUserId={String(admin._id)} />
    </div>
  );
}
