import { cn } from "@/components/ui/cn";
import type { BuddyMood } from "./buddy-face";

/*
 * Bolt, the Bona buddy: a small robot in the Bona Chain blues with a
 * blinking antenna light and a tick on its chest (it is about checking).
 * Decorative: the button around it carries the name. Its face follows the
 * same moods as <BuddyFace>. The motion classes live in BUDDY_FACE_CSS and
 * only run when the person has not asked for reduced motion.
 */

const MOUTHS: Record<BuddyMood, string> = {
  resting: "M29 28q3 2 6 0",
  listening: "M29.5 28.5h5",
  thinking: "M29 29q1.5-1.5 3 0t3 0",
  happy: "M28 27q4 4 8 0",
  concerned: "M29 29.5q3-2 6 0",
};

export function RobotPet({ mood, className }: { mood: BuddyMood; className?: string }) {
  const wide = mood === "listening" || mood === "happy";
  return (
    <svg
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={cn("bona-robot overflow-visible", className)}
      data-mood={mood}
    >
      <ellipse cx="32" cy="60" rx="15" ry="2.6" fill="#000" opacity=".16" />
      <g className="bona-robot-body">
        <path d="M32 12V6" stroke="#030720" strokeWidth="2.5" strokeLinecap="round" />
        <circle
          className={cn(
            "bona-robot-light",
            mood === "thinking" && "bona-robot-light-fast",
          )}
          cx="32"
          cy="5"
          r="3.5"
          fill="#c9d8ff"
        />
        <rect x="16" y="12" width="32" height="24" rx="9" fill="#0346ff" />
        <rect x="20" y="16" width="24" height="15" rx="6" fill="#030720" />
        <ellipse
          className="bona-robot-eye"
          cx="27"
          cy="23"
          rx={wide ? 3 : 2.6}
          ry={wide ? 3.4 : 3}
          fill="#c9d8ff"
        />
        <ellipse
          className="bona-robot-eye"
          cx="37"
          cy="23"
          rx={wide ? 3 : 2.6}
          ry={wide ? 3.4 : 3}
          fill="#c9d8ff"
        />
        <path
          d={MOUTHS[mood]}
          stroke="#c9d8ff"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <rect x="20" y="38" width="24" height="16" rx="6" fill="#0235c4" />
        <path
          d="M27 46l3 3 6-6"
          stroke="#ffffff"
          strokeWidth="2.2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="bona-robot-arm-l"
          d="M20 42l-6 6"
          stroke="#0235c4"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          className="bona-robot-arm-r"
          d="M44 42l6 6"
          stroke="#0235c4"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <rect x="22" y="54" width="7" height="4" rx="2" fill="#030720" />
        <rect x="35" y="54" width="7" height="4" rx="2" fill="#030720" />
      </g>
    </svg>
  );
}
