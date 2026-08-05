import { Router } from "express";
import { authMiddleware } from "../../core/middleware/auth.middleware.js";
import { authorize } from "../../core/middleware/authorize.js";
import {
  addVehicleHandler,
  listVehiclesHandler,
  raiseRequestHandler,
  listRequestsHandler,
  assignVehicleHandler,
  updateTripStatusHandler,
  trackTripHandler,
  listMyTripsHandler,
} from "./ambulance.controller.js";

const ambulanceRoutes = Router();

ambulanceRoutes.use(authMiddleware);

// Fleet management (admin/dispatcher)
ambulanceRoutes.post(
  "/vehicles",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "AMBULANCE_DISPATCHER"),
  addVehicleHandler,
);
ambulanceRoutes.get("/vehicles", listVehiclesHandler);

// Dispatch requests
ambulanceRoutes.post(
  "/requests",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "AMBULANCE_DISPATCHER", "RECEPTIONIST"),
  raiseRequestHandler,
);
ambulanceRoutes.get(
  "/requests",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "AMBULANCE_DISPATCHER"),
  listRequestsHandler,
);
ambulanceRoutes.patch(
  "/requests/:id/assign",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "AMBULANCE_DISPATCHER"),
  assignVehicleHandler,
);

// Trips
ambulanceRoutes.patch(
  "/trips/:id/status",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "AMBULANCE_DRIVER"),
  updateTripStatusHandler,
);
ambulanceRoutes.get(
  "/trips/mine",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "AMBULANCE_DRIVER"),
  listMyTripsHandler,
);
ambulanceRoutes.get(
  "/trips/:id/track",
  authorize("SUPER_ADMIN", "HOSPITAL_ADMIN", "AMBULANCE_DISPATCHER", "AMBULANCE_DRIVER", "RECEPTIONIST"),
  trackTripHandler,
);

export { ambulanceRoutes };
