/**
 * Where a branch's address takes a visitor who clicks it.
 *
 * The branch's own `mapUrl` always wins: that is a pin an operator placed
 * deliberately. With none saved, a Google Maps search for the address text is
 * close enough to be useful and needs no admin work — every branch is clickable
 * the day it is created.
 *
 * The fallback deliberately targets `www.google.com`, which is already on the
 * allowlist `isMapUrl` enforces for stored links, so both paths send a visitor
 * to the same set of hosts. Rendered with `rel="noopener noreferrer"` like every
 * other outbound map link.
 *
 * Returns undefined when there is neither a saved link nor an address to search
 * for, so the caller renders plain text rather than a link to an empty query.
 */
export function mapLink(address: string, mapUrl?: string): string | undefined {
  if (mapUrl) return mapUrl;
  const query = address.trim();
  if (!query) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
