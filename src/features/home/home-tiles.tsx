"use client";

import Link from "next/link";
import type { PhotoName } from "@/components/media/manifest";
import { Photo } from "@/components/media/photo";
import { useAudience, workspaceFor } from "@/data/audience";
import { useMessages } from "@/i18n";

type Tile = { href: string; picture: PhotoName; title: string; body: string };

/**
 * The picture tiles under the school search. The community sees report, check
 * on my report and all problems. Staff see their own workspace and all
 * problems instead: reporting is not their job here.
 */
export function HomeTiles() {
  const m = useMessages();
  const l = m.landing;
  const audience = useAudience();
  const issues: Tile = { href: "/issues", picture: "community_meeting", ...l.issues };

  let tiles: Tile[] = [
    { href: "/report", picture: "evidence_capture", ...l.report },
    { href: "/track", picture: "verify_phone", ...l.track },
    issues,
  ];
  const role = audience.community ? null : audience.role;
  const workspace = workspaceFor(role);
  if (role && role !== "reporter" && workspace) {
    const own: Tile = {
      href: workspace.href,
      picture: role === "independent_reviewer" ? "verify_phone" : "community_meeting",
      ...m.audience.workspaceTile[role],
    };
    tiles = own.href === issues.href ? [own] : [own, issues];
  }

  return (
    <ul className="mt-3 flex flex-col gap-3" data-testid="home-tiles">
      {tiles.map((tile) => (
        <li key={tile.href}>
          <Link
            href={tile.href}
            className="relative flex min-h-24 items-center overflow-hidden rounded-2xl border border-line bg-surface shadow-card hover:border-brand"
          >
            <Photo
              name={tile.picture}
              alt=""
              shape="free"
              sizes="240px"
              className="photo-blend-side absolute! inset-y-0 right-0 h-full w-[46%]"
            />
            <span className="relative flex max-w-[64%] flex-col gap-0.5 p-4">
              <span className="text-xl leading-snug font-semibold">{tile.title}</span>
              <span className="text-sm text-muted">{tile.body}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
