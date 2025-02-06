const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { uploadToGCS } = require("../Helpers/gcs");

exports.complianceUpload = async (req, res) => {
  const {
    siteCode,
    campaignId,
    advertiser,
    brand,
    address,
    boardType,
    mediaOwner,
    message,
    comment,
    status,
    structureId,
    posterId,
    illuminationId,
    routeId,
    sideId,
  } = req.body;

  // Extract user ID from middleware token
  const fieldAuditorId = req.user?.id;

  if (
    !siteCode ||
    !campaignId ||
    !advertiser ||
    !brand ||
    !address ||
    !boardType ||
    !mediaOwner ||
    !message ||
    !comment ||
    !status ||
    !structureId ||
    !posterId ||
    !illuminationId ||
    !routeId ||
    !sideId
  ) {
    return res
      .status(400)
      .json({ error: "All required fields must be provided." });
  }

  try {
    // Check if the site assignment exists for this auditor
    const siteAssignment = await prisma.siteAssignment.findFirst({
      where: {
        fieldAuditorId,
      },
    });

    if (!siteAssignment) {
      return res
        .status(404)
        .json({ error: "Site assignment not found for the given user." });
    }

    // Handle file uploads (images)
    const imageUrls = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadedUrl = await uploadToGCS(file);
        imageUrls.push(uploadedUrl);
      }
    }

    // Create the compliance report
    const complianceReport = await prisma.complianceReport.create({
      data: {
        siteCode,
        campaignId: parseInt(campaignId),
        advertiser,
        brand,
        address,
        boardType,
        mediaOwner,
        message,
        comment,
        status,
        structureId: parseInt(structureId),
        posterId: parseInt(posterId),
        illuminationId: parseInt(illuminationId),
        routeId: parseInt(routeId),
        sideId: parseInt(sideId),
        imageUrls,
        uploadedBy: fieldAuditorId,
      },
    });

    res.status(201).json({
      message: "Compliance report successfully created.",
      complianceReport,
    });
  } catch (error) {
    console.error("Error creating compliance report:", error);
    res.status(500).json({
      error: "An error occurred while creating the compliance report.",
    });
  }
};

// Create a new structure
exports.createStructure = async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Structure name is required." });
  }

  try {
    const structure = await prisma.structure.create({
      data: { name },
    });
    res
      .status(201)
      .json({ message: "Structure created successfully", structure });
  } catch (error) {
    console.error("Error creating structure:", error);
    res
      .status(500)
      .json({ error: "An error occurred while creating the structure." });
  }
};

// Get all structures
exports.getAllStructures = async (req, res) => {
  try {
    const structures = await prisma.structure.findMany();
    res.status(200).json({ structures });
  } catch (error) {
    console.error("Error fetching structures:", error);
    res
      .status(500)
      .json({ error: "An error occurred while fetching structures." });
  }
};

//Create other entities (posters, illuminations, routes, sides) in a similar way
exports.createEntity = (model) => async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: `${model} name is required.` });
  }

  try {
    const entity = await prisma[model.toLowerCase()].create({
      data: { name },
    });
    res.status(201).json({ message: `${model} created successfully`, entity });
  } catch (error) {
    console.error(`Error creating ${model}:`, error);
    res
      .status(500)
      .json({ error: `An error occurred while creating the ${model}.` });
  }
};

exports.getAllEntities = (model) => async (req, res) => {
  try {
    const entities = await prisma[model.toLowerCase()].findMany();
    res.status(200).json({ entities });
  } catch (error) {
    console.error(`Error fetching ${model}s:`, error);
    res
      .status(500)
      .json({ error: `An error occurred while fetching ${model}s.` });
  }
};
