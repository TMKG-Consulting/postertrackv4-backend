const express = require("express");
const router = express.Router();
const advertiserController = require("../controllers/advertiser");
const brandController = require("../controllers/brand");
const categoryController = require("../controllers/category");
const analyticsController = require("../controllers/analyticsController")
const { authToken, authRole } = require("../middleware/auth");

router.post(
  "/api/categories",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  categoryController.createCategory
);
router.get(
  "/api/categories",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  categoryController.getCategory
);

router.post(
  "/api/advertisers",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  advertiserController.createAdvertiser
);
router.get(
  "/api/advertisers",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  advertiserController.getAdvertisers
);

router.post(
  "/api/brands",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
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

router.get('/analytics/overview', authToken, analyticsController.getAnalyticsOverview);

module.exports = router;
