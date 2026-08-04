import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import { ROLES, type Role } from "../../config/auth.js";
import {
  createConversationHandler,
  renameConversationHandler,
  addMembersHandler,
  leaveConversationHandler,
  deleteConversationHandler,
  listConversationsHandler,
  getMessagesHandler,
  sendMessageHandler,
  editMessageHandler,
  markReadHandler,
  listChatUsersHandler,
  lookupConversationHandler,
  conversationStatusHandler,
} from "./chat.controller.js";

/**
 * Staff roles allowed to use internal chat — mirrors the frontend
 * STAFF_CHAT_ROLES in client/src/shared/components/layout/nav-items.ts
 * (FRD 25.3 — not exposed to PATIENT).
 */
const STAFF_CHAT_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.HOSPITAL_ADMIN,
  ROLES.DOCTOR,
  ROLES.NURSE,
  ROLES.RECEPTIONIST,
  ROLES.LAB_TECHNICIAN,
  ROLES.PHARMACIST,
  ROLES.BILLING_STAFF,
  ROLES.INVENTORY_MANAGER,
  ROLES.AMBULANCE_DISPATCHER,
  ROLES.AMBULANCE_DRIVER,
  ROLES.WARD_BOY,
  ROLES.IT_SUPPORT,
];

const chatRoutes = Router();

chatRoutes.use(authMiddleware);

// Internal staff only (FRD 25.3 — not exposed to PATIENT)
chatRoutes.post(
  "/conversations",
  authorize(...STAFF_CHAT_ROLES),
  createConversationHandler,
);
// Staff contacts for the "New conversation" picker — available to every staff
// role, not just admins (GET /users is admin-only).
chatRoutes.get(
  "/users",
  authorize(...STAFF_CHAT_ROLES),
  listChatUsersHandler,
);
// Picker hint: does this exact member set already have a thread?
chatRoutes.get(
  "/conversations/lookup",
  authorize(...STAFF_CHAT_ROLES),
  lookupConversationHandler,
);
// Picker hint: per-user 1:1 thread status for the selected people.
chatRoutes.get(
  "/thread-status",
  authorize(...STAFF_CHAT_ROLES),
  conversationStatusHandler,
);
chatRoutes.get("/conversations", listConversationsHandler);
chatRoutes.get("/conversations/:id/messages", getMessagesHandler);
chatRoutes.post("/conversations/:id/messages", sendMessageHandler);
chatRoutes.patch("/messages/:id", editMessageHandler);
chatRoutes.post("/conversations/:id/read", markReadHandler);
// Rename a group conversation (participant-only, GROUP type).
chatRoutes.patch("/conversations/:id", renameConversationHandler);
// Add members to a group conversation.
chatRoutes.post("/conversations/:id/members", addMembersHandler);
// Leave a group conversation.
chatRoutes.post("/conversations/:id/leave", leaveConversationHandler);
// Delete a group conversation for everyone.
chatRoutes.delete("/conversations/:id", deleteConversationHandler);

export { chatRoutes };
