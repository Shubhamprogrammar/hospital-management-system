import type { Request, Response } from "express";

export async function getMessages(_req: Request, res: Response) {
  res.json({ messages: [] });
}
