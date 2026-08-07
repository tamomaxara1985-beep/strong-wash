import { FileImage, Package, Paperclip, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";

import { getAdminCounts } from "@/lib/queries/admin";
import { formatBytes } from "@/lib/uploads";

export default async function AdminDashboard() {
  const counts = await getAdminCounts();

  const tiles = [
    {
      label: "Accounts",
      value: String(counts.users),
      hint: `${counts.admins} admin${counts.admins === 1 ? "" : "s"}`,
      href: "/admin/users",
      icon: Users,
    },
    {
      label: "Quote requests",
      value: String(counts.quotes),
      hint: `${counts.newQuotes} new`,
      href: "/admin/attachments",
      icon: ShieldCheck,
    },
    {
      label: "Media files",
      value: String(counts.media),
      hint: formatBytes(counts.mediaBytes),
      href: "/admin/media",
      icon: FileImage,
    },
    {
      label: "Quote attachments",
      value: String(counts.attachments),
      hint: "sent by customers",
      href: "/admin/attachments",
      icon: Paperclip,
    },
    {
      label: "Active products",
      value: String(counts.products),
      hint: "in the catalogue",
      href: "/ka",
      icon: Package,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-display text-2xl">Dashboard</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Files and accounts. Product editing arrives with Phase 4 of the plan.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link
              href={tile.href}
              className="bg-card hover:border-primary/60 focus-visible:ring-ring flex items-start justify-between gap-3 rounded-lg border p-4 transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span>
                <span className="text-muted-foreground block text-xs font-semibold tracking-wide uppercase">
                  {tile.label}
                </span>
                <span className="text-data mt-1 block text-2xl font-bold">{tile.value}</span>
                <span className="text-muted-foreground mt-0.5 block text-xs">{tile.hint}</span>
              </span>
              <tile.icon aria-hidden className="text-muted-foreground size-5 shrink-0" />
            </Link>
          </li>
        ))}
      </ul>

      <section className="bg-card rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Granting admin access</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          Roles are not editable from this panel, by design — a role field in a web
          form is the most valuable thing a stolen admin session could reach. Promote
          an existing account from the command line:
        </p>
        <pre className="bg-secondary text-data mt-3 overflow-x-auto rounded-md p-3 text-xs">
          npm run set-role -- someone@example.com admin
        </pre>
        <p className="text-muted-foreground mt-2 text-xs">
          The account must exist first, and the person has to sign out and back in
          before the change reaches their session.
        </p>
      </section>
    </div>
  );
}
