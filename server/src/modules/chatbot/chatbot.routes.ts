import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import {
  startSessionHandler,
  sendMessageHandler,
  getSessionHistoryHandler,
  feedbackHandler,
} from "./chatbot.controller.js";

const chatbotRoutes = Router();

chatbotRoutes.use(authMiddleware);

chatbotRoutes.post("/conversations", startSessionHandler);
chatbotRoutes.post("/conversations/:id/messages", sendMessageHandler);
chatbotRoutes.get("/conversations/:id", getSessionHistoryHandler);
chatbotRoutes.post("/conversations/:id/feedback", feedbackHandler);

export { chatbotRoutes };
