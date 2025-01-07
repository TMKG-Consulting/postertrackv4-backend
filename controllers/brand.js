const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

//Create a brand
exports.createBrand = async (req, res) => {
  const { name, advertiserId, categoryId } = req.body;
  try {
    const brand = await prisma.brand.create({
      data: {
        name,
        advertiserId,
        categoryId,
      },
    });
    res.json(brand);
  } catch (error) {
    res.json({ error: "Server error" });
  }
};

//Get All Brands for an Advertiser
exports.getBrands = async (req, res) => {
  const { advertiserId } = req.params;
  try {
    const brands = await prisma.brand.findMany({
      where: { advertiserId: parseInt(advertiserId) },
      include: {
        advertiser: true, // Include Advertiser data
        category: true, // Include Category data
      },
    });
    res.json(brands);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
    console.log(err);
  }
};

//Get All Brands for an Advertiser
exports.getAllBrands = async (req, res) => {
  try {
    const brands = await prisma.brand.findMany();
    res.json(brands);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
