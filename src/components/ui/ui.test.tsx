// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Photo } from "@/components/media/photo";
import { PHOTO_NAMES } from "@/components/media/manifest";
import { ISSUE_STATUSES } from "@/data/types";
import { Avatar } from "./avatar";
import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { describedBy, Field, Input } from "./field";
import { ProgressRing } from "./progress-ring";
import { StatusPill } from "./status-pill";
import { Stepper } from "./stepper";

afterEach(cleanup);

describe("StatusPill", () => {
  it("names every status in words with an icon, and never says resolved", () => {
    for (const status of ISSUE_STATUSES) {
      const { container, unmount } = render(<StatusPill status={status} />);
      const pill = container.querySelector(`[data-status="${status}"]`);
      expect(pill).not.toBeNull();
      expect(pill!.textContent!.trim().length).toBeGreaterThan(0);
      expect(pill!.textContent!.toLowerCase()).not.toContain("resolved");
      expect(pill!.querySelector("svg")).not.toBeNull();
      unmount();
    }
  });

  it("tells screen readers a repair claim is not verified yet", () => {
    render(<StatusPill status="repair_claimed" />);
    expect(screen.getByText(/Not verified yet/)).toBeInTheDocument();
    expect(screen.getByText("Repair claimed")).toBeInTheDocument();
  });
});

describe("Stepper", () => {
  it("marks the current step and announces its position", () => {
    render(
      <Stepper steps={["Where", "What", "Show us", "Done"]} current={1} label="Report" />,
    );
    const current = screen.getByRole("listitem", { current: "step" });
    expect(current).toHaveTextContent("Step 2 of 4");
    expect(current).toHaveTextContent("What");
    expect(screen.getByRole("navigation", { name: "Report" })).toBeInTheDocument();
  });
});

describe("Field", () => {
  it("links label, hint and a live error to the control", () => {
    render(
      <Field
        id="name"
        label="Your name"
        hint="As on your ID"
        required
        error="Please fill this in."
      >
        <Input
          id="name"
          aria-invalid
          aria-describedby={describedBy("name", { hint: true, error: true })}
        />
      </Field>,
    );
    const input = screen.getByLabelText(/Your name/);
    expect(input).toHaveAccessibleDescription("As on your ID Please fill this in.");
    expect(screen.getByRole("alert")).toHaveTextContent("Please fill this in.");
  });
});

describe("Button", () => {
  it("is busy and disabled while loading, keeping its label", () => {
    render(<Button loading>Send report</Button>);
    const button = screen.getByRole("button", { name: /Send report/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});

describe("Photo", () => {
  it("draws a labelled placeholder for every key before the files exist", () => {
    for (const name of PHOTO_NAMES) {
      const { container, unmount } = render(<Photo name={name} />);
      const box = container.querySelector(`[data-photo="${name}"]`)!;
      expect(box).not.toBeNull();
      // Either a real image or a placeholder, and in both cases a description.
      const image = box.querySelector("img");
      if (image) expect(image.getAttribute("alt")!.length).toBeGreaterThan(10);
      else {
        expect(box).toHaveAttribute("role", "img");
        expect(box.getAttribute("aria-label")!.length).toBeGreaterThan(10);
      }
      unmount();
    }
  });

  it("hides a decorative placeholder from screen readers", () => {
    const { container } = render(<Photo name="empty_state" alt="" />);
    expect(container.querySelector("[data-photo]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

describe("EmptyState, Avatar, ProgressRing", () => {
  it("renders a titled region with one action", () => {
    render(
      <EmptyState
        title="No reports yet"
        body="Be the first."
        action={<Button>Report</Button>}
      />,
    );
    expect(screen.getByRole("region", { name: "No reports yet" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Report" })).toBeInTheDocument();
  });

  it("shows initials and stays decorative beside a name", () => {
    const { container } = render(<Avatar name="Zanele Dlamini" />);
    expect(container.textContent).toBe("ZD");
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("exposes the ring as a labelled progress bar", () => {
    render(<ProgressRing value={7} max={10} label="7 of 10 people affected" />);
    const bar = screen.getByRole("progressbar", { name: "7 of 10 people affected" });
    expect(bar).toHaveAttribute("aria-valuenow", "7");
    expect(bar).toHaveAttribute("aria-valuemax", "10");
  });
});
