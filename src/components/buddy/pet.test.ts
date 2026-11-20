import { describe, expect, it } from "vitest";
import {
  CONTENT_MAX_PX,
  PET_PX,
  hasGutter,
  homeSpot,
  onScreen,
  panelPlacement,
  settle,
  strollTarget,
  type View,
} from "./pet";

const wide: View = { w: 1536, h: 800, bottomReserve: 80 };
const phone: View = { w: 390, h: 800, bottomReserve: 150 };
const leftGutterEnd = (wide.w - CONTENT_MAX_PX) / 2;

describe("where the pet may sit", () => {
  it("knows when there is room beside the content", () => {
    expect(hasGutter(wide.w)).toBe(true);
    expect(hasGutter(1180)).toBe(false);
    expect(hasGutter(phone.w)).toBe(false);
  });

  it("starts bottom right, above the page's own bottom bar", () => {
    const home = homeSpot(phone);
    expect(home.x).toBe(phone.w - PET_PX - 16);
    expect(home.y).toBe(phone.h - phone.bottomReserve - PET_PX);
  });

  it("is moved out of the content when dropped on it, onto the nearer side", () => {
    const dropped = settle({ x: 600, y: 300 }, wide);
    expect(dropped.x + PET_PX).toBeLessThanOrEqual(leftGutterEnd);
    const right = settle({ x: 1000, y: 300 }, wide);
    expect(right.x).toBeGreaterThanOrEqual(wide.w - leftGutterEnd);
  });

  it("hugs an edge on a phone, and never covers the header or the bottom bar", () => {
    expect(settle({ x: 120, y: 5 }, phone)).toEqual({ x: 16, y: 96 });
    expect(settle({ x: 300, y: 790 }, phone)).toEqual({
      x: phone.w - PET_PX - 16,
      y: phone.h - phone.bottomReserve - PET_PX,
    });
  });

  it("can be dragged anywhere on screen while held", () => {
    expect(onScreen({ x: -40, y: 2000 }, phone)).toEqual({ x: 0, y: phone.h - PET_PX });
  });

  it("strolls only within its own strip, and stays put on a phone", () => {
    for (const random of [0, 0.5, 1]) {
      const next = strollTarget({ x: 40, y: 300 }, wide, () => random);
      expect(next.x + PET_PX).toBeLessThanOrEqual(leftGutterEnd);
    }
    const spot = settle({ x: 300, y: 400 }, phone);
    expect(strollTarget(spot, phone)).toEqual(spot);
  });

  it("opens panels on its side, above it when low and below it when high", () => {
    const low = panelPlacement({ x: 1440, y: 650 }, wide);
    expect(low.right).toBeDefined();
    expect(low.bottom).toBeDefined();
    const high = panelPlacement({ x: 30, y: 120 }, wide);
    expect(high.left).toBeDefined();
    expect(high.top).toBe(120 + PET_PX + 10);
  });
});
