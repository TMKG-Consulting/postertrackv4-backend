const xlsx = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { campaignPaginate } = require("../Helpers/paginate");

const parseSiteList = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

  if (data.length === 0) {
    return { error: "The uploaded file is empty." };
  }

  const firstRow = data[0];
  if (firstRow.length !== 7) {
    return {
      error: `The uploaded file must have exactly 7 columns. Found ${firstRow.length}.`,
    };
  }

  const siteData = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (row.length !== 7) {
      return { error: `Row ${i + 1} does not have exactly 7 columns.` };
    }

    const [code, state, city, location, mediaOwner, brand, format] = row.map(
      (value) => value?.toString().trim() || ""
    );

    if (!location) continue;

    const generatedCode = code || `SITE-${i.toString().padStart(4, "0")}`;

    siteData.push({
      code: generatedCode,
      state,
      city,
      location,
      mediaOwner,
      brand,
      format,
    });
  }

  return { data: siteData };
};

exports.createCampaign = async (req, res) => {
  const { clientId, accountManagerId } = req.body;

  if (!clientId || !accountManagerId) {
    return res
      .status(400)
      .json({ error: "Client ID and Account Manager ID are required." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "A site list file is required." });
  }

  try {
    const client = await prisma.user.findUnique({
      where: { id: parseInt(clientId) },
      include: { advertiser: true },
    });

    if (!client || !client.advertiser || !client.advertiser.name) {
      return res.status(404).json({
        error:
          "Client or associated advertiser not found, or advertiser name is missing.",
      });
    }

    const accountManager = await prisma.user.findUnique({
      where: {
        id: parseInt(accountManagerId),
        OR: [{ role: "ACCOUNT_MANAGER" }, { role: "CHIEF_ACCOUNT_MANAGER" }],
      },
    });

    if (!accountManager) {
      return res
        .status(404)
        .json({ error: "Account Manager or Chief Account Manager not found." });
    }

    const currentDate = new Date();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    const existingCampaign = await prisma.campaign.findFirst({
      where: {
        clientId: parseInt(clientId),
        uploadedAt: {
          gte: new Date(currentYear, currentMonth, 1),
          lt: new Date(currentYear, currentMonth + 1, 1),
        },
      },
    });

    if (existingCampaign) {
      return res.status(400).json({
        error: `A campaign for this advertiser already exists for ${monthNames[currentMonth]}-${currentYear}.`,
      });
    }

    const { data, error } = parseSiteList(req.file.path);

    if (error) {
      return res.status(400).json({ error });
    }

    const generateCampaignID = async () => {
      const advertiserName = client.advertiser.name.slice(0, 3).toUpperCase();
      const month = monthNames[currentDate.getMonth()]
        .slice(0, 3)
        .toUpperCase();
      const year = currentDate.getFullYear().toString().slice(-2);

      const baseCampaignID = `${advertiserName}${month}${year}`;
      let uniqueID = baseCampaignID;
      let counter = 1;

      while (true) {
        const existingCampaign = await prisma.campaign.findUnique({
          where: { campaignID: uniqueID },
        });

        if (!existingCampaign) break;
        uniqueID = `${baseCampaignID}-${counter}`;
        counter++;
      }

      return uniqueID;
    };

    const campaignID = await generateCampaignID();

    const campaign = await prisma.campaign.create({
      data: {
        campaignID,
        clientId: parseInt(clientId),
        accountManagerId: parseInt(accountManagerId),
        siteList: data,
        uploadedAt: new Date(),
        totalSites: data.length,
      },
    });

    const fieldAuditors = await prisma.user.findMany({
      where: { role: "FIELD_AUDITOR" },
      include: {
        statesCovered: { select: { name: true } },
      },
    });

    const siteAssignments = [];
    const stateAuditorMap = {};

    for (const auditor of fieldAuditors) {
      for (const state of auditor.statesCovered) {
        const normalizedState = state.name.trim().toLowerCase();
        if (!stateAuditorMap[normalizedState]) {
          stateAuditorMap[normalizedState] = [];
        }
        stateAuditorMap[normalizedState].push(auditor.id);
      }
    }

    for (const [index, site] of data.entries()) {
      const state = site.state ? site.state.trim().toLowerCase() : "";
      const auditors = stateAuditorMap[state];

      if (auditors && auditors.length > 0) {
        const auditorId = auditors[index % auditors.length];
        siteAssignments.push({
          campaignId: campaign.id,
          siteCode: site.code || `CODE-${Date.now()}-${index + 1}`,
          fieldAuditorId: auditorId,
          status: "pending",
        });
      } else {
        console.warn(`No auditors found for state: ${state}`);
      }
    }

    await prisma.siteAssignment.createMany({ data: siteAssignments });

    res.status(201).json({
      message: "Campaign created and sites assigned to field auditors.",
      campaign,
      siteAssignments,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creating campaign." });
  }
};

exports.addSitesToCampaign = async (req, res) => {
  const { campaignId, proceedWithDuplicates } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: "Campaign ID is required." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "A site list file is required." });
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(campaignId) },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const existingSiteList = Array.isArray(campaign.siteList)
      ? campaign.siteList
      : [];

    const { duplicates, data, error } = parseSiteList(req.file.path);

    if (error) {
      return res.status(400).json({ error });
    }

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: "No valid site data found." });
    }

    if (duplicates && duplicates.length > 0 && !proceedWithDuplicates) {
      return res.status(400).json({
        error: "Duplicate board locations found.",
        duplicates,
        prompt: "Would you like to proceed with the upload?",
      });
    }

    const updatedSiteList = [...existingSiteList, ...data];

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        siteList: updatedSiteList,
        totalSites: updatedSiteList.length,
        editedAt: new Date(),
      },
    });

    const fieldAuditors = await prisma.user.findMany({
      where: { role: "FIELD_AUDITOR" },
      include: { statesCovered: { select: { name: true } } },
    });

    if (!fieldAuditors || fieldAuditors.length === 0) {
      return res
        .status(400)
        .json({ error: "No field auditors found for site assignments." });
    }

    const stateAuditorMap = fieldAuditors.reduce((map, auditor) => {
      auditor.statesCovered.forEach((state) => {
        const normalizedState = state.name.trim().toLowerCase();
        if (!map[normalizedState]) map[normalizedState] = [];
        map[normalizedState].push(auditor.id);
      });
      return map;
    }, {});

    const siteAssignments = data
      .map((site, index) => {
        const state = site.state ? site.state.trim().toLowerCase() : "";
        const auditors = stateAuditorMap[state] || [];

        if (auditors.length === 0) {
          console.warn(`No auditors found for state: ${state}`);
          return null;
        }

        const auditorId = auditors[index % auditors.length];
        return {
          campaignId: updatedCampaign.id,
          siteCode: site.code || `CODE-${Date.now()}-${index + 1}`,
          fieldAuditorId: auditorId,
          status: "pending",
        };
      })
      .filter(Boolean);

    if (siteAssignments.length > 0) {
      await prisma.siteAssignment.createMany({ data: siteAssignments });
    }

    res.status(200).json({
      message: "Sites added to campaign and assigned to field auditors.",
      updatedCampaign,
      siteAssignments,
    });
  } catch (error) {
    console.error("Error adding sites to campaign:", error);
    res.status(500).json({ error: "Error adding sites to campaign." });
  }
};

// View a campaign
exports.viewCampaign = async (req, res) => {
  const { id } = req.params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
      include: {
        client: true,
        accountManager: true,
        siteAssignments: true,
      },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    // Check user permissions
    if (
      req.user.role === "ACCOUNT_MANAGER" &&
      campaign.accountManagerId !== req.user.id
    ) {
      return res.status(403).json({
        error:
          "Permission Denied: You can only access your assigned campaigns.",
      });
    }

    if (
      req.user.role === "CHIEF_ACCOUNT_MANAGER" ||
      req.user.role === "SUPER_ADMIN" ||
      (req.user.role === "ACCOUNT_MANAGER" &&
        campaign.accountManagerId === req.user.id)
    ) {
      return res.status(200).json({
        campaign,
        siteList: campaign.siteList,
      });
    } else {
      return res.status(403).json({
        error:
          "Permission Denied: Only authorized users can access this campaign.",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error retrieving campaign." });
  }
};

// Fetch Campaigns Based on Role
exports.fetchCampaigns = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const { page = 1, limit = 10 } = req.query;

    // Define role-based filters
    let whereClause = {};
    if (role === "SUPER_ADMIN" || role === "CHIEF_ACCOUNT_MANAGER") {
      whereClause = {}; // No filter for these roles
    } else if (role === "ACCOUNT_MANAGER") {
      whereClause = { accountManagerId: userId }; // Filter for ACCOUNT_MANAGER
    } else {
      // Unauthorized access
      return res.status(403).json({
        error:
          "Permission Denied: You are not authorized to access this resource.",
      });
    }

    // Use the updated paginate function
    const {
      data: campaigns,
      total,
      totalPages,
    } = await campaignPaginate(
      prisma.campaign,
      parseInt(page),
      parseInt(limit),
      {
        where: whereClause,
        include: {
          client: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
              advertiser: true,
            },
          },
          accountManager: {
            select: {
              id: true,
              firstname: true,
              lastname: true,
              email: true,
            },
          },
          siteAssignments: {
            select: {
              id: true,
              siteCode: true,
              fieldAuditorId: true,
              status: true, // Include the status field
            },
          },
        },
      }
    );

    // Return the response with site assignments
    res.status(200).json({
      data: campaigns,
      total,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Error fetching campaigns:", error);
    res.status(500).json({ error: "Error fetching campaigns." });
  }
};

exports.deleteCampaign = async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Campaign ID is required." });
  }

  try {
    // Check if the campaign exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    // Delete related compliance reports first
    await prisma.complianceReport.deleteMany({
      where: {
        siteAssignment: { campaignId: parseInt(id) },
      },
    });

    // Delete related site assignments
    await prisma.siteAssignment.deleteMany({
      where: { campaignId: parseInt(id) },
    });

    // Delete the campaign
    await prisma.campaign.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: "Campaign successfully deleted." });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res.status(500).json({
      error: "An error occurred while deleting the campaign.",
      details: error.message,
    });
  }
};

//Get Assigned Sites
exports.getAssignedSites = async (req, res) => {
  const fieldAuditorId = req.user?.id;

  if (!fieldAuditorId) {
    return res.status(400).json({ error: "Field Auditor ID is required." });
  }

  try {
    const siteAssignments = await prisma.siteAssignment.findMany({
      where: { fieldAuditorId },
      include: {
        campaign: {
          select: {
            campaignID: true,
            siteList: true,
            uploadedAt: true,
            client: { select: { advertiser: true } },
          },
        },
      },
    });

    if (!siteAssignments.length) {
      return res.status(404).json({ message: "No site assignments found." });
    }

    const formattedData = siteAssignments.map((assignment) => {
      const siteList = assignment.campaign?.siteList;

      if (!Array.isArray(siteList)) {
        console.warn(
          "siteList is not an array for campaign:",
          assignment.campaign?.campaignID
        );
        return {
          siteCode: assignment.siteCode,
          error: "Site list data is malformed or missing.",
        };
      }

      const siteData = siteList.find((site) => {
        if (!site || typeof site.code !== "string") return false;
        return site.code.trim() === assignment.siteCode.trim();
      });

      if (!siteData) {
        console.warn(`No site data found for siteCode: ${assignment.siteCode}`);
      }

      return {
        siteAssignmentId: assignment.id,
        siteCode: assignment.siteCode,
        address: siteData?.location || "N/A",
        state: siteData?.state || "N/A",
        brand: siteData?.brand || "N/A",
        city: siteData?.city || "N/A",
        boardType: siteData?.format || "N/A",
        mediaOwner: siteData?.mediaOwner || "N/A",
        campaignID: assignment.campaign?.campaignID || "N/A",
        uploadedAt: assignment.campaign?.uploadedAt,
        advertiser: assignment.campaign?.client?.advertiser || "Unknown",
        status: assignment.status,
      };
    });

    res.status(200).json({
      message: "Assigned sites successfully retrieved.",
      assignedSites: formattedData,
    });
  } catch (error) {
    console.error("Error fetching assigned sites:", error);
    res.status(500).json({
      error: "An error occurred while retrieving assigned sites.",
    });
  }
};

//Get Campaign Allocations
exports.getCampaignAllocations = async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        client: { select: { advertiser: true } },
        accountManager: { select: { firstname: true, lastname: true } },
        siteAssignments: true,
      },
    });

    if (campaigns.length === 0) {
      return res.status(404).json({ message: "No campaigns found." });
    }

    const result = campaigns.map((campaign) => {
      const totalAuditors = new Set(
        campaign.siteAssignments.map((assignment) => assignment.fieldAuditorId)
      ).size;

      return {
        mainId: campaign.id,
        campaignId: campaign.campaignID,
        client: campaign.client?.advertiser || "N/A",
        accountManager:
          campaign.accountManager?.firstname +
            " " +
            campaign.accountManager?.lastname || "N/A",
        dateUploaded: campaign.uploadedAt,
        totalSites: campaign.totalSites,
        totalAuditors,
      };
    });

    res.status(200).json({
      message: "Campaign allocations retrieved successfully.",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching campaign allocations:", error);
    res.status(500).json({
      error: "An error occurred while retrieving campaign allocations.",
    });
  }
};

//View Sites Allocation
exports.viewAllocation = async (req, res) => {
  const { campaignId } = req.params;

  if (!campaignId) {
    return res.status(400).json({ error: "Campaign ID is required." });
  }

  try {
    // Fetch campaign to ensure it exists
    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(campaignId) },
      include: {
        siteAssignments: {
          include: {
            fieldAuditor: { select: { firstname: true, lastname: true } },
          },
        },
      },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    // Process data to group by field auditor
    const auditorTaskData = campaign.siteAssignments.reduce(
      (acc, assignment) => {
        const { fieldAuditor, status } = assignment;
        if (!fieldAuditor) return acc;

        const auditorName =
          fieldAuditor.firstname + " " + fieldAuditor.lastname;

        if (!acc[auditorName]) {
          acc[auditorName] = { totalSites: 0, approvedSites: 0 };
        }

        acc[auditorName].totalSites += 1;
        if (status.toLowerCase() === "approved") {
          acc[auditorName].approvedSites += 1;
        }

        return acc;
      },
      {}
    );

    // Format the response
    const result = Object.entries(auditorTaskData).map(([name, data]) => ({
      fieldAuditor: name,
      totalSites: data.totalSites,
      approvedSites: data.approvedSites,
    }));

    res.status(200).json({
      message: "Field auditor tasks retrieved successfully.",
      campaignId: campaign.campaignID,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching field auditor tasks:", error);
    res.status(500).json({
      error: "An error occurred while fetching field auditor tasks.",
    });
  }
};
