"use client";

import type { ComponentProps } from "react";
import { Dialog } from "./dialog";

/**
 * A sheet that rises from the bottom of the screen on every size: for choices
 * made with one thumb (pick a category, confirm, share). For forms or anything
 * long, use <Dialog>, which becomes a centred window on wide screens.
 */
export function BottomSheet(props: Omit<ComponentProps<typeof Dialog>, "variant">) {
  return <Dialog {...props} variant="sheet" />;
}
