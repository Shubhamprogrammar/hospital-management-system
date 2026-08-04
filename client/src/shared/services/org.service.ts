import { api } from "@/shared/services/api";
import type { Department, Doctor, DoctorAvailability, DoctorLeave, TimeSlot } from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Departments ----------

export interface CreateDepartmentInput {
  name: string;
  code: string;
  description?: string;
  hodUserId?: string;
}

export function listDepartments(params: PaginationParams & { search?: string; isActive?: boolean } = {}) {
  return api.list<Department>("/departments", params);
}

export function getDepartment(id: string) {
  return api.get<Department>(`/departments/${id}`);
}

export function createDepartment(input: CreateDepartmentInput) {
  return api.post<Department>("/departments", input);
}

export function updateDepartment(id: string, input: Partial<CreateDepartmentInput>) {
  return api.patch<Department>(`/departments/${id}`, input);
}

export function deactivateDepartment(id: string) {
  return api.delete<{ id: string }>(`/departments/${id}`);
}

export function listDepartmentDoctors(departmentId: string) {
  return api.get<Doctor[]>(`/departments/${departmentId}/doctors`);
}

// ---------- Doctors ----------

export interface CreateDoctorInput {
  userId: string;
  departmentId: string;
  registrationNo: string;
  specialization: string;
  qualifications?: unknown;
  consultationFee?: number;
  experienceYears?: number;
  bio?: string;
}

export interface AvailabilityInput {
  weekday: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes?: number;
  clinicRoom?: string;
}

export interface LeaveInput {
  startDate: string;
  endDate: string;
  reason?: string;
}

export function listDoctors(params: PaginationParams & { search?: string; departmentId?: string; specialization?: string } = {}) {
  return api.list<Doctor>("/doctors", params);
}

export function getDoctor(id: string) {
  return api.get<Doctor>(`/doctors/${id}`);
}

export function createDoctor(input: CreateDoctorInput) {
  return api.post<Doctor>("/doctors", input);
}

export function updateDoctor(id: string, input: Partial<Omit<CreateDoctorInput, "userId">> & { isActive?: boolean }) {
  return api.patch<Doctor>(`/doctors/${id}`, input);
}

export function deactivateDoctor(id: string) {
  return api.delete<{ id: string }>(`/doctors/${id}`);
}

export function setDoctorAvailability(doctorId: string, input: AvailabilityInput) {
  return api.post<DoctorAvailability>(`/doctors/${doctorId}/availability`, input);
}

export function markDoctorLeave(doctorId: string, input: LeaveInput) {
  return api.post<DoctorLeave>(`/doctors/${doctorId}/leave`, input);
}

export function getDoctorSlots(doctorId: string, query: { date: string }) {
  return api.get<TimeSlot[]>(`/doctors/${doctorId}/slots`, query);
}
