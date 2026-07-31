import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  createConversation,
  listUserConversations,
  getMessages,
  sendMessage,
  editMessage,
  markConversationRead,
} from "./chat.service.js";

export const createConversationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const conversation = await createConversation({ ...req.body, createdBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CONVERSATION_CREATED",
      module: "chat",
      entityType: "ChatConversation",
      entityId: conversation.id,
    },
    req,
  );
  sendSuccess(res, conversation, 201);
});

export const listConversationsHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const conversations = await listUserConversations(actor.id);
  sendSuccess(res, conversations);
});

export const getMessagesHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const pagination = parsePagination(req.query.page, req.query.limit);
  const { messages, total } = await getMessages(req.params.id, actor.id, pagination);
  sendPaginated(res, messages, buildPaginationMeta(total, pagination));
});

export const sendMessageHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const message = await sendMessage(req.params.id, {
    senderId: actor.id,
    body: req.body.body,
    attachments: req.body.attachments,
  });
  sendSuccess(res, message, 201);
});

export const editMessageHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const message = await editMessage(req.params.id, {
    userId: actor.id,
    body: req.body.body,
    deleteForEveryone: req.body.deleteForEveryone,
  });
  sendSuccess(res, message);
});

export const markReadHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await markConversationRead(req.params.id, actor.id, req.body.messageId);
  sendSuccess(res, result);
});
