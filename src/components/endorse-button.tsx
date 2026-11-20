"use client";

import { useState } from "react";
import { getApi } from "@/data/api";
import { useAudience } from "@/data/audience";
import { ApiError } from "@/data/errors";
import { useMessages } from "@/i18n";
import { cn } from "./ui/cn";
import { Icon } from "./ui/icon";
import { ProgressRing } from "./ui/progress-ring";

/** The ring fills as more people say they are affected; it is full at this many. */
const RING_FULL_AT = 100;

/**
 * "I'm affected too". A toggle button plus the running count.
 * One per person; a second tap withdraws it. Updates immediately and rolls
 * back if the request fails. Staff see only the count: saying you are affected
 * is for the community, and the backend refuses it for staff anyway.
 */
export function EndorseButton({
  issueId,
  endorsements,
  endorsedByMe,
  size = "regular",
  className,
}: {
  issueId: string;
  endorsements: number;
  endorsedByMe: boolean;
  size?: "regular" | "large";
  className?: string;
}) {
  const m = useMessages();
  const [state, setState] = useState({ endorsements, endorsedByMe });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const large = size === "large";
  const audience = useAudience();
  // Wait until we know who is signed in, so staff never see the button flash.
  const canEndorse = audience.status === "ready" && audience.community;

  async function toggle() {
    const previous = state;
    const affected = !previous.endorsedByMe;
    setBusy(true);
    setFailed(false);
    setState({
      endorsedByMe: affected,
      endorsements: previous.endorsements + (affected ? 1 : -1),
    });
    try {
      setState(await getApi().setEndorsement(issueId, affected));
    } catch (caught) {
      setState(previous);
      // The backend may require an account for this. Send the person to sign in
      // and bring them back to the issue, rather than showing an error.
      if (caught instanceof ApiError && caught.code === "unauthenticated") {
        // A full page load, so the sign-in screen starts from a freshly read session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(
          `/sign-in?next=${encodeURIComponent(`/issues/${issueId}`)}`,
        );
        return;
      }
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <span
        className="flex items-center gap-2 font-semibold"
        data-testid="endorsement-count"
      >
        <ProgressRing
          value={state.endorsements}
          max={RING_FULL_AT}
          label={m.endorse.countWords(state.endorsements)}
          size={large ? "md" : "sm"}
        />{" "}
        <span className={cn(large ? "text-base" : "text-sm")}>
          {m.endorse.countWords(state.endorsements)}
        </span>
      </span>
      {/* Takes a whole row of its own when there is no room beside the count. */}
      {canEndorse ? (
        <span className="flex min-w-[11rem] flex-1 flex-col gap-1">
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            aria-pressed={state.endorsedByMe}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-xl border-2 font-semibold whitespace-nowrap transition-colors",
              large ? "min-h-14 w-full px-6 text-lg" : "min-h-12 w-full px-4",
              state.endorsedByMe
                ? "border-brand bg-brand text-on-brand"
                : "border-brand bg-surface text-brand-strong hover:bg-brand-soft",
            )}
          >
            <Icon name={state.endorsedByMe ? "check" : "hand"} />
            {state.endorsedByMe ? m.endorse.done : m.endorse.action}
          </button>
          {large && state.endorsedByMe ? (
            <span className="text-sm text-muted">{m.endorse.undo}</span>
          ) : null}
        </span>
      ) : null}
      {failed ? (
        <span role="alert" className="w-full text-sm font-semibold text-danger">
          {m.common.actionError}
        </span>
      ) : null}
    </div>
  );
}
