import Link from "next/link";
import { notFound } from "next/navigation";

import { LocationForm } from "@/components/admin/location-form";
import { getAdminLocation } from "@/lib/queries/admin";

export default async function EditLocationPage({ params }: PageProps<"/admin/locations/[id]">) {
  const { id } = await params;
  const location = await getAdminLocation(id);
  if (!location) notFound();

  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/locations" className="text-muted-foreground text-sm hover:underline">
          ← Locations
        </Link>
        <h1 className="text-display mt-1 text-2xl">{location.name.en ?? location.name.ka}</h1>
        <p className="text-data text-muted-foreground mt-1 text-sm">{location.phone}</p>
      </header>

      <LocationForm location={location} />
    </div>
  );
}
