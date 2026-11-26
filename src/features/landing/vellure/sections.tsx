import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { Photo } from "@/components/media/photo";
import { Icon, type IconName } from "@/components/ui/icon";
import { HomeTiles } from "@/features/home/home-tiles";
import { getMessages } from "@/i18n";
import { Faq } from "./faq";
import { PeopleTabs } from "./people-tabs";
import "./vellure.css";

/*
 * The sections of the public landing page, top to bottom. They are drawn in
 * the layout of the free Framer template "Vellure" with BonaWork's own
 * words, logo and pictures. Every "screen" on this page is an illustration
 * built from HTML and marked as a sample: none of it is live data.
 */

/** How long after it comes into view a card starts to rise, so a row arrives in turn. */
const delay = (ms: number) => ({ "--vl-delay": `${ms}ms` }) as CSSProperties;

/** A two-line heading: each line is its own block, read as one sentence. */
function Lines({ lines }: { lines: readonly string[] }) {
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={line}>
          {index > 0 ? " " : null}
          <span>{line}</span>
        </Fragment>
      ))}
    </>
  );
}

/** The small pill above a section's heading. */
function Label({ children }: { children: string }) {
  return (
    <p className="vl-label" data-reveal>
      {children}
    </p>
  );
}

/** A row of small bars: `filled` of `total` are blue. Decoration only. */
function Bars({ filled, total = 22 }: { filled: number; total?: number }) {
  return (
    <span className="vl-bar" aria-hidden="true">
      {Array.from({ length: total }, (_, index) => (
        <i key={index} data-on={index < filled ? "" : undefined} />
      ))}
    </span>
  );
}

/** The guided demo's entry; `BONAWORK_DEMO_MODE=off` hides it (read when the page is built). */
const DEMO_ON = !["off", "false", "0"].includes(
  (process.env.BONAWORK_DEMO_MODE ?? "").trim().toLowerCase(),
);

const MOCK_RAIL: IconName[] = ["home", "list", "file", "shieldCheck", "cube", "users"];

/**
 * The hero: the page's one h1 on a navy-to-blue ground, the two things most
 * people come to do, the school search, and a sample case drawn as a
 * dashboard that rises from the bottom edge.
 */
export function Hero() {
  const m = getMessages();
  const h = m.landingPage.hero;
  return (
    <section className="vl-hero vl-on-dark" aria-labelledby="hero-title">
      <div className="vl-wrap">
        <p className="vl-badge" data-rise style={delay(0)}>
          <i aria-hidden="true" />
          {h.badge}
        </p>
        <h1 id="hero-title" data-rise style={delay(80)}>
          <Lines lines={h.title} />
        </h1>
        <p className="vl-hero-sub" data-rise style={delay(160)}>
          {h.sub}
        </p>
        <div className="vl-hero-actions" data-rise style={delay(240)}>
          {DEMO_ON ? (
            <Link href="/demo" className="vl-btn vl-btn-white" data-testid="try-demo">
              Try the demo
            </Link>
          ) : null}
          <Link
            href="/report"
            className={DEMO_ON ? "vl-btn vl-btn-glass" : "vl-btn vl-btn-white"}
          >
            {h.primary}
          </Link>
          <Link href="/issues" className="vl-btn vl-btn-glass">
            {h.secondary}
          </Link>
        </div>

        <form
          action="/schools"
          role="search"
          className="vl-search"
          data-rise
          style={delay(320)}
        >
          <label htmlFor="school-search">{h.searchLabel}</label>
          <div className="vl-search-row">
            <input
              id="school-search"
              name="q"
              type="search"
              placeholder={h.searchPlaceholder}
              autoComplete="off"
            />
            <button type="submit" className="vl-btn vl-btn-white vl-btn-sm">
              <Icon name="search" className="size-4" />
              {h.searchAction}
            </button>
          </div>
        </form>

        {/* A drawing of a case. Screen readers get one sentence instead of its parts. */}
        <div
          className="vl-mock-ring"
          role="img"
          aria-label={h.mock.label}
          data-rise
          style={delay(420)}
        >
          <div className="vl-mock" aria-hidden="true">
            <div className="vl-mock-side">
              {MOCK_RAIL.map((icon, index) => (
                <span key={icon} data-on={index === 1 ? "" : undefined}>
                  <Icon name={icon} className="size-4.5" />
                </span>
              ))}
            </div>
            <div className="vl-mock-main">
              <div className="vl-mock-head">
                <p>{h.mock.title}</p>
                <div className="vl-mock-meta">
                  <span className="vl-chip">{h.mock.sample}</span>
                  <span>{h.mock.school}</span>
                  <span className="vl-chip" data-tone="blue">
                    {h.mock.viewAll}
                  </span>
                </div>
              </div>
              <dl className="vl-mock-tiles">
                {h.mock.tiles.map((tile) => (
                  <div key={tile.label} className="vl-mock-tile">
                    <dt>{tile.label}</dt>
                    <dd>
                      <b>{tile.value}</b>
                      <small>{tile.note}</small>
                      <Bars filled={tile.filled} />
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="vl-mock-lower">
                <div className="vl-mock-panel">
                  <p>{h.mock.trailTitle}</p>
                  <ul>
                    {h.mock.trail.map((row) => (
                      <li key={row.step}>
                        <span>{row.step}</span>
                        <span className="vl-chip" data-tone="good">
                          {h.mock.recorded}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="vl-mock-panel">
                  <p>{h.mock.rolesTitle}</p>
                  <ul>
                    {h.mock.roles.map((role) => (
                      <li key={role}>
                        <span>{role}</span>
                        <Icon name="check" className="size-4" />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** What it is built on, as plain names. Not a list of customers. */
export function BuiltOn() {
  const b = getMessages().landingPage.builtOn;
  return (
    <section className="vl-strip" aria-label={b.label}>
      <div className="vl-wrap vl-strip-row">
        <p>{b.label}</p>
        <ul>
          {b.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * The three things people come to do, as the same picture tiles as before.
 * Someone signed in as staff sees their own workspace here instead.
 */
export function StartHere() {
  const m = getMessages();
  const s = m.landingPage.start;
  return (
    <section className="vl-section vl-start" aria-labelledby="start-title">
      <div className="vl-wrap">
        <div className="vl-head" data-align="left">
          <Label>{s.label}</Label>
          <h2 id="start-title" className="vl-h2" data-reveal>
            {s.title}
          </h2>
        </div>
        <HomeTiles />
        <Link href="/schools" className="vl-start-more">
          {m.landing.browseSchools}
          <Icon name="arrowRight" className="size-4" />
        </Link>
      </div>
    </section>
  );
}

type AboutMessages = ReturnType<typeof getMessages>["landingPage"]["about"];

/**
 * One escrow and its two payment stages, with the independent check
 * that must pass before a stage is released. A drawing: the card's own
 * words say the same thing to a screen reader.
 */
function ContractsDrawing({ c }: { c: AboutMessages["contracts"] }) {
  return (
    <div className="vl-contracts" aria-hidden="true">
      <span className="vl-node" data-kind="factory">
        <Icon name="cube" className="size-4" />
        <span>
          <strong>{c.factory}</strong>
          <small>{c.factoryNote}</small>
        </span>
      </span>
      <span className="vl-branch">
        <span className="vl-gate">
          <Icon name="shieldCheck" className="size-3.5" />
          {c.gate}
        </span>
      </span>
      <span className="vl-node-row">
        <span className="vl-node">
          <Icon name="file" className="size-4" />
          <span>
            <strong>{c.operations}</strong>
            <small>{c.operationsNote}</small>
          </span>
        </span>
        <span className="vl-node" data-kind="finance">
          <Icon name="lock" className="size-4" />
          <span>
            <strong>{c.finance}</strong>
            <small>{c.financeNote}</small>
          </span>
        </span>
      </span>
    </div>
  );
}

/** The seven roles as a chain of badges, the independent reviewer marked. */
function RolesDrawing({ r }: { r: AboutMessages["roles"] }) {
  return (
    <ol className="vl-roles" aria-label={r.label}>
      {r.names.map((name, index) => (
        <li key={name} data-on={index === r.highlight ? "" : undefined}>
          <span className="vl-roles-n" aria-hidden="true">
            {index + 1}
          </span>
          {name}
          {index === r.highlight ? (
            <Icon name="shieldCheck" className="size-3.5" />
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Number, picture, number. */
export function About() {
  const a = getMessages().landingPage.about;
  const [first, second] = a.cards;
  const drawings = [
    <ContractsDrawing key="contracts" c={a.contracts} />,
    <RolesDrawing key="roles" r={a.roles} />,
  ];
  const card = (item: (typeof a.cards)[number], index: number) => (
    <div className="vl-stat" data-reveal style={delay(index * 120)}>
      {drawings[index]}
      <b>{item.value}</b>
      <strong>{item.title}</strong>
      <p>{item.body}</p>
    </div>
  );
  return (
    <section className="vl-section" aria-labelledby="about-title">
      <div className="vl-wrap">
        <div className="vl-head">
          <Label>{a.label}</Label>
          <h2 id="about-title" className="vl-h2" data-reveal>
            <Lines lines={a.title} />
          </h2>
        </div>
        <div className="vl-trio">
          {card(first, 0)}
          <figure className="vl-photo" data-reveal style={delay(60)}>
            <Photo
              name="reviewer_check"
              shape="free"
              sizes="(min-width: 900px) 40vw, 100vw"
            />
            <figcaption>{a.photoNote}</figcaption>
          </figure>
          {card(second, 1)}
        </div>
      </div>
    </section>
  );
}

const CAPABILITY_ICONS: IconName[] = ["flag", "file", "shieldCheck", "cube"];

/** Heading left, paragraph right, then four cards. */
export function Capabilities() {
  const c = getMessages().landingPage.capabilities;
  return (
    <section
      className="vl-section"
      data-ground="soft"
      aria-labelledby="capabilities-title"
    >
      <div className="vl-wrap">
        <div className="vl-split-head">
          <div className="vl-head" data-align="left">
            <Label>{c.label}</Label>
            <h2 id="capabilities-title" className="vl-h2" data-reveal>
              <Lines lines={c.title} />
            </h2>
          </div>
          <p className="vl-lede" data-reveal>
            {c.intro}
          </p>
        </div>
        <ul className="vl-cards-4">
          {c.cards.map((card, index) => (
            <li key={card.title} className="vl-cap" data-reveal style={delay(index * 80)}>
              <span className="vl-tile" aria-hidden="true">
                <Icon name={CAPABILITY_ICONS[index]} className="size-5" />
              </span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </li>
          ))}
        </ul>
        <div className="vl-center">
          <Link href="/issues" className="vl-btn vl-btn-blue">
            {c.action}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** The four people in a case, as pill tabs. */
export function People() {
  const p = getMessages().landingPage.people;
  return (
    <section className="vl-section" aria-labelledby="people-title">
      <div className="vl-wrap">
        <div className="vl-head">
          <Label>{p.label}</Label>
          <h2 id="people-title" className="vl-h2" data-reveal>
            <Lines lines={p.title} />
          </h2>
        </div>
        <PeopleTabs />
      </div>
    </section>
  );
}

/** Three large numbers. Each one can be counted in the repository. */
export function Metrics() {
  const t = getMessages().landingPage.metrics;
  return (
    <section className="vl-section" aria-labelledby="metrics-title">
      <div className="vl-wrap">
        <div className="vl-head" data-align="left">
          <Label>{t.label}</Label>
          <h2 id="metrics-title" className="vl-h2" data-reveal>
            <Lines lines={t.title} />
          </h2>
        </div>
        <ul className="vl-numbers">
          {t.items.map((item, index) => (
            <li key={item.title} data-reveal style={delay(index * 100)}>
              <b>{item.value}</b>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Three cards, each with a small drawing under its words. */
export function Bento() {
  const b = getMessages().landingPage.bento;
  const w = b.widgets;
  const drawings = [
    <ul key="trail" className="vl-mini">
      {w.trail.map((step) => (
        <li key={step}>
          <span className="vl-dot">
            <Icon name="check" className="size-3.5" />
          </span>
          {step}
          <span className="vl-chip" data-tone="good">
            {w.recorded}
          </span>
        </li>
      ))}
    </ul>,
    <div key="chips" className="vl-floaters">
      {w.chips.map((chip, index) => (
        <span key={chip}>
          <Icon
            name={index === 1 ? "ban" : index === 2 ? "sparkle" : "file"}
            className="size-4"
          />
          {chip}
        </span>
      ))}
    </div>,
    <div key="lock" className="vl-orbit">
      <span className="vl-tile">
        <Icon name="file" className="size-5" />
      </span>
      <span className="vl-tile">
        <Icon name="shieldCheck" className="size-5" />
      </span>
      <span className="vl-tile">
        <Icon name="users" className="size-5" />
      </span>
      <span className="vl-tile">
        <Icon name="lock" className="size-6" />
      </span>
      <em className="vl-chip" data-tone="wait">
        {w.lock}
      </em>
    </div>,
  ];
  return (
    <section className="vl-section" data-ground="soft" aria-labelledby="bento-title">
      <div className="vl-wrap">
        <div className="vl-head">
          <Label>{b.label}</Label>
          <h2 id="bento-title" className="vl-h2" data-reveal>
            <Lines lines={b.title} />
          </h2>
        </div>
        <ul className="vl-bento">
          {b.cards.map((card, index) => (
            <li
              key={card.title}
              className="vl-bento-card"
              data-reveal
              style={delay(index * 100)}
            >
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <div className="vl-widget" aria-hidden="true">
                {drawings[index]}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Who funds it: heading left, two plans. There are no prices to show. */
export function Funding() {
  const f = getMessages().landingPage.funding;
  return (
    <section className="vl-section" aria-labelledby="funding-title">
      <div className="vl-wrap">
        <div className="vl-split-head">
          <div className="vl-head" data-align="left">
            <Label>{f.label}</Label>
            <h2 id="funding-title" className="vl-h2" data-reveal>
              <Lines lines={f.title} />
            </h2>
          </div>
          <p className="vl-lede" data-reveal>
            {f.intro}
          </p>
        </div>
        <ul className="vl-plans">
          {f.plans.map((plan, index) => (
            <li
              key={plan.name}
              className="vl-plan"
              data-tone={index === 1 ? "dark" : undefined}
              data-reveal
              style={delay(index * 100)}
            >
              <h3>{plan.name}</h3>
              <p>{plan.body}</p>
              <p className="vl-price">
                <b>{plan.price}</b>
                <span className="vl-plan-unit">{plan.unit}</span>
              </p>
              <p className="vl-plan-incl">{f.included}</p>
              <ul>
                {plan.points.map((point) => (
                  <li key={point}>
                    <Icon name="check" className="size-4.5" />
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`vl-btn ${index === 1 ? "vl-btn-white" : "vl-btn-dark"}`}
              >
                {plan.action}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Where the template shows a customer's words, this shows the team's own
 * promise. Nobody is quoted who did not say it, and there is no customer yet.
 */
export function OurPromise() {
  const p = getMessages().landingPage.promise;
  return (
    <section className="vl-section" data-ground="soft" aria-labelledby="promise-title">
      <div className="vl-wrap">
        <div className="vl-head">
          <Label>{p.label}</Label>
          <h2 id="promise-title" className="vl-h2" data-reveal>
            <Lines lines={p.title} />
          </h2>
        </div>
        <figure className="vl-story" data-reveal>
          <figcaption>
            <div className="vl-story-who">
              <span className="vl-tile" aria-hidden="true">
                <Icon name="users" className="size-6" />
              </span>
              <span>
                <strong>{p.by}</strong>
                <span>{p.where}</span>
              </span>
            </div>
            <div className="vl-story-first">
              <strong>{p.firstLabel}</strong>
              <p>{p.first}</p>
            </div>
          </figcaption>
          <blockquote>{p.quote}</blockquote>
        </figure>
        <div className="vl-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </div>
    </section>
  );
}

/** The questions people ask first, as an accordion. */
export function Questions() {
  const f = getMessages().landingPage.faq;
  return (
    <section className="vl-section" aria-labelledby="faq-title">
      <div className="vl-wrap">
        <div className="vl-head">
          <Label>{f.label}</Label>
          <h2 id="faq-title" className="vl-h2" data-reveal>
            {f.title}
          </h2>
        </div>
        <Faq />
      </div>
    </section>
  );
}

/** The closing band: the product in three words and the same two buttons. */
export function ClosingBand() {
  const m = getMessages();
  const c = m.landingPage.cta;
  const h = m.landingPage.hero;
  return (
    <section className="vl-cta-wrap" aria-labelledby="cta-title">
      <div className="vl-cta vl-on-dark" data-reveal>
        <h2 id="cta-title">
          <Lines lines={c.title} />
        </h2>
        <p>{c.sub}</p>
        <div className="vl-hero-actions">
          <Link href="/report" className="vl-btn vl-btn-white">
            {h.primary}
          </Link>
          <Link href="/issues" className="vl-btn vl-btn-glass">
            {h.secondary}
          </Link>
        </div>
      </div>
    </section>
  );
}
