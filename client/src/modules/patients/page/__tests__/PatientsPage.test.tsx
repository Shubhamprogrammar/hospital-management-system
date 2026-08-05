import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// jsdom polyfills needed by Radix primitives
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

vi.mock("@/shared/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { role: "SUPER_ADMIN" } }, isPending: false }),
}));

const patientsService = vi.hoisted(() => ({
  searchPatients: vi.fn(),
  getPatient: vi.fn(),
  getPatientTimeline: vi.fn(),
  getPatientMe: vi.fn(),
  updatePatient: vi.fn(),
  addPatientDocument: vi.fn(),
  removePatientDocument: vi.fn(),
  mergePatients: vi.fn(),
  registerPatient: vi.fn(),
}));

vi.mock("@/shared/services/patients.service", () => patientsService);

const platformService = vi.hoisted(() => ({
  presignUpload: vi.fn(),
  confirmUpload: vi.fn(),
  getDownloadUrl: vi.fn(),
  deleteUpload: vi.fn(),
}));

vi.mock("@/shared/services/platform.service", () => platformService);

import PatientsPage from "@/modules/patients/page/PatientsPage";

const NOW = new Date().toISOString();

const patientA = {
  id: "p1",
  uhid: "HMS-26-0001",
  userId: null,
  name: "jane doe",
  dob: "2001-05-26T00:00:00.000Z",
  gender: "MALE",
  phone: "7788994455",
  email: "jane@gmail.com",
  bloodGroup: "AB_NEG",
  address: null,
  emergencyContact: null,
  allergies: [],
  chronicConditions: [],
  guardianPatientId: null,
  isActive: true,
  hospitalId: null,
  createdAt: NOW,
  deletedAt: null,
  documents: [],
};

const patientB = {
  ...patientA,
  id: "p2",
  uhid: "HMS-26-0002",
  name: "jane doe dup",
  gender: "FEMALE",
  phone: "9999888877",
  email: "jane2@gmail.com",
  bloodGroup: "O_POS",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <PatientsPage />
    </QueryClientProvider>,
  );
  return { ...utils, queryClient };
}

describe("PatientsPage detail dialog actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    patientsService.searchPatients.mockResolvedValue({
      items: [patientA, patientB],
      pagination: { page: 1, limit: 10, totalItems: 2, totalPages: 1 },
    });
    patientsService.getPatient.mockResolvedValue(patientA);
    patientsService.getPatientTimeline.mockResolvedValue([]);
    patientsService.updatePatient.mockResolvedValue(patientA);
    patientsService.mergePatients.mockResolvedValue({ merged: true });
    patientsService.addPatientDocument.mockResolvedValue({
      id: "doc1",
      patientId: "p1",
      docType: "OTHER",
      s3Key: "uploads/patient_doc/x/file.pdf",
      uploadedBy: null,
      createdAt: NOW,
    });
    patientsService.removePatientDocument.mockResolvedValue({ id: "docX", deleted: true });
    platformService.presignUpload.mockResolvedValue({
      fileId: "f1",
      uploadUrl: "/api/v1/uploads/f1/confirm",
      s3Key: "uploads/patient_doc/x/file.pdf",
      expiresIn: 300,
    });
    platformService.confirmUpload.mockResolvedValue({ id: "f1", status: "SCANNED_CLEAN" });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens the patient detail dialog", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("jane doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("jane doe"));
    await waitFor(() => expect(screen.getByText("Merge duplicate")).toBeInTheDocument());
    expect(screen.getByText("Edit record")).toBeInTheDocument();
    expect(screen.getByText("Upload")).toBeInTheDocument();
  });

  it("opens the Edit record dialog without crashing", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("jane doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("jane doe"));
    await waitFor(() => expect(screen.getByText("Edit record")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit record"));
    await waitFor(() => expect(screen.getByText("Save changes")).toBeInTheDocument());
  });

  it("opens the Merge duplicate dialog without crashing", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("jane doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("jane doe"));
    await waitFor(() => expect(screen.getByText("Merge duplicate")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Merge duplicate"));
    await waitFor(() => expect(screen.getByText("Merge records")).toBeInTheDocument());
  });

  it("opens the Upload document dialog without crashing", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("jane doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("jane doe"));
    await waitFor(() => expect(screen.getByText("Upload")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    expect(await screen.findByText("Upload document")).toBeInTheDocument();
    expect(screen.getByText("Document type")).toBeInTheDocument();
  });

  it("saves edits through updatePatient", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("jane doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("jane doe"));
    await waitFor(() => expect(screen.getByText("Edit record")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit record"));

    const nameInput = await screen.findByDisplayValue("jane doe");
    fireEvent.change(nameInput, { target: { value: "jane doe updated" } });
    fireEvent.click(screen.getByText("Save changes"));

    await waitFor(() =>
      expect(patientsService.updatePatient).toHaveBeenCalledWith("p1",
        expect.objectContaining({ name: "jane doe updated" })),
    );
  });

  it("uploads through Cloudinary when presign returns a signed contract", async () => {
    platformService.presignUpload.mockResolvedValue({
      fileId: "f1",
      uploadUrl: "https://api.cloudinary.com/v1_1/hms-test/raw/upload",
      s3Key: "patient_doc/abc-123/file.pdf",
      expiresIn: 300,
      uploadParams: { api_key: "key", timestamp: 1, signature: "sig", folder: "patient_doc/abc-123", public_id: "file.pdf" },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        public_id: "patient_doc/abc-123/file.pdf",
        secure_url: "https://res.cloudinary.com/hms-test/raw/upload/file.pdf",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPage();
    await waitFor(() => expect(screen.getByText("jane doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("jane doe"));
    await waitFor(() => expect(screen.getByText("Upload")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await screen.findByText("Upload document");

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["hello"], "file.pdf", { type: "application/pdf" })] },
    });
    const dialogs = screen.getAllByRole("dialog");
    fireEvent.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Upload" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.cloudinary.com/v1_1/hms-test/raw/upload",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(platformService.confirmUpload).toHaveBeenCalledWith("f1", {
        publicId: "patient_doc/abc-123/file.pdf",
        secureUrl: "https://res.cloudinary.com/hms-test/raw/upload/file.pdf",
      }),
    );
    await waitFor(() =>
      expect(patientsService.addPatientDocument).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ s3Key: "patient_doc/abc-123/file.pdf" }),
      ),
    );
  });

  it("deletes a patient document through removePatientDocument", async () => {
    patientsService.getPatient.mockResolvedValue({
      ...patientA,
      documents: [
        { id: "docX", patientId: "p1", docType: "OTHER", s3Key: "uploads/patient_doc/x/notes.pdf", uploadedBy: null, createdAt: NOW },
      ],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText("jane doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("jane doe"));
    await waitFor(() => expect(screen.getByText("notes.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Delete"));
    await waitFor(() =>
      expect(patientsService.removePatientDocument).toHaveBeenCalledWith("p1", "docX"),
    );
  });

  it("uploads a document through presign -> confirm -> addPatientDocument", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("jane doe")).toBeInTheDocument());
    fireEvent.click(screen.getByText("jane doe"));
    await waitFor(() => expect(screen.getByText("Upload")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /upload/i }));
    await screen.findByText("Upload document");

    // The upload dialog is rendered through a Radix portal, so query document.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["hello"], "test.pdf", { type: "application/pdf" })] },
    });

    const dialogs = screen.getAllByRole("dialog");
    fireEvent.click(within(dialogs[dialogs.length - 1]).getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(platformService.presignUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadContext: "PATIENT_DOC", filename: "test.pdf" }),
    ));
    await waitFor(() => expect(platformService.confirmUpload).toHaveBeenCalledWith("f1"));
    await waitFor(() => expect(patientsService.addPatientDocument).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ docType: "OTHER", s3Key: "uploads/patient_doc/x/file.pdf" }),
    ));
  });
});
