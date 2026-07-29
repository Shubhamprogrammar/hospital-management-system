import type { Request, Response } from "express";

export async function generate(_req: Request, res: Response) {
  res.json({ result: "AI response" });
}
