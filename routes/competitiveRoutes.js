const express = require("express");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { authToken, authRole } = require("../middleware/auth");
const competitiveController = require("../controllers/competitiveController");

const router = express.Router();

// POST request to create compliance report
router.post(
  "/competitive-report",
  authToken,
  upload.array("images", 5),
  competitiveController.competitiveUpload
);

router.get(
  "/competitive-report/:id",
  authToken,
  competitiveController.viewCompetitiveUpload
);

router.get(
  "/competitive-report",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"]),
  competitiveController.getCompetitiveUploads
);

router.get(
  "/competitive-map/:id",
  authToken,
  competitiveController.getCompetitiveMapData
);

router.get(
  "/competitive-upload/:auditorId",
  authToken,
  competitiveController.getCompetitiveUploadHistory
);

module.exports = router;
