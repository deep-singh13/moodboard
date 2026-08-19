import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { MoodboardItem } from "@/types";

vi.mock("@/lib/api", () => ({
  fetchItems: vi.fn(),
  createItem: vi.fn(),
  deleteItem: vi.fn(),
  patchItemEdit: vi.fn(),
}));

import { fetchItems, createItem, deleteItem, patchItemEdit } from "@/lib/api";
import { useBoard } from "@/lib/useBoard";

const mockFetchItems = vi.mocked(fetchItems);
const mockCreateItem = vi.mocked(createItem);
const mockDeleteItem = vi.mocked(deleteItem);
const mockPatchItemEdit = vi.mocked(patchItemEdit);

function item(id: string, over: Partial<MoodboardItem> = {}): MoodboardItem {
  return {
    id,
    type: "link",
    url: `https://example.com/${id}`,
    addedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

/** Renders the hook and waits for the initial load to settle. */
async function loaded(
  items: MoodboardItem[],
  options: Parameters<typeof useBoard>[0] = {},
) {
  mockFetchItems.mockResolvedValue(items);
  const view = renderHook(() => useBoard(options));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchItems.mockResolvedValue([]);
  mockCreateItem.mockImplementation((i) => Promise.resolve(i));
  mockDeleteItem.mockResolvedValue(undefined);
  mockPatchItemEdit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("loading", () => {
  it("requests the board it was given", async () => {
    await loaded([], { board: "quotes" });
    expect(mockFetchItems).toHaveBeenCalledWith("quotes");
  });

  it("defaults to the moodboard board", async () => {
    await loaded([]);
    expect(mockFetchItems).toHaveBeenCalledWith("moodboard");
  });

  it("exposes the loaded items and clears loading", async () => {
    const { result } = await loaded([item("a"), item("b")]);
    expect(result.current.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result.current.loadError).toBe(false);
  });

  it("sets loadError when the fetch rejects", async () => {
    mockFetchItems.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useBoard({ board: "places" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadError).toBe(true);
    expect(result.current.items).toEqual([]);
  });
});

describe("add", () => {
  it("prepends optimistically and reports success", async () => {
    const { result } = await loaded([item("old")]);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.add(item("new", { addedAt: "2026-06-01T00:00:00.000Z" }));
    });

    expect(saved).toBe(true);
    expect(result.current.items.map((i) => i.id)).toEqual(["new", "old"]);
    expect(result.current.addError).toBeNull();
  });

  it("appends instead when the board is spatially packed", async () => {
    const { result } = await loaded([item("old")], {
      board: "moodboard",
      insert: "append",
    });

    await act(async () => {
      await result.current.add(item("new", { addedAt: "2026-06-01T00:00:00.000Z" }));
    });

    expect(result.current.items.map((i) => i.id)).toEqual(["old", "new"]);
  });

  it("rolls the item back out and flashes an error when the save fails", async () => {
    mockCreateItem.mockRejectedValue(new Error("offline"));
    const { result } = await loaded([item("old")]);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.add(item("new"));
    });

    expect(saved).toBe(false);
    expect(result.current.items.map((i) => i.id)).toEqual(["old"]);
    expect(result.current.addError).toBe("Couldn't save — check your connection.");
  });

  it("clears the error after four seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockCreateItem.mockRejectedValue(new Error("offline"));
    mockFetchItems.mockResolvedValue([]);

    const { result } = renderHook(() => useBoard({ board: "discover" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.add(item("new"));
    });
    expect(result.current.addError).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.addError).toBeNull();
  });

  it("sorts a pinned insert above unpinned ones", async () => {
    const { result } = await loaded([item("old", { addedAt: "2026-09-01T00:00:00.000Z" })]);

    await act(async () => {
      await result.current.add(item("pinned", { pinned: true, addedAt: "2020-01-01T00:00:00.000Z" }));
    });

    expect(result.current.items.map((i) => i.id)).toEqual(["pinned", "old"]);
  });
});

describe("remove", () => {
  it("drops the item optimistically and calls the API", async () => {
    const { result } = await loaded([item("a"), item("b")]);

    await act(async () => {
      await result.current.remove("a");
    });

    expect(result.current.items.map((i) => i.id)).toEqual(["b"]);
    expect(mockDeleteItem).toHaveBeenCalledWith("a");
  });

  it("swallows a failed delete", async () => {
    mockDeleteItem.mockRejectedValue(new Error("offline"));
    const { result } = await loaded([item("a")]);

    await act(async () => {
      await expect(result.current.remove("a")).resolves.toBeUndefined();
    });
  });
});

describe("toggles", () => {
  it("toggleComplete sends the negated value", async () => {
    const { result } = await loaded([item("a", { completed: false })]);

    act(() => result.current.toggleComplete("a"));

    expect(result.current.items[0].completed).toBe(true);
    expect(mockPatchItemEdit).toHaveBeenCalledWith("a", { completed: true });
  });

  it("toggleComplete does not re-sort", async () => {
    const { result } = await loaded([
      item("a", { addedAt: "2026-01-01T00:00:00.000Z" }),
      item("b", { addedAt: "2026-09-01T00:00:00.000Z" }),
    ]);

    act(() => result.current.toggleComplete("a"));

    expect(result.current.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("togglePin floats the item to the top", async () => {
    const { result } = await loaded([
      item("a", { addedAt: "2026-09-01T00:00:00.000Z" }),
      item("b", { addedAt: "2026-01-01T00:00:00.000Z" }),
    ]);

    act(() => result.current.togglePin("b"));

    expect(result.current.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(mockPatchItemEdit).toHaveBeenCalledWith("b", { pinned: true });
  });

  it("un-pinning drops the item back into date order", async () => {
    const { result } = await loaded([
      item("pinned", { pinned: true, addedAt: "2020-01-01T00:00:00.000Z" }),
      item("recent", { addedAt: "2026-09-01T00:00:00.000Z" }),
    ]);

    act(() => result.current.togglePin("pinned"));

    expect(result.current.items.map((i) => i.id)).toEqual(["recent", "pinned"]);
  });

  it("ignores a toggle for an id that is not on the board", async () => {
    const { result } = await loaded([item("a")]);

    act(() => result.current.togglePin("ghost"));

    expect(mockPatchItemEdit).not.toHaveBeenCalled();
  });
});

describe("update", () => {
  it("merges only the fields it was given", async () => {
    const { result } = await loaded([
      item("a", { title: "Original", subtitle: "Keep me", note: "Keep me too" }),
    ]);

    act(() => result.current.update("a", { title: "Changed" }));

    expect(result.current.items[0]).toMatchObject({
      title: "Changed",
      subtitle: "Keep me",
      note: "Keep me too",
    });
    expect(mockPatchItemEdit).toHaveBeenCalledWith("a", { title: "Changed" });
  });

  it("treats an explicit null as a clear", async () => {
    const { result } = await loaded([item("a", { note: "Something" })]);

    act(() => result.current.updateNote("a", null));

    expect(result.current.items[0].note).toBeUndefined();
    expect(mockPatchItemEdit).toHaveBeenCalledWith("a", { note: null });
  });
});

describe("replace", () => {
  it("swaps in a server-authoritative row", async () => {
    const { result } = await loaded([item("a", { title: "Stale" }), item("b")]);

    act(() => result.current.replace(item("a", { title: "Fresh", price: 42 })));

    expect(result.current.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(result.current.items[0]).toMatchObject({ title: "Fresh", price: 42 });
  });
});
