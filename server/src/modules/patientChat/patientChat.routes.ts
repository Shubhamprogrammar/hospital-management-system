import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  startConversationHandler,
  listConversationsHandler,
  getMessagesHandler,
  sendMessageHandler,
  escalateHandler,
  closeConversationHandler,
} from "./patientChat.controller.js";

const patientChatRoutes = Router();

patientChatRoutes.use(authMiddleware);

patientChatRoutes.post("/conversations", authorize("SUPER_ADMIN", "PATIENT"), startConversationHandler);
patientChatRoutes.get("/conversations", listConversationsHandler);
patientChatRoutes.get("/conversations/:id/messages", getMessagesHandler);
patientChatRoutes.post(
  "/conversations/:id/messages",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "DOCTOR", "RECEPTIONIST", "PATIENT"),
  sendMessageHandler,
);
patientChatRoutes.post("/conversations/:id/escalate", escalateHandler);
patientChatRoutes.post("/conversations/:id/close", closeConversationHandler);

export { patientChatRoutes };
