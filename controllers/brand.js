const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { uploadToGCS } = require("../Helpers/gcs");
const { paginate } = require("../Helpers/paginate");

//Create a brand
exports.createBrand = async (req, res) => {
  try {
    const { name, advertiserId, categoryId } = req.body;

    // Validate input fields
    if (!name || !advertiserId || !categoryId) {
      return res
        .status(400)
        .json({ error: "Name, Advertiser ID, and Category ID are required." });
    }

    // Check if brand already exists for the given advertiser and category
    const existingBrand = await prisma.brand.findFirst({
      where: {
        name: name.trim(),
        advertiserId: parseInt(advertiserId),
        categoryId: parseInt(categoryId),
      },
    });

    if (existingBrand) {
      return res.status(400).json({
        error:
          "Brand with the same name already exists for this advertiser and category.",
      });
    }

    // Upload logo if provided
    let logoUrl = null;
    if (req.file) {
      logoUrl = await uploadToGCS(req.file);
    }

    // Create brand
    const brand = await prisma.brand.create({
      data: {
        name: name.trim(),
        advertiserId: parseInt(advertiserId),
        categoryId: parseInt(categoryId),
        logo: logoUrl,
      },
    });

    res.status(201).json(brand);
  } catch (error) {
    console.error("Error creating brand:", error);
    res.status(500).json({ error: "Server error" });
  }
};

//Get All Brands for an Advertiser
exports.getBrands = async (req, res) => {
  const { advertiserId } = req.params;
  const { page = 1, limit = 9 } = req.query;

  try {
    // Validate advertiserId
    const parsedAdvertiserId = parseInt(advertiserId);
    if (isNaN(parsedAdvertiserId)) {
      return res.status(400).json({ error: "Invalid advertiser ID." });
    }

    // Use the paginate function
    const { data, total, totalPages } = await paginate(
      prisma.brand,
      parseInt(page),
      parseInt(limit),
      {
        advertiserId: parsedAdvertiserId,
      },
      {
        advertiser: true, // Populate Advertiser data
        category: true, // Populate Category data
      }
    );

    // Check if no brands were found
    if (data.length === 0) {
      return res.status(404).json({
        error: "No brands found for the specified advertiser ID.",
      });
    }

    res.status(200).json({
      data,
      total,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (err) {
    console.error("Error fetching brands:", err);
    res.status(500).json({ error: "Server error." });
  }
};

//Get All Brands for an Advertiser
exports.getAllBrands = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch paginated data with relationships
    const [brands, total] = await Promise.all([
      prisma.brand.findMany({
        skip,
        take: parseInt(limit),
        include: {
          advertiser: true, // Populate Advertiser data
          category: true, // Populate Category data
        },
      }),
      prisma.brand.count(), // Only count the total number of brands
    ]);

    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      data: brands,
      total,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({ error: "Error fetching brands." });
  }
};

//Update a Brand
exports.editBrand = async (req, res) => {
  const { id } = req.params; // Brand ID
  const { name, advertiserId, categoryId } = req.body; // Fields to update

  try {
    // Check if the brand exists
    const existingBrand = await prisma.brand.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingBrand) {
      return res.status(404).json({ error: "Brand not found." });
    }

    // Upload a new logo if provided
    let logoUrl = existingBrand.logo; // Default to the current logo
    if (req.file) {
      logoUrl = await uploadToGCS(req.file); // Upload the new logo and get the URL
    }

    // Update the brand
    const updatedBrand = await prisma.brand.update({
      where: { id: parseInt(id) },
      data: {
        name: name || existingBrand.name, // Update only if provided
        advertiserId: advertiserId
          ? parseInt(advertiserId)
          : existingBrand.advertiserId,
        categoryId: categoryId
          ? parseInt(categoryId)
          : existingBrand.categoryId,
        logo: logoUrl, // Update logo URL
      },
    });

    res
      .status(200)
      .json({ message: "Brand updated successfully", updatedBrand });
  } catch (error) {
    console.error("Error updating brand:", error);
    res.status(500).json({ error: "Error updating brand." });
  }
};

//Delete a Brand
exports.deleteBrand = async (req, res) => {
  const { id } = req.params; // Brand ID

  try {
    await prisma.brand.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: "Brand deleted successfully" });
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).json({ error: "Error deleting brand." });
  }
};
