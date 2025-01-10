const express = require("express");
const router = express.Router();
const searchController = require("../controllers/searchController");
const { authToken } = require("../middleware/auth");

router.get("/search", authToken, searchController.search);

module.exports = router;