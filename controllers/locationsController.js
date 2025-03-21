const { PrismaClient } = require("@prisma/client");
const { authRole } = require("../middleware/auth");
const prisma = new PrismaClient();

// Middleware to allow only SUPER_ADMIN and CHIEF_ACCOUNT_MANAGER
const allowedRoles = ["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "FIELD_AUDITOR"];

// Create a Region
exports.createRegion = [
  authRole(allowedRoles),
  async (req, res) => {
    const { name } = req.body;
    try {
      const region = await prisma.region.create({
        data: { name },
      });
      res.json(region);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
      console.error(error);
    }
  },
];

// Get All Regions
exports.getRegions = [
  authRole(allowedRoles),
  async (req, res) => {
    try {
      const regions = await prisma.region.findMany();
      res.json(regions);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
      console.error(error);
    }
  },
];

// Create a State
exports.createState = [
  authRole(allowedRoles),
  async (req, res) => {
    const { name, regionId } = req.body;
    try {
      const state = await prisma.state.create({
        data: { name, regionId },
      });
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
      console.error(error);
    }
  },
];

// Get All States per Region
exports.getStates = [
  authRole(allowedRoles),
  async (req, res) => {
    const { regionId } = req.params;
    try {
      const states = await prisma.state.findMany({
        where: { regionId: parseInt(regionId) },
      });
      res.json(states);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
      console.error(error);
    }
  },
];

// Get All States
exports.getAllStates = [
  authRole(allowedRoles),
  async (req, res) => {
    try {
      const states = await prisma.state.findMany();
      res.json(states);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
      console.error(error);
    }
  },
];

// Create a City
exports.createCity = [
  authRole(allowedRoles),
  async (req, res) => {
    const { name, stateId } = req.body;
    try {
      const city = await prisma.city.create({
        data: { name, stateId },
      });
      res.json(city);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
      console.error(error);
    }
  },
];

// Get All Cities per State
exports.getCities = [
  authRole(allowedRoles),
  async (req, res) => {
    const { stateId } = req.params;
    try {
      const cities = await prisma.city.findMany({
        where: { stateId: parseInt(stateId) },
      });
      res.json(cities);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
      console.error(error);
    }
  },
];

// Get All Cities
exports.getAllCities = [
  authRole(allowedRoles),
  async (req, res) => {
    try {
      const cities = await prisma.city.findMany();
      res.json(cities);
    } catch (error) {
      res.status(500).json({ error: "Server error" });
      console.error(error);
    }
  },
];
