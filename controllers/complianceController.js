const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { uploadToGCS } = require("../Helpers/gcs");

exports.complianceUpload = async (req, res) => {
  const {
    siteCode,
    campaignId,
    advertiser,
    brand,
    city,
    address,
    boardType,
    mediaOwner,
    message,
    comment,
    status,
    bsv,
    structureId,
    posterId,
    illuminationId,
    routeId,
    sideId,
  } = req.body;

  const fieldAuditorId = req.user?.id;

  try {
    // Validate required fields
    const requiredFields = {
      siteCode,
      campaignId,
      advertiser,
      brand,
      city,
      address,
      boardType,
      mediaOwner,
      message,
      comment,
      structureId,
      posterId,
      illuminationId,
      routeId,
      sideId,
    };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return res.status(400).json({ error: `${key} is required.` });
      }
    }

    // Check if the site assignment exists for this auditor
    const siteAssignment = await prisma.siteAssignment.findFirst({
      where: { fieldAuditorId },
    });

    if (!siteAssignment) {
      return res.status(404).json({
        error: "No site assignment found for this auditor.",
      });
    }

    // Check for existing compliance report
    const existingReport = await prisma.complianceReport.findFirst({
      where: { siteCode, campaignId: parseInt(campaignId) },
    });

    if (existingReport) {
      return res.status(409).json({
        error:
          "A compliance report already exists for this siteCode and campaign.",
      });
    }

    // Handle image uploads
    let imageUrls = [];
    if (req.files?.length > 0) {
      try {
        for (const file of req.files) {
          const uploadedUrl = await uploadToGCS(file);
          imageUrls.push(uploadedUrl);
        }
      } catch (uploadError) {
        return res.status(500).json({
          error: "Error uploading images.",
          details: uploadError.message,
        });
      }
    }

    // Create the compliance report
    const complianceReport = await prisma.complianceReport.create({
      data: {
        siteCode,
        advertiser,
        brand,
        city,
        address,
        boardType,
        mediaOwner,
        message,
        comment,
        status: status || "pending",
        bsv: bsv || "0%",
        imageUrls,
        campaign: { connect: { id: parseInt(campaignId) } },
        Illumination: { connect: { id: parseInt(illuminationId) } },
        Poster: { connect: { id: parseInt(posterId) } },
        Route: { connect: { id: parseInt(routeId) } },
        Side: { connect: { id: parseInt(sideId) } },
        Structure: { connect: { id: parseInt(structureId) } },
        FieldAuditor: { connect: { id: parseInt(fieldAuditorId) } },
        siteAssignment: { connect: { id: parseInt(siteAssignment.id) } },
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
      details: error.message,
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

//Site Status update
exports.updateComplianceStatus = async (req, res) => {
  const { complianceReportId } = req.params;
  const { status } = req.body; // Expected: 'approved' or 'disapproved'

  if (!["approved", "disapproved"].includes(status)) {
    return res.status(400).json({ error: "Invalid status provided." });
  }

  try {
    // Fetch the compliance report
    const complianceReport = await prisma.complianceReport.findUnique({
      where: { id: parseInt(complianceReportId) },
      include: { siteAssignment: true },
    });

    if (!complianceReport) {
      return res.status(404).json({ error: "Compliance report not found." });
    }

    // Update the compliance report status
    const updatedComplianceReport = await prisma.complianceReport.update({
      where: { id: parseInt(complianceReportId) },
      data: { status },
    });

    // If status is 'approved', delete the corresponding site assignment
    if (status === "approved" && complianceReport.siteAssignmentId) {
      await prisma.siteAssignment.delete({
        where: { id: complianceReport.siteAssignmentId },
      });
    }

    res.status(200).json({
      message: `Compliance report status updated to '${status}'.`,
      updatedComplianceReport,
    });
  } catch (error) {
    console.error("Error updating compliance report status:", error);
    res.status(500).json({
      error: "An error occurred while updating the status.",
      details: error.message,
    });
  }
};
