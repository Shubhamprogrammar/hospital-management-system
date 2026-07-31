import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  startConversation,
  listConversations,
  getMessages,
  sendMessage,
  escalateConversation,
  closeConversation,
} from "./patientChat.service.js";

export const startConversationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const conversation = await startConversation({ ...req.body, patientUserId: actor.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CONVERSATION_STARTED",
      module: "patientChat",
      entityType: "PatientChatConversation",
      entityId: conversation.id,
    },
    req,
  );
  sendSuccess(res, conversation, 201);
});

export const listConversationsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const conversations = await listConversations(actor);
  sendSuccess(res, conversations);
});

export const getMessagesHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const messages = await getMessages(req.params.id, actor);
  sendSuccess(res, messages);
});

export const sendMessageHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const message = await sendMessage(req.params.id, {
    senderId: actor.id,
    senderRole: actor.role === "PATIENT" ? "PATIENT" : "STAFF",
    body: req.body.body,
  });
  sendSuccess(res, message, 201);
});

export const escalateHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const conversation = await escalateConversation(req.params.id, req.body);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "ESCALATED",
      module: "patientChat",
      entityType: "PatientChatConversation",
      entityId: req.params.id,
      after: { escalateTo: req.body.escalateTo },
    },
    req,
  );
  sendSuccess(res, conversation);
});

export const closeConversationHandler = catchAsync(async (req: Request, res: Response) => {
  const conversation = await closeConversation(req.params.id);
  sendSuccess(res, conversation);
});
