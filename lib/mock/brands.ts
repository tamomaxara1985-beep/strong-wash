import type { Brand } from "../types";

/**
 * Manufacturers active in professional car wash equipment. Brand names stay
 * untranslated — they are proper nouns in all three locales.
 */
export const brands: Brand[] = [
  { id: "br_karcher", slug: "karcher", name: "Kärcher", order: 1, isActive: true },
  { id: "br_washtec", slug: "washtec", name: "WashTec", order: 2, isActive: true },
  { id: "br_istobal", slug: "istobal", name: "Istobal", order: 3, isActive: true },
  { id: "br_christ", slug: "christ", name: "Christ", order: 4, isActive: true },
  { id: "br_tammermatic", slug: "tammermatic", name: "Tammermatic", order: 5, isActive: true },
  { id: "br_ehrle", slug: "ehrle", name: "Ehrle", order: 6, isActive: true },
  { id: "br_nilfisk", slug: "nilfisk", name: "Nilfisk", order: 7, isActive: true },
  { id: "br_comet", slug: "comet", name: "Comet", order: 8, isActive: true },
  { id: "br_ar", slug: "annovi-reverberi", name: "Annovi Reverberi", order: 9, isActive: true },
  { id: "br_interpump", slug: "interpump", name: "Interpump", order: 10, isActive: true },
  { id: "br_unitec", slug: "unitec", name: "Unitec", order: 11, isActive: true },
  { id: "br_aquarama", slug: "aquarama", name: "Aquarama", order: 12, isActive: true },
  { id: "br_koch", slug: "koch-chemie", name: "Koch-Chemie", order: 13, isActive: true },
  { id: "br_nerta", slug: "nerta", name: "Nerta", order: 14, isActive: true },
  { id: "br_sonax", slug: "sonax", name: "Sonax", order: 15, isActive: true },
];

const byId = new Map(brands.map((b) => [b.id, b]));
const bySlug = new Map(brands.map((b) => [b.slug, b]));

export function getBrandById(id: string): Brand | undefined {
  return byId.get(id);
}

export function getBrandBySlug(slug: string): Brand | undefined {
  return bySlug.get(slug);
}
