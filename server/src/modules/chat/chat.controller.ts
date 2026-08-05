import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import { parsePagination, buildPaginationMeta } from "../../core/utils/pagination.js";
import { AppError } from "../../core/errors/AppError.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  createConversation,
  renameConversation,
  addConversationMembers,
  leaveConversation,
  deleteConversation,
  listUserConversations,
  getMessages,
  sendMessage,
  editMessage,
  markConversationRead,
  listChatUsers,
  findConversationBySet,
  listConversationStatusForUsers,
} from "./chat.service.js";

export const listChatUsersHandler = catchAsync(async (req: Request, res: Response) => {
  const users = await listChatUsers({
    search: req.query.search as string | undefined,
    role: req.query.role as string | undefined,
  });
  sendSuccess(res, users);
});

export const lookupConversationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const withIds =
    (req.query.participants as string | undefined)
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean) ?? [];
  // Exact member set = the actor + the selected users; mirrors createConversation reuse.
  const conversation = await findConversationBySet([actor.id, ...withIds]);
  sendSuccess(res, { conversation, reused: !!conversation });
});

export const conversationStatusHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const ids =
    (req.query.ids as string | undefined)?.split(",").map((id) => id.trim()).filter(Boolean) ?? [];
  const statuses = await listConversationStatusForUsers(actor.id, ids);
  sendSuccess(res, statuses);
});

export const createConversationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const { conversation, reused } = await createConversation({ ...req.body, createdBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CONVERSATION_CREATED",
      module: "chat",
      entityType: "ChatConversation",
      entityId: conversation.id,
      after: { reused },
    },
    req,
  );
  // 201 = brand-new thread, 200 = resumed an existing one (same member set).
  sendSuccess(res, { conversation, reused }, reused ? 200 : 201);
});

export const renameConversationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const conversation = await renameConversation(req.params.id, actor.id, req.body.title ?? "");
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CONVERSATION_RENAMED",
      module: "chat",
      entityType: "ChatConversation",
      entityId: conversation.id,
      after: { title: conversation.title },
    },
    req,
  );
  sendSuccess(res, conversation);
});

export const addMembersHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const conversation = await addConversationMembers(req.params.id, actor.id, req.body.userIds ?? []);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CONVERSATION_MEMBERS_ADDED",
      module: "chat",
      entityType: "ChatConversation",
      entityId: conversation.id,
      after: { memberCount: conversation.participants.length },
    },
    req,
  );
  sendSuccess(res, conversation);
});

export const leaveConversationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await leaveConversation(req.params.id, actor.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CONVERSATION_LEFT",
      module: "chat",
      entityType: "ChatConversation",
      entityId: req.params.id,
      after: result,
    },
    req,
  );
  sendSuccess(res, result);
});

export const deleteConversationHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await deleteConversation(req.params.id, actor.id);
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "CONVERSATION_DELETED",
      module: "chat",
      entityType: "ChatConversation",
      entityId: req.params.id,
      after: result,
    },
    req,
  );
  sendSuccess(res, result);
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
