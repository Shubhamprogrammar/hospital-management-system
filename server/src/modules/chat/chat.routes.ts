import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  createConversationHandler,
  listConversationsHandler,
  getMessagesHandler,
  sendMessageHandler,
  editMessageHandler,
  markReadHandler,
} from "./chat.controller.js";

const chatRoutes = Router();

chatRoutes.use(authMiddleware);

// Internal staff only (FRD 25.3 — not exposed to PATIENT)
chatRoutes.post(
  "/conversations",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "NURSE", "RECEPTIONIST", "LAB_TECHNICIAN", "PHARMACIST", "BILLING_STAFF", "INVENTORY_MANAGER", "AMBULANCE_DISPATCHER", "AMBULANCE_DRIVER", "IT_SUPPORT"),
  createConversationHandler,
);
chatRoutes.get("/conversations", listConversationsHandler);
chatRoutes.get("/conversations/:id/messages", getMessagesHandler);
chatRoutes.post("/conversations/:id/messages", sendMessageHandler);
chatRoutes.patch("/messages/:id", editMessageHandler);
chatRoutes.post("/conversations/:id/read", markReadHandler);

export { chatRoutes };
