import type { Request, Response } from "express";
import { catchAsync } from "../../core/utils/catchAsync.js";
import { sendSuccess } from "../../core/utils/apiResponse.js";
import { writeAuditLog } from "../../core/utils/audit.js";
import {
  listTemplates,
  generateReport,
  getJobStatus,
  createSchedule,
  listSchedules,
} from "./reports.service.js";

export const listTemplatesHandler = catchAsync(async (_req: Request, res: Response) => {
  const templates = await listTemplates();
  sendSuccess(res, templates);
});

export const generateReportHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const result = await generateReport({ ...req.body, requestedBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "REPORT_GENERATED",
      module: "reports",
      entityType: "ReportJob",
      entityId: result.jobId,
      after: { templateKey: req.body.templateKey },
    },
    req,
  );
  sendSuccess(res, result);
});

export const getJobStatusHandler = catchAsync(async (req: Request, res: Response) => {
  const job = await getJobStatus(req.params.id);
  sendSuccess(res, job);
});

export const createScheduleHandler = catchAsync(async (req: Request, res: Response) => {
  const actor = (req as any).user;
  const schedule = await createSchedule({ ...req.body, createdBy: actor?.id });
  writeAuditLog(
    {
      actorId: actor?.id,
      actorRole: actor?.role,
      action: "SCHEDULE_CREATED",
      module: "reports",
      entityType: "ReportSchedule",
      entityId: schedule.id,
      after: { cronExpression: req.body.cronExpression },
    },
    req,
  );
  sendSuccess(res, schedule, 201);
});

export const listSchedulesHandler = catchAsync(async (_req: Request, res: Response) => {
  const schedules = await listSchedules();
  sendSuccess(res, schedules);
});
