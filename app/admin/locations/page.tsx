import { Plus } from "lucide-react";
import Link from "next/link";

import { LocationRowActions } from "@/components/admin/location-row-actions";
import { Badge } from "@/components/ui/badge";
import { listAdminLocations } from "@/lib/queries/admin";

export default async function AdminLocationsPage() {
  const locations = await listAdminLocations();
  const active = locations.filter((location) => location.isActive).length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-display text-2xl">Locations</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {active} shown on the site, {locations.length} in total. The first by order is
            the one the header and product pages show.
          </p>
        </div>
        <Link
          href="/admin/locations/new"
          className="bg-brand-yellow text-brand-black hover:bg-brand-yellow-dark inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors"
        >
          <Plus aria-hidden className="size-4" />
          New location
        </Link>
      </header>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50 text-muted-foreground text-xs uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Name</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Phone</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">Address (KA)</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Order</th>
              <th scope="col" className="px-3 py-2 text-left font-semibold">State</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {locations.map((location, index) => (
              <tr key={location.id} className="border-t">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/locations/${location.id}`}
                    className="font-medium hover:underline"
                  >
                    {location.name.en || location.name.ka}
                  </Link>
                  {index === 0 && location.isActive ? (
                    <span className="text-muted-foreground ml-2 text-xs">primary</span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <div className="text-data">{location.phone}</div>
                  {location.phone2 ? (
                    <div className="text-data text-muted-foreground text-xs">
                      <span className="sr-only">Second number: </span>
                      {location.phone2}
                    </div>
                  ) : null}
                </td>
                <td className="max-w-72 px-3 py-2">{location.address.ka}</td>
                <td className="text-data px-3 py-2 text-right">{location.order}</td>
                <td className="px-3 py-2">
                  {location.isActive ? (
                    <Badge variant="secondary">active</Badge>
                  ) : (
                    <Badge variant="outline">hidden</Badge>
                  )}
                </td>
                <td className="px-3 py-2">
                  <LocationRowActions
                    id={location.id}
                    name={location.name.en || location.name.ka}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-muted-foreground text-xs">
        Branches are listed lowest order first. The footer shows up to three in full and
        links to the locations page beyond that. With no location at all, the site falls
        back to a single built-in branch.
      </p>
    </div>
  );
}
