import {
  Archivo,
  Figtree,
  Inter,
  Manrope,
  Plus_Jakarta_Sans,
  Rubik,
  Source_Sans_3,
} from "next/font/google";

/**
 * The faces an admin can choose from.
 *
 * `next/font` is analysed at build time — a family name read from the database
 * cannot be passed to a loader. So every option is loaded here at module scope
 * and stays self-hosted; the stored key only decides which variable
 * `--font-body` resolves to.
 *
 * Only the default is preloaded. The others are declared so their CSS exists,
 * but the browser fetches a face only when a rule actually references it, so the
 * cost of a long list is build size rather than page weight. That is also why
 * this list is deliberately short.
 *
 * Georgian: Source Sans 3 and Rubik carry Mkhedruli; the rest fall through to
 * Noto Sans Georgian per glyph, exactly as Manrope does today. The Georgian
 * stack in globals.css therefore stays appended for every entry.
 */
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], display: "swap" });
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], display: "swap", preload: false });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap", preload: false });
const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin", "cyrillic"], display: "swap", preload: false });
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"], display: "swap", preload: false });

export type FontEntry = {
  key: string;
  label: string;
  /** The CSS variable name the loader defines, e.g. `--font-inter`. */
  variable: string;
  /** The class that puts that variable in scope, applied to <html>. */
  className: string;
};

export const FONTS: FontEntry[] = [
  { key: "manrope", label: "Manrope", variable: "--font-manrope", className: manrope.variable },
  { key: "inter", label: "Inter", variable: "--font-inter", className: inter.variable },
  { key: "figtree", label: "Figtree", variable: "--font-figtree", className: figtree.variable },
  { key: "jakarta", label: "Plus Jakarta Sans", variable: "--font-jakarta", className: jakarta.variable },
  { key: "source-sans", label: "Source Sans 3", variable: "--font-source-sans", className: sourceSans.variable },
  { key: "rubik", label: "Rubik", variable: "--font-rubik", className: rubik.variable },
  { key: "archivo", label: "Archivo", variable: "--font-archivo", className: archivo.variable },
];

export const FONT_KEYS = FONTS.map((font) => font.key);

/** Falls back to the default rather than throwing: a stale key must not 500 a page. */
export function findFont(key: string): FontEntry {
  return FONTS.find((font) => font.key === key) ?? FONTS[0];
}

/** Every face's class, so any of their variables can be referenced at runtime. */
export function fontClassNames(): string {
  return FONTS.map((font) => font.className).join(" ");
}
