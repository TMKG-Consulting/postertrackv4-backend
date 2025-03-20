const express = require("express");
const router = express.Router();
const boardTypeController = require("../controllers/boardType");
const { authToken } = require("../middleware/auth");

// Add a new industry
router.post("/api/board", authToken, boardTypeController.createBoardType);

// Get all industries
router.get("/api/board", authToken, boardTypeController.getBoardType);

module.exports = router;
