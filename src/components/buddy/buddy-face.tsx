import type { ReactNode } from "react";

export const BUDDY_MOODS = [
  "resting",
  "listening",
  "thinking",
  "happy",
  "concerned",
] as const;

/**
 * resting: nothing is happening. listening: the help sheet is open.
 * thinking: waiting for an answer. happy: something worked.
 * concerned: something went wrong.
 */
export type BuddyMood = (typeof BUDDY_MOODS)[number];

/*
 * Idle motion: a slow bob, a blink every few seconds and three "thinking"
 * dots. All of it sits inside `prefers-reduced-motion: no-preference`, so with
 * reduced motion the face has no animation at all. Rendered once by <BonaBuddy>.
 * Keep this text free of quotes and angle brackets: React escapes those in a
 * style element.
 */
export const BUDDY_FACE_CSS = `
@media (prefers-reduced-motion: no-preference) {
  .bona-buddy-bob { animation: bona-buddy-bob 5s ease-in-out infinite; }
  .bona-buddy-blink { transform-box: fill-box; transform-origin: center; animation: bona-buddy-blink 5.6s ease-in-out infinite; }
  .bona-buddy-dot { animation: bona-buddy-dot 1.2s ease-in-out infinite; }
  .bona-buddy-dot + .bona-buddy-dot { animation-delay: 0.2s; }
  .bona-buddy-dot + .bona-buddy-dot + .bona-buddy-dot { animation-delay: 0.4s; }
  .bona-pet-hop { animation: bona-pet-hop 0.4s ease-in-out 4; }
  .bona-robot-body { animation: bona-buddy-bob 3s ease-in-out infinite; }
  .bona-robot-eye { animation: bona-robot-blink 4.5s infinite; transform-box: fill-box; transform-origin: center; }
  .bona-robot-light { animation: bona-robot-glow 1.6s ease-in-out infinite; }
  .bona-robot-light-fast { animation-duration: 0.5s; }
  .bona-robot[data-mood="happy"] .bona-robot-arm-r { animation: bona-robot-wave 0.6s ease-in-out 3; transform-box: fill-box; transform-origin: 0% 0%; }
  .bona-pet-wiggle { animation: bona-pet-wiggle 0.5s ease-in-out 2; }
  .bona-pet-heart { animation: bona-pet-heart 1.1s ease-out both; }
}
@keyframes bona-robot-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
@keyframes bona-robot-glow { 50% { opacity: 0.35; } }
@keyframes bona-robot-wave { 50% { transform: rotate(-40deg); } }
@keyframes bona-pet-hop { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes bona-pet-wiggle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-12deg); } 75% { transform: rotate(12deg); } }
@keyframes bona-pet-heart { from { opacity: 0; transform: translateY(0) scale(0.6); } 20% { opacity: 1; } to { opacity: 0; transform: translateY(-30px) scale(1.1); } }
@keyframes bona-buddy-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
@keyframes bona-buddy-blink { 0%, 44%, 50%, 100% { transform: scaleY(1); } 47% { transform: scaleY(0.1); } }
@keyframes bona-buddy-dot { 0%, 100% { opacity: 0.35; } 50% { opacity: 1; } }
`;

type Features = {
  /** Open eyes are drawn as ellipses; `arc` draws closed, smiling eyes instead. */
  eyes: { cy: number; dx: number; rx: number; ry: number } | "arc";
  brows?: ReactNode;
  mouth: ReactNode;
  cheeks?: boolean;
};

const line = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const brow = { ...line, strokeWidth: 2 } as const;

const FACES: Record<BuddyMood, Features> = {
  resting: {
    eyes: { cy: 21, dx: 0, rx: 3, ry: 3 },
    mouth: <path d="M18 29.5q6 5 12 0" {...line} />,
    cheeks: true,
  },
  listening: {
    eyes: { cy: 21.5, dx: 0, rx: 3.2, ry: 4.2 },
    brows: (
      <>
        <path d="M13.5 13.5q3.5-2.5 7 0" {...brow} />
        <path d="M27.5 13.5q3.5-2.5 7 0" {...brow} />
      </>
    ),
    mouth: <ellipse cx="24" cy="31.5" rx="2.8" ry="3.2" fill="currentColor" />,
  },
  thinking: {
    eyes: { cy: 19.5, dx: 1.5, rx: 3, ry: 3 },
    brows: (
      <>
        <path d="M14 13.5h6.5" {...brow} />
        <path d="M28.5 12q3.5-2 7 .5" {...brow} />
      </>
    ),
    mouth: (
      <>
        <circle
          className="bona-buddy-dot"
          cx="19"
          cy="31.5"
          r="1.6"
          fill="currentColor"
        />
        <circle
          className="bona-buddy-dot"
          cx="24"
          cy="31.5"
          r="1.6"
          fill="currentColor"
        />
        <circle
          className="bona-buddy-dot"
          cx="29"
          cy="31.5"
          r="1.6"
          fill="currentColor"
        />
      </>
    ),
  },
  happy: {
    eyes: "arc",
    mouth: <path d="M16 27.5h16a8 8 0 0 1-16 0z" fill="currentColor" />,
    cheeks: true,
  },
  concerned: {
    eyes: { cy: 22, dx: 0, rx: 3, ry: 3 },
    brows: (
      <>
        <path d="M13 16l7-2.5" {...brow} />
        <path d="M28 13.5l7 2.5" {...brow} />
      </>
    ),
    mouth: <path d="M18.5 33q5.5-4.5 11 0" {...line} />,
  },
};

/**
 * The buddy's face, drawn in the colour of the text around it (put it on a
 * brand-coloured circle with `text-on-brand`). Decorative: the control it sits
 * in carries the name.
 */
export function BuddyFace({
  mood = "resting",
  className = "size-10",
}: {
  mood?: BuddyMood;
  className?: string;
}) {
  const face = FACES[mood];
  return (
    <svg
      viewBox="0 0 48 48"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
      data-mood={mood}
    >
      <g className="bona-buddy-bob">
        {face.cheeks ? (
          <>
            <circle cx="11.5" cy="28.5" r="2.6" className="fill-sun" />
            <circle cx="36.5" cy="28.5" r="2.6" className="fill-sun" />
          </>
        ) : null}
        {face.brows}
        {face.eyes === "arc" ? (
          <>
            <path d="M13.5 22q3.5-5 7 0" {...line} />
            <path d="M27.5 22q3.5-5 7 0" {...line} />
          </>
        ) : (
          <g className="bona-buddy-blink" fill="currentColor">
            <ellipse
              cx={17 + face.eyes.dx}
              cy={face.eyes.cy}
              rx={face.eyes.rx}
              ry={face.eyes.ry}
            />
            <ellipse
              cx={31 + face.eyes.dx}
              cy={face.eyes.cy}
              rx={face.eyes.rx}
              ry={face.eyes.ry}
            />
          </g>
        )}
        {face.mouth}
      </g>
    </svg>
  );
}
