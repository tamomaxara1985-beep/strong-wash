import Link from "next/link";

import { BrandForm } from "@/components/admin/brand-form";

export default function NewBrandPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <Link href="/admin/brands" className="text-muted-foreground text-sm hover:underline">
          ← Brands
        </Link>
        <h1 className="text-display mt-1 text-2xl">New brand</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Manufacturer names stay untranslated; only the description is per-language.
        </p>
      </header>

      <BrandForm />
    </div>
  );
}
