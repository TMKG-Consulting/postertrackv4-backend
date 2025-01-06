const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Add a new industry
exports.createIndustry = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Industry name is required." });
  }

  try {
    const industry = await prisma.industry.create({
      data: { name },
    });
    res.status(201).json(industry);
  } catch (error) {
    console.error("Error creating industry:", error);
    if (error.code === "P2002") {
      // Prisma's unique constraint violation error
      res.status(400).json({ error: "Industry name must be unique." });
    } else {
      res.status(500).json({ error: "Error creating industry." });
    }
  }
};

// Get all industries
exports.getIndustries = async (req, res) => {
  try {
    const industries = await prisma.industry.findMany();
    res.status(200).json(industries);
  } catch (error) {
    console.error("Error fetching industries:", error);
    res.status(500).json({ error: "Error fetching industries." });
  }
};
