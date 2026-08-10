import Link from "next/link";

import { LocationForm } from "@/components/admin/location-form";

export default function NewLocationPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/locations" className="text-muted-foreground text-sm hover:underline">
          ← Locations
        </Link>
        <h1 className="text-display mt-1 text-2xl">New location</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Georgian is required; English and Russian fall back to it when empty.
        </p>
      </header>

      <LocationForm />
    </div>
  );
}
