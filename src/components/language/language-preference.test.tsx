// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BonaBuddy } from "@/components/buddy/bona-buddy";
import { resetBuddyStore } from "@/components/buddy/buddy-store";
import { LANGUAGE_KEY, LanguagePreference } from "./language-preference";

const askAssistant = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/data/api", () => ({
  USING_FIXTURES: true,
  getApi: () => ({ askAssistant }),
}));

const TWELVE = [
  "English",
  "Afrikaans",
  "isiNdebele",
  "isiXhosa",
  "isiZulu",
  "Sepedi",
  "Sesotho",
  "Setswana",
  "siSwati",
  "Tshivenda",
  "Xitsonga",
  "South African Sign Language",
];

const QUESTION = "Which language do you prefer?";
const note = () => screen.getByTestId("buddy-language");
const ask = () => within(note()).getByRole("button", { name: QUESTION });
const listed = () =>
  within(screen.getByRole("combobox"))
    .getAllByRole("option")
    .map((option) => option.textContent);
const choose = (code: string) =>
  fireEvent.change(screen.getByRole("combobox"), { target: { value: code } });

beforeEach(() => {
  window.localStorage.clear();
  askAssistant.mockReset();
});

afterEach(() => {
  cleanup();
  resetBuddyStore();
  vi.restoreAllMocks();
});

describe("<LanguagePreference>", () => {
  it("asks the question and keeps the list closed until it is pressed", () => {
    render(<LanguagePreference />);
    expect(ask()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("lists exactly the twelve official languages, each in its own name", () => {
    render(<LanguagePreference />);
    fireEvent.click(ask());
    expect(ask()).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("combobox", { name: QUESTION });
    expect(list).toHaveFocus();
    expect(listed()).toEqual(TWELVE);
    // Nothing is picked for the person: the only other entry is a hidden prompt.
    expect(list).toHaveValue("");
    expect(list.querySelectorAll("option")).toHaveLength(13);
  });

  it("shows the chosen language, remembers it, and lets the person change it", () => {
    const first = render(<LanguagePreference />);
    fireEvent.click(ask());
    choose("zu");
    expect(note()).toHaveTextContent("Preferred language: isiZulu");
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe("zu");
    const change = within(note()).getByRole("button", { name: "Change" });
    expect(change).toHaveFocus();

    first.unmount();
    render(<LanguagePreference />);
    expect(note()).toHaveTextContent("Preferred language: isiZulu");
    expect(within(note()).queryByRole("button", { name: QUESTION })).toBeNull();

    fireEvent.click(within(note()).getByRole("button", { name: "Change" }));
    expect(screen.getByRole("combobox")).toHaveValue("zu");
    expect(listed()).toEqual(TWELVE);
    choose("sasl");
    expect(note()).toHaveTextContent("Preferred language: South African Sign Language");
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBe("sasl");
  });

  it("closes the list again without choosing", () => {
    render(<LanguagePreference />);
    fireEvent.click(ask());
    fireEvent.click(ask());
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(window.localStorage.getItem(LANGUAGE_KEY)).toBeNull();
  });

  it("asks again when what was saved is not one of the twelve", () => {
    window.localStorage.setItem(LANGUAGE_KEY, "tlh");
    render(<LanguagePreference />);
    expect(ask()).toBeInTheDocument();
    expect(note()).not.toHaveTextContent("Preferred language");
  });

  it("still works when this device blocks storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<LanguagePreference />);
    fireEvent.click(ask());
    expect(listed()).toEqual(TWELVE);
    expect(() => choose("xh")).not.toThrow();
    expect(ask()).toBeInTheDocument();
  });
});

describe("the note in Bolt's bubble", () => {
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: "Bona buddy: help" }));

  it("is not on the page until the bubble opens, then sits under its heading", () => {
    render(<BonaBuddy />);
    expect(screen.queryByTestId("buddy-language")).toBeNull();
    open();
    const panel = screen.getByTestId("bona-buddy-panel");
    expect(within(panel).getByRole("button", { name: QUESTION })).toBeInTheDocument();
    // Above the chat, so the question box and the chips stay where they are.
    const sheet = screen.getByTestId("bona-buddy-sheet");
    expect(note().compareDocumentPosition(sheet)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(sheet).not.toContainElement(note());
  });

  it("only records the choice: nothing else in the bubble or the page changes", () => {
    render(<BonaBuddy />);
    open();
    const panel = screen.getByTestId("bona-buddy-panel");
    const sheet = screen.getByTestId("bona-buddy-sheet");
    const heading = within(panel).getByRole("heading", { level: 2 });
    const before = { sheet: sheet.innerHTML, heading: heading.textContent };
    const lang = document.documentElement.lang;

    fireEvent.click(ask());
    choose("zu");

    expect(note()).toHaveTextContent("Preferred language: isiZulu");
    expect(sheet.innerHTML).toBe(before.sheet);
    expect(heading.textContent).toBe(before.heading);
    expect(document.documentElement.lang).toBe(lang);
    expect(askAssistant).not.toHaveBeenCalled();
    expect(screen.queryByTestId("fake-signer")).toBeNull();
    expect(screen.getByTestId("bona-buddy")).toHaveAttribute("data-pet", "robot");
    // Only the one key is written.
    expect(Object.keys(window.localStorage)).toEqual([LANGUAGE_KEY]);
  });

  it("is still there when the bubble is closed and opened again", () => {
    render(<BonaBuddy />);
    open();
    fireEvent.click(ask());
    choose("st");
    fireEvent.click(
      within(screen.getByTestId("bona-buddy-panel")).getByRole("button", {
        name: "Close",
      }),
    );
    expect(screen.queryByTestId("buddy-language")).toBeNull();
    open();
    expect(note()).toHaveTextContent("Preferred language: Sesotho");
  });
});
