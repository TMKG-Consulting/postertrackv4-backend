const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authToken, authRole } = require("../middleware/auth");

router.post("/super-admin/signup", userController.createSuperAdmin);
router.post("/login", userController.login);
router.post(
  "/users/create",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  userController.createUser
);
router.get("/users", authToken, userController.fetchAllUsers);

module.exports = router;
