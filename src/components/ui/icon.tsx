import type { ReactNode } from "react";

/** One small, consistent icon set: 24px grid, 2px rounded strokes. */
const paths = {
  home: (
    <>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M5 5h14v11H10l-5 4z" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 5h11l-2 4 2 4H6" />
    </>
  ),
  wrench: (
    <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3L15 12l-3-3z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" />
      <path d="m9 12 2.2 2.2L15.2 10" />
    </>
  ),
  shield: <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" />,
  alert: (
    <>
      <path d="M12 4 3 19.5h18z" />
      <path d="M12 10v4.5M12 17h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  arrowRight: <path d="M5 12h14M13 6l6 6-6 6" />,
  arrowLeft: <path d="M19 12H5M11 6l-6 6 6 6" />,
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 14.4c2.1.8 3.5 2.800 3.5 5.600" />
    </>
  ),
  hand: (
    <path d="M8 12V5.500a1.500 1.500 0 0 1 3 0V11m0-1V4.500a1.500 1.500 0 0 1 3 0V11m0-4.500a1.500 1.500 0 0 1 3 0V14c0 4-2.500 6.500-6 6.500-2.800 0-4.300-1.200-5.500-3.300L3.800 14a1.500 1.500 0 0 1 2.500-1.600L8 14.500" />
  ),
  school: (
    <>
      <path d="M3 10 12 5l9 5" />
      <path d="M5 10v9h14v-9" />
      <path d="M10 19v-5h4v5" />
    </>
  ),
  mapPin: (
    <>
      <path d="M12 21s-6.500-5.600-6.500-11a6.500 6.500 0 0 1 13 0c0 5.400-6.500 11-6.500 11z" />
      <circle cx="12" cy="10" r="2.300" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5M7.500 9.500 12 5l4.500 4.500" />
      <path d="M5 19h14" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.500h7l4 4V20.500H7z" />
      <path d="M14 3.500v4h4" />
    </>
  ),
  copy: (
    <>
      <rect x="8.500" y="8.500" width="11" height="11" rx="2" />
      <path d="M15.500 5.500v-1H4.500v11h1" />
    </>
  ),
  send: <path d="M4 12 20 4l-5 16-3.500-6.500z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.500" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 0 0 5.700 0l3-3A4 4 0 0 0 13 5.300l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.700 0l-3 3A4 4 0 0 0 11 18.700l1-1" />
    </>
  ),
  eye: (
    <>
      <path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z" />
      <circle cx="12" cy="12" r="2.800" />
    </>
  ),
  cube: (
    <>
      <path d="M12 3.500 4.500 7.500v9L12 20.500l7.500-4v-9z" />
      <path d="M4.500 7.500 12 11.500l7.500-4M12 11.500v9" />
    </>
  ),
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
    </>
  ),
  /* The same padlock with its shackle swung open. */
  lockOpen: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 7.700-1.500" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c0-3.6 3.100-6 7-6s7 2.400 7 6" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="8.500" />
      <path d="m6 6 12 12" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V4h10v5" />
      <rect x="4" y="9" width="16" height="8" rx="1.500" />
      <path d="M7 14h10v6H7z" />
    </>
  ),
  /* Category and media icons */
  drop: <path d="M12 3.5c-3 4.5-6 7.5-6 11a6 6 0 0 0 12 0c0-3.5-3-6.5-6-11z" />,
  bolt: <path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6z" />,
  building: (
    <>
      <path d="M4 20.5h16M6 20.5V5h9v15.5M15 9.5h3v11" />
      <path d="M9 8.5h.01M9 12h.01M9 15.5h.01M12 8.5h.01M12 12h.01M12 15.5h.01" />
    </>
  ),
  fence: (
    <>
      <path d="M5 20.5V7l2-3 2 3v13.5M15 20.5V7l2-3 2 3v13.5" />
      <path d="M3 11h18M3 16h18" />
    </>
  ),
  book: (
    <>
      <path d="M4.5 4.5h6a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5h-6.5z" />
      <path d="M19.5 4.5h-6a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5h6.5z" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3.5l1.5-2.5h6l1.5 2.5H20v11H4z" />
      <circle cx="12" cy="13.5" r="3.2" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="m3.5 16 5-5 4 4 2.5-2.5 5.5 5.5" />
      <circle cx="15.5" cy="9.5" r="1.3" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5L4.5 11 10 9z" />
      <path d="M19 17.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </>
  ),
  loader: (
    <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M6 6l2.1 2.1M15.9 15.9 18 18M6 18l2.1-2.1M15.9 8.1 18 6" />
  ),
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronUp: <path d="m6 14.5 6-6 6 6" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  bell: (
    <>
      <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2" />
      <path d="M11 17.5h2" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;

/** Decorative by default. Give `label` only when the icon stands alone without text. */
export function Icon({
  name,
  className = "size-5",
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {paths[name]}
    </svg>
  );
}
