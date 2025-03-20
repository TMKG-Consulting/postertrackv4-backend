const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { paginate } = require("../Helpers/paginate");

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
  const { page = 1, limit = 10 } = req.query;

  try {
    const { data, total, totalPages } = await paginate(
      prisma.category,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      data,
      total,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Error fetching categories." });
  }
};

exports.getCategoryByBrand = async (req, res) => {
  const { id } = req.params; // Brand ID from request params

  try {
    // Validate if brand exists and get its category
    const brand = await prisma.brand.findUnique({
      where: { id: parseInt(id) },
      include: { category: true }, // Include the associated category
    });

    if (!brand) {
      return res.status(404).json({ error: "Brand not found" });
    }

    res.status(200).json({
      brandId: brand.id,
      brandName: brand.name,
      category: brand.category ? brand.category : null, // Return category if exists
    });
  } catch (error) {
    console.error("Error retrieving category:", error);
    res.status(500).json({ error: "Error retrieving category." });
  }
};

//Update a Category
exports.editCategory = async (req, res) => {
  const { id } = req.params; // Category ID
  const { name } = req.body; // Fields to update

  try {
    const updatedCategory = await prisma.category.update({
      where: { id: parseInt(id) },
      data: {
        name,
      },
    });

    res
      .status(200)
      .json({ message: "Category updated successfully", updatedCategory });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Error updating category." });
  }
};

//Delete a Category
exports.deleteCategory = async (req, res) => {
  const { id } = req.params; // Category ID

  try {
    await prisma.category.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ error: "Error deleting category." });
  }
};
