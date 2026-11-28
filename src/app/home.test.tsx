// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Home from "./page";

afterEach(cleanup);

describe("home page (the money line)", () => {
  it("has one h1 and the four stations of the line", () => {
    render(<Home />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const line = screen.getByRole("region", { name: "How money moves" });
    const stations = within(line).getAllByRole("listitem");
    expect(stations.map((s) => s.getAttribute("data-station"))).toEqual([
      "in",
      "locked",
      "check1",
      "check2",
    ]);
    expect(line).toHaveTextContent("R5 000");
    expect(line).toHaveTextContent("R3 000");
    expect(line).toHaveTextContent("R2 000");
  });

  it("sends people to the live repair and lists example repairs as examples", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: "Follow a real repair" })).toHaveAttribute(
      "href",
      "/demo",
    );
    const list = screen.getByTestId("live-repairs");
    const links = within(list).getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/demo");
    for (const link of links.slice(1)) {
      expect(link.getAttribute("href")).toMatch(/^\/cases\//);
      expect(link).toHaveTextContent("Example");
    }
  });

  it("never says paid or resolved", () => {
    const { container } = render(<Home />);
    expect(container.textContent).not.toMatch(/\bpaid\b|\bresolved\b/i);
  });
});
