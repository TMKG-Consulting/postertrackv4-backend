const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

//Create BSV Values in a similar way
exports.createBsvValue = (model) => async (req, res) => {
  const { num } = req.body;

  if (!num) {
    return res.status(400).json({ error: `${model} number is required.` });
  }

  try {
    const entity = await prisma[model].create({
      data: { number: parseInt(num) },
    });
    res.status(201).json({ message: `${model} created successfully`, entity });
  } catch (error) {
    console.error(`Error creating ${model}:`, error);
    res
      .status(500)
      .json({ error: `An error occurred while creating the ${model}.` });
  }
};

exports.getAllBsvValues = (model) => async (req, res) => {
  try {
    const values = await prisma[model].findMany();
    res.status(200).json({ values });
  } catch (error) {
    console.error(`Error fetching ${model}s:`, error);
    res
      .status(500)
      .json({ error: `An error occurred while fetching ${model}s.` });
  }
};
