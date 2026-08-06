import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WardsPage from "./WardsPage";
import { listWards } from "@/shared/services/ipd.service";

vi.mock("@/shared/services/ipd.service", () => ({
  createWard: vi.fn(),
  deactivateWard: vi.fn(),
  getWard: vi.fn(),
  getWardCensus: vi.fn(),
  listWards: vi.fn(),
  updateWard: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

const ward = {
  id: "w1",
  name: "Ward-A",
  wardType: "GENERAL",
  departmentId: null,
  floor: "1st",
  nursePatientRatio: "1:4",
  isActive: true,
  hospitalId: null,
  createdAt: "2026-08-04T12:05:30.438Z",
  deletedAt: null,
  _count: { beds: 1 },
};

const listWardsMock = listWards as ReturnType<typeof vi.fn>;

beforeEach(() => {
  listWardsMock.mockReset();
  listWardsMock.mockResolvedValue({
    items: [ward],
    pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
  });
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <QueryClientProvider client={qc}>
        <WardsPage />
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe("WardsPage Edit dialog", () => {
  it("opens the Edit dialog when the Edit button is clicked", async () => {
    renderPage();
    await screen.findByText("Ward-A");
    const editBtn = screen.getByRole("button", { name: "Edit" });
    fireEvent.click(editBtn);
    expect(await screen.findByText("Edit ward")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ward-A")).toBeInTheDocument();
  });
});
