"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

/**
 * The largest symbol drawn: version 20, 97 modules a side, about 850
 * characters. A denser code is too fine to scan from a screen, so a longer
 * link gets a sentence instead.
 */
export const VERIFY_QR_MAX_VERSION = 20;

/** Light border the standard asks for around a code, in modules. */
const QUIET_ZONE = 4;

type Level = "L" | "M" | "Q" | "H";

export interface QrDrawing {
  /** 1 to 40. A symbol has `17 + 4 * version` modules a side. */
  version: number;
  /** Error-correction level used. */
  level: Level;
  /** Side of the drawing in modules, quiet zone included. */
  side: number;
  /** SVG path data for the dark modules, one unit per module. */
  path: string;
}

function encode(text: string, version: number, level: Level) {
  // Version 0 asks the library for the smallest symbol that holds the text.
  const code = qrcode(version as Parameters<typeof qrcode>[0], level);
  code.addData(text, "Byte");
  code.make(); // Throws when the text does not fit.
  return code;
}

/**
 * Work out the square code for `text`, or null when it needs a symbol larger
 * than `VERIFY_QR_MAX_VERSION`.
 *
 * Error correction: on a screen nothing is torn or smudged, so module size
 * matters more than redundancy. The smallest symbol that holds the text is
 * chosen first (level L), then the strongest level that still fits in that
 * same symbol, which costs nothing.
 */
export function drawQr(text: string): QrDrawing | null {
  // The library's byte mode writes one byte per character, so the text must be ASCII.
  const ascii = /^[\x20-\x7e]*$/.test(text) ? text : encodeURI(text);
  let code: ReturnType<typeof encode>;
  let level: Level = "L";
  try {
    code = encode(ascii, 0, "L");
  } catch {
    return null;
  }
  const version = (code.getModuleCount() - 17) / 4;
  if (version > VERIFY_QR_MAX_VERSION) return null;
  for (const stronger of ["M", "Q", "H"] as const) {
    try {
      code = encode(ascii, version, stronger);
      level = stronger;
    } catch {
      break;
    }
  }

  const count = code.getModuleCount();
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!code.isDark(row, col)) continue;
      // One rectangle per run of dark modules keeps the path short.
      let run = 1;
      while (col + run < count && code.isDark(row, col + run)) run++;
      path += `M${col + QUIET_ZONE} ${row + QUIET_ZONE}h${run}v1h-${run}z`;
      col += run;
    }
  }
  return { version, level, side: count + QUIET_ZONE * 2, path };
}

/**
 * A QR code for `href`, drawn as inline SVG with qrcode-generator. Dark modules use currentColor.
 *
 * A code only scans reliably as dark on light. So it always sits on a white
 * tile, and the modules are darkened: in the dark theme `currentColor` is a
 * light ink, which would otherwise vanish on the tile.
 *
 * When the link is too long for a code that can be scanned from a screen, this
 * returns a short sentence instead of throwing.
 */
export function VerifyQr({
  href,
  size = 176,
  className,
  label = "Square code that opens BonaWork Verify with this record filled in",
}: {
  href: string;
  /** Width and height in CSS pixels. 160 or more scans comfortably from another phone. */
  size?: number;
  className?: string;
  /** Accessible name. */
  label?: string;
}) {
  const drawing = useMemo(() => drawQr(href), [href]);

  if (!drawing) {
    return (
      <p
        data-testid="verify-qr-too-long"
        className={["text-sm text-muted", className].filter(Boolean).join(" ")}
        style={{ maxWidth: Math.max(size, 176) }}
      >
        This record is too long for a square code. Use the link instead.
      </p>
    );
  }

  return (
    <span
      role="img"
      aria-label={label}
      data-testid="verify-qr"
      data-qr-version={drawing.version}
      className={className}
      // White, whatever the theme: see the note above.
      style={{
        display: "inline-block",
        width: size,
        height: size,
        backgroundColor: "#ffffff",
        lineHeight: 0,
      }}
    >
      <svg
        viewBox={`0 0 ${drawing.side} ${drawing.side}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        aria-hidden="true"
        focusable="false"
        style={{ display: "block", filter: "brightness(0.35)" }}
      >
        <path d={drawing.path} fill="currentColor" />
      </svg>
    </span>
  );
}
