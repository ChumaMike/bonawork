/**
 * Where the buddy button sits (docs/design/SIMPLIFY_SPRINT.md, "Buddy position"):
 * above the phone bottom menu and above any sticky action bar, which is at most
 * 4.75rem tall. The device's safe area is added because the bottom menu grows
 * by the same amount.
 */
export const BUDDY_BOTTOM =
  "calc(var(--spacing-bottom-bar) + 5.25rem + env(safe-area-inset-bottom, 0px))";

/** The button is a 52 px circle. */
export const BUDDY_SIZE_PX = 52;

/** Just above the buddy button: where its panels sit. */
export const ABOVE_BUDDY = `calc(${BUDDY_BOTTOM} + ${BUDDY_SIZE_PX}px + 0.5rem)`;
