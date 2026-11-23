// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApproveWorkOrderInput } from "@/data/types";
import { getMessages } from "@/i18n";
import { OrderForm, type SampleOrder } from "./order-form";

const words = getMessages().procurement;
const sample: SampleOrder = {
  supplierRef: words.orderShortcut.supplierRef,
  scope: words.orderShortcut.scope("Ceiling board sagging", "Library"),
  lines: words.orderShortcut.lines,
};

afterEach(cleanup);

describe("the funder's sample-order shortcut", () => {
  it("is not offered when no sample is given", () => {
    render(<OrderForm onSubmit={vi.fn()} />);
    expect(screen.queryByTestId("order-shortcut")).not.toBeInTheDocument();
  });

  it("fills the form and sends nothing until the funder approves", async () => {
    const onSubmit = vi.fn<(input: ApproveWorkOrderInput) => Promise<void>>(
      async () => undefined,
    );
    render(<OrderForm onSubmit={onSubmit} sample={sample} />);

    fireEvent.click(screen.getByRole("button", { name: words.orderShortcut.action }));

    expect(screen.getByLabelText(words.orderForm.supplierRef)).toHaveValue("SUP-2026-0417");
    expect(screen.getByLabelText(words.orderForm.scope)).toHaveValue(sample.scope);
    expect(screen.getByTestId("order-form-total")).toHaveTextContent("R4 200,00");
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: words.orderForm.submit }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      supplierRef: "SUP-2026-0417",
      description: sample.scope,
      lines: [
        {
          sku: "MATERIALS-01",
          description: "Materials for the repair",
          quantity: 1,
          unitPriceCents: 240000,
        },
        {
          sku: "LABOUR-01",
          description: "Labour to carry out the repair",
          quantity: 1,
          unitPriceCents: 180000,
        },
      ],
    });
  });
});
