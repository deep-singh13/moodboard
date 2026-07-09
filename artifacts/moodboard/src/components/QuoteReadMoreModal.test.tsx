import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QuoteReadMoreModal } from "./QuoteReadMoreModal";

describe("QuoteReadMoreModal", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the full text and author", () => {
    render(
      <QuoteReadMoreModal
        text="A long quote that would otherwise be truncated in the card."
        author="Jane Doe"
        onClose={onClose}
      />,
    );

    expect(
      screen.getByText("A long quote that would otherwise be truncated in the card."),
    ).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", () => {
    render(<QuoteReadMoreModal text="Some quote" onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /close/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when clicking the overlay backdrop, but not when clicking inside the drawer", () => {
    const { container } = render(<QuoteReadMoreModal text="Some quote" onClose={onClose} />);

    const overlay = container.querySelector(".modal-overlay") as HTMLElement;
    const drawer = container.querySelector(".modal-drawer") as HTMLElement;

    fireEvent.click(drawer);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
