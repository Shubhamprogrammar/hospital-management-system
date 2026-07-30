import express from "express";
import { routes } from "./routes/index.js";
import { notFoundHandler } from "./core/middleware/notFound.middleware.js";
import { globalErrorHandler } from "./core/errors/errorHandler.js";

const app = express();

app.use(express.json());
app.use("/api/v1", routes);

app.use(notFoundHandler);
app.use(globalErrorHandler);

export { app };
