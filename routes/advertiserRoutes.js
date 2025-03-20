const express = require("express");
const router = express.Router();
const advertiserController = require("../controllers/advertiser");
const { authToken, authRole } = require("../middleware/auth");

router.post(
  "/api/advertisers",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  advertiserController.createAdvertiser
);

router.get(
  "/api/advertisers",
  authToken,
  advertiserController.getAdvertisers
);

router.put(
  "/api/advertiser/:id",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  advertiserController.editAdvertiser
);

router.post(
  "/api/advertiser/:id/delete",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  advertiserController.deleteAdvertiser
);

module.exports = router;
