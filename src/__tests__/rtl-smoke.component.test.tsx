// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";

function Greeting() {
  return <p>Hello</p>;
}

describe("React Testing Library setup", () => {
  test(`renders a component in jsdom`, () => {
    render(<Greeting />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
