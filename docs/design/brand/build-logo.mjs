// Builds the Bona Chain logo files from one of the four marks on the options page.
//
//   node docs/design/brand/build-logo.mjs <rings|link|trail|bc> [outDir]
//
// Writes, under outDir (default: the repository's public/ folder):
//   brand/bona-chain-mark.svg        the mark, ink with the rust accent
//   brand/bona-chain-mark-mono.svg   the mark in one colour (currentColor)
//   brand/bona-chain-logo.svg        mark and name, for light backgrounds
//   brand/bona-chain-logo-dark.svg   mark and name, for dark backgrounds
//   icon.svg                         the app icon (rounded tile)
//   icon-maskable.svg                the app icon, full bleed, mark inside the safe zone
//
// The name is drawn as outlines of Bricolage Grotesque Bold (SIL Open Font
// Licence), so the files do not need the font. Marks sit on a 40 x 40 grid.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const INK = "#2B2118";
const CREAM = "#F6F0E4";
const RUST = "#8C4F24";
const SUN = "#D4AF78";

/** Each mark: its shapes for a main colour `c` and an accent `a`, and its left and right edges. */
export const MARKS = {
  rings: {
    name: "Seeing links",
    edges: [6.25, 33.75],
    draw: (c, a) =>
      `<circle cx="20" cy="15" r="11.5" fill="none" stroke="${c}" stroke-width="3.5"/>` +
      `<circle cx="20" cy="25" r="11.5" fill="none" stroke="${c}" stroke-width="3.5"/>` +
      `<circle cx="20" cy="20" r="3.1" fill="${a}"/>`,
  },
  link: {
    name: "Link and tick",
    edges: [0, 39],
    draw: (c, a, id = "gap") =>
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="40" height="40">` +
      `<rect width="40" height="40" fill="#fff"/><path d="M22 20 40 2" fill="none" stroke="#000" stroke-width="8"/></mask>` +
      `<rect x="2" y="15" width="27" height="17" rx="8.5" fill="none" stroke="${c}" stroke-width="4" mask="url(#${id})"/>` +
      `<path d="M12.5 20.5 17 25 37 5" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  trail: {
    name: "Trail to tick",
    edges: [2.7, 38.7],
    draw: (c, a) =>
      `<circle cx="4.6" cy="16.6" r="1.9" fill="${c}"/><circle cx="8.9" cy="20.9" r="2.3" fill="${c}"/>` +
      `<circle cx="13.9" cy="25.9" r="2.7" fill="${c}"/>` +
      `<path d="M19.5 31.5 36 9.5" fill="none" stroke="${a}" stroke-width="5.4" stroke-linecap="round"/>`,
  },
  bc: {
    name: "bc links",
    edges: [3.5, 36.4],
    draw: (c, a) =>
      `<path d="M5.5 4V25" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="14.5" cy="25" r="9" fill="none" stroke="${c}" stroke-width="4"/>` +
      `<path d="M34.4 19.2A9 9 0 1 0 34.4 30.8" fill="none" stroke="${a}" stroke-width="4" stroke-linecap="round"/>`,
  },
};

/* "Bona Chain" in Bricolage Grotesque Bold at 100 units per em, baseline at y = 0,
   letter-spacing -0.025 em. Cap height 66; total width 534.2. */
const WORD_WIDTH = 534.2;
const CAP_HEIGHT = 66;
const WORD_BONA =
  "M37.20 0L7.30 0L7.30-66L34.70-66Q40.80-66 45.60-64.95Q50.40-63.90 53.85-61.80Q57.30-59.70 59.15-56.35Q61-53 61-48.40L61-48.40Q61-44.50 59.35-41.60Q57.70-38.70 54.25-36.90Q50.80-35.10 45.20-34.40L45.20-34.40L45.20-32.90Q54.70-32.20 59.15-28.15Q63.60-24.10 63.60-17.30L63.60-17.30Q63.60-11.60 60.65-7.75Q57.70-3.90 51.80-1.95Q45.90 0 37.20 0L37.20 0ZM21-29L21-11.60L37-11.60Q43.40-11.60 46.50-13.55Q49.60-15.50 49.60-19.60L49.60-19.60Q49.60-24.30 45.70-26.65Q41.80-29 33.90-29L33.90-29L21-29ZM21-54.60L21-38L31.80-38Q39.60-38 43.25-40.15Q46.90-42.30 46.90-46.50L46.90-46.50Q46.90-50.70 43.60-52.65Q40.30-54.60 33.50-54.60L33.50-54.60L21-54.60ZM96.20 1.40L96.20 1.40Q88.30 1.40 82.30-1.75Q76.30-4.90 72.90-11.05Q69.50-17.20 69.50-26.40L69.50-26.40Q69.50-35.60 72.95-41.70Q76.40-47.80 82.45-50.85Q88.50-53.90 96.20-53.90L96.20-53.90Q104.10-53.90 110.15-50.80Q116.20-47.70 119.65-41.55Q123.10-35.40 123.10-26.20L123.10-26.20Q123.10-16.90 119.55-10.75Q116.00-4.60 109.95-1.60Q103.90 1.40 96.20 1.40ZM96.70-9.30L96.70-9.30Q100.60-9.30 103.25-11.10Q105.90-12.90 107.25-16.55Q108.60-20.20 108.60-25.40L108.60-25.40Q108.60-30.90 107.15-34.75Q105.70-38.60 102.90-40.65Q100.10-42.70 95.80-42.70L95.80-42.70Q92.10-42.70 89.40-40.95Q86.70-39.20 85.30-35.55Q83.90-31.90 83.90-26.60L83.90-26.60Q83.90-18.10 87.30-13.70Q90.70-9.30 96.70-9.30ZM145.20 0L130.80 0L130.80-31.80L130.80-52.50L142.60-52.50L142.50-36.80L144.50-36.80Q145.80-42.50 148.20-46.30Q150.60-50.10 154.25-52Q157.90-53.90 162.90-53.90L162.90-53.90Q172.00-53.90 176.75-47.50Q181.50-41.10 181.50-27.40L181.50-27.40L181.50 0L167.00 0L167.00-25.80Q167.00-34.20 164.55-38.05Q162.10-41.90 157.40-41.90L157.40-41.90Q153.40-41.90 150.70-39.40Q148.00-36.90 146.65-32.85Q145.30-28.80 145.20-23.80L145.20-23.80L145.20 0ZM203.70 1.40L203.70 1.40Q199.30 1.40 195.90-0.35Q192.50-2.10 190.60-5.40Q188.70-8.70 188.70-13.60L188.70-13.60Q188.70-17.90 190.35-20.80Q192-23.70 195.20-25.50Q198.40-27.30 203.10-28.50Q207.80-29.70 213.80-30.60L213.80-30.60Q217-31.10 219.05-31.55Q221.10-32 222.10-33.05Q223.10-34.10 223.10-36.10L223.10-36.10Q223.10-38.90 221.10-40.90Q219.10-42.90 214.80-42.90L214.80-42.90Q211.90-42.90 209.45-41.90Q207-40.90 205.25-38.90Q203.50-36.90 202.70-33.80L202.70-33.80L190-37.70Q191.20-41.80 193.45-44.80Q195.70-47.80 198.90-49.85Q202.10-51.90 206.20-52.90Q210.30-53.90 215.10-53.90L215.10-53.90Q222.80-53.90 227.65-51.45Q232.50-49 234.90-43.85Q237.30-38.70 237.30-30.60L237.30-30.60L237.30-21.60Q237.30-18.10 237.45-14.50Q237.60-10.90 237.85-7.25Q238.10-3.60 238.40 0L238.40 0L225.70 0Q225.30-2.50 224.95-5.75Q224.60-9 224.40-12.30L224.40-12.30L222.60-12.30Q221.20-8.50 218.60-5.40Q216-2.30 212.25-0.45Q208.50 1.40 203.70 1.40ZM209.80-9L209.80-9Q211.70-9 213.65-9.70Q215.60-10.40 217.45-11.65Q219.30-12.90 220.85-14.80Q222.40-16.70 223.40-19.10L223.40-19.10L223.20-27.50L225.50-27Q223.70-25.70 221.30-24.95Q218.90-24.20 216.35-23.80Q213.80-23.40 211.30-22.90Q208.80-22.40 206.85-21.60Q204.90-20.80 203.75-19.45Q202.60-18.10 202.60-15.70L202.60-15.70Q202.60-12.60 204.60-10.80Q206.60-9 209.80-9Z";
const WORD_CHAIN =
  "M301.40 1.40L301.40 1.40Q293.70 1.40 287.65-0.75Q281.60-2.90 277.35-7.15Q273.10-11.40 270.90-17.70Q268.70-24 268.70-32.30L268.70-32.30Q268.70-40.70 270.95-47.20Q273.20-53.70 277.45-58.25Q281.70-62.80 287.50-65.10Q293.30-67.40 300.40-67.40L300.40-67.40Q305.90-67.40 310.60-65.95Q315.30-64.50 318.70-61.80Q322.10-59.10 324.05-55.20Q326-51.30 326.10-46.40L326.10-46.40L312.80-42.90Q312.80-47.10 310.95-49.90Q309.10-52.70 306.15-54.15Q303.20-55.60 299.90-55.60L299.90-55.60Q297-55.60 294.15-54.45Q291.30-53.30 288.95-50.65Q286.60-48 285.15-43.70Q283.70-39.40 283.70-33.20L283.70-33.20Q283.70-25.10 286.05-20.10Q288.40-15.10 292.50-12.75Q296.60-10.40 301.70-10.40L301.70-10.40Q307.20-10.40 310.25-12.65Q313.30-14.90 314.65-18.45Q316-22 316.10-26L316.10-26L328.70-23.90Q328.60-18.60 327.10-13.95Q325.60-9.30 322.40-5.85Q319.20-2.40 314-0.50Q308.80 1.40 301.40 1.40ZM350.30 0L335.90 0L335.90-33L335.90-71.50L350.40-71.50L350.40-55.10Q350.40-53.10 350.25-50.90Q350.10-48.70 349.75-46.45Q349.40-44.20 349.05-41.90Q348.70-39.60 348.30-37.30L348.30-37.30L350.50-37.30Q351.90-42.40 354.05-46.10Q356.20-49.80 359.60-51.85Q363-53.90 368.20-53.90L368.20-53.90Q377.40-53.90 382-47.45Q386.60-41 386.60-27.70L386.60-27.70L386.60 0L372.10 0L372.10-25.50Q372.10-33.90 369.65-37.95Q367.20-42 362.30-42L362.30-42Q358.30-42 355.70-39.60Q353.10-37.20 351.80-33.15Q350.50-29.10 350.30-24.10L350.30-24.10L350.30 0ZM408.80 1.40L408.80 1.40Q404.40 1.40 401.00-0.35Q397.60-2.10 395.70-5.40Q393.80-8.70 393.80-13.60L393.80-13.60Q393.80-17.90 395.45-20.80Q397.10-23.70 400.30-25.50Q403.50-27.30 408.20-28.50Q412.90-29.70 418.90-30.60L418.90-30.60Q422.10-31.10 424.15-31.55Q426.20-32 427.20-33.05Q428.20-34.10 428.20-36.10L428.20-36.10Q428.20-38.90 426.20-40.90Q424.20-42.90 419.90-42.90L419.90-42.90Q417.00-42.90 414.55-41.90Q412.10-40.90 410.35-38.90Q408.60-36.90 407.80-33.80L407.80-33.80L395.10-37.70Q396.30-41.80 398.55-44.80Q400.80-47.80 404.00-49.85Q407.20-51.90 411.30-52.90Q415.40-53.90 420.20-53.90L420.20-53.90Q427.90-53.90 432.75-51.45Q437.60-49 440.00-43.85Q442.40-38.70 442.40-30.60L442.40-30.60L442.40-21.60Q442.40-18.10 442.55-14.50Q442.70-10.90 442.95-7.25Q443.20-3.60 443.50 0L443.50 0L430.80 0Q430.40-2.50 430.05-5.75Q429.70-9 429.50-12.30L429.50-12.30L427.70-12.30Q426.30-8.50 423.70-5.40Q421.10-2.30 417.35-0.45Q413.60 1.40 408.80 1.40ZM414.90-9L414.90-9Q416.80-9 418.75-9.70Q420.70-10.40 422.55-11.65Q424.40-12.90 425.95-14.80Q427.50-16.70 428.50-19.10L428.50-19.10L428.30-27.50L430.60-27Q428.80-25.70 426.40-24.95Q424.00-24.20 421.45-23.80Q418.90-23.40 416.40-22.90Q413.90-22.40 411.95-21.60Q410.00-20.80 408.85-19.45Q407.70-18.10 407.70-15.70L407.70-15.70Q407.70-12.60 409.70-10.80Q411.70-9 414.90-9ZM466.90 0L452.50 0L452.50-52.50L466.90-52.50L466.90 0ZM459.80-60.40L459.80-60.40Q455.60-60.40 453.35-62.15Q451.10-63.90 451.10-67.30L451.10-67.30Q451.10-70.80 453.35-72.60Q455.60-74.40 459.80-74.40L459.80-74.40Q464.10-74.40 466.35-72.60Q468.60-70.80 468.60-67.30L468.60-67.30Q468.60-64 466.35-62.20Q464.10-60.40 459.80-60.40ZM492.10 0L477.70 0L477.70-31.80L477.70-52.50L489.50-52.50L489.40-36.80L491.40-36.80Q492.70-42.50 495.10-46.30Q497.50-50.10 501.15-52Q504.80-53.90 509.80-53.90L509.80-53.90Q518.90-53.90 523.65-47.50Q528.40-41.10 528.40-27.40L528.40-27.40L528.40 0L513.90 0L513.90-25.80Q513.90-34.20 511.45-38.05Q509-41.90 504.30-41.90L504.30-41.90Q500.30-41.90 497.60-39.40Q494.90-36.90 493.55-32.85Q492.20-28.80 492.10-23.80L492.10-23.80L492.10 0Z";

const svg = (w, h, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"` +
  (label ? ` role="img" aria-label="${label}"` : "") +
  `>${body}</svg>
`;

function lockup(mark, main, accent) {
  // The mark is 40 tall. The name is set so that the mark is 1.4 em tall.
  const em = 40 / 1.4;
  const scale = em / 100;
  const [left, right] = mark.edges;
  const markWidth = right - left;
  const gap = em * 0.36;
  const wordX = markWidth + gap;
  const baseline = 20 + (CAP_HEIGHT * scale) / 2;
  const width = Math.ceil(wordX + WORD_WIDTH * scale);
  const body =
    `<g transform="translate(${(-left).toFixed(2)} 0)">${mark.draw(main, accent)}</g>` +
    `<g transform="translate(${wordX.toFixed(2)} ${baseline.toFixed(2)}) scale(${scale.toFixed(4)})">` +
    `<path fill="${main}" d="${WORD_BONA}"/><path fill="${accent}" d="${WORD_CHAIN}"/></g>`;
  return svg(width, 40, body, "Bona Chain");
}

function icon(mark, { radius, markSize }) {
  const scale = markSize / 40;
  const offset = (64 - markSize) / 2;
  return svg(
    64,
    64,
    `<rect width="64" height="64" rx="${radius}" fill="${INK}"/>` +
      `<g transform="translate(${offset} ${offset}) scale(${scale})">${mark.draw(CREAM, SUN)}</g>`,
  );
}

export function build(id) {
  const mark = MARKS[id];
  if (!mark)
    throw new Error(
      `Unknown mark "${id}". Use one of: ${Object.keys(MARKS).join(", ")}.`,
    );
  return {
    "brand/bona-chain-mark.svg": svg(40, 40, mark.draw(INK, RUST), "Bona Chain"),
    "brand/bona-chain-mark-mono.svg": svg(
      40,
      40,
      mark.draw("currentColor", "currentColor"),
      "Bona Chain",
    ),
    "brand/bona-chain-logo.svg": lockup(mark, INK, RUST),
    "brand/bona-chain-logo-dark.svg": lockup(mark, CREAM, SUN),
    "icon.svg": icon(mark, { radius: 14, markSize: 44 }),
    "icon-maskable.svg": icon(mark, { radius: 0, markSize: 34 }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [id, outArg] = process.argv.slice(2);
  const outDir = outArg
    ? resolve(outArg)
    : resolve(dirname(fileURLToPath(import.meta.url)), "../../../public");
  for (const [file, content] of Object.entries(build(id))) {
    const path = join(outDir, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    console.log("wrote", path);
  }
}
