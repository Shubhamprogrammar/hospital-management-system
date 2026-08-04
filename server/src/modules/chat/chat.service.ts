import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { Message } from "./models/message.model.js";
import { emitToRoom, emitToUser } from "../../core/utils/socket.js";
import type { Pagination } from "../../core/utils/pagination.js";

export async function createConversation(data: {
  type?: "DIRECT" | "GROUP";
  title?: string;
  participantIds: string[];
  linkedEntityType?: string;
  linkedEntityId?: string;
  createdBy?: string;
}) {
  const participantIds = [...new Set([...(data.participantIds ?? []), ...(data.createdBy ? [data.createdBy] : [])])];
  if (participantIds.length < 2) {
    throw new AppError("A conversation requires at least 2 participants", 400, undefined, "VALIDATION_ERROR");
  }

  const conversation = await prisma.chatConversation.create({
    data: {
      type: data.type ?? "DIRECT",
      title: data.title,
      linkedEntityType: data.linkedEntityType,
      linkedEntityId: data.linkedEntityId,
      createdBy: data.createdBy,
      participants: {
        create: participantIds.map((userId) => ({ userId })),
      },
    },
    include: { participants: { include: { user: { select: { id: true, name: true } } } } },
  });

  return conversation;
}

export async function listUserConversations(userId: string) {
  const conversations = await prisma.chatConversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
      _count: { select: { participants: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // Attach last message summary from Mongo — single aggregation instead of a
  // per-conversation query (was N+1).
  const conversationIds = conversations.map((c) => c.id);
  const lastMessages = conversationIds.length
    ? await Message.aggregate<{
        conversationId: string;
        _id: string;
        body: string;
        createdAt: Date;
        senderId: string;
      }>([
        { $match: { conversationId: { $in: conversationIds } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$conversationId", doc: { $first: "$$ROOT" } } },
        {
          $project: {
            conversationId: "$_id",
            _id: "$doc._id",
            body: "$doc.body",
            createdAt: "$doc.createdAt",
            senderId: "$doc.senderId",
          },
        },
      ])
    : [];
  const lastByConversation = new Map(lastMessages.map((m) => [m.conversationId, m]));

  const withLast = conversations.map((c) => ({
    ...c,
    lastMessage: lastByConversation.get(c.id) ?? null,
  }));

  return withLast;
}

export async function getMessages(conversationId: string, userId: string, pagination: Pagination) {
  // BR-01: participant check
  const participant = await prisma.chatParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) {
    throw new AppError(
      "You are not a participant of this conversation",
      403,
      undefined,
      "ERR_NOT_PARTICIPANT",
    );
  }

  const messages = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean();

  const total = await Message.countDocuments({ conversationId });

  return { messages: messages.reverse(), total, cursor: null };
}

export async function sendMessage(
  conversationId: string,
  data: { senderId: string; body: string; attachments?: { s3Key: string; type: string; size: number }[] },
) {
  const participant = await prisma.chatParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: data.senderId } },
  });
  if (!participant) {
    throw new AppError("You are not a participant of this conversation", 403, undefined, "ERR_NOT_PARTICIPANT");
  }
  if (!data.body && !data.attachments?.length) {
    throw new AppError("Message body is required or must contain an attachment", 400, undefined, "VALIDATION_ERROR");
  }

  const message = await Message.create({
    conversationId,
    senderId: data.senderId,
    body: data.body,
    attachments: data.attachments ?? [],
  });

  // Broadcast to conversation room + notify offline participants
  emitToRoom(`conversation:${conversationId}`, "chat:message-new", message);

  const participants = await prisma.chatParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  for (const p of participants) {
    if (p.userId !== data.senderId) {
      emitToUser(p.userId, "chat:message-new", message);
    }
  }

  return message;
}

export async function editMessage(
  messageId: string,
  data: { userId: string; body?: string; deleteForEveryone?: boolean },
) {
  const message = await Message.findById(messageId);
  if (!message) throw new AppError("Message not found", 404, undefined, "NOT_FOUND");

  if (message.senderId !== data.userId) {
    throw new AppError("You can only edit your own messages", 403, undefined, "ERR_NOT_PARTICIPANT");
  }

  // Edit window: 5 min for delete-for-everyone (FRD 25.5 BR-02)
  const ageMs = Date.now() - new Date(message.createdAt).getTime();
  if (data.deleteForEveryone && ageMs > 5 * 60 * 1000) {
    throw new AppError("Delete-for-everyone window (5 min) expired", 400, undefined, "ERR_EDIT_WINDOW_EXPIRED");
  }

  if (data.deleteForEveryone) {
    message.body = "[Message deleted]";
    message.deletedForEveryoneAt = new Date();
  } else if (data.body) {
    message.body = data.body;
    message.editedAt = new Date();
  }

  await message.save();
  emitToRoom(`conversation:${message.conversationId}`, "chat:message-edited", message);
  return message;
}

export async function markConversationRead(conversationId: string, userId: string, messageId: string) {
  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadMessageId: messageId },
  });
  return { conversationId, lastReadMessageId: messageId };
}
