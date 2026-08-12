import {
  Factory,
  FileImage,
  FolderTree,
  GalleryHorizontal,
  LayoutDashboard,
  Mail,
  MapPin,
  Package,
  Paperclip,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { AdminSignOut } from "@/components/admin/admin-sign-out";
import { Badge } from "@/components/ui/badge";
import { requireAdminPage } from "@/lib/auth/guard";
import { countUnreadMessages } from "@/lib/queries/admin";

import "../globals.css";

export const metadata: Metadata = {
  title: "Admin — Strong Wash",
  // An operator console has nothing to rank for and should never be indexed.
  robots: { index: false, follow: false },
};

/**
 * Unlocalised, English-only (plan.md). `proxy.ts` excludes `/admin` from the
 * next-intl middleware so this tree is not rewritten to `/ka/admin`.
 *
 * This is its own `<html>` document rather than nesting under the storefront
 * layout: the panel needs neither the locale provider nor the site chrome.
 */
const MESSAGES_HREF = "/admin/messages";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: MESSAGES_HREF, label: "Messages", icon: Mail },
  { href: "/admin/slides", label: "Homepage banners", icon: GalleryHorizontal },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/brands", label: "Brands", icon: Factory },
  { href: "/admin/categories", label: "Categories", icon: FolderTree },
  { href: "/admin/media", label: "Media library", icon: FileImage },
  { href: "/admin/attachments", label: "Quote attachments", icon: Paperclip },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/settings", label: "Site settings", icon: Settings },
  { href: "/admin/locations", label: "Locations", icon: MapPin },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // The gate: redirects when signed out, 404s for a signed-in non-admin, and
  // reads the role from the database rather than the cookie's claim.
  const admin = await requireAdminPage();

  // After the gate, never in parallel with it: this is a count of visitor-submitted
  // mail, so it must not be queried until the request is known to be an admin's.
  //
  // Shared layouts are not re-rendered on client-side navigation between admin
  // pages, so the badge is as fresh as the last full server render — a hard
  // reload, or the `router.refresh()` that `message-actions` already fires after
  // marking a message handled. New mail arriving mid-session shows on the next
  // one; nothing here polls.
  const unread = await countUnreadMessages();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-secondary/30 min-h-dvh">
        <div className="flex min-h-dvh flex-col">
          <header className="bg-brand-black text-white">
            <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="bg-brand-yellow text-brand-black rounded-sm px-2 py-0.5 text-xs font-bold">
                  ADMIN
                </span>
                <Link href="/ka" className="text-sm font-semibold text-white/80 hover:text-white">
                  Strong Wash ↗
                </Link>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-white/70">{admin.email}</span>
                <AdminSignOut className="text-white hover:bg-white/10" />
              </div>
            </div>
          </header>

          <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 lg:flex-row">
            <nav aria-label="Admin sections" className="lg:w-56 lg:shrink-0">
              <ul className="flex gap-1 overflow-x-auto lg:flex-col">
                {NAV.map((item) => (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      className="hover:bg-card focus-visible:ring-ring flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <item.icon aria-hidden className="size-4 shrink-0" />
                      {item.label}
                      {item.href === MESSAGES_HREF && unread > 0 ? (
                        <Badge
                          // Labelled rather than left as a bare number: read on its
                          // own by a screen reader, "3" next to "Messages" is
                          // meaningless.
                          aria-label={`${unread} unread`}
                          className="bg-brand-yellow text-brand-black ml-auto px-1.5 tabular-nums"
                        >
                          {unread > 99 ? "99+" : unread}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <main className="min-w-0 flex-1">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
