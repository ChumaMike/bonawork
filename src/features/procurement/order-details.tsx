import type { TrailOrder } from "@/data/types";
import { useMessages } from "@/i18n";
import { formatRand } from "./money";

/**
 * A work order as its reader may see it: the scope, the supplier and the
 * lines. The price columns exist only when the reader has prices; for
 * everyone else they are not rendered at all, not hidden.
 */
export function OrderDetails({ order }: { order: TrailOrder }) {
  const m = useMessages();
  const o = m.procurement.order;
  const priced = order.totalCents !== undefined;
  return (
    <div data-testid="order-details" className="flex flex-col gap-3">
      <dl className="flex flex-col gap-2">
        <div>
          <dt className="text-sm font-semibold text-muted">{o.scope}</dt>
          <dd>{order.description}</dd>
        </div>
        <div>
          <dt className="text-sm font-semibold text-muted">{o.supplier}</dt>
          <dd>
            {order.supplierName}{" "}
            <span className="font-mono text-sm">{order.supplierRef}</span>
          </dd>
        </div>
      </dl>
      {/* A table with prices scrolls inside its own box; the page never scrolls sideways.
          A box that scrolls must be reachable by keyboard, so it takes focus. */}
      <div
        role="region"
        aria-label={o.lines}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="overflow-x-auto rounded-xl border border-line"
      >
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <caption className="sr-only">
            {o.title}, {o.version(order.version)}
          </caption>
          <thead className="bg-sunken text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                {o.code}
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {o.description}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {o.quantity}
              </th>
              {priced ? (
                <>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    {o.unitPrice}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    {o.lineTotal}
                  </th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {order.lines.map((line) => (
              <tr key={line.sku}>
                <td className="px-3 py-2 font-mono">{line.sku}</td>
                <td className="px-3 py-2">{line.description}</td>
                <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                {priced ? (
                  <>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {line.unitPriceCents !== undefined
                        ? formatRand(line.unitPriceCents)
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {line.unitPriceCents !== undefined
                        ? formatRand(line.quantity * line.unitPriceCents)
                        : ""}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
          {order.totalCents !== undefined ? (
            <tfoot>
              <tr className="border-t-2 border-line-strong font-semibold">
                <th scope="row" colSpan={4} className="px-3 py-2 text-right">
                  {o.total}
                </th>
                <td
                  data-testid="order-total"
                  className="px-3 py-2 text-right whitespace-nowrap tabular-nums"
                >
                  {formatRand(order.totalCents)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
