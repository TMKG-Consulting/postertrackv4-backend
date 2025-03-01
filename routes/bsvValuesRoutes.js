const express = require("express");
const bsvValuesController = require("../controllers/bsvValues");
const { authToken, authRole } = require("../middleware/auth");

const router = express.Router();

const models = [
  "VisibilityDistance",
  "TrafficDensity",
  "TrafficSpeed",
  "AngleVision",
  "ClutterBillboard",
  "ClutterFormat",
  "ProximityCompetition",
  "PedestrianTraffic",
];

models.forEach((model) => {
  router.post(
    `/api/${model.toLowerCase()}`,
    authToken,
    authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
    bsvValuesController.createBsvValue(model)
  );
  router.get(
    `/api/${model.toLowerCase()}`,
    authToken,
    bsvValuesController.getAllBsvValues(model)
  );
});

module.exports = router;
