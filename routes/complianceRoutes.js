const express = require("express");
const complianceController = require("../controllers/complianceController");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { authToken } = require("../middleware/auth");

const router = express.Router();

router.post("/structure", authToken, complianceController.createStructure);
router.get("/structure", authToken, complianceController.getAllStructures);

const models = ["Poster", "Illumination", "Route", "Side"];

models.forEach((model) => {
  router.post(`/${model.toLowerCase()}`, authToken, complianceController.createEntity(model));
  router.get(`/${model.toLowerCase()}`, authToken, complianceController.getAllEntities(model));
});

// POST request to create compliance report
router.post(
  "/compliance-report",
  authToken,
  upload.array("imageUrls", 2), // Multiple image uploads
  complianceController.complianceUpload
);

module.exports = router;
