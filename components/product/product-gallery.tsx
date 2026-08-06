"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type GalleryImage = {
  url: string;
  alt: string;
};

export function ProductGallery({
  images,
  label,
}: {
  images: GalleryImage[];
  label: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0];

  if (!current) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card relative aspect-square overflow-hidden rounded-lg border">
        <Image
          src={current.url}
          alt={current.alt}
          fill
          sizes="(min-width: 1024px) 45vw, 100vw"
          priority
          className="object-contain p-6"
        />
      </div>

      {images.length > 1 ? (
        <ul aria-label={label} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {images.map((image, index) => (
            <li key={image.url}>
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-current={index === active ? "true" : undefined}
                className={cn(
                  "bg-card focus-visible:ring-ring relative block aspect-square w-full overflow-hidden rounded-md border transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  index === active
                    ? "border-primary ring-primary/30 ring-2"
                    : "hover:border-primary/60",
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-contain p-1.5"
                />
                <span className="sr-only">{`${label} ${index + 1}`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
