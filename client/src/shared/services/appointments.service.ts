import { api } from "@/shared/services/api";
import type {
  Appointment,
  AppointmentMode,
  AppointmentStatus,
  OpdDiagnosis,
  OpdQueueItem,
  OpdVisit,
  OpdVital,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Appointments ----------

export interface BookAppointmentInput {
  patientId: string;
  doctorId: string;
  departmentId: string;
  appointmentDate: string;
  slotStartTime: string;
  slotEndTime: string;
  mode: AppointmentMode;
  reason?: string;
}

export function bookAppointment(input: BookAppointmentInput) {
  return api.post<Appointment>("/appointments", input);
}

export function listAppointments(
  params: PaginationParams & {
    status?: AppointmentStatus;
    doctorId?: string;
    departmentId?: string;
    date?: string;
    search?: string;
  } = {},
) {
  return api.list<Appointment>("/appointments", params);
}

export function getAppointment(id: string) {
  return api.get<Appointment>(`/appointments/${id}`);
}

export function rescheduleAppointment(id: string, input: { appointmentDate: string; slotStartTime: string; slotEndTime: string }) {
  return api.patch<Appointment>(`/appointments/${id}/reschedule`, input);
}

export function cancelAppointment(id: string, input?: { reason?: string }) {
  return api.patch<Appointment>(`/appointments/${id}/cancel`, input);
}

export function checkInAppointment(id: string) {
  return api.post<Appointment>(`/appointments/${id}/check-in`);
}

export function getAppointmentQueue(query: { departmentId?: string; doctorId?: string }) {
  return api.get<OpdQueueItem[]>("/appointments/queue", query);
}

// ---------- OPD ----------

export interface VitalsInput {
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  temperature?: number;
  spo2?: number;
  weight?: number;
  height?: number;
}

export function getOpdQueue(query: { departmentId?: string; doctorId?: string; date?: string } = {}) {
  return api.get<OpdQueueItem[]>("/opd/queue", query);
}

export function recordVitals(appointmentId: string, input: VitalsInput) {
  return api.post<OpdVital>(`/opd/visits/${appointmentId}/vitals`, input);
}

export function getOpdVisit(id: string) {
  return api.get<OpdVisit>(`/opd/visits/${id}`);
}

export function startConsultation(id: string) {
  return api.patch<OpdVisit>(`/opd/visits/${id}/start-consultation`);
}

export function saveDiagnosis(id: string, input: { icd10Code: string; description?: string; notes?: string }) {
  return api.patch<OpdDiagnosis>(`/opd/visits/${id}/diagnosis`, input);
}

export function closeOpdVisit(id: string) {
  return api.patch<OpdVisit>(`/opd/visits/${id}/close`);
}

export function referToIpd(id: string, input?: { reason?: string; wardType?: string }) {
  return api.post<{ admissionId: string }>(`/opd/visits/${id}/refer-ipd`, input);
}
