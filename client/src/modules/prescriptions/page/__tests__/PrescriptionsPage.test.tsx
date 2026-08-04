import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import PrescriptionsPage from "@/modules/prescriptions/page/PrescriptionsPage";

/** Generic successful list response so queries settle into empty states. */
function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone() {
      return this;
    },
  } as unknown as Response;
}

const fetchMock = vi.fn();
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("PrescriptionsPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async () =>
      okJson({ data: [], meta: { pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 1 } } }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    queryClient.clear();
  });

  it("opens the New prescription dialog without crashing", async () => {
    render(<PrescriptionsPage />, { wrapper });

    const button = await screen.findByRole("button", { name: /new prescription/i });
    fireEvent.click(button);

    // If the dialog render throws, this test fails with the exact error.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("New prescription")).toBeInTheDocument();
    expect(within(dialog).getByText("Items")).toBeInTheDocument();
  });
});
