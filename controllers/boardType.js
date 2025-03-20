const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Add a board type
exports.createBoardType = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "board name is required." });
  }

  try {
    const board = await prisma.boardType.create({
      data: { name },
    });
    res.status(201).json(board);
  } catch (error) {
    console.error("Error creating board:", error);
    if (error.code === "P2002") {
      // Prisma's unique constraint violation error
      res.status(400).json({ error: "board type already exist!!!" });
    } else {
      res.status(500).json({ error: "Error creating board." });
    }
  }
};

// Get all industries
exports.getBoardType = async (req, res) => {
  try {
    const boards = await prisma.boardType.findMany();
    res.status(200).json(boards);
  } catch (error) {
    console.error("Error fetching boards:", error);
    res.status(500).json({ error: "Error fetching boards." });
  }
};
