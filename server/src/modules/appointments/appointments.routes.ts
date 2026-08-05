import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  bookAppointmentHandler,
  listAppointmentsHandler,
  getAppointmentHandler,
  rescheduleAppointmentHandler,
  cancelAppointmentHandler,
  checkInAppointmentHandler,
  getQueueHandler,
} from "./appointments.controller.js";

const appointmentsRoutes = Router();

appointmentsRoutes.use(authMiddleware);

appointmentsRoutes.post(
  "/",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST", "PATIENT"),
  bookAppointmentHandler,
);
appointmentsRoutes.get("/", listAppointmentsHandler);
appointmentsRoutes.get("/queue", getQueueHandler);
appointmentsRoutes.get("/:id", getAppointmentHandler);
appointmentsRoutes.patch(
  "/:id/reschedule",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST", "PATIENT"),
  rescheduleAppointmentHandler,
);
appointmentsRoutes.patch(
  "/:id/cancel",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST", "PATIENT"),
  cancelAppointmentHandler,
);
appointmentsRoutes.post(
  "/:id/check-in",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "RECEPTIONIST"),
  checkInAppointmentHandler,
);

export { appointmentsRoutes };
