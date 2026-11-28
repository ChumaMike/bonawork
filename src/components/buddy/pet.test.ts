import { describe, expect, it } from "vitest";
import {
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

describe("where the pet may sit", () => {
  it("never strolls beside the content: the workbench pages use the full width", () => {
    expect(hasGutter(wide.w)).toBe(false);
    expect(hasGutter(phone.w)).toBe(false);
  });

  it("starts bottom right, above the page's own bottom bar", () => {
    const home = homeSpot(phone);
    expect(home.x).toBe(phone.w - PET_PX - 16);
    expect(home.y).toBe(phone.h - phone.bottomReserve - PET_PX);
  });

  it("is moved to the nearer bottom corner when dropped", () => {
    expect(settle({ x: 600, y: 300 }, wide)).toEqual({
      x: 16,
      y: wide.h - wide.bottomReserve - PET_PX,
    });
    expect(settle({ x: 1000, y: 300 }, wide).x).toBe(wide.w - PET_PX - 16);
  });

  it("hugs a bottom corner on a phone, above the bottom bar", () => {
    expect(settle({ x: 120, y: 5 }, phone)).toEqual({
      x: 16,
      y: phone.h - phone.bottomReserve - PET_PX,
    });
    expect(settle({ x: 300, y: 790 }, phone)).toEqual({
      x: phone.w - PET_PX - 16,
      y: phone.h - phone.bottomReserve - PET_PX,
    });
  });

  it("can be dragged anywhere on screen while held", () => {
    expect(onScreen({ x: -40, y: 2000 }, phone)).toEqual({ x: 0, y: phone.h - PET_PX });
  });

  it("stays put instead of strolling", () => {
    const corner = settle({ x: 40, y: 300 }, wide);
    expect(strollTarget(corner, wide, () => 0.9)).toEqual(corner);
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
