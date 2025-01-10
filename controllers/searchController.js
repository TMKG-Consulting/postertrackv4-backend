const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.search = async (req, res) => {
  const { q, type } = req.query; // `q` is the search term, `type` is the entity type

  if (!q || !type) {
    return res
      .status(400)
      .json({ error: "Search term (`q`) and type (`type`) are required." });
  }

  try {
    let results = [];
    const searchTerm = q.trim();

    switch (type.toLowerCase()) {
      case "advertiser":
        results = await prisma.advertiser.findMany({
          where: {
            name: {
              contains: searchTerm,
              mode: "insensitive", // Case-insensitive search
            },
          },
        });
        break;

      case "brand":
        results = await prisma.brand.findMany({
          where: {
            name: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
          include: {
            advertiser: true, // Include related advertiser data
            category: true, // Include related category data
          },
        });
        break;

      case "category":
        results = await prisma.category.findMany({
          where: {
            name: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        });
        break;

      case "user":
        results = await prisma.user.findMany({
          where: {
            OR: [
              { firstname: { contains: searchTerm, mode: "insensitive" } },
              { lastname: { contains: searchTerm, mode: "insensitive" } },
              { email: { contains: searchTerm, mode: "insensitive" } },
            ],
          },
        });
        break;

      default:
        return res
          .status(400)
          .json({
            error:
              "Invalid search type. Use 'advertiser', 'brand', 'category', or 'user'.",
          });
    }

    res.status(200).json({ type, results });
  } catch (error) {
    console.error("Error performing search:", error);
    res.status(500).json({ error: "Error performing search." });
  }
};
