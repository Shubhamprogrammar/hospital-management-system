// Domain entity types — mirror the server/src/db/prisma/schema.prisma models.
// Keep field names/statuses in sync with the backend.

// ---------- Identity & Access ----------

export interface Role {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  deletedAt: string | null;
  /** Populated by GET /roles (nested `rolePermissions`). */
  rolePermissions?: Array<{ permission: { id: string; key: string; module: string } }>;
}

export interface Permission {
  id: string;
  key: string;
  module: string;
  description: string | null;
  createdAt: string;
}

export interface SessionInfo {
  id: string;
  expiresAt: string;
  createdAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

// ---------- Org master data ----------

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string | null;
  hodUserId: string | null;
  isActive: boolean;
  hospitalId: string | null;
  createdAt: string;
  deletedAt: string | null;
  hod?: { id: string; name: string | null; email: string } | null;
  _count?: { doctors: number; wards: number };
}

export interface DoctorAvailability {
  id: string;
  doctorId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  clinicRoom: string | null;
}

export interface DoctorLeave {
  id: string;
  doctorId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
  createdAt: string;
}

export interface Doctor {
  id: string;
  userId: string;
  departmentId: string;
  registrationNo: string;
  specialization: string;
  qualifications: unknown;
  consultationFee: number | string;
  experienceYears: number;
  bio: string | null;
  isActive: boolean;
  hospitalId: string | null;
  createdAt: string;
  deletedAt: string | null;
  user?: { id: string; name: string | null; email: string; phone: string | null; image: string | null };
  department?: { id: string; name: string; code: string };
  availability?: DoctorAvailability[];
  leaves?: DoctorLeave[];
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

// ---------- Patients ----------

export type PatientGender = "MALE" | "FEMALE" | "OTHER";
export type BloodGroup =
  | "A_POS" | "A_NEG" | "B_POS" | "B_NEG"
  | "AB_POS" | "AB_NEG" | "O_POS" | "O_NEG" | "UNKNOWN";

export interface Patient {
  id: string;
  uhid: string;
  userId: string | null;
  name: string;
  dob: string;
  gender: PatientGender;
  phone: string;
  email: string | null;
  bloodGroup: BloodGroup;
  address: unknown;
  emergencyContact: unknown;
  allergies: string[];
  chronicConditions: string[];
  guardianPatientId: string | null;
  isActive: boolean;
  hospitalId: string | null;
  createdAt: string;
  deletedAt: string | null;
  guardian?: { id: string; name: string; uhid: string } | null;
  /** Populated by GET /patients/:id (descending by createdAt). */
  documents?: PatientDocument[];
}

export interface PatientDocument {
  id: string;
  patientId: string;
  docType: "ID_PROOF" | "INSURANCE" | "OTHER";
  s3Key: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface PatientTimelineEntry {
  type: string;
  referenceId: string;
  description: string;
  occurredAt: string;
  meta?: Record<string, unknown>;
}

// ---------- Appointments & OPD ----------

export type AppointmentMode = "IN_PERSON" | "TELECONSULT";
export type AppointmentStatus =
  | "PENDING" | "BOOKED" | "CHECKED_IN" | "COMPLETED"
  | "CANCELLED" | "REJECTED" | "NO_SHOW" | "NEEDS_RESCHEDULE";

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  slotStartTime: string;
  slotEndTime: string;
  mode: AppointmentMode;
  status: AppointmentStatus;
  reason: string | null;
  createdBy: string | null;
  reviewedById: string | null;
  decisionNote: string | null;
  hospitalId: string | null;
  createdAt: string;
  updatedAt: string;
  patient?: { id: string; name: string; uhid: string; phone: string };
  doctor?: { id: string; name: string; specialization: string };
  department?: { id: string; name: string; code: string };
  opdVisit?: { id: string; tokenNumber: string; status: string };
}

export type OpdVisitStatus =
  | "WAITING" | "VITALS_DONE" | "IN_CONSULTATION" | "COMPLETED"
  | "REFERRED_IPD" | "ABANDONED";

export interface OpdVisit {
  id: string;
  appointmentId: string | null;
  patientId: string;
  doctorId: string;
  departmentId: string;
  tokenNumber: string;
  status: OpdVisitStatus;
  checkedInAt: string;
  consultationStartedAt: string | null;
  closedAt: string | null;
  patient?: { id: string; name: string; uhid: string; phone: string };
  doctor?: { id: string; name: string; specialization: string };
  department?: { id: string; name: string };
  vitals?: OpdVital[];
  diagnoses?: OpdDiagnosis[];
}

export interface OpdVital {
  id: string;
  visitId: string;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pulse: number | null;
  temperature: number | null;
  spo2: number | null;
  weight: number | null;
  height: number | null;
  recordedBy: string | null;
  recordedAt: string;
}

export interface OpdDiagnosis {
  id: string;
  visitId: string;
  icd10Code: string;
  description: string | null;
  notes: string | null;
  diagnosedBy: string | null;
  createdAt: string;
}

export interface OpdQueueItem {
  visit: OpdVisit;
  position: number;
  avgWaitMinutes?: number;
}

// ---------- IPD ----------

export type IpdStatus = "ADMITTED" | "IN_TREATMENT" | "DISCHARGE_PLANNED" | "DISCHARGED";
export type AdmissionType = "EMERGENCY" | "REFERRAL" | "DIRECT";

export interface IpdAdmission {
  id: string;
  admissionNo: string;
  patientId: string;
  admittingDoctorId: string;
  wardId: string;
  bedId: string;
  admissionType: AdmissionType;
  referredFromVisitId: string | null;
  status: IpdStatus;
  admittedAt: string;
  dischargedAt: string | null;
  hospitalId: string | null;
  patient?: { id: string; name: string; uhid: string; phone: string };
  admittingDoctor?: { id: string; name: string; specialization: string };
  ward?: { id: string; name: string; wardType: string };
  bed?: { id: string; bedNumber: string; bedType: string };
  rounds?: IpdRound[];
  vitals?: IpdVital[];
  dischargeSummary?: DischargeSummary | null;
}

export interface IpdRound {
  id: string;
  admissionId: string;
  doctorId: string;
  notes: string;
  createdAt: string;
  doctor?: { id: string; name: string };
}

export interface IpdVital {
  id: string;
  admissionId: string;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  pulse: number | null;
  temperature: number | null;
  spo2: number | null;
  recordedBy: string | null;
  recordedAt: string;
}

export interface IpdTransfer {
  id: string;
  admissionId: string;
  fromBedId: string;
  toBedId: string;
  reason: string | null;
  transferredBy: string | null;
  createdAt: string;
}

export interface DischargeSummary {
  id: string;
  admissionId: string;
  diagnosis: string;
  treatmentSummary: string;
  followUpInstructions: string;
  signedBy: string;
  s3Key: string | null;
  createdAt: string;
}

export interface WardCensus {
  ward: Ward;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  admissions: IpdAdmission[];
}

// ---------- Wards & Beds ----------

export type WardType = "GENERAL" | "ICU" | "ICCU" | "PEDIATRIC" | "MATERNITY" | "ISOLATION";
export type BedStatus = "AVAILABLE" | "OCCUPIED" | "CLEANING" | "MAINTENANCE" | "RESERVED";
export type BedType = "GENERAL" | "ICU" | "ISOLATION";

export interface Ward {
  id: string;
  name: string;
  wardType: WardType;
  departmentId: string | null;
  floor: string;
  nursePatientRatio: string | null;
  isActive: boolean;
  hospitalId: string | null;
  createdAt: string;
  deletedAt: string | null;
  department?: { id: string; name: string } | null;
  beds?: Bed[];
  _count?: { beds: number };
}

export interface Bed {
  id: string;
  wardId: string;
  bedNumber: string;
  bedType: BedType;
  status: BedStatus;
  currentAdmissionId: string | null;
  createdAt: string;
  deletedAt: string | null;
  ward?: { id: string; name: string; floor: string };
}

export interface IpdWaitlist {
  id: string;
  patientId: string;
  requestedWardType: WardType;
  priority: "EMERGENCY" | "URGENT" | "ROUTINE";
  requestedAt: string;
  fulfilledAdmissionId: string | null;
  patient?: { id: string; name: string; uhid: string };
}

// ---------- Ambulance ----------

export type AmbulanceVehicleType = "BASIC" | "ICU" | "MORTUARY";
export type AmbulanceVehicleStatus = "AVAILABLE" | "ON_TRIP" | "MAINTENANCE";
export type AmbulanceRequestUrgency = "EMERGENCY" | "URGENT" | "ROUTINE";
export type AmbulanceRequestStatus = "PENDING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type AmbulanceTripStatus = "EN_ROUTE_TO_PICKUP" | "ARRIVED" | "TRANSPORTING" | "ARRIVED_HOSPITAL" | "COMPLETED";

export interface AmbulanceVehicle {
  id: string;
  registrationNo: string;
  type: AmbulanceVehicleType;
  status: AmbulanceVehicleStatus;
  driverId: string | null;
  hospitalId: string | null;
  createdAt: string;
  deletedAt: string | null;
  driver?: { id: string; name: string | null } | null;
}

export interface AmbulanceRequest {
  id: string;
  patientId: string | null;
  requestedBy: string | null;
  pickupAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropAddress: string | null;
  urgency: AmbulanceRequestUrgency;
  status: AmbulanceRequestStatus;
  hospitalId: string | null;
  createdAt: string;
  patient?: { id: string; name: string; uhid: string; phone: string } | null;
  trip?: AmbulanceTrip | null;
}

export interface AmbulanceTrip {
  id: string;
  requestId: string;
  vehicleId: string;
  driverId: string | null;
  status: AmbulanceTripStatus;
  startedAt: string;
  completedAt: string | null;
  vehicle?: { id: string; registrationNo: string; type: AmbulanceVehicleType } | null;
  driver?: { id: string; name: string | null } | null;
  /** Populated by GET /trips/mine and GET /trips/:id/track. */
  request?: {
    id: string;
    pickupAddress: string;
    dropAddress: string | null;
    patient?: { id: string; name: string; uhid: string; phone: string } | null;
  } | null;
}

// ---------- Clinical: Prescriptions ----------

export type PrescriptionStatus = "ACTIVE" | "DISPENSED" | "PARTIALLY_DISPENSED" | "EXPIRED" | "CANCELLED";
export type DrugRoute = "ORAL" | "IV" | "IM" | "TOPICAL" | "OTHER";
export type InteractionSeverity = "MILD" | "MODERATE" | "SEVERE";

export interface DrugMaster {
  id: string;
  name: string;
  genericName: string | null;
  category: string | null;
  isControlled: boolean;
  unit: string | null;
  createdAt: string;
}

export interface DrugInteraction {
  id: string;
  drugAId: string;
  drugBId: string;
  severity: InteractionSeverity;
  description: string | null;
  drugA?: { id: string; name: string };
  drugB?: { id: string; name: string };
}

export interface PrescriptionItem {
  id: string;
  prescriptionId: string;
  drugId: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  route: DrugRoute;
  instructions: string | null;
  drug?: { id: string; name: string; genericName: string | null; unit: string | null };
}

export interface Prescription {
  id: string;
  patientId: string;
  doctorId: string;
  opdVisitId: string | null;
  ipdAdmissionId: string | null;
  supersedesId: string | null;
  status: PrescriptionStatus;
  notes: string | null;
  createdAt: string;
  patient?: { id: string; name: string; uhid: string };
  doctor?: { id: string; name: string; specialization: string };
  items?: PrescriptionItem[];
}

export interface InteractionsCheckResult {
  conflicts: DrugInteraction[];
  safe: boolean;
}

// ---------- AI Prescriptions ----------

export type AiSuggestionStatus = "PENDING_REVIEW" | "ACCEPTED" | "EDITED_AND_ACCEPTED" | "REJECTED";

export interface AiPrescriptionSuggestion {
  id: string;
  patientId: string;
  doctorId: string;
  opdVisitId: string | null;
  diagnosisText: string;
  symptoms: string[];
  suggestedItems: unknown;
  overallConfidence: number | null;
  modelVersion: string | null;
  status: AiSuggestionStatus;
  resultingPrescriptionId: string | null;
  createdAt: string;
  patient?: { id: string; name: string; uhid: string };
}

// ---------- Laboratory ----------

export type LabOrderStatus =
  | "ORDERED" | "SAMPLE_COLLECTED" | "RESULTS_ENTERED" | "VERIFIED"
  | "REPORT_RELEASED" | "CANCELLED";

export interface LabTest {
  id: string;
  name: string;
  code: string;
  category: string | null;
  price: number | string;
  sampleType: string | null;
  turnaroundHours: number;
  createdAt: string;
  parameters?: LabTestParameter[];
}

export interface LabTestParameter {
  id: string;
  testId: string;
  name: string;
  unit: string | null;
  referenceRangeMin: number | null;
  referenceRangeMax: number | null;
  criticalLow: number | null;
  criticalHigh: number | null;
}

export interface LabResult {
  id: string;
  orderId: string;
  testParameterId: string;
  value: string;
  unit: string | null;
  isAbnormal: boolean;
  isCritical: boolean;
  enteredBy: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  testParameter?: LabTestParameter;
}

export interface LabOrder {
  id: string;
  patientId: string;
  doctorId: string;
  opdVisitId: string | null;
  ipdAdmissionId: string | null;
  status: LabOrderStatus;
  barcode: string;
  hospitalId: string | null;
  createdAt: string;
  patient?: { id: string; name: string; uhid: string };
  doctor?: { id: string; name: string };
  orderTests?: Array<{ id: string; test: LabTest }>;
  results?: LabResult[];
}

// ---------- Pharmacy ----------

export type DispenseStatus = "FULL" | "PARTIAL";

export interface PharmacyDispense {
  id: string;
  prescriptionId: string;
  dispensedBy: string | null;
  status: DispenseStatus;
  createdAt: string;
  prescription?: Prescription;
  items?: DispenseItem[];
}

export interface DispenseItem {
  id: string;
  dispenseId: string;
  prescriptionItemId: string;
  drugId: string;
  batchId: string | null;
  quantityDispensed: number;
  substitutedFromDrugId: string | null;
  substitutionReason: string | null;
  drug?: { id: string; name: string };
  batch?: { id: string; batchNo: string; expiryDate: string } | null;
  /** Populated on detail/list dispense responses (backend `substitutedFromDrug` / `returns`). */
  substitutedFromDrug?: { id: string; name: string } | null;
  returns?: Array<{ id: string; quantityReturned: number; reason: string; createdAt: string }>;
}

export interface PharmacyQueueItem {
  prescription: Prescription;
  position: number;
}

// ---------- Inventory ----------

export type InventoryItemCategory = "DRUG" | "CONSUMABLE" | "EQUIPMENT";
export type LedgerChangeType = "RECEIPT" | "DISPENSE" | "ADJUSTMENT" | "TRANSFER" | "WRITE_OFF";
export type PurchaseOrderStatus = "DRAFT" | "ORDERED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryItemCategory;
  unit: string | null;
  reorderPoint: number;
  reorderQuantity: number;
  createdAt: string;
  /** Populated on stock/alerts endpoints (e.g. GET /inventory/alerts). */
  stockLevel?: number;
  lowStock?: boolean;
  batches?: InventoryBatch[];
  _count?: { batches: number };
}

export interface InventoryBatch {
  id: string;
  itemId: string;
  batchNo: string;
  expiryDate: string;
  supplierId: string | null;
  receivedAt: string;
  unitCost: number | string;
  item?: { id: string; name: string };
  supplier?: { id: string; name: string } | null;
}

export interface StockLine {
  item: InventoryItem;
  totalQuantity: number;
  batchCount: number;
  nearestExpiry?: string;
  lowStock: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  contactInfo: unknown;
  isActive: boolean;
  createdAt: string;
}

export interface PurchaseOrderItem {
  id: string;
  poId: string;
  itemId: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number | string;
  item?: { id: string; name: string };
}

export interface PurchaseOrder {
  id: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  createdBy: string | null;
  hospitalId: string | null;
  createdAt: string;
  supplier?: { id: string; name: string };
  items?: PurchaseOrderItem[];
}

// ---------- Billing & Payments ----------

export type BillStatus = "DRAFT" | "PENDING_APPROVAL" | "FINALIZED" | "PAID" | "PARTIALLY_PAID" | "CANCELLED";
export type BillItemSource = "CONSULTATION" | "LAB" | "PHARMACY" | "ROOM_CHARGE" | "AMBULANCE" | "MISC";
export type DiscountStatus = "PENDING" | "APPROVED" | "REJECTED";
export type PaymentMode = "CASH" | "CARD" | "UPI" | "NET_BANKING" | "INSURANCE" | "WALLET";
export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";

export interface BillItem {
  id: string;
  billId: string;
  sourceModule: BillItemSource;
  sourceReferenceId: string | null;
  description: string;
  quantity: number;
  unitPrice: number | string;
  amount: number | string;
}

export interface BillDiscount {
  id: string;
  billId: string;
  percentage: number | string;
  reason: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  status: DiscountStatus;
  createdAt: string;
}

export interface Bill {
  id: string;
  invoiceNo: string | null;
  patientId: string;
  opdVisitId: string | null;
  ipdAdmissionId: string | null;
  ambulanceTripId: string | null;
  status: BillStatus;
  subtotal: number | string;
  discountAmount: number | string;
  taxAmount: number | string;
  insuranceCovered: number | string;
  totalAmount: number | string;
  finalizedAt: string | null;
  hospitalId: string | null;
  createdAt: string;
  patient?: { id: string; name: string; uhid: string; phone: string };
  items?: BillItem[];
  discounts?: BillDiscount[];
  payments?: Payment[];
}

export interface InsurancePolicy {
  id: string;
  patientId: string;
  providerName: string;
  policyNo: string;
  coverageLimit: number | string;
  validTill: string;
  patient?: { id: string; name: string; uhid: string };
}

export interface CreditNote {
  id: string;
  originalBillId: string;
  amount: number | string;
  reason: string;
  issuedBy: string | null;
  createdAt: string;
}

export interface Payment {
  id: string;
  billId: string;
  patientId: string;
  amount: number | string;
  mode: PaymentMode;
  status: PaymentStatus;
  gatewayTransactionId: string | null;
  collectedBy: string | null;
  createdAt: string;
  bill?: { id: string; invoiceNo: string | null; status: BillStatus };
  patient?: { id: string; name: string; uhid: string };
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: number | string;
  reason: string;
  approvedBy: string | null;
  status: "PENDING" | "APPROVED" | "PROCESSED" | "REJECTED";
  createdAt: string;
}

export interface ReconciliationSummary {
  expectedAmount: number;
  countedAmount: number;
  variance: number;
  date: string;
}

// ---------- Reports ----------

export type ReportJobStatus = "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface ReportTemplate {
  id: string;
  name: string;
  module: string;
  description: string | null;
  createdAt: string;
}

export interface ReportJob {
  id: string;
  templateId: string;
  requestedBy: string | null;
  params: unknown;
  status: ReportJobStatus;
  s3Key: string | null;
  createdAt: string;
  completedAt: string | null;
  template?: { id: string; name: string };
}

export interface ReportSchedule {
  id: string;
  templateId: string;
  params: unknown;
  cronExpression: string;
  recipients: string[];
  createdBy: string | null;
  isActive: boolean;
  createdAt: string;
  template?: { id: string; name: string };
}

// ---------- Chat ----------

export type ConversationType = "DIRECT" | "GROUP";

export interface ChatConversation {
  id: string;
  type: ConversationType;
  title: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  createdBy: string | null;
  createdAt: string;
  participants?: ChatParticipant[];
  lastMessage?: ChatMessage | null;
}

export interface ChatParticipant {
  id: string;
  conversationId: string;
  userId: string;
  joinedAt: string;
  lastReadMessageId: string | null;
  user?: { id: string; name: string | null; email: string; image: string | null; role: string };
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: "TEXT" | "ATTACHMENT";
  attachments: unknown;
  editedAt: string | null;
  createdAt: string;
  sender?: { id: string; name: string | null; image: string | null; role?: string };
}

export type PatientChatStatus = "OPEN" | "ANSWERED" | "CLOSED" | "ESCALATED";

export interface PatientChatConversation {
  id: string;
  patientId: string;
  staffId: string | null;
  departmentId: string | null;
  status: PatientChatStatus;
  createdAt: string;
  lastMessageAt: string | null;
  patient?: { id: string; name: string; uhid: string; phone: string };
  department?: { id: string; name: string } | null;
}

export type ChatbotUserType = "PATIENT" | "STAFF";
export type ChatbotSessionStatus = "ACTIVE" | "ENDED";

export interface ChatbotSession {
  id: string;
  userId: string;
  userType: ChatbotUserType;
  status: ChatbotSessionStatus;
  startedAt: string;
  endedAt: string | null;
}

export interface ChatbotMessage {
  id: string;
  sessionId: string;
  role: "USER" | "ASSISTANT";
  content: string;
  createdAt: string;
}

// ---------- Platform ----------

export type UploadContext =
  | "PATIENT_DOC" | "LAB_REPORT" | "CHAT_ATTACHMENT" | "AVATAR"
  | "PRESCRIPTION_PDF" | "DISCHARGE_SUMMARY" | "OTHER";
export type UploadStatus = "PENDING" | "UPLOADED" | "SCANNED_CLEAN" | "SCANNED_INFECTED" | "FAILED";

export interface FileUpload {
  id: string;
  uploadedBy: string;
  uploadContext: UploadContext;
  s3Key: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  status: UploadStatus;
  createdAt: string;
}

export interface PresignResponse {
  fileId: string;
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
  /** Signed direct-upload params (Cloudinary) — present when real storage is enabled. */
  uploadParams?: Record<string, string | number>;
}

export interface HospitalProfile {
  id: string;
  name: string;
  address: unknown;
  registrationNo: string | null;
  logoUrl: string | null;
  taxId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessRule {
  id: string;
  key: string;
  value: unknown;
  updatedBy: string | null;
  updatedAt: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  isEnabled: boolean;
  description: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export type IntegrationProvider = "SMS" | "EMAIL" | "PAYMENT_GATEWAY" | "AI_PROVIDER";

export interface IntegrationCredential {
  id: string;
  provider: IntegrationProvider;
  updatedBy: string | null;
  updatedAt: string;
}

// ---------- Audit ----------

export interface AuditLog {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditAnomaly {
  id: string;
  actorEmail: string | null;
  action: string;
  entityType: string;
  reason: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  createdAt: string;
}

// ---------- Notifications ----------

export interface NotificationTemplate {
  id: string;
  key: string;
  channel: "SMS" | "EMAIL" | "PUSH" | "IN_APP";
  subject: string | null;
  bodyTemplate: string;
  isCritical: boolean;
  createdAt: string;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  category: string;
  channel: "SMS" | "EMAIL" | "PUSH" | "IN_APP";
  isEnabled: boolean;
}
