"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useMessages } from "@/i18n";

/**
 * The questions, as an accordion: each question is a button that opens its
 * answer, the first one open to begin with. More than one may be open, so
 * nothing a person is reading closes under them.
 */
export function Faq() {
  const m = useMessages();
  const f = m.landingPage.faq;
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set([0]));

  function toggle(index: number) {
    setOpen((now) => {
      const next = new Set(now);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  return (
    <div className="vl-faq" data-testid="landing-faq">
      {f.items.map((item, index) => {
        const isOpen = open.has(index);
        return (
          <div key={item.q} className="vl-faq-item">
            <h3>
              <button
                type="button"
                id={`faq-q-${index}`}
                aria-expanded={isOpen}
                aria-controls={`faq-a-${index}`}
                onClick={() => toggle(index)}
              >
                {item.q}
                <Icon name="chevronDown" className="size-5" />
              </button>
            </h3>
            <div
              id={`faq-a-${index}`}
              role="region"
              aria-labelledby={`faq-q-${index}`}
              hidden={!isOpen}
              className="vl-faq-answer"
            >
              <p>{item.a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
