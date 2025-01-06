const express = require("express");
const router = express.Router();
const industryController = require("../controllers/industryController");
const { authToken } = require("../middleware/auth");

// Add a new industry
router.post("/api/industries", authToken, industryController.createIndustry);

// Get all industries
router.get("/api/industries", authToken, industryController.getIndustries);

module.exports = router;
