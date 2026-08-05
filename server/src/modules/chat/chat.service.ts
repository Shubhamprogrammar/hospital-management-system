import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { Message } from "./models/message.model.js";
import { emitToRoom, emitToUser } from "../../core/utils/socket.js";
import type { Pagination } from "../../core/utils/pagination.js";

/** Deterministic key for a participant set — sorted user ids joined by ":". */
function makeParticipantKey(userIds: string[]): string {
  return [...new Set(userIds)].sort().join(":");
}

/** Prisma unique-constraint violation (P2002). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

/** Lightweight staff user card used for chat contacts & sender previews. */
interface ChatUserSummary {
  id: string;
  name: string | null;
  image: string | null;
  role: string;
}

/** API-facing shape of a staff chat message — maps Mongo `_id`/`body` to `id`/`content`. */
interface ChatMessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: "TEXT" | "ATTACHMENT";
  attachments: { s3Key: string; type: string; size: number }[];
  editedAt: Date | null;
  deletedForEveryoneAt: Date | null;
  createdAt: Date;
  sender?: ChatUserSummary;
}

/** Structural subset of the Mongo Message document (also covers .lean() output). */
interface MessageDoc {
  _id: unknown;
  conversationId: string;
  senderId: string;
  body: string;
  attachments?: { s3Key: string; type: string; size: number }[];
  editedAt?: Date;
  deletedForEveryoneAt?: Date;
  createdAt: Date;
}

function toMessageDto(doc: MessageDoc, senders: Map<string, ChatUserSummary>): ChatMessageDto {
  return {
    id: String(doc._id),
    conversationId: doc.conversationId,
    senderId: doc.senderId,
    content: doc.body ?? "",
    messageType: doc.attachments?.length ? "ATTACHMENT" : "TEXT",
    attachments: doc.attachments ?? [],
    editedAt: doc.editedAt ?? null,
    deletedForEveryoneAt: doc.deletedForEveryoneAt ?? null,
    createdAt: doc.createdAt,
    sender: senders.get(doc.senderId),
  };
}

async function loadSenders(userIds: string[]): Promise<Map<string, ChatUserSummary>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, image: true, role: true },
  });
  return new Map(users.map((u) => [u.id, { id: u.id, name: u.name, image: u.image, role: u.role }]));
}

/**
 * Staff users available for the "New conversation" picker.
 * Unlike GET /users (admin-only), this is available to every staff chat role
 * and excludes patients (FRD 25.3 — internal staff chat only).
 *
 * `search` filters by name/email (autocomplete), `role` narrows by role;
 * results are capped so the picker stays snappy while typing.
 */
export async function listChatUsers(params: { search?: string; role?: string } = {}) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    isActive: true,
  };

  // Intersect the role filter with the patient exclusion so a client can never
  // widen the picker back to patients (FRD 25.3 — internal staff chat only).
  if (params.role) {
    where.AND = [{ role: { not: "PATIENT" } }, { role: params.role }];
  } else {
    where.role = { not: "PATIENT" };
  }

  const query = params.search?.trim();
  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
    ];
  }

  return prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, role: true, image: true },
    orderBy: { name: "asc" },
    take: 50,
  });
}

/**
 * Returns the existing conversation for an exact participant set (if any).
 * Used by the picker to hint that a new conversation will resume an old thread.
 */
export async function findConversationBySet(userIds: string[]) {
  const participantKey = makeParticipantKey(userIds);
  return prisma.chatConversation.findUnique({
    where: { participantKey },
    include: { participants: { include: { user: { select: { id: true, name: true, image: true, role: true, email: true } } } } },
  });
}

/**
 * For each user, whether a 1:1 thread with the actor already exists — powers
 * the per-person "Existing chat" badge in the new-conversation picker.
 */
export async function listConversationStatusForUsers(actorId: string, userIds: string[]) {
  return Promise.all(
    [...new Set(userIds)].map(async (userId) => ({
      userId,
      hasExistingThread: !!(await findConversationBySet([actorId, userId])),
    })),
  );
}

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

  const participantKey = makeParticipantKey(participantIds);
  const include = {
    participants: { include: { user: { select: { id: true, name: true, image: true, role: true, email: true } } } },
  } as const;

  // Race-proof get-or-create: the unique index on participantKey guarantees a
  // member set can have only one thread. A concurrent request that wins the
  // insert makes ours hit P2002, which we resolve by returning the winner.
  // `reused` lets the client tell "resumed an existing thread" from "created a
  // brand-new one" (e.g. for a "Continuing existing conversation" toast).
  try {
    return await prisma.$transaction(async (tx) => {
      // Fast path: existing thread for this exact member set.
      const existing = await tx.chatConversation.findUnique({
        where: { participantKey },
        include,
      });
      if (existing) return { conversation: existing, reused: true };

      // Legacy rows created before participantKey existed — exact member-set match.
      const legacy = await tx.chatConversation.findFirst({
        where: {
          type: data.type ?? "DIRECT",
          participantKey: null,
          participants: { every: { userId: { in: participantIds } } },
        },
        include,
        orderBy: { createdAt: "desc" },
      });
      if (legacy && legacy.participants.length === participantIds.length) {
        const conversation = await tx.chatConversation.update({
          where: { id: legacy.id },
          data: { participantKey },
          include,
        });
        return { conversation, reused: true };
      }

      const conversation = await tx.chatConversation.create({
        data: {
          type: data.type ?? "DIRECT",
          title: data.title,
          linkedEntityType: data.linkedEntityType,
          linkedEntityId: data.linkedEntityId,
          createdBy: data.createdBy,
          participantKey,
          participants: {
            create: participantIds.map((userId) => ({ userId })),
          },
        },
        include,
      });
      return { conversation, reused: false };
    });
  } catch (err) {
    // participantIds are deduped, so the only P2002 this transaction can hit is
    // the participantKey unique index — a concurrent request created the same
    // member set first. Return the winner instead of erroring.
    if (isUniqueViolation(err)) {
      const winner = await prisma.chatConversation.findUnique({
        where: { participantKey },
        include,
      });
      if (winner) return { conversation: winner, reused: true };
    }
    throw err;
  }
}

const CONVERSATION_INCLUDE = {
  participants: {
    include: { user: { select: { id: true, name: true, image: true, role: true, email: true } } },
  },
} as const;

/**
 * Renames a group conversation. Only participants can rename, and only GROUP
 * conversations (direct chats keep their auto-derived titles).
 */
export async function renameConversation(conversationId: string, userId: string, title: string) {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new AppError("Group name cannot be empty", 400, undefined, "VALIDATION_ERROR");
  }
  if (trimmed.length > 60) {
    throw new AppError("Group name must be 60 characters or fewer", 400, undefined, "VALIDATION_ERROR");
  }

  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: CONVERSATION_INCLUDE,
  });
  if (!conversation) {
    throw new AppError("Conversation not found", 404, undefined, "NOT_FOUND");
  }
  if (conversation.type !== "GROUP") {
    throw new AppError("Only group conversations can be renamed", 400, undefined, "VALIDATION_ERROR");
  }
  if (!conversation.participants.some((p) => p.userId === userId)) {
    throw new AppError("You are not a participant of this conversation", 403, undefined, "ERR_NOT_PARTICIPANT");
  }
  if (conversation.title === trimmed) return conversation;

  const updated = await prisma.chatConversation.update({
    where: { id: conversationId },
    data: { title: trimmed },
    include: CONVERSATION_INCLUDE,
  });

  // Live-sync the new name to everyone in the room (and their sockets).
  emitToRoom(`conversation:${conversationId}`, "chat:conversation-updated", updated);
  for (const p of updated.participants) {
    if (p.userId !== userId) {
      emitToUser(p.userId, "chat:conversation-updated", updated);
    }
  }
  return updated;
}

/**
 * Recomputes the participantKey after a member-set change and persists it.
 * If another thread already owns the exact new member set (P2002 on the unique
 * key), we drop our key instead — the legacy exact-set matcher in
 * createConversation still finds this thread when the same set is re-created.
 */
async function refreshParticipantKey(conversationId: string, memberIds: string[]) {
  const participantKey = makeParticipantKey(memberIds);
  try {
    return await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { participantKey },
      include: CONVERSATION_INCLUDE,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { participantKey: null },
        include: CONVERSATION_INCLUDE,
      });
    }
    throw err;
  }
}

/** Broadcasts a changed conversation to everyone who should still see it. */
function broadcastConversationUpdate(conversation: Awaited<ReturnType<typeof refreshParticipantKey>>) {
  emitToRoom(`conversation:${conversation.id}`, "chat:conversation-updated", conversation);
  for (const p of conversation.participants) {
    emitToUser(p.userId, "chat:conversation-updated", conversation);
  }
}

/** Loads a conversation + participants, throwing the standard errors for missing/GROUP/participant. */
async function loadGroupConversationForActor(conversationId: string, actorId: string) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: conversationId },
    include: CONVERSATION_INCLUDE,
  });
  if (!conversation) {
    throw new AppError("Conversation not found", 404, undefined, "NOT_FOUND");
  }
  if (conversation.type !== "GROUP") {
    throw new AppError("Only group conversations support members", 400, undefined, "VALIDATION_ERROR");
  }
  if (!conversation.participants.some((p) => p.userId === actorId)) {
    throw new AppError("You are not a participant of this conversation", 403, undefined, "ERR_NOT_PARTICIPANT");
  }
  return conversation;
}

/** Adds staff members to a group conversation (any member can add). */
export async function addConversationMembers(conversationId: string, actorId: string, userIds: string[]) {
  const conversation = await loadGroupConversationForActor(conversationId, actorId);

  const requested = [...new Set(userIds)].filter((id) => id && id !== actorId);
  if (requested.length === 0) {
    throw new AppError("Select at least one member to add", 400, undefined, "VALIDATION_ERROR");
  }

  const existingIds = new Set(conversation.participants.map((p) => p.userId));
  const toAdd = requested.filter((id) => !existingIds.has(id));
  if (toAdd.length === 0) {
    throw new AppError("Selected users are already members of this group", 400, undefined, "VALIDATION_ERROR");
  }

  // Internal staff chat only (FRD 25.3) — never let a client add a patient.
  const users = await prisma.user.findMany({
    where: { id: { in: toAdd }, deletedAt: null, isActive: true, role: { not: "PATIENT" } },
    select: { id: true },
  });
  if (users.length !== toAdd.length) {
    throw new AppError("One or more selected users were not found or are inactive", 400, undefined, "VALIDATION_ERROR");
  }

  await prisma.chatParticipant.createMany({
    data: toAdd.map((userId) => ({ conversationId, userId })),
    skipDuplicates: true,
  });

  const updated = await refreshParticipantKey(conversationId, [...existingIds, ...toAdd]);
  broadcastConversationUpdate(updated);
  return updated;
}

/** Removes the actor from a group conversation. */
export async function leaveConversation(conversationId: string, userId: string) {
  const conversation = await loadGroupConversationForActor(conversationId, userId);
  const participant = conversation.participants.find((p) => p.userId === userId);
  if (!participant) {
    throw new AppError("You are not a participant of this conversation", 403, undefined, "ERR_NOT_PARTICIPANT");
  }

  await prisma.chatParticipant.delete({ where: { id: participant.id } });

  const remaining = conversation.participants.filter((p) => p.userId !== userId);
  if (remaining.length === 0) {
    // Last member out — the group ceases to exist.
    await prisma.chatConversation.delete({ where: { id: conversationId } });
    await Message.deleteMany({ conversationId });
    return { left: true, deleted: true };
  }

  const updated = await refreshParticipantKey(conversationId, remaining.map((p) => p.userId));
  // Only the remaining members can still see this thread.
  emitToRoom(`conversation:${conversationId}`, "chat:conversation-updated", updated);
  for (const p of remaining) {
    emitToUser(p.userId, "chat:conversation-updated", updated);
  }
  return { left: true, deleted: false, conversation: updated };
}

/** Deletes a group conversation for everyone (any member can delete). */
export async function deleteConversation(conversationId: string, userId: string) {
  const conversation = await loadGroupConversationForActor(conversationId, userId);

  await prisma.chatConversation.delete({ where: { id: conversationId } });
  await Message.deleteMany({ conversationId });

  const payload = { id: conversationId };
  emitToRoom(`conversation:${conversationId}`, "chat:conversation-deleted", payload);
  for (const p of conversation.participants) {
    emitToUser(p.userId, "chat:conversation-deleted", payload);
  }
  return { deleted: true };
}

export async function listUserConversations(userId: string) {
  const conversations = await prisma.chatConversation.findMany({
    where: { participants: { some: { userId } } },
    include: {
      participants: {
        include: { user: { select: { id: true, name: true, image: true, role: true, email: true } } },
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
        id: string;
        content: string;
        createdAt: Date;
        senderId: string;
      }>([
        { $match: { conversationId: { $in: conversationIds } } },
        { $sort: { createdAt: -1 } },
        { $group: { _id: "$conversationId", doc: { $first: "$$ROOT" } } },
        {
          $project: {
            conversationId: "$_id",
            id: { $toString: "$doc._id" },
            content: "$doc.body",
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

  const docs = await Message.find({ conversationId })
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean<MessageDoc[]>();

  const senders = await loadSenders(docs.map((d) => d.senderId));
  const messages = docs.reverse().map((d) => toMessageDto(d, senders));

  const total = await Message.countDocuments({ conversationId });

  return { messages, total, cursor: null };
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

  const doc = await Message.create({
    conversationId,
    senderId: data.senderId,
    body: data.body,
    attachments: data.attachments ?? [],
  });

  const senders = await loadSenders([data.senderId]);
  const message = toMessageDto(doc.toObject(), senders);

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

  const senders = await loadSenders([message.senderId]);
  const dto = toMessageDto(message.toObject(), senders);
  emitToRoom(`conversation:${message.conversationId}`, "chat:message-edited", dto);
  return dto;
}

export async function markConversationRead(conversationId: string, userId: string, messageId: string) {
  await prisma.chatParticipant.update({
    where: { conversationId_userId: { conversationId, userId } },
    data: { lastReadMessageId: messageId },
  });
  return { conversationId, lastReadMessageId: messageId };
}
