const express = require("express");
const router = express.Router();
const multer = require("multer");
const campaignController = require("../controllers/campaignController");
const { authToken, authRole } = require("../middleware/auth");

// Configure Multer for file uploads
const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    // console.log("File Info in Filter:", file);
    const allowedTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only CSV and Excel files are allowed"));
    }
    cb(null, true);
  },
});

router.post(
  "/campaigns/create",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  upload.single("siteList"),
  campaignController.createCampaign
);

router.get(
  "/campaigns/:id",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"]),
  campaignController.viewCampaign
);

router.get("/campaigns", authToken, campaignController.fetchCampaigns);

module.exports = router;
