import { api } from "./api";

export const patientService = {
  list: () => api<unknown[]>("/patients"),
  get: (id: number) => api<unknown>(`/patients/${id}`),
};
