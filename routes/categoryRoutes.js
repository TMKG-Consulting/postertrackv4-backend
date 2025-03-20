const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/category");
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
  categoryController.getCategory
);

router.get(
  "/api/category/:id",
  authToken,
  categoryController.getCategoryByBrand
);

router.put(
  "/api/category/:id",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  categoryController.editCategory
);

router.delete(
  "/api/category/:id",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  categoryController.deleteCategory
);

module.exports = router;