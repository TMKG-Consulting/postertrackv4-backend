const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { uploadGCS } = require("../Helpers/gcs");
const { transporter } = require("../Helpers/transporter");
const ExifParser = require("exif-parser");
const { applyWatermarks } = require("../Helpers/watermark");

exports.complianceUpload = async (req, res) => {
  const { siteAssignmentId } = req.params;
  const {
    siteCode,
    campaignId,
    advertiser,
    brand,
    city,
    state,
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

  if (!siteAssignmentId) {
    return res.status(400).json({ error: "Site Assignment ID is required." });
  }

  try {
    const requiredFields = {
      siteCode,
      campaignId,
      advertiser,
      brand,
      city,
      state,
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

    const siteAssignment = await prisma.siteAssignment.findFirst({
      where: { id: parseInt(siteAssignmentId), fieldAuditorId },
    });

    if (!siteAssignment) {
      return res.status(404).json({
        error:
          "No site assignment found for this auditor or invalid site assignment.",
      });
    }

    if (siteAssignment.siteCode !== siteCode) {
      return res.status(400).json({
        error: `Provided site code '${siteCode}' does not match the assigned site code '${siteAssignment.siteCode}'.`,
      });
    }

    const existingReport = await prisma.complianceReport.findFirst({
      where: { siteCode, campaignId: parseInt(campaignId) },
    });

    if (existingReport) {
      return res.status(409).json({
        error:
          "A compliance report already exists for this siteCode and campaign.",
      });
    }

    let imageUrls = [];
    let capturedTimestamps = [];
    let geolocations = [];

    if (req.files?.length > 0) {
      for (const file of req.files) {
        try {
          const buffer = file.buffer;
          if (!buffer) {
            return res
              .status(400)
              .json({ error: `Invalid file data for '${file.originalname}'` });
          }

          const parser = ExifParser.create(buffer);
          const exifData = parser.parse();

          const latitude = exifData.tags?.GPSLatitude;
          const longitude = exifData.tags?.GPSLongitude;
          if (!latitude || !longitude) {
            return res.status(400).json({
              error: `Image '${file.originalname}' must contain GPS geotag information.`,
            });
          }

          const captureDate = exifData.tags?.DateTimeOriginal;
          if (!captureDate) {
            return res.status(400).json({
              error: `Image '${file.originalname}' must contain capture date and timestamp.`,
            });
          }

          const timestamp = new Date(captureDate * 1000).toISOString();
          capturedTimestamps.push({ timestamp, filename: file.originalname });
          geolocations.push({ latitude, longitude });

          const watermarkedBuffer = await applyWatermarks(
            buffer,
            captureDate,
            city
          );

          const uploadedUrl = await uploadGCS({
            buffer: watermarkedBuffer,
            filename: file.originalname,
          });

          imageUrls.push(uploadedUrl);
        } catch (error) {
          return res.status(500).json({
            error: "Error processing or uploading images.",
            details: error.message,
          });
        }
      }
    } else {
      return res.status(400).json({ error: "At least one image is required." });
    }

    const newComplianceReport = await prisma.complianceReport.create({
      data: {
        siteCode,
        advertiser,
        brand,
        city,
        state,
        address,
        boardType,
        mediaOwner,
        message,
        comment,
        status: status || "pending",
        bsv: bsv || "0%",
        imageUrls,
        geolocations: JSON.stringify(geolocations),
        capturedTimestamps: JSON.stringify(capturedTimestamps),
        campaign: { connect: { id: parseInt(campaignId) } },
        Illumination: { connect: { id: parseInt(illuminationId) } },
        Poster: { connect: { id: parseInt(posterId) } },
        Route: { connect: { id: parseInt(routeId) } },
        Side: { connect: { id: parseInt(sideId) } },
        Structure: { connect: { id: parseInt(structureId) } },
        FieldAuditor: { connect: { id: parseInt(fieldAuditorId) } },
        siteAssignment: { connect: { id: parseInt(siteAssignmentId) } },
        uploadedAt: new Date(),
      },
    });

    // Fetch the compliance report again to include related data
    const complianceReport = await prisma.complianceReport.findUnique({
      where: { id: newComplianceReport.id },
      include: {
        campaign: {
          include: {
            client: {
              select: { advertiser: true, email: true, additionalEmail: true },
            },
            accountManager: { select: { firstname: true, email: true } },
          },
        },
        Poster: true,
        Structure: true,
      },
    });

    // Validate if Poster or Structure is not OK and send aberration alert
    const posterStatus = complianceReport.Poster.name || "N/A";
    const structureStatus = complianceReport.Structure?.name || "N/A";

    // Parse captured timestamps for visit date-time
    let visitDateTime = "N/A";
    try {
      const timestamps = JSON.parse(
        complianceReport.capturedTimestamps || "[]"
      );
      if (timestamps.length > 0) {
        const firstCapturedTimestamp = timestamps[0]?.timestamp;
        if (firstCapturedTimestamp) {
          visitDateTime = new Date(firstCapturedTimestamp)
            .toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
            .replace(",", " |")
            .toLowerCase();
        }
      }
    } catch (error) {
      console.error("Error parsing timestamps:", error);
    }

    if (posterStatus !== "Ok" || structureStatus !== "Ok") {
      const accountManagerName =
        complianceReport.campaign?.accountManager?.firstname ||
        "Account Manager";
      const accountManagerEmail =
        complianceReport.campaign?.accountManager?.email;

      const aberrationDetails = `
        <div style="text-align: left;">
          <p>Dear ${accountManagerName},</p>
          <p>An aberration has been detected. Please review the compliance report below:</p>
          <p><b>Campaign Code:</b> ${
            complianceReport.campaign?.campaignID || "N/A"
          }</p>
          <p><b>SITE ID:</b> ${complianceReport.siteCode || "N/A"}</p>
          <p><b>Brand:</b> ${complianceReport.brand || "N/A"}</p>
          <p><b>City:</b> ${complianceReport.city || "N/A"}</p>
          <p><b>Location:</b> ${complianceReport.address || "N/A"}</p>
          <p><b>Format:</b> ${complianceReport.boardType || "N/A"}</p>
          <p><b>Media Owner:</b> ${complianceReport.mediaOwner || "N/A"}</p>
          <p><b>Aberration:</b> ${posterStatus} </p>
          <p><b>Poster Status:</b> ${posterStatus} </p>
          <p><b>Visit Date-Time:</b> ${visitDateTime}</p>
        </div>
      `;

      const attachments = complianceReport.imageUrls.map((url) => ({
        filename: url.split("/").pop(),
        path: url,
      }));

      try {
        await transporter.sendMail({
          from: `"TMKG Media Audit" <${process.env.EMAIL_USER}>`,
          to: accountManagerEmail,
          subject: "OOH Compliance Aberration Alert!",
          html: aberrationDetails,
          attachments,
        });

        console.log("Aberration alert email sent successfully.");
        return res.status(201).json({
          message: "Compliance report successfully created.",
          complianceReport,
        });
      } catch (emailError) {
        console.error("Error sending aberration email:", emailError);
      }
    }

    res.status(201).json({
      message: "Compliance report successfully created.",
      newComplianceReport,
    });
  } catch (error) {
    console.error("Error creating compliance report:", error);
    res.status(500).json({
      error: "An error occurred while creating the compliance report.",
      details: error.message,
    });
  }
};

exports.getAllComplianceUploads = async (req, res) => {
  const { user } = req;
  let { page = 1, limit = 10 } = req.query; // Default to page 1, 10 records per page

  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  try {
    if (!user || !user.role) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    let whereClause = {}; // Default: Super Admin & Chief Account Manager see all records

    if (user.role === "ACCOUNT_MANAGER") {
      whereClause = {
        campaign: {
          accountManagerId: user.id, // Account Managers only see their campaigns
        },
      };
    } else if (!["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"].includes(user.role)) {
      return res.status(403).json({ error: "Access denied." });
    }

    // Fetch compliance reports with pagination
    const [complianceReports, totalRecords] = await Promise.all([
      prisma.complianceReport.findMany({
        where: whereClause,
        include: {
          Illumination: true,
          Poster: true,
          Route: true,
          Side: true,
          Structure: true,
          siteAssignment: true,
          FieldAuditor: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { uploadedAt: "desc" }, // Sort by latest uploads
      }),
      prisma.complianceReport.count({ where: whereClause }),
    ]);

    if (complianceReports.length === 0) {
      return res.status(200).json({
        message: "No compliance reports found.",
        uploads: [],
      });
    }

    res.status(200).json({
      message: "Compliance uploads retrieved successfully.",
      data: complianceReports,
      pagination: {
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
        currentPage: page,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching compliance uploads:", error);
    res.status(500).json({
      error: "An error occurred while fetching compliance uploads.",
      details: error.message,
    });
  }
};

exports.viewComplianceUpload = async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch a single compliance report by its ID
    const complianceReport = await prisma.complianceReport.findUnique({
      where: { id: parseInt(id) },
      include: {
        Illumination: true,
        Poster: true,
        Route: true,
        Side: true,
        Structure: true,
        siteAssignment: true,
        FieldAuditor: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });

    if (!complianceReport) {
      return res.status(404).json({ message: "Compliance upload not found." });
    }

    res.status(200).json({
      message: "Compliance upload retrieved successfully.",
      data: complianceReport,
    });
  } catch (error) {
    console.error("Error fetching compliance upload:", error);
    res.status(500).json({
      error: "An error occurred while fetching the compliance upload.",
      details: error.message,
    });
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

exports.getAllComplianceEntities = async (req, res) => {
  try {
    const [structures, posters, illuminations, routes, sides] =
      await Promise.all([
        prisma.structure.findMany(),
        prisma.poster.findMany(),
        prisma.illumination.findMany(),
        prisma.route.findMany(),
        prisma.side.findMany(),
      ]);

    res.status(200).json({
      message: "Entities fetched successfully.",
      data: {
        structures,
        posters,
        illuminations,
        routes,
        sides,
      },
    });
  } catch (error) {
    console.error("Error fetching entities:", error);
    res.status(500).json({
      error: "An error occurred while fetching entities.",
      details: error.message,
    });
  }
};

//Site Status update
exports.updateComplianceStatus = async (req, res) => {
  const { id } = req.params;
  const { status, disapprovalReason } = req.body;

  if (!id || !status) {
    return res
      .status(400)
      .json({ error: "Compliance ID and status are required." });
  }

  try {
    const complianceReport = await prisma.complianceReport.findUnique({
      where: { id: parseInt(id) },
      include: {
        siteAssignment: true,
        campaign: {
          include: {
            client: {
              select: { advertiser: true, email: true, additionalEmail: true },
            },
            accountManager: true,
          },
        },
        Poster: true,
        Structure: true,
      },
    });

    if (!complianceReport) {
      return res.status(404).json({ error: "Compliance report not found." });
    }

    // Parse captured timestamps for visit date-time
    let visitDateTime = "N/A";
    try {
      const timestamps = JSON.parse(
        complianceReport.capturedTimestamps || "[]"
      );
      if (timestamps.length > 0) {
        const firstCapturedTimestamp = timestamps[0]?.timestamp;
        if (firstCapturedTimestamp) {
          visitDateTime = new Date(firstCapturedTimestamp)
            .toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
            .replace(",", " |")
            .toLowerCase();
        }
      }
    } catch (error) {
      console.error("Error parsing timestamps:", error);
    }

    // Handle disapproval case
    if (status === "disapproved") {
      if (!disapprovalReason) {
        return res
          .status(400)
          .json({ error: "Disapproval reason is required." });
      }

      await prisma.complianceReport.update({
        where: { id: parseInt(id) },
        data: { status },
      });

      if (complianceReport.siteAssignmentId) {
        await prisma.siteAssignment.update({
          where: { id: complianceReport.siteAssignmentId },
          data: { status },
        });
      }

      return res.status(200).json({
        message: "Compliance report marked as disapproved.",
        disapprovalReason,
      });
    }

    // Handle approval logic
    const isPosterOk = complianceReport.Poster.name === "Ok";
    const isStructureOk = complianceReport.Structure.name === "Ok";

    await prisma.complianceReport.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    if (complianceReport.siteAssignmentId) {
      await prisma.siteAssignment.update({
        where: { id: complianceReport.siteAssignmentId },
        data: { status },
      });
    }

    // If either Poster or Structure is NOT "Ok", send an aberration alert
    if (status === "approved" && (!isPosterOk || !isStructureOk)) {
      const clientName =
        complianceReport.campaign?.client?.advertiser.name || "Client";
      const aberrationDetails = `
        <div style="text-align: left;">
          <p>Dear ${clientName},</p>
          <p>Find below details of aberration on your OOH display as captured by our field force:</p>
          <p><b>Campaign Code:</b> ${
            complianceReport.campaign?.campaignID || "N/A"
          }</p>
          <p><b>SITE ID:</b> ${complianceReport.siteCode || "N/A"}</p>
          <p><b>Brand:</b> ${complianceReport.brand || "N/A"}</p>
          <p><b>City:</b> ${complianceReport.city || "N/A"}</p>
          <p><b>Location:</b> ${complianceReport.address || "N/A"}</p>
          <p><b>Format:</b> ${complianceReport.boardType || "N/A"}</p>
          <p><b>Media Owner:</b> ${complianceReport.mediaOwner || "N/A"}</p>
          <p><b>Aberration:</b> ${complianceReport.Poster.name || "N/A"}</p>
          <p><b>Poster Status:</b> ${complianceReport.Poster.name || "N/A"}</p>
          <p><b>Visit Date-Time:</b> ${visitDateTime}</p>
        </div>
      `;

      const attachments = (complianceReport.imageUrls || []).map((url) => ({
        filename: url.split("/").pop(),
        path: url,
      }));

      const clientEmail = complianceReport.campaign?.client?.email;
      const additionalEmails =
        complianceReport.campaign?.client?.additionalEmail;

      // Convert comma-separated string to an array if needed
      if (typeof additionalEmails === "string") {
        additionalEmails = additionalEmails
          .split(",")
          .map((email) => email.trim());
      }

      const recipients = [clientEmail, ...additionalEmails].filter(Boolean);

      if (recipients.length > 0) {
        try {
          for (const recipient of recipients) {
            await transporter.sendMail({
              from: `"TMKG Media Audit" <${process.env.EMAIL_USER}>`,
              to: recipient,
              subject: "OOH Compliance Aberration Alert!",
              html: aberrationDetails,
              attachments,
            });
          }
          console.log("Aberration alert emails sent successfully.");
        } catch (emailError) {
          console.error("Error sending email:", emailError);
        }
      } else {
        console.warn("No valid recipients found for aberration alert email.");
      }
    }

    return res.status(200).json({
      message: "Compliance report status successfully updated.",
    });
  } catch (error) {
    console.error("Error updating compliance report status:", error);
    return res.status(500).json({
      error: "An error occurred while updating compliance report status.",
    });
  }
};

// Controller to fetch pending compliance report sites
exports.getPendingComplianceSites = async (req, res) => {
  try {
    // Extract user from request
    const { user } = req;

    // Get pagination params with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    let whereCondition = { status: "pending" };

    // Restrict Account Managers to only see their assigned sites
    if (user.role === "ACCOUNT_MANAGER") {
      whereCondition = {
        ...whereCondition,
        campaign: {
          accountManagerId: user.id,
        },
      };
    }

    // Count total pending compliance reports based on user role
    const totalRecords = await prisma.complianceReport.count({
      where: whereCondition,
    });

    // If no records, return an empty array
    if (totalRecords === 0) {
      return res.status(200).json({
        message: "No pending compliance reports found.",
        pendingSites: [],
      });
    }

    // Fetch paginated pending compliance reports based on user role
    const pendingComplianceReports = await prisma.complianceReport.findMany({
      where: whereCondition,
      include: {
        siteAssignment: true,
        campaign: {
          select: {
            campaignID: true,
            client: { select: { advertiser: true } },
          },
        },
      },
      skip,
      take: limit,
      orderBy: { uploadedAt: "desc" }, // Sorting by newest first
    });

    // Format the response data
    const formattedData = pendingComplianceReports.map((report) => ({
      complianceId: report.id,
      siteCode: report.siteCode,
      campaignId: report.campaign?.campaignID || "N/A",
      city: report.city,
      brand: report.brand,
      address: report.address,
      siteAssignmentId: report.siteAssignmentId,
      advertiser: report.campaign?.client?.advertiser || "Unknown",
      uploadedAt: report.uploadedAt,
      fieldAuditorId: report.fieldAuditorId,
      status: report.status,
    }));

    res.status(200).json({
      message: "Pending compliance reports retrieved successfully.",
      currentPage: page,
      totalPages: Math.ceil(totalRecords / limit),
      totalRecords,
      hasNextPage: page * limit < totalRecords,
      pendingSites: formattedData,
    });
  } catch (error) {
    console.error("Error fetching pending compliance sites:", error);
    res.status(500).json({
      error: "An error occurred while retrieving pending compliance sites.",
    });
  }
};

// Controller to fetch compliance reports by site code
exports.checkComplianceUpload = async (req, res) => {
  const { siteAssignmentId } = req.params;

  try {
    // Find compliance report by siteAssignmentId
    const complianceReport = await prisma.complianceReport.findFirst({
      where: { siteAssignmentId: parseInt(siteAssignmentId) },
      include: {
        Structure: true,
        Poster: true,
        Illumination: true,
        Route: true,
        Side: true,
      },
    });

    if (!complianceReport) {
      return res.status(404).json({
        error: "No compliance upload found for this site assignment.",
      });
    }

    res.status(200).json(complianceReport);
  } catch (error) {
    console.error("Error fetching compliance report:", error);
    res.status(500).json({
      error: "An error occurred while fetching the compliance report.",
    });
  }
};

exports.getAllUploadedCampaigns = async (req, res) => {
  const { user } = req;
  let { page = 1, limit = 10 } = req.query;

  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  try {
    if (!user || !user.role) {
      return res.status(403).json({ error: "Unauthorized access." });
    }

    let whereClause = {
      ComplianceReport: { some: {} }, // Ensure only campaigns with compliance uploads
    };

    if (user.role === "ACCOUNT_MANAGER") {
      whereClause.accountManagerId = user.id; // Account Managers only see their campaigns
    } else if (!["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"].includes(user.role)) {
      return res.status(403).json({ error: "Access denied." });
    }

    // Fetch campaigns with compliance uploads and their total sites
    const [campaigns, totalRecords] = await Promise.all([
      prisma.campaign.findMany({
        where: whereClause,
        select: {
          id: true,
          campaignID: true,
          client: {
            select: { advertiser: true },
          },
          uploadedAt: true, // Date uploaded
          _count: {
            select: { ComplianceReport: true }, // Count of compliance reports (sites)
          },
        },
        skip: offset,
        take: limit,
        orderBy: { uploadedAt: "desc" }, // Sort by latest uploads
      }),
      prisma.campaign.count({ where: whereClause }),
    ]);

    if (campaigns.length === 0) {
      return res.status(200).json({
        message: "No campaign uploads found.",
        currentPage: page,
        totalPages: 0,
        totalRecords: 0,
        hasNextPage: false,
        campaigns: [],
      });
    }

    // Format response
    const formattedCampaigns = campaigns.map((campaign) => ({
      id: campaign.id,
      campaignID: campaign.campaignID,
      clientName: campaign.client?.advertiser || "N/A",
      dateUploaded: campaign.uploadedAt,
      totalSites: campaign._count.ComplianceReport || 0,
    }));

    res.status(200).json({
      message: "Campaign uploads retrieved successfully.",
      data: formattedCampaigns,
      pagination: {
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
        currentPage: page,
        perPage: limit,
      },
    });
  } catch (error) {
    console.error("Error fetching uploaded campaigns:", error);
    res.status(500).json({
      error: "An error occurred while fetching uploaded campaigns.",
      details: error.message,
    });
  }
};

exports.getComplianceReportsForCampaign = async (req, res) => {
  const { campaignID } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const userRole = req.user.role;
  const accountManagerID = req.user.id;

  if (!campaignID) {
    return res.status(400).json({ error: "Campaign ID is required." });
  }

  try {
    // Base query conditions
    const whereCondition = { campaignId: parseInt(campaignID) };

    // Restrict data access for Account Managers
    if (userRole === "ACCOUNT_MANAGER") {
      whereCondition["campaign.accountManagerId"] = accountManagerID;
    }

    // Fetch compliance reports with pagination
    const complianceReports = await prisma.complianceReport.findMany({
      where: whereCondition,
      include: {
        siteAssignment: true,
        campaign: {
          include: {
            client: { select: { advertiser: true } },
            accountManager: {
              select: { firstname: true, lastname: true, email: true },
            },
          },
        },
        Poster: true,
        Structure: true,
        Route: true,
        Side: true,
        Illumination: true,
        FieldAuditor: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: parseInt(limit),
    });

    if (complianceReports.length === 0) {
      return res.status(200).json({
        message: "No pending compliance reports found.",
        Reports: [],
      });
    }

    res.status(200).json({
      message: "Compliance reports retrieved successfully.",
      data: complianceReports,
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        totalRecords: complianceReports.length,
      },
    });
  } catch (error) {
    console.error("Error fetching compliance reports:", error);
    res.status(500).json({
      error: "An error occurred while fetching compliance reports.",
      details: error.message,
    });
  }
};

exports.updateComplianceReport = async (req, res) => {
  const { id } = req.params;
  const {
    bsv,
    comment,
    structureId,
    posterId,
    illuminationId,
    routeId,
    sideId,
    visibilityDistance,
    trafficDensity,
    trafficSpeed,
    angleVision,
    clutterBillboard,
    clutterFormat,
    proximityCompetition,
    pedestrianTraffic
  } = req.body;

  if (
    !bsv &&
    !comment &&
    !structureId &&
    !posterId &&
    !illuminationId &&
    !routeId &&
    !sideId
  ) {
    return res
      .status(400)
      .json({ error: "At least one field must be provided for update." });
  }

  try {
    const complianceReport = await prisma.complianceReport.findUnique({
      where: { id: parseInt(id) },
      include: {
        Structure: true,
        Poster: true,
        campaign: {
          select: {
            client: {
              select: {
                email: true,
                additionalEmail: true,
                advertiser: { select: { name: true } },
              },
            },
            campaignID: true,
          },
        },
      },
    });

    if (!complianceReport) {
      return res.status(404).json({ error: "Compliance report not found." });
    }

    const updateData = {};
    if (bsv) updateData.bsv = bsv;
    if (comment) updateData.comment = comment;
    if (structureId)
      updateData.Structure = { connect: { id: parseInt(structureId) } };
    if (posterId) updateData.Poster = { connect: { id: parseInt(posterId) } };
    if (illuminationId)
      updateData.Illumination = { connect: { id: parseInt(illuminationId) } };
    if (routeId) updateData.Route = { connect: { id: parseInt(routeId) } };
    if (sideId) updateData.Side = { connect: { id: parseInt(sideId) } };
    if (visibilityDistance) updateData.visibilityDistance = visibilityDistance;
    if (trafficDensity) updateData.trafficDensity = trafficDensity;
    if (trafficSpeed) updateData.trafficSpeed = trafficSpeed;
    if (angleVision) updateData.angleVision = angleVision;
    if (clutterBillboard) updateData.clutterBillboard = clutterBillboard;
    if (clutterFormat) updateData.clutterFormat = clutterFormat;
    if (proximityCompetition) updateData.proximityCompetition = proximityCompetition;
    if (pedestrianTraffic) updateData.pedestrianTraffic = pedestrianTraffic;

    const updatedCompliance = await prisma.complianceReport.update({
      where: { id: parseInt(id) },
      data: updateData,
      include: {
        Structure: true,
        Poster: true,
        Illumination: true,
        Route: true,
        Side: true,
      },
    });

    // Get new status after update
    const newPosterStatus = updatedCompliance.Poster?.name || "N/A";
    const newStructureStatus = updatedCompliance.Structure?.name || "N/A";

    // Check if poster or structure is not "Ok" after update
    const isPosterChanged = newPosterStatus !== "Ok";
    const isStructureChanged = newStructureStatus !== "Ok";

    if (isPosterChanged || isStructureChanged) {
      const clientEmail = complianceReport.campaign?.client?.email;
      let additionalEmails = complianceReport.campaign?.client?.additionalEmail;
      const clientName =
        complianceReport.campaign?.client?.advertiser?.name || "Client";

      if (typeof additionalEmails === "string") {
        additionalEmails = additionalEmails
          .split(",")
          .map((email) => email.trim());
      }

      const recipients = [clientEmail, ...additionalEmails].filter(Boolean);

      let visitDateTime = "N/A";
      try {
        const timestamps = JSON.parse(
          complianceReport.capturedTimestamps || "[]"
        );
        if (timestamps.length > 0) {
          visitDateTime = new Date(timestamps[0]?.timestamp)
            .toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
            .replace(",", " |")
            .toLowerCase();
        }
      } catch (error) {
        console.error("Error parsing timestamps:", error);
      }

      const aberrationDetails = `
        <div style="text-align: left; font-family: Arial, sans-serif;">
          <p>Dear ${clientName},</p>
          <p>Find below details of aberration on your OOH display as captured by our field force:</p>
          <p><b>Campaign Code:</b> ${
            complianceReport.campaign?.campaignID || "N/A"
          }</p>
          <p><b>SITE ID:</b> ${complianceReport.siteCode || "N/A"}</p>
          <p><b>Brand:</b> ${complianceReport.brand || "N/A"}</p>
          <p><b>City:</b> ${complianceReport.city || "N/A"}</p>
          <p><b>Location:</b> ${complianceReport.address || "N/A"}</p>
          <p><b>Format:</b> ${complianceReport.boardType || "N/A"}</p>
          <p><b>Media Owner:</b> ${complianceReport.mediaOwner || "N/A"}</p>
          <p><b>Aberration:</b> ${newPosterStatus}</p>
          <p><b>Poster Status:</b> ${newPosterStatus}</p>
          <p><b>Structure Status:</b> ${newStructureStatus}</p>
          <p><b>Visit Date-Time:</b> ${visitDateTime}</p>
        </div>
      `;

      const attachments = (complianceReport.imageUrls || []).map((url) => ({
        filename: url.split("/").pop(),
        path: url,
      }));

      if (recipients.length > 0) {
        try {
          console.log("Sending email...");
          for (const recipient of recipients) {
            await transporter.sendMail({
              from: `"TMKG Media Audit" <${process.env.EMAIL_USER}>`,
              to: recipient,
              subject: "OOH Compliance Aberration Alert!",
              html: aberrationDetails,
              attachments,
            });
            console.log(`Email sent successfully to: ${recipient}`);
          }
        } catch (emailError) {
          console.error("Error sending email:", emailError);
        }
      } else {
        console.warn("No valid recipients found for aberration alert email.");
      }
    } else {
      console.log("No status change detected. Email will not be sent.");
    }

    res.status(200).json({
      message: "Compliance report updated successfully.",
      updatedCompliance,
    });
  } catch (error) {
    console.error("Error updating compliance report:", error);
    res.status(500).json({
      error: "An error occurred while updating the compliance report.",
    });
  }
};

exports.getPendingApprovalsByAuditor = async (req, res) => {
  try {
    const { userId, role } = req.user; // Extract user ID and role from the token

    // Ensure only field auditors can access this route
    if (role !== "FIELD_AUDITOR") {
      return res
        .status(403)
        .json({ error: "Access denied. Unauthorized role." });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Count total pending approvals for the authenticated field auditor
    const totalRecords = await prisma.complianceReport.count({
      where: { fieldAuditorId: userId, status: "pending" },
    });

    // If no records, return an empty array
    if (totalRecords === 0) {
      return res.status(200).json({
        message: "No pending approvals found.",
        currentPage: page,
        totalPages: 0,
        totalRecords: 0,
        hasNextPage: false,
        pendingApprovals: [],
      });
    }

    // Fetch pending approvals for the authenticated field auditor
    const pendingApprovals = await prisma.complianceReport.findMany({
      where: { fieldAuditorId: userId, status: "pending" },
      include: {
        siteAssignment: true,
        campaign: {
          select: {
            campaignID: true,
            client: { select: { advertiser: true } },
          },
        },
      },
      skip,
      take: limit,
      orderBy: { uploadedAt: "desc" }, // Sorting by newest first
    });

    // Format the response data
    const formattedData = pendingApprovals.map((report) => ({
      complianceId: report.id,
      siteCode: report.siteCode,
      campaignId: report.campaign?.campaignID || "N/A",
      city: report.city,
      brand: report.brand,
      address: report.address,
      siteAssignmentId: report.siteAssignmentId,
      advertiser: report.campaign?.client?.advertiser || "Unknown",
      uploadedAt: report.uploadedAt,
      fieldAuditorId: report.fieldAuditorId,
      status: report.status,
    }));

    res.status(200).json({
      message: "Pending approvals retrieved successfully.",
      currentPage: page,
      totalPages: Math.ceil(totalRecords / limit),
      totalRecords,
      hasNextPage: page * limit < totalRecords,
      pendingApprovals: formattedData,
    });
  } catch (error) {
    console.error("Error fetching pending approvals:", error);
    res.status(500).json({
      error: "An error occurred while retrieving pending approvals.",
    });
  }
};
