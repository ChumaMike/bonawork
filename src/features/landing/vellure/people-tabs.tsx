"use client";

import Link from "next/link";
import { Fragment, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { useMessages } from "@/i18n";

type Visuals = ReturnType<typeof useMessages>["landingPage"]["people"]["visuals"];

/** The small card drawn beside each tab. An illustration of a screen, not live data. */
function Visual({ id, v }: { id: string; v: Visuals }) {
  if (id === "community") {
    const c = v.community;
    return (
      <div className="vl-ui">
        <div className="vl-ui-top">
          <div>
            <p className="vl-ui-title">{c.title}</p>
            <p className="vl-ui-sub">{c.place}</p>
          </div>
          <span className="vl-chip">{v.sample}</span>
        </div>
        <ul className="vl-ui-list">
          <li>
            <span className="vl-dot" data-tone="wait">
              <Icon name="clock" className="size-3.5" />
            </span>
            <span>{c.status}</span>
            <span className="vl-chip" data-tone="wait">
              {c.note}
            </span>
          </li>
          <li>
            <span className="vl-dot">
              <Icon name="users" className="size-3.5" />
            </span>
            <span>{c.affected}</span>
          </li>
        </ul>
      </div>
    );
  }
  if (id === "supplier") {
    const s = v.supplier;
    return (
      <div className="vl-ui">
        <div className="vl-ui-top">
          <div>
            <p className="vl-ui-title">{s.title}</p>
            <p className="vl-ui-sub">{s.count}</p>
          </div>
          <span className="vl-chip">{v.sample}</span>
        </div>
        <ul className="vl-ui-list">
          {s.reasons.map((reason) => (
            <li key={reason}>
              <span className="vl-dot" data-tone="bad">
                <Icon name="alert" className="size-3.5" />
              </span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
        <p className="vl-ui-foot">{s.ai}</p>
      </div>
    );
  }
  if (id === "reviewer") {
    const r = v.reviewer;
    return (
      <div className="vl-ui">
        <div className="vl-ui-top">
          <p className="vl-ui-title">{r.title}</p>
          <span className="vl-chip">{v.sample}</span>
        </div>
        <ul className="vl-ui-list">
          {r.checks.map((check) => (
            <li key={check}>
              <span className="vl-dot">
                <Icon name="check" className="size-3.5" />
              </span>
              <span>{check}</span>
              <span className="vl-chip" data-tone="good">
                {r.yes}
              </span>
            </li>
          ))}
        </ul>
        {/* A picture of the button, not a control: nothing here can be pressed. */}
        <p className="vl-ui-fake-button">{r.action}</p>
      </div>
    );
  }
  const a = v.approver;
  return (
    <div className="vl-ui">
      <div className="vl-ui-top">
        <div>
          <p className="vl-ui-title">{a.title}</p>
          <p className="vl-ui-sub">{a.count}</p>
        </div>
        <span className="vl-chip">{v.sample}</span>
      </div>
      <ul className="vl-ui-list">
        {a.checks.map((check) => (
          <li key={check.text}>
            <span className="vl-dot" data-tone={check.done ? undefined : "wait"}>
              <Icon name={check.done ? "check" : "clock"} className="size-3.5" />
            </span>
            <span>{check.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Four people, one case: a row of pill tabs, and for each person what they
 * do, three facts and where to go. Arrow keys move between the tabs, as the
 * tabs pattern asks.
 */
export function PeopleTabs() {
  const m = useMessages();
  const p = m.landingPage.people;
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const last = p.tabs.length - 1;
    const next =
      event.key === "ArrowRight"
        ? active === last
          ? 0
          : active + 1
        : event.key === "ArrowLeft"
          ? active === 0
            ? last
            : active - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  const tab = p.tabs[active];
  return (
    <>
      <div role="tablist" aria-label={p.tabsLabel} className="vl-tabs" data-reveal>
        {p.tabs.map((item, index) => (
          <button
            key={item.id}
            ref={(node) => {
              tabs.current[index] = node;
            }}
            type="button"
            role="tab"
            id={`people-tab-${item.id}`}
            aria-selected={index === active}
            aria-controls="people-panel"
            tabIndex={index === active ? 0 : -1}
            onClick={() => setActive(index)}
            onKeyDown={onKey}
            className="vl-tab"
          >
            {item.tab}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="people-panel"
        aria-labelledby={`people-tab-${tab.id}`}
        tabIndex={0}
        className="vl-panel"
      >
        {/* Keyed by the tab, so the text and the picture rise in again on each change. */}
        <div key={`text-${tab.id}`} className="vl-panel-text vl-swap">
          <h3>
            {tab.title.map((line, index) => (
              <Fragment key={line}>
                {index > 0 ? " " : null}
                <span>{line}</span>
              </Fragment>
            ))}
          </h3>
          <p>{tab.body}</p>
          <ul className="vl-ticks">
            {tab.points.map((point) => (
              <li key={point}>
                <Icon name="check" className="size-5" />
                {point}
              </li>
            ))}
          </ul>
          <Link href={tab.href} className="vl-btn vl-btn-blue">
            {tab.action}
          </Link>
        </div>
        <div key={`visual-${tab.id}`} className="vl-visual vl-swap" aria-hidden="true">
          <Visual id={tab.id} v={p.visuals} />
        </div>
      </div>
    </>
  );
}
