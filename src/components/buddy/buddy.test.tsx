// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/en";
import { BonaBuddy } from "./bona-buddy";
import { BUDDY_MOODS, BuddyFace } from "./buddy-face";
import { BuddyHint } from "./buddy-hint";
import {
  BUDDY_HINT_IDS,
  currentHint,
  hintForPath,
  isBuddyHintId,
  openBuddy,
  pushHint,
  resetBuddyStore,
  resolveHint,
} from "./buddy-store";
import { pickTarget, poseFor, wordMs, wordsIn } from "./sign-words";

const path = vi.hoisted(() => ({ current: "/" }));
const askAssistant = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname: () => path.current }));
vi.mock("@/data/api", () => ({
  USING_FIXTURES: true,
  getApi: () => ({ askAssistant }),
}));
// The real module pulls in three.js and WebGL; the buddy only needs to load *a* panel.
vi.mock("./sign-preview", () => ({
  SignPreview: ({ onClose }: { onClose: () => void }) => (
    <button type="button" data-testid="fake-signer" onClick={onClose}>
      close signer
    </button>
  ),
}));

beforeAll(() => {
  // jsdom has no modal dialogs yet.
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

beforeEach(() => {
  path.current = "/";
  askAssistant.mockReset();
});

afterEach(() => {
  cleanup();
  resetBuddyStore();
});

describe("buddy hint store", () => {
  it("has no hint until a page announces one", () => {
    expect(currentHint()).toBeNull();
  });

  it("shows the newest hint and goes back when it leaves", () => {
    const leaveSchool = pushHint("school");
    const leaveStep = pushHint("report.photo");
    expect(currentHint()).toBe("report.photo");
    leaveStep();
    expect(currentHint()).toBe("school");
    leaveStep(); // withdrawing twice does nothing
    expect(currentHint()).toBe("school");
    leaveSchool();
    expect(currentHint()).toBeNull();
  });

  it("keeps a newer hint when an older one leaves first", () => {
    const leaveOld = pushHint("report.school");
    pushHint("report.category");
    leaveOld();
    expect(currentHint()).toBe("report.category");
  });
});

describe("hint lookup", () => {
  it("knows every id in the list and nothing else", () => {
    for (const id of BUDDY_HINT_IDS) expect(isBuddyHintId(id)).toBe(true);
    expect(isBuddyHintId("report.unknown")).toBe(false);
    expect(isBuddyHintId(null)).toBe(false);
  });

  it("uses the page's hint when it knows it", () => {
    expect(resolveHint("report.review", "/")).toBe("report.review");
  });

  it("falls back to the address, then to general help", () => {
    expect(resolveHint("not-a-step", "/track")).toBe("track");
    expect(resolveHint(null, "/somewhere/else")).toBe("fallback");
    expect(resolveHint(undefined, null)).toBe("fallback");
  });

  it("guesses a hint from the address", () => {
    const cases: Record<string, string> = {
      "/": "home",
      "/report": "report",
      "/receipts/BB-2026-000118": "receipt",
      "/issues": "fallback",
      "/issues/issue-118": "issue",
      "/issues/issue-118/evidence": "issue",
      "/schools": "home",
      "/schools/thuto-lesedi-primary": "school",
      "/track": "track",
      "/verify": "verify",
      "/admin": "admin",
      "/reviewer": "reviewer",
      "/assistant": "fallback",
      "/sign-in": "fallback",
    };
    for (const [pathname, id] of Object.entries(cases)) {
      expect(hintForPath(pathname), pathname).toBe(id);
    }
  });

  it("has plain copy for every id: a title and one or two tips", () => {
    expect(Object.keys(en.buddy.hints).sort()).toEqual([...BUDDY_HINT_IDS].sort());
    for (const id of BUDDY_HINT_IDS) {
      const hint = en.buddy.hints[id];
      expect(hint.title.trim().length, id).toBeGreaterThan(0);
      expect(hint.tips.length, id).toBeGreaterThanOrEqual(1);
      expect(hint.tips.length, id).toBeLessThanOrEqual(2);
      // There is no "resolved" status in BonaBlock.
      expect(`${hint.title} ${hint.tips.join(" ")}`.toLowerCase()).not.toContain(
        "resolved",
      );
    }
  });
});

describe("<BuddyHint>", () => {
  it("renders nothing, announces its id and withdraws it on the way out", () => {
    const { container, unmount, rerender } = render(<BuddyHint id="report.category" />);
    expect(container).toBeEmptyDOMElement();
    expect(currentHint()).toBe("report.category");
    rerender(<BuddyHint id="report.describe" />);
    expect(currentHint()).toBe("report.describe");
    unmount();
    expect(currentHint()).toBeNull();
  });
});

describe("<BuddyFace>", () => {
  it("draws every expression as a decorative picture", () => {
    for (const mood of BUDDY_MOODS) {
      const { container, unmount } = render(<BuddyFace mood={mood} />);
      const svg = container.querySelector("svg");
      expect(svg).toHaveAttribute("data-mood", mood);
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg!.querySelectorAll("path, ellipse, circle").length).toBeGreaterThan(1);
      unmount();
    }
  });
});

describe("<BonaBuddy>", () => {
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "Bona buddy: help" }));

  it("is one named button until it is opened", () => {
    render(<BonaBuddy />);
    const button = screen.getByRole("button", { name: "Bona buddy: help" });
    expect(button).toHaveAttribute("data-mood", "resting");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("bona-buddy-sheet")).toBeNull();
    expect(screen.queryByTestId("fake-signer")).toBeNull();
  });

  it("opens with tips for the address, then for the step the page names", () => {
    path.current = "/track";
    render(<BonaBuddy />);
    open();
    expect(
      screen.getByRole("heading", { name: "Following a report" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("bona-buddy")).toHaveAttribute("data-mood", "listening");

    render(<BuddyHint id="report.photo" />);
    expect(screen.getByRole("heading", { name: "Adding a photo" })).toBeInTheDocument();
    expect(screen.getByText(/You can skip this and add one later/)).toBeInTheDocument();
  });

  it("looks pleased on the receipt, where the report just worked", () => {
    path.current = "/receipts/BB-2026-000118";
    render(<BonaBuddy />);
    expect(screen.getByTestId("bona-buddy")).toHaveAttribute("data-mood", "happy");
  });

  it("opens as a small panel that leaves the page usable, and Escape closes it", () => {
    render(<BonaBuddy />);
    open();
    const panel = screen.getByRole("dialog", { name: "How can I help?" });
    expect(panel).toHaveAttribute("aria-modal", "false");
    expect(panel.style.width).toContain("380px");
    // The header says who is answering.
    expect(screen.getByText("Bona AI")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How can I help?" })).toHaveFocus();

    fireEvent.keyDown(panel, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Bona buddy: help" })).toHaveFocus();
  });

  it("resizes from its corner with the arrow keys and remembers the size", () => {
    window.localStorage.removeItem("bona:buddy:size");
    const { unmount } = render(<BonaBuddy />);
    open();
    const grip = screen.getByRole("button", { name: /Resize this panel/ });
    fireEvent.keyDown(grip, { key: "ArrowLeft" });
    fireEvent.keyDown(grip, { key: "ArrowUp" });
    const panel = screen.getByRole("dialog");
    expect(panel.style.width).toContain("404px");
    expect(panel.style.height).toContain("544px");
    // Never smaller than its minimum.
    for (let i = 0; i < 20; i++) fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(panel.style.width).toContain("280px");
    unmount();

    render(<BonaBuddy />);
    open();
    expect(screen.getByRole("dialog").style.width).toContain("280px");
    window.localStorage.removeItem("bona:buddy:size");
  });

  it("is Bolt the robot, and its chat offers questions to tap", async () => {
    askAssistant.mockResolvedValue({ id: "a2", role: "assistant", text: "Tap Report." });
    render(<BonaBuddy />);
    expect(screen.getByTestId("bona-buddy")).toHaveAttribute("data-pet", "robot");
    open();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "How do I report a problem?" }));
    });
    expect(askAssistant).toHaveBeenCalledWith(
      [expect.objectContaining({ role: "user", text: "How do I report a problem?" })],
      "How do I report a problem?",
    );
    expect(screen.getByText("Tap Report.")).toBeInTheDocument();
  });

  it("can be opened from elsewhere on the page", () => {
    render(<BonaBuddy />);
    act(() => openBuddy());
    expect(screen.getByTestId("bona-buddy-sheet")).toBeInTheDocument();
  });

  it("asks Bona AI and shows the answer, with the honest wording", async () => {
    let answer: (reply: unknown) => void = () => {};
    askAssistant.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    render(<BonaBuddy />);
    open();
    expect(screen.getByText(/Bona AI only uses recorded cases/)).toBeInTheDocument();
    expect(screen.getByTestId("buddy-ask-notice")).toHaveTextContent(/scripted sample/);

    fireEvent.change(screen.getByLabelText("Your question for Bona AI"), {
      target: { value: "Where is my report?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(askAssistant).toHaveBeenCalledWith(
      [expect.objectContaining({ role: "user", text: "Where is my report?" })],
      "Where is my report?",
    );
    expect(screen.getByTestId("buddy-ask-result")).toHaveAttribute(
      "data-status",
      "thinking",
    );
    expect(screen.getByTestId("bona-buddy")).toHaveAttribute("data-mood", "thinking");

    await act(async () => {
      answer({
        id: "a1",
        role: "assistant",
        text: "Use the reference number on your receipt.",
        actions: [{ label: "Track a report", href: "/track" }],
      });
    });
    expect(
      screen.getByText("Use the reference number on your receipt."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Track a report" })).toHaveAttribute(
      "href",
      "/track",
    );
    expect(screen.getByTestId("bona-buddy")).toHaveAttribute("data-mood", "happy");
    expect(
      screen.getByRole("link", { name: "Open the full Bona AI page" }),
    ).toHaveAttribute("href", "/assistant");
  });

  it("says so when Bona AI cannot answer, and offers another try", async () => {
    askAssistant.mockRejectedValue(new Error("offline"));
    render(<BonaBuddy />);
    open();
    fireEvent.change(screen.getByLabelText("Your question for Bona AI"), {
      target: { value: "Hello" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send" }));
    });
    expect(screen.getByText(/Bona AI could not answer just now/)).toBeInTheDocument();
    expect(screen.getByTestId("bona-buddy")).toHaveAttribute("data-mood", "concerned");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("keeps the signer off until its switch is used, and says what the switch does", async () => {
    render(<BonaBuddy />);
    open();
    // Extras stay out of the chat until asked for.
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    const toggle = screen.getByRole("switch", { name: "Sign language preview" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription(
      "A 3D figure moves for the words you point at.",
    );
    expect(screen.queryByTestId("fake-signer")).toBeNull();

    await act(async () => {
      fireEvent.click(toggle);
    });
    // Loaded on demand; the sheet steps aside so the page can be pointed at.
    const signer = await screen.findByTestId("fake-signer");
    expect(screen.queryByTestId("bona-buddy-sheet")).toBeNull();

    fireEvent.click(signer);
    expect(screen.queryByTestId("fake-signer")).toBeNull();
  });
});

describe("lazy loading", () => {
  const here = __dirname;
  const read = (name: string) => readFileSync(join(here, name), "utf8");

  it("reaches three.js only through one dynamic import", () => {
    expect(read("bona-buddy.tsx")).toContain('await import("./sign-preview")');
    // Everything the layout loads on every page stays free of three.js and the signer.
    for (const name of [
      "bona-buddy.tsx",
      "buddy-ask.tsx",
      "buddy-face.tsx",
      "buddy-hint.tsx",
      "buddy-store.ts",
      "position.ts",
    ]) {
      const source = read(name);
      expect(source, name).not.toMatch(/from "three"/);
      expect(source, name).not.toMatch(/from "\.\/sign-/);
    }
    expect(read("sign-figure.ts")).toMatch(/from "three"/);
  });
});

describe("sign preview words", () => {
  it("gives a word the same made-up gesture every time", () => {
    expect(poseFor("school")).toEqual(poseFor("school"));
    expect(poseFor("Grade 3").spell).toBe(true);
    expect(poseFor("fixed?").brow).toBe(1);
  });

  it("shows numbers and sentence ends for longer", () => {
    expect(wordMs("2026")).toBeGreaterThan(wordMs("door"));
    expect(wordMs("door.")).toBe(wordMs("doors") + 220);
  });

  it("picks the sentence under the pointer and skips its own panel", () => {
    document.body.innerHTML = `
      <p id="line">The <strong id="word">girls'</strong> toilets are blocked</p>
      <div data-bona-sign-ignore><p id="panel">Not for reading</p></div>`;
    const line = document.getElementById("line")!;
    expect(pickTarget(document.getElementById("word")!)).toBe(line);
    expect(pickTarget(document.getElementById("panel")!)).toBeNull();
    expect(wordsIn(line).map((word) => word.text)).toEqual([
      "The",
      "girls'",
      "toilets",
      "are",
      "blocked",
    ]);
    document.body.innerHTML = "";
  });
});
