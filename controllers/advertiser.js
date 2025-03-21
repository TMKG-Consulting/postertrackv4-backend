const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { paginate } = require("../Helpers/paginate");

//Create an advertiser
exports.createAdvertiser = async (req, res) => {
  const { name, categoryIds } = req.body;

  try {
    // Ensure categoryIds is an array
    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one category is required" });
    }

    // Validate if all categories exist
    const validCategories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });

    if (validCategories.length !== categoryIds.length) {
      return res
        .status(400)
        .json({ error: "One or more categories do not exist" });
    }

    // Create advertiser
    const advertiser = await prisma.advertiser.create({
      data: {
        name: name,
        advertiserCategories: {
          create: categoryIds.map((id) => ({ categoryId: id })),
        },
      },
      include: { advertiserCategories: { include: { category: true } } },
    });

    res.status(201).json(advertiser);
  } catch (error) {
    console.error("Create Advertiser Error:", error);
    if (error.code === "P2002") {
      res.status(400).json({
        error: `An advertiser with this name already exists: ${name}`,
      });
    } else {
      res.status(500).json({ error: "Server error" });
    }
  }
};

//Get All Advertisers
exports.getAdvertisers = async (req, res) => {
  const { page = 1, limit = 10, search = "" } = req.query;

  try {
    const where = search
      ? {
          name: {
            contains: search,
            mode: "insensitive",
          },
        }
      : {}; // Ensure `where` is an empty object if no search term

    const include = {};
    const orderBy = { name: "asc" };

    const { data, total, totalPages } = await paginate(
      prisma.advertiser,
      parseInt(page),
      parseInt(limit),
      where,
      include,
      orderBy
    );

    res.status(200).json({
      data,
      total,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Error fetching advertisers:", error);
    res.status(500).json({ error: "Error fetching advertisers." });
  }
};

//Update an Advertiser
// exports.editAdvertiser = async (req, res) => {
//   const { id } = req.params; // Advertiser ID
//   const { name } = req.body; // Fields to update

//   try {
//     const updatedAdvertiser = await prisma.advertiser.update({
//       where: { id: parseInt(id) },
//       data: {
//         name,
//       },
//     });

//     res
//       .status(200)
//       .json({ message: "Advertiser updated successfully", updatedAdvertiser });
//   } catch (error) {
//     console.error("Error updating advertiser:", error);
//     res.status(500).json({ error: "Error updating advertiser." });
//   }
// };

exports.editAdvertiser = async (req, res) => {
  const { id } = req.params; // Advertiser ID
  const { name, categoryIds } = req.body; // Fields to update

  try {
    // Ensure categoryIds is an array if provided
    if (categoryIds && !Array.isArray(categoryIds)) {
      return res.status(400).json({ error: "categoryIds must be an array" });
    }

    // Validate if the advertiser exists
    const existingAdvertiser = await prisma.advertiser.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingAdvertiser) {
      return res.status(404).json({ error: "Advertiser not found" });
    }

    // Validate if all categories exist (only if categoryIds is provided)
    if (categoryIds && categoryIds.length > 0) {
      const validCategories = await prisma.category.findMany({
        where: { id: { in: categoryIds } },
      });

      if (validCategories.length !== categoryIds.length) {
        return res
          .status(400)
          .json({ error: "One or more categories do not exist" });
      }
    }

    // Update advertiser and its categories
    const updatedAdvertiser = await prisma.advertiser.update({
      where: { id: parseInt(id) },
      data: {
        name,
        advertiserCategories: categoryIds
          ? {
              deleteMany: {}, // Remove existing category relationships
              create: categoryIds.map((categoryId) => ({ categoryId })), // Add new relationships
            }
          : undefined, // If categoryIds is not provided, don't change categories
      },
      include: {
        advertiserCategories: { include: { category: true } }, // Include updated categories in response
      },
    });

    res.status(200).json({
      message: "Advertiser updated successfully",
      advertiser: updatedAdvertiser,
    });
  } catch (error) {
    console.error("Error updating advertiser:", error);
    res.status(500).json({ error: "Error updating advertiser." });
  }
};

// Delete Advertiser with Confirmation
exports.deleteAdvertiser = async (req, res) => {
  const { id } = req.params; // Advertiser ID
  const { confirmDelete } = req.body; // Confirmation flag

  try {
    // Check if the advertiser exists
    const advertiser = await prisma.advertiser.findUnique({
      where: { id: parseInt(id) },
      include: { brands: true }, // Fetch associated brands
    });

    if (!advertiser) {
      return res.status(404).json({ error: "Advertiser not found." });
    }

    // Check if there are associated brands
    if (advertiser.brands && advertiser.brands.length > 0) {
      if (!confirmDelete) {
        // Warn the user about associated brands
        return res.status(400).json({
          message:
            "This advertiser has associated brands. Deleting the advertiser will also delete the following brands:",
          associatedBrands: advertiser.brands.map((brand) => ({
            id: brand.id,
            name: brand.name,
          })),
        });
      }

      // If confirmation is provided, delete associated brands first
      await prisma.brand.deleteMany({
        where: { advertiserId: parseInt(id) },
      });
    }

    // Proceed to delete the advertiser
    await prisma.advertiser.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({
      message: "Advertiser and associated brands deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting advertiser:", error);
    res.status(500).json({ error: "Error deleting advertiser." });
  }
};
