const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const brandController = require("../controllers/brand");
const { authToken, authRole } = require("../middleware/auth");

// Multer setup for handling file uploads
// const upload = multer({
//   storage: multer.memoryStorage(), // Store files in memory for GCS
//   limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
// });

router.post(
  "/api/brands",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  upload.single("logo"),
  brandController.createBrand
);

router.get(
  "/api/brands",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  brandController.getAllBrands
);

router.get(
  "/api/advertiser/:advertiserId/brands",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  brandController.getBrands
);

router.put(
  "/api/brand/:id",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  upload.single("logo"),
  brandController.editBrand
);

router.delete(
  "/api/brand/:id",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  brandController.deleteBrand
);

module.exports = router;
