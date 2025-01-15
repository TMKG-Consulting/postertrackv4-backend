const xlsx = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { campaignPaginate } = require("../Helpers/paginate");

// Function to parse uploaded file and check for duplicates
const parseSiteList = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 }); // Read as a 2D array

  // Validate if the file has at least one row (headers)
  if (data.length === 0) {
    return { error: "The uploaded file is empty." };
  }

  // Validate the number of columns
  const firstRow = data[0];
  if (firstRow.length !== 7) {
    return {
      error: `The uploaded file must have exactly 7 columns. Found ${firstRow.length}.`,
    };
  }

  // Extract board locations for duplicate detection
  const boardLocations = new Set();
  const duplicates = [];
  const siteData = [];

  // Validate rows for duplicates and structure
  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (row.length !== 7) {
      return { error: `Row ${i + 1} does not have exactly 7 columns.` };
    }

    const [code, state, city, location, mediaOwner, brand, format] = row;

    // Validate that the `code` column is empty
    if (code && code.trim() !== "") {
      return {
        error: `Row ${i + 1} has a non-empty value in the 'code' column.`,
      };
    }

    // Check for duplicates in the location column (4th column)
    if (boardLocations.has(location)) {
      duplicates.push(location);
    } else {
      boardLocations.add(location);
    }

    // Generate a unique code for each site
    const generatedCode = `SITE-${i.toString().padStart(4, "0")}`;

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

  return { duplicates, data: siteData };
};

// Create a new Campaign
exports.createCampaign = async (req, res) => {
  const { clientId, accountManagerId, proceedWithDuplicates } = req.body;

  if (!clientId || !accountManagerId) {
    return res
      .status(400)
      .json({ error: "Client ID and Account Manager ID are required." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "A site list file is required." });
  }

  try {
    // Validate client
    const client = await prisma.user.findUnique({
      where: { id: parseInt(clientId), role: "CLIENT_AGENCY_USER" },
    });

    if (!client) {
      return res.status(404).json({ error: "Client not found." });
    }

    // Validate account manager (include both roles)
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

    // Parse the uploaded file
    const { duplicates, data, error } = parseSiteList(req.file.path);

    if (error) {
      return res.status(400).json({ error }); // Handle missing columns
    }

    if (duplicates.length > 0 && !proceedWithDuplicates) {
      return res.status(400).json({
        error: "Duplicate board locations found.",
        duplicates,
        prompt: "Would you like to proceed with the upload?",
      });
    }

    // Auto-generate campaignID (5-digit code)
    const generateCampaignID = () => {
      const randomCode = Math.floor(10000 + Math.random() * 90000);
      return `CMP-${randomCode}`;
    };

    let campaignID;
    let isUnique = false;

    // Ensure campaignID is unique
    while (!isUnique) {
      campaignID = generateCampaignID();
      const existingCampaign = await prisma.campaign.findUnique({
        where: { campaignID },
      });
      isUnique = !existingCampaign;
    }

    // Create the campaign
    const campaign = await prisma.campaign.create({
      data: {
        campaignID, // Auto-generated ID
        clientId: parseInt(clientId),
        accountManagerId: parseInt(accountManagerId),
        siteList: data,
        uploadedAt: new Date(),
        totalSites: data.length,
      },
    });

    // Distribute sites to field auditors based on states covered
    const fieldAuditors = await prisma.user.findMany({
      where: { role: "FIELD_AUDITOR" },
      include: {
        statesCovered: {
          select: { name: true }, // Retrieve state names
        },
      },
    });

    const siteAssignments = [];
    const stateAuditorMap = {};

    // Map auditors to states they cover
    for (const auditor of fieldAuditors) {
      for (const state of auditor.statesCovered) {
        const normalizedState = state.name.trim().toLowerCase();
        if (!stateAuditorMap[normalizedState]) {
          stateAuditorMap[normalizedState] = [];
        }
        stateAuditorMap[normalizedState].push(auditor.id);
      }
    }

    // Assign sites to auditors evenly
    for (const [index, site] of data.entries()) {
      const state = site.state ? site.state.trim().toLowerCase() : "";
      const auditors = stateAuditorMap[state];

      if (auditors && auditors.length > 0) {
        // Distribute sites evenly among auditors for the state
        const auditorId = auditors[index % auditors.length];
        siteAssignments.push({
          campaignId: campaign.id,
          siteCode: site.code || `CODE-${Date.now()}-${index + 1}`, // Autogenerate code if empty
          fieldAuditorId: auditorId,
          status: "pending", // Initialize status as pending
        });
      } else {
        console.warn(`No auditors found for state: ${state}`);
      }
    }

    // Save site assignments in the database
    await prisma.siteAssignment.createMany({
      data: siteAssignments,
    });

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

// View a campaign
exports.viewCampaign = async (req, res) => {
  const { id } = req.params;

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(id) },
      include: {
        client: true,
        accountManager: true,
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

//Site Status update
exports.updateSiteStatus = async (req, res) => {
  try {
    const { siteAssignmentId, status } = req.body;
    const { role, id: userId } = req.user;

    // Validate input
    if (!siteAssignmentId || !status) {
      return res.status(400).json({
        error: "Site assignment ID and status are required.",
      });
    }

    // Validate status value
    const validStatuses = ["pending", "approved", "disapproved"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Allowed values are: ${validStatuses.join(
          ", "
        )}`,
      });
    }

    // Check if the site assignment exists
    const siteAssignment = await prisma.siteAssignment.findUnique({
      where: { id: parseInt(siteAssignmentId) },
      include: {
        campaign: {
          select: { accountManagerId: true },
        },
      },
    });

    if (!siteAssignment) {
      return res.status(404).json({
        error: "Site assignment not found.",
      });
    }

    // Role-based access control
    if (role === "ACCOUNT_MANAGER") {
      if (siteAssignment.campaign.accountManagerId !== userId) {
        return res.status(403).json({
          error:
            "Permission Denied: You can only manage sites in your campaigns.",
        });
      }
    } else if (role !== "SUPER_ADMIN" && role !== "CHIEF_ACCOUNT_MANAGER") {
      return res.status(403).json({
        error:
          "Permission Denied: You are not authorized to approve or disapprove site uploads.",
      });
    }

    // Update the site status
    const updatedSiteAssignment = await prisma.siteAssignment.update({
      where: { id: parseInt(siteAssignmentId) },
      data: { status },
    });

    res.status(200).json({
      message: "Site status updated successfully.",
      updatedSiteAssignment,
    });
  } catch (error) {
    console.error("Error updating site status:", error);
    res.status(500).json({ error: "Error updating site status." });
  }
};
