const express = require("express");
const complianceController = require("../controllers/complianceController");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { authToken, authRole } = require("../middleware/auth");

const router = express.Router();

// router.post("/structure", authToken, complianceController.createStructure);
// router.get("/structure", authToken, complianceController.getAllStructures);

const models = ["Structure", "Poster", "Illumination", "Route", "Side"];

models.forEach((model) => {
  router.post(
    `/${model.toLowerCase()}`,
    authToken,
    complianceController.createEntity(model)
  );
  router.get(
    `/${model.toLowerCase()}`,
    authToken,
    complianceController.getAllEntities(model)
  );
});

// POST request to create compliance report
router.post(
  "/compliance-report",
  authToken,
  upload.array("imageUrls", 5), // Multiple image uploads
  complianceController.complianceUpload
);

// Update site status
router.put(
  "/compliance/:complianceReportId/status",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"]),
  complianceController.updateComplianceStatus
);

router.get(
  "/compliance-report",
  authToken,
  complianceController.getAllComplianceUploads
);

router.get(
  "/compliance-report/:id",
  authToken,
  complianceController.viewComplianceUpload
);

module.exports = router;
