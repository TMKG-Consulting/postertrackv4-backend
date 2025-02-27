const express = require("express");
const complianceController = require("../controllers/complianceController");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { authToken, authRole } = require("../middleware/auth");

const router = express.Router();

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

router.get(
  "/entities",
  authToken,
  complianceController.getAllComplianceEntities
);

// POST request to create compliance report
router.post(
  "/compliance-report/:siteAssignmentId",
  authToken,
  upload.array("imageUrls", 5), // Multiple image uploads
  complianceController.complianceUpload
);

// Update site status
router.put(
  "/compliance/:id/status",
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

router.get(
  "/compliance/pending-approval",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"]),
  complianceController.getPendingComplianceSites
);

router.get(
  "/check-upload/:siteAssignmentId",
  authToken,
  complianceController.checkComplianceUpload
);

router.get(
  "/campaign-compliance/uploads",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"]),
  complianceController.getAllUploadedCampaigns
);

router.get(
  "/view-campaign-compliance/:campaignID",
  authToken,
  complianceController.getComplianceReportsForCampaign
);

// Update BSV
router.put(
  "/compliance/:id",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"]),
  complianceController.updateComplianceReport
);

router.get(
  "/site-pending-approval",
  authToken,
  complianceController.getPendingApprovalsByAuditor
);

module.exports = router;
