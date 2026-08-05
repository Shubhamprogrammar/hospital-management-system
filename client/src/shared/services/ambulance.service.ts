import { api } from "@/shared/services/api";
import type {
  AmbulanceRequest,
  AmbulanceRequestStatus,
  AmbulanceRequestUrgency,
  AmbulanceTrip,
  AmbulanceVehicle,
  AmbulanceVehicleStatus,
  AmbulanceVehicleType,
} from "@/shared/types/domain";
import type { PaginationParams } from "@/shared/types/api";

// ---------- Vehicles ----------

export interface AddVehicleInput {
  registrationNo: string;
  type: AmbulanceVehicleType;
  driverId?: string;
}

export function addVehicle(input: AddVehicleInput) {
  return api.post<AmbulanceVehicle>("/ambulance/vehicles", input);
}

export function listVehicles(params: PaginationParams & { status?: AmbulanceVehicleStatus } = {}) {
  return api.list<AmbulanceVehicle>("/ambulance/vehicles", params);
}

// ---------- Requests ----------

export interface RaiseRequestInput {
  patientId?: string;
  pickupAddress: string;
  pickupLat?: number;
  pickupLng?: number;
  dropAddress?: string;
  urgency: AmbulanceRequestUrgency;
}

export function raiseRequest(input: RaiseRequestInput) {
  return api.post<AmbulanceRequest>("/ambulance/requests", input);
}

export function listRequests(params: PaginationParams & { status?: AmbulanceRequestStatus; urgency?: AmbulanceRequestUrgency } = {}) {
  return api.list<AmbulanceRequest>("/ambulance/requests", params);
}

export function assignVehicle(requestId: string, input: { vehicleId: string; driverId?: string }) {
  return api.patch<AmbulanceRequest>(`/ambulance/requests/${requestId}/assign`, input);
}

// ---------- Trips ----------

export function updateTripStatus(tripId: string, input: { status: AmbulanceTrip["status"] }) {
  return api.patch<AmbulanceTrip>(`/ambulance/trips/${tripId}/status`, input);
}

export function trackTrip(tripId: string) {
  return api.get<AmbulanceTrip>(`/ambulance/trips/${tripId}/track`);
}

export function listMyTrips() {
  return api.get<AmbulanceTrip[]>("/ambulance/trips/mine");
}
