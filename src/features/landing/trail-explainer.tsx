import { Badge } from "@/components/ui/card";
import { getMessages } from "@/i18n";

/**
 * What Bona Chain does, for someone who has never seen it: three steps
 * (report, check, prove), then the trail in plain words, with the role that
 * takes each step. It is words only: no case data, no amounts, no names, and
 * no link to a staff workspace.
 */
export function TrailExplainer() {
  const m = getMessages();
  const l = m.landing;

  return (
    <>
      <section
        aria-labelledby="how-title"
        className="mx-auto w-full max-w-2xl px-4 pb-8 sm:px-6"
      >
        <h2 id="how-title" className="text-2xl font-bold tracking-tight">
          {l.howTitle}
        </h2>
        <ol className="mt-4 flex flex-col gap-3">
          {l.steps.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-3 rounded-2xl border border-line bg-surface p-4"
            >
              <span
                aria-hidden
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand font-bold text-on-brand"
              >
                {index + 1}
              </span>
              <span>
                <span className="block text-lg font-semibold">{step.title}</span>
                <span className="text-muted">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section
        aria-labelledby="trail-title"
        data-testid="trail-explainer"
        className="mx-auto w-full max-w-2xl px-4 pb-8 sm:px-6"
      >
        <h2 id="trail-title" className="text-2xl font-bold tracking-tight">
          {l.trail.title}
        </h2>
        <p className="mt-1 text-muted">{l.trail.intro}</p>
        <ol className="mt-4 flex flex-col">
          {l.trail.rows.map((row, index) => {
            const last = index === l.trail.rows.length - 1;
            return (
              <li
                key={row.event}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3"
              >
                <span className="flex flex-col items-center">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-brand bg-surface text-sm font-bold text-brand-strong"
                  >
                    {index === 0 ? "" : index}
                  </span>
                  {last ? null : <span aria-hidden className="w-0.5 grow bg-line" />}
                </span>
                <div className={last ? "pb-1" : "pb-5"}>
                  <p className="text-sm font-semibold text-muted">
                    {index === 0 ? l.trail.start : l.trail.step(index)}
                  </p>
                  <h3 className="text-lg leading-snug font-semibold">
                    {m.event[row.event]}
                  </h3>
                  <Badge tone="neutral" className="mt-1.5">
                    {m.actor[row.actor]}
                  </Badge>
                  <p className="mt-1.5 text-muted">{row.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
        <p className="mt-4 rounded-2xl border border-line bg-sunken px-4 py-3">
          {l.trail.noMoney}
        </p>
        <p className="mt-3 text-muted">{l.trail.privacy}</p>
      </section>
    </>
  );
}
