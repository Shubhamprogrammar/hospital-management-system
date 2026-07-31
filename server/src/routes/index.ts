import { Router } from "express";

const router = Router();

// Health check
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    message: "Hospital Management System API is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Module routers
import { authRoutes } from "../modules/auth/auth.routes.js";
import { usersRoutes } from "../modules/users/users.routes.js";
import { rolesRoutes } from "../modules/roles/roles.routes.js";
import { departmentsRoutes } from "../modules/departments/departments.routes.js";
import { doctorsRoutes } from "../modules/doctors/doctors.routes.js";
import { patientsRoutes } from "../modules/patients/patients.routes.js";
import { appointmentsRoutes } from "../modules/appointments/appointments.routes.js";
import { opdRoutes } from "../modules/opd/opd.routes.js";
import { ipdRoutes } from "../modules/ipd/ipd.routes.js";
import { wardsRoutes } from "../modules/wards/wards.routes.js";
import { bedsRoutes } from "../modules/beds/beds.routes.js";
import { ambulanceRoutes } from "../modules/ambulance/ambulance.routes.js";
import { prescriptionsRoutes } from "../modules/prescriptions/prescriptions.routes.js";
import { aiPrescriptionsRoutes } from "../modules/aiPrescriptions/aiPrescriptions.routes.js";
import { laboratoryRoutes } from "../modules/laboratory/laboratory.routes.js";
import { pharmacyRoutes } from "../modules/pharmacy/pharmacy.routes.js";
import { inventoryRoutes } from "../modules/inventory/inventory.routes.js";
import { billingRoutes } from "../modules/billing/billing.routes.js";
import { paymentsRoutes } from "../modules/payments/payments.routes.js";
import { reportsRoutes } from "../modules/reports/reports.routes.js";
import { notificationsRoutes } from "../modules/notifications/notifications.routes.js";
import { chatRoutes } from "../modules/chat/chat.routes.js";
import { patientChatRoutes } from "../modules/patientChat/patientChat.routes.js";
import { chatbotRoutes } from "../modules/chatbot/chatbot.routes.js";
import { uploadsRoutes } from "../modules/uploads/uploads.routes.js";
import { auditRoutes } from "../modules/audit/audit.routes.js";
import { settingsRoutes } from "../modules/settings/settings.routes.js";

// Versioned API routes under /api/v1
router.use("/v1/auth", authRoutes);
router.use("/v1/users", usersRoutes);
router.use("/v1/roles", rolesRoutes);
router.use("/v1/departments", departmentsRoutes);
router.use("/v1/doctors", doctorsRoutes);
router.use("/v1/patients", patientsRoutes);
router.use("/v1/appointments", appointmentsRoutes);
router.use("/v1/opd", opdRoutes);
router.use("/v1/ipd", ipdRoutes);
router.use("/v1/wards", wardsRoutes);
router.use("/v1/beds", bedsRoutes);
router.use("/v1/ambulance", ambulanceRoutes);
router.use("/v1/prescriptions", prescriptionsRoutes);
router.use("/v1/ai-prescriptions", aiPrescriptionsRoutes);
router.use("/v1/lab", laboratoryRoutes);
router.use("/v1/pharmacy", pharmacyRoutes);
router.use("/v1/inventory", inventoryRoutes);
router.use("/v1/billing", billingRoutes);
router.use("/v1/payments", paymentsRoutes);
router.use("/v1/reports", reportsRoutes);
router.use("/v1/notifications", notificationsRoutes);
router.use("/v1/chat", chatRoutes);
router.use("/v1/patient-chat", patientChatRoutes);
router.use("/v1/chatbot", chatbotRoutes);
router.use("/v1/uploads", uploadsRoutes);
router.use("/v1/audit", auditRoutes);
router.use("/v1/settings", settingsRoutes);

export { router };
