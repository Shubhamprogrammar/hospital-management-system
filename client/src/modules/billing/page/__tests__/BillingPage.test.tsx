import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import BillingPage from "@/modules/billing/page/BillingPage";

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

const draftBill = {
  id: "b1",
  invoiceNo: "INV-0001",
  patient: { id: "p1", name: "Rahul Verma", uhid: "UHID0001" },
  createdAt: "2026-08-01T10:00:00.000Z",
  status: "DRAFT",
  totalAmount: 1500,
};

describe("BillingPage", () => {
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

  it("opens the Create bill dialog without crashing", async () => {
    render(<BillingPage />, { wrapper });

    const button = await screen.findByRole("button", { name: /create bill/i });
    fireEvent.click(button);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Line items")).toBeInTheDocument();
  });

  it("opens the Apply discount dialog without crashing", async () => {
    // The discount form is rendered OUTSIDE any Form provider — a bare
    // <FormLabel> there used to crash with "Cannot read properties of null".
    fetchMock.mockImplementation(async () =>
      okJson({ data: [draftBill], meta: { pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 } } }),
    );

    render(<BillingPage />, { wrapper });

    const discountButton = await screen.findByRole("button", { name: /discount/i });
    fireEvent.click(discountButton);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Discount %")).toBeInTheDocument();
  });
});
