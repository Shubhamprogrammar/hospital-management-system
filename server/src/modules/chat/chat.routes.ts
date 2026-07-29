import { Router } from "express";
import { getMessages } from "./chat.controller.js";

const chatRoutes = Router();

chatRoutes.get("/messages", getMessages);

export { chatRoutes };
