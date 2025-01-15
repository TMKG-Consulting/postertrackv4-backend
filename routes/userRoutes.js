const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { authToken, authRole } = require("../middleware/auth");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

router.post("/super-admin/signup", userController.createSuperAdmin);
router.post("/login", userController.login);
router.post(
  "/users/create",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  userController.createUser
);
router.get(
  "/users",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  userController.fetchAllUsers
);

// Fetch a single user's information
router.get("/user/detail", authToken, userController.getUser);

router.put(
  "/api/users/:id",
  authToken,
  upload.single("profilePicture"),
  userController.updateUser
);

router.get(
  "/users/account-managers",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  userController.getAccountManagers
);

router.get(
  "/users/field-auditors",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  userController.getFieldAuditors
);

router.get(
  "/users/clients",
  authToken,
  authRole(["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"]),
  userController.getClients
);

router.get("/users/search", userController.searchUsers);

module.exports = router;
