import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess, sendPaginated } from "../../core/utils/apiResponse.js";
import {
  getInbox,
  markRead,
  markAllRead,
  getPreferences,
  updatePreferences,
  listTemplates,
  createTemplate,
} from "./notifications.service.js";
import { buildPaginationMeta } from "../../core/utils/pagination.js";

export const getInboxHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const { total, notifications, unread, pagination } = await getInbox(
    actor.id,
    req.query.page,
    req.query.limit,
  );
  const meta = buildPaginationMeta(total, pagination);
  (meta as any).unread = unread;
  sendPaginated(res, notifications, meta);
});

export const markReadHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const notification = await markRead(actor.id, req.params.id);
  sendSuccess(res, notification);
});

export const markAllReadHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await markAllRead(actor.id);
  sendSuccess(res, result);
});

export const getPreferencesHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const prefs = await getPreferences(actor.id);
  sendSuccess(res, prefs);
});

export const updatePreferencesHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const prefs = await updatePreferences(actor.id, req.body.preferences ?? []);
  sendSuccess(res, prefs);
});

export const listTemplatesHandler = catchAsync(async (_req: Request, res: Response) => {
  const templates = await listTemplates();
  sendSuccess(res, templates);
});

export const createTemplateHandler = catchAsync(async (req: Request, res: Response) => {
  const template = await createTemplate(req.body);
  sendSuccess(res, template, 201);
});
