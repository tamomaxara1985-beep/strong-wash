/**
 * Generates the local placeholder artwork used by Phase 1.
 *
 * Phase 1 has no real product photography, but the gallery and card components
 * need images that visibly differ so their behaviour is testable. Three
 * variants per equipment family gives that without shipping stock photos.
 *
 * Run: node scripts/generate-placeholders.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "public", "placeholders");

// Palette sampled from the supplied brand artwork: the mark is exactly
// #fec303 and #010101. Accent strokes use the darker yellow so they stay
// legible on a near-white panel; flat fills use the brand yellow itself.
const INK = "#101010";
const ACCENT = "#e0a800";
const ACCENT_FILL = "#fec303";
const FOAM = "#f4f3ef";
const WHITE = "#ffffff";
const LINE = "#dcdbd5";

const stroke = (extra = "") =>
  `fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" ${extra}`;

/** A simple car silhouette, reused wherever the subject is a vehicle in a machine. */
const car = (y = 470) => `
  <path d="M250 ${y}h300l52 48h58a26 26 0 0 1 26 26v34H236v-34a26 26 0 0 1 26-26h58z"
    fill="${FOAM}" stroke="${INK}" stroke-width="6" stroke-linejoin="round" />
  <path d="M318 ${y + 48}h164" fill="none" stroke="${LINE}" stroke-width="5" />
  <circle cx="322" cy="${y + 108}" r="26" fill="${WHITE}" stroke="${INK}" stroke-width="6" />
  <circle cx="558" cy="${y + 108}" r="26" fill="${WHITE}" stroke="${INK}" stroke-width="6" />
`;

const shapes = {
  // Rollover gantry: the arch travels over a stationary car.
  gantry: `
    <path d="M186 640V300a34 34 0 0 1 34-34h360a34 34 0 0 1 34 34v340" ${stroke()} />
    <rect x="150" y="640" width="500" height="26" rx="8" fill="${INK}" />
    <rect x="214" y="300" width="52" height="250" rx="14" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <rect x="534" y="300" width="52" height="250" rx="14" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <rect x="266" y="266" width="268" height="46" rx="14" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    ${car(452)}
  `,

  // Tunnel: a car on a conveyor passing successive stations.
  tunnel: `
    <path d="M140 620V330a30 30 0 0 1 30-30h460a30 30 0 0 1 30 30v290" ${stroke()} />
    <path d="M232 300v300M328 300v300M424 300v300M520 300v300" fill="none" stroke="${LINE}" stroke-width="5" />
    <rect x="120" y="620" width="560" height="24" rx="8" fill="${INK}" />
    <path d="M150 664h500" fill="none" stroke="${ACCENT}" stroke-width="10" stroke-linecap="round" />
    <rect x="196" y="300" width="34" height="180" rx="10" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <rect x="570" y="300" width="34" height="180" rx="10" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    ${car(470)}
  `,

  // Self-service bay: wall column, boom and lance.
  bay: `
    <rect x="180" y="230" width="150" height="330" rx="18" ${stroke()} />
    <rect x="208" y="266" width="94" height="76" rx="10" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <circle cx="232" cy="396" r="13" fill="${ACCENT_FILL}" />
    <circle cx="278" cy="396" r="13" fill="${LINE}" />
    <path d="M330 290h190a26 26 0 0 1 26 26v54" ${stroke()} />
    <path d="M546 370c0 70-42 96-42 150" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" />
    <path d="M486 520h44v56h-44z" ${stroke()} />
    <rect x="150" y="600" width="500" height="24" rx="8" fill="${INK}" />
  `,

  // Payment terminal: pedestal, screen, card slot.
  terminal: `
    <rect x="280" y="180" width="240" height="330" rx="24" ${stroke()} />
    <rect x="312" y="216" width="176" height="120" rx="10" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <path d="M330 380h140" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" />
    <rect x="336" y="418" width="128" height="20" rx="10" fill="${LINE}" />
    <path d="M362 510h76v110h-76z" ${stroke()} />
    <rect x="300" y="620" width="200" height="24" rx="8" fill="${INK}" />
  `,

  // Pressure washer: cabinet on wheels with hose and lance.
  pressure: `
    <rect x="200" y="300" width="290" height="250" rx="26" ${stroke()} />
    <rect x="240" y="342" width="150" height="80" rx="10" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <circle cx="266" cy="474" r="16" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <circle cx="324" cy="474" r="16" fill="${LINE}" />
    <circle cx="256" cy="574" r="30" ${stroke()} />
    <circle cx="434" cy="574" r="30" ${stroke()} />
    <path d="M242 300v-46a30 30 0 0 1 30-30h60" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" />
    <path d="M490 380c78 0 92 62 56 104" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" />
    <path d="M536 490l84-64" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" />
    <path d="M604 438l38-28" fill="none" stroke="${ACCENT}" stroke-width="8" stroke-linecap="round" />
  `,

  // Coin-operated vacuum station: cabinet, coin head, two hoses.
  vacuum: `
    <rect x="270" y="220" width="260" height="360" rx="26" ${stroke()} />
    <rect x="306" y="256" width="188" height="72" rx="10" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <path d="M382 300h36" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" />
    <circle cx="400" cy="392" r="26" fill="${WHITE}" stroke="${INK}" stroke-width="6" />
    <path d="M270 430c-70 12-96 66-96 150" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" />
    <path d="M530 430c70 12 96 66 96 150" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" />
    <path d="M154 580h40v54h-40zM606 580h40v54h-40z" ${stroke()} />
    <rect x="240" y="600" width="320" height="24" rx="8" fill="${INK}" />
  `,

  // Water treatment: tank battery with flow.
  water: `
    <rect x="212" y="270" width="130" height="300" rx="26" ${stroke()} />
    <rect x="360" y="270" width="130" height="300" rx="26" ${stroke()} />
    <rect x="508" y="330" width="98" height="240" rx="22" ${stroke()} />
    <path d="M212 460h130M360 460h130" fill="none" stroke="${LINE}" stroke-width="5" />
    <path d="M240 500h74v46h-74zM388 500h74v46h-74z" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <path d="M342 350h18a20 20 0 0 1 20 20M490 400h18a20 20 0 0 1 20 20" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" />
    <path d="M277 232c22 24 22 38 0 38s-22-14 0-38M425 232c22 24 22 38 0 38s-22-14 0-38"
      fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <rect x="180" y="600" width="450" height="24" rx="8" fill="${INK}" />
  `,

  // Chemical drum with a tap.
  chemical: `
    <path d="M300 250h200a30 30 0 0 1 30 30v300a30 30 0 0 1-30 30H300a30 30 0 0 1-30-30V280a30 30 0 0 1 30-30z" ${stroke()} />
    <path d="M356 206h88v46h-88z" ${stroke()} />
    <rect x="304" y="330" width="192" height="132" rx="10" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <path d="M336 372h128M336 410h84" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round" />
    <path d="M530 520h52v34h-52z" ${stroke()} />
    <path d="M556 554v40" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" />
    <circle cx="556" cy="616" r="12" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="5" />
  `,

  // Foam arch spraying a vehicle.
  foam: `
    <path d="M200 620V330a30 30 0 0 1 30-30h340a30 30 0 0 1 30 30v290" ${stroke()} />
    <rect x="230" y="266" width="340" height="44" rx="14" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <circle cx="286" cy="372" r="13" fill="${ACCENT_FILL}" />
    <circle cx="400" cy="352" r="13" fill="${ACCENT_FILL}" />
    <circle cx="514" cy="372" r="13" fill="${ACCENT_FILL}" />
    <path d="M286 398c0 30-14 40 0 62M400 378c0 30-14 40 0 62M514 398c0 30-14 40 0 62"
      fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round" />
    ${car(492)}
  `,

  // Dryer arch with air flow.
  dryer: `
    <path d="M196 620V320a30 30 0 0 1 30-30h348a30 30 0 0 1 30 30v300" ${stroke()} />
    <rect x="226" y="320" width="60" height="150" rx="16" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <rect x="514" y="320" width="60" height="150" rx="16" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <rect x="300" y="286" width="200" height="46" rx="14" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <path d="M330 372h140M348 410h104M366 448h68" fill="none" stroke="${ACCENT}" stroke-width="7" stroke-linecap="round" />
    ${car(492)}
  `,

  // Spare parts: nozzle, coupling and hose coil.
  parts: `
    <circle cx="400" cy="400" r="146" ${stroke()} />
    <circle cx="400" cy="400" r="88" fill="none" stroke="${ACCENT}" stroke-width="7" />
    <circle cx="400" cy="400" r="36" fill="${ACCENT_FILL}" stroke="${INK}" stroke-width="6" />
    <path d="M400 254v-56M400 602v-56M254 400h-56M602 400h56" ${stroke()} />
    <path d="M298 298l-40-40M502 298l40-40M298 502l-40 40M502 502l40 40" fill="none" stroke="${LINE}" stroke-width="6" stroke-linecap="round" />
  `,
};

/** Each variant reframes the same drawing so thumbnails are distinguishable. */
const variants = [
  { bg: FOAM, panel: WHITE, transform: "", accent: false },
  { bg: WHITE, panel: FOAM, transform: "rotate(-7 400 400) scale(1.08) translate(-30 -30)", accent: false },
  { bg: FOAM, panel: WHITE, transform: "scale(0.86) translate(66 66)", accent: true },
];

function svg(key, variant) {
  const v = variants[variant - 1];
  const accent = v.accent
    ? `<g opacity="0.6">
         ${[0, 1, 2]
           .map(
             (row) =>
               `<circle cx="${688 - row * 34}" cy="${688 - row * 34}" r="8" fill="${ACCENT_FILL}" />`,
           )
           .join("")}
       </g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img">
  <rect width="800" height="800" fill="${v.bg}" />
  <rect x="56" y="56" width="688" height="688" rx="20" fill="${v.panel}" stroke="${LINE}" stroke-width="2" />
  ${accent}
  <g transform="${v.transform}">${shapes[key]}</g>
</svg>
`;
}

await mkdir(OUT_DIR, { recursive: true });

let written = 0;
for (const key of Object.keys(shapes)) {
  for (const variant of [1, 2, 3]) {
    await writeFile(join(OUT_DIR, `${key}-${variant}.svg`), svg(key, variant), "utf8");
    written += 1;
  }
}

console.log(`Wrote ${written} placeholder files to public/placeholders/`);
