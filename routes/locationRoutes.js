const express = require("express");
const router = express.Router();
const locationsController = require("../controllers/locationsController");
const { authToken, authRole } = require("../middleware/auth");

// Regions
router.post(
  "/api/regions",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  locationsController.createRegion
);
router.get(
  "/api/regions",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  locationsController.getRegions
);

// States
router.post(
  "/api/states",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  locationsController.createState
);
router.get(
  "/api/regions/:regionId/states",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  locationsController.getStates
);
router.get(
  "/api/states",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  locationsController.getAllStates
);

// Cities
router.post(
  "/api/cities",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  locationsController.createCity
);
router.get(
  "/api/states/:stateId/cities",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  locationsController.getCities
);
router.get(
  "/api/cities",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  locationsController.getAllCities
);

module.exports = router;
