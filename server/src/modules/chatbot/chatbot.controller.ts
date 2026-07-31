import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  startSession,
  getSessionHistory,
  sendUserMessage,
  submitFeedback,
} from "./chatbot.service.js";

export const startSessionHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const session = await startSession(actor.id, actor.role === "PATIENT" ? "PATIENT" : "STAFF");
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "SESSION_STARTED",
      module: "chatbot",
      entityType: "ChatbotSession",
      entityId: session.id,
    },
    req,
  );
  sendSuccess(res, session, 201);
});

export const sendMessageHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await sendUserMessage(req.params.id, {
    userId: actor.id,
    userRole: actor.role === "PATIENT" ? "PATIENT" : "STAFF",
    message: req.body.message,
  });
  sendSuccess(res, result);
});

export const getSessionHistoryHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const history = await getSessionHistory(req.params.id, actor.id);
  sendSuccess(res, history);
});

export const feedbackHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const feedback = await submitFeedback(req.params.id, { ...req.body, userId: actor.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "FEEDBACK_SUBMITTED",
      module: "chatbot",
      entityType: "ChatbotSession",
      entityId: req.params.id,
      after: { rating: req.body.rating },
    },
    req,
  );
  sendSuccess(res, feedback, 201);
});
