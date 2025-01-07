const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

//Create a category
exports.createCategory = async (req, res) => {
  const { name } = req.body;
  try {
    const category = await prisma.category.create({
      data: {
        name,
      },
    });
    res.json(category);
  } catch (error) {
    res.json({ error: "Server error" });
    console.log(error);
  }
};

//Get All Categories
exports.getCategory = async (req, res) => {
  try {
    const categories = await prisma.category.findMany();
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
