const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

//Create an advertiser
exports.createAdvertiser = async (req, res) => {
  const { name } = req.body;
  try {
    const advertiser = await prisma.advertiser.create({
      data: {
        name: name,
      },
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
  try {
    const advertisers = await prisma.advertiser.findMany();
    res.json(advertisers);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};
