import { prisma } from "../../config/prisma.js";
import { AppError } from "../../core/errors/AppError.js";
import { PatientChatMessage } from "../../db/mongo/models/patientChatMessage.model.js";
import { emitToRoom } from "../../core/utils/socket.js";
import { ensurePatientProfile } from "../../core/utils/patientProfile.js";

/**
 * Resolve the Patient profile backing a patient account (shared provisioning
 * logic — same as the signup hook): linked userId → match+link by email/phone
 * → auto-create when the account has all required fields → null.
 */
async function resolvePatientForUser(patientUserId: string) {
  const user = await prisma.user.findUnique({ where: { id: patientUserId } });
  if (!user) return null;
  return ensurePatientProfile(user);
}

/**
 * Patient starts a conversation — relationship check (BR-01/FR 26.4-01):
 * patient must have appointment history with the chosen doctor, or use the
 * general reception queue (staffId/reception).
 */
export async function startConversation(data: {
  patientId?: string;
  patientUserId: string;
  doctorId?: string;
  departmentId?: string;
}) {
  // Resolve the patient from the caller's linked profile when no explicit
  // patientId is supplied (frontend sends only the actor's session).
  const patient = data.patientId
    ? await prisma.patient.findFirst({ where: { id: data.patientId, deletedAt: null } })
    : await resolvePatientForUser(data.patientUserId);
  if (!patient) {
    throw new AppError(
      "No patient profile is linked to this account. Register a patient profile (or contact reception to link one) before starting a chat.",
      404,
      undefined,
      "ERR_PATIENT_PROFILE_REQUIRED",
    );
  }

  if (data.doctorId) {
    // Relationship-existence check (FR 26.4-01)
    const hasRelation = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        doctorId: data.doctorId,
      },
    });
    if (!hasRelation) {
      throw new AppError(
        "You can only chat with doctors you have an appointment history with",
        403,
        undefined,
        "ERR_NO_RELATIONSHIP",
      );
    }
  }

  const existing = await prisma.patientChatConversation.findFirst({
    where: {
      patientId: patient.id,
      staffId: data.doctorId,
      status: { in: ["OPEN", "ANSWERED"] },
    },
  });
  if (existing) return existing;

  return prisma.patientChatConversation.create({
    data: {
      patientId: patient.id,
      staffId: data.doctorId,
      departmentId: data.departmentId,
    },
  });
}

export async function listConversations(actor: { id: string; role: string }) {
  if (actor.role === "PATIENT") {
    const patient = await prisma.patient.findFirst({
      where: { userId: actor.id, deletedAt: null },
      select: { id: true },
    });
    if (!patient) return [];
    return prisma.patientChatConversation.findMany({
      where: { patientId: patient.id },
      orderBy: { lastMessageAt: "desc" },
    });
  }

  // Staff inbox: open department/general queue. Patient-started threads have
  // staffId = null (frontend only sends departmentId), so the clinical/front-
  // desk roles that see the Patient Chat module must be able to pick up the
  // unassigned OPEN/ANSWERED conversations and reply. Mirrors the client nav
  // allow-list — other staff roles are deliberately excluded.
  const staffChatRoles = ["DOCTOR", "NURSE", "RECEPTIONIST", "HOSPITAL_ADMIN", "SUPER_ADMIN"];
  if (!staffChatRoles.includes(actor.role)) return [];

  return prisma.patientChatConversation.findMany({
    where: { status: { in: ["OPEN", "ANSWERED"] } },
    orderBy: { lastMessageAt: "desc" },
  });
}

export async function getMessages(conversationId: string, actor: { id: string; role: string }) {
  const conversation = await prisma.patientChatConversation.findUnique({
    where: { id: conversationId },
    include: { patient: true },
  });
  if (!conversation) throw new AppError("Conversation not found", 404, undefined, "NOT_FOUND");

  // Authorization: patient can only read own; staff only assigned/admin
  if (actor.role === "PATIENT") {
    if (conversation.patient.userId !== actor.id) {
      throw new AppError("You cannot access this conversation", 403, undefined, "FORBIDDEN");
    }
  } else if (conversation.staffId && conversation.staffId !== actor.id && actor.role !== "HOSPITAL_ADMIN" && actor.role !== "SUPER_ADMIN") {
    throw new AppError("You cannot access this conversation", 403, undefined, "FORBIDDEN");
  }

  const messages = await PatientChatMessage.find({ conversationId })
    .sort({ createdAt: 1 })
    .lean();
  return messages;
}

export async function sendMessage(
  conversationId: string,
  data: { senderId: string; senderRole: "PATIENT" | "STAFF"; body: string },
) {
  const conversation = await prisma.patientChatConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) throw new AppError("Conversation not found", 404, undefined, "NOT_FOUND");
  if (conversation.status === "CLOSED") {
    throw new AppError("Conversation is closed", 409, undefined, "ERR_CONVERSATION_CLOSED");
  }

  const message = await PatientChatMessage.create({
    conversationId,
    senderType: data.senderRole,
    senderId: data.senderId,
    body: data.body,
  });

  await prisma.patientChatConversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      // CLOSED already throws above, so a patient reply re-opens the thread
      status: data.senderRole === "STAFF" ? "ANSWERED" : "OPEN",
    },
  });

  emitToRoom(`conversation:${conversationId}`, "patient-chat:message-new", message);
  return message;
}

/** Escalate to appointment or ambulance (FR 26.4-04). */
export async function escalateConversation(
  conversationId: string,
  data: { escalateTo: "APPOINTMENT" | "AMBULANCE"; details?: Record<string, unknown> },
) {
  const conversation = await prisma.patientChatConversation.update({
    where: { id: conversationId },
    data: { status: "ESCALATED" },
  });
  return { conversation, escalateTo: data.escalateTo, details: data.details };
}

export async function closeConversation(conversationId: string) {
  return prisma.patientChatConversation.update({
    where: { id: conversationId },
    data: { status: "CLOSED" },
  });
}
