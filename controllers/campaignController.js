const xlsx = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { campaignPaginate } = require("../Helpers/paginate");

// const parseSiteList = (filePath) => {
//   const workbook = xlsx.readFile(filePath);
//   const sheet = workbook.Sheets[workbook.SheetNames[0]];
//   const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });

//   if (data.length === 0) {
//     return { error: "The uploaded file is empty." };
//   }

//   const firstRow = data[0];
//   if (firstRow.length !== 7) {
//     return {
//       error: `The uploaded file must have exactly 7 columns. Found ${firstRow.length}.`,
//     };
//   }

//   const seenLocations = new Map();
//   const duplicates = [];
//   const siteData = [];

//   for (let i = 1; i < data.length; i++) {
//     const row = data[i];

//     if (row.length !== 7) {
//       return { error: `Row ${i + 1} does not have exactly 7 columns.` };
//     }

//     const [code, state, city, location, mediaOwner, brand, format] = row;

//     if (!location || location.trim() === "") {
//       continue; // Skip rows with empty location values
//     }

//     // Check for exact match in the location column only
//     if (seenLocations.has(location)) {
//       const originalRow = seenLocations.get(location) + 1;
//       duplicates.push(
//         `Row ${
//           i + 1
//         }: Duplicate location "${location}" (originally in Row ${originalRow})`
//       );
//     } else {
//       seenLocations.set(location, i);
//     }

//     if (code && code.trim() !== "") {
//       return {
//         error: `Row ${i + 1} has a non-empty value in the 'code' column.`,
//       };
//     }

//     const generatedCode = `SITE-${i.toString().padStart(4, "0")}`;

//     siteData.push({
//       code: generatedCode,
//       state,
//       city,
//       location,
//       mediaOwner,
//       brand,
//       format,
//     });
//   }

//   return { duplicates, data: siteData };
// };

// Create a new Campaign

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

  const seenLocations = new Map();
  const duplicates = [];
  const siteData = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (row.length !== 7) {
      return { error: `Row ${i + 1} does not have exactly 7 columns.` };
    }

    const [code, state, city, location, mediaOwner, brand, format] = row.map(
      (value) => value?.toString().trim() || ""
    );

    // Skip rows with empty location values
    if (!location) continue;

    // Check for exact location duplicates
    if (seenLocations.has(location)) {
      duplicates.push({
        row: i + 1,
        code: code || `SITE-${i.toString().padStart(4, "0")}`,
        state,
        city,
        location,
        mediaOwner,
        brand,
        format,
      });
    } else {
      seenLocations.set(location, i);
    }

    // Generate a unique code if empty
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

  return { duplicates, data: siteData };
};

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
    // Validate client and fetch the related advertiser
    const client = await prisma.user.findUnique({
      where: { id: parseInt(clientId) },
      include: { advertiser: true }, // Include the advertiser relationship
    });

    if (!client || !client.advertiser || !client.advertiser.name) {
      return res.status(404).json({
        error:
          "Client or associated advertiser not found, or advertiser name is missing.",
      });
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

    // Check for existing campaign for the same advertiser in the current month
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
    const currentMonth = currentDate.getMonth(); // Zero-based month
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

    if (existingCampaign) {
      return res.status(400).json({
        error: `A campaign for this advertiser already exists for ${currentMonth}-${currentYear}.`,
      });
    }

    // Parse the uploaded file
    const { duplicates, data, error } = parseSiteList(req.file.path);

    if (error) {
      return res.status(400).json({ error }); // Handle missing columns
    }

    if (duplicates.length > 0 && !proceedWithDuplicates) {
      // Filter and populate only valid duplicates with meaningful data
      const populatedDuplicates = duplicates
        .filter((duplicate) =>
          Object.values(duplicate).some((value) => value && value !== "N/A")
        )
        .map((duplicate) => ({
          code: duplicate.code || "N/A",
          state: duplicate.state || "N/A",
          city: duplicate.city || "N/A",
          location: duplicate.location || "Unknown",
          mediaOwner: duplicate.mediaOwner || "N/A",
          brand: duplicate.brand || "N/A",
          format: duplicate.format || "N/A",
        }));

      return res.status(400).json({
        error: "Duplicate board locations found.",
        duplicates: populatedDuplicates,
        prompt: "Would you like to proceed with the upload?",
      });
    }

    // Auto-generate campaignID based on client name, current month, and year
    const generateCampaignID = async () => {
      const advertiserName = client.advertiser.name.slice(0, 3).toUpperCase(); // First 3 letters of advertiser name
      const currentDate = new Date();
      const monthNames = [
        "JAN",
        "FEB",
        "MAR",
        "APR",
        "MAY",
        "JUN",
        "JUL",
        "AUG",
        "SEP",
        "OCT",
        "NOV",
        "DEC",
      ];
      const month = monthNames[currentDate.getMonth()];
      const year = currentDate.getFullYear().toString().slice(-2); // Last 2 digits of year

      const baseCampaignID = `${advertiserName}${month}${year}`;
      let uniqueID = baseCampaignID;

      // Ensure campaignID is unique by appending a counter if necessary
      let counter = 1;
      while (true) {
        const existingCampaign = await prisma.campaign.findUnique({
          where: { campaignID: uniqueID },
        });

        if (!existingCampaign) break; // Unique campaignID found
        uniqueID = `${baseCampaignID}-${counter}`;
        counter++;
      }

      return uniqueID;
    };

    const campaignID = await generateCampaignID();

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

    const { duplicates, data, error } = parseSiteList(req.file.path);

    if (error) {
      return res.status(400).json({ error });
    }

    if (duplicates.length > 0 && !proceedWithDuplicates) {
      return res.status(400).json({
        error: "Duplicate board locations found.",
        duplicates,
        prompt: "Would you like to proceed with the upload?",
      });
    }

    // Update the campaign site list
    const updatedSiteList = [...campaign.siteList, ...data];

    const updatedCampaign = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        siteList: updatedSiteList,
        totalSites: updatedSiteList.length,
        editedAt: new Date(),
      },
    });

    // Fetch field auditors and map states to auditors
    const fieldAuditors = await prisma.user.findMany({
      where: { role: "FIELD_AUDITOR" },
      include: { statesCovered: { select: { name: true } } },
    });

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

    const siteAssignments = [];

    for (const [index, site] of data.entries()) {
      const state = site.state ? site.state.trim().toLowerCase() : "";
      const auditors = stateAuditorMap[state];

      if (auditors && auditors.length > 0) {
        const auditorId = auditors[index % auditors.length];
        siteAssignments.push({
          campaignId: updatedCampaign.id,
          siteCode: site.code || `CODE-${Date.now()}-${index + 1}`,
          fieldAuditorId: auditorId,
          status: "pending",
        });
      } else {
        console.warn(`No auditors found for state: ${state}`);
      }
    }

    await prisma.siteAssignment.createMany({ data: siteAssignments });

    res.status(200).json({
      message: "Sites added to campaign and assigned to field auditors.",
      updatedCampaign,
      siteAssignments,
    });
  } catch (error) {
    console.error(error);
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

    // Delete related site assignments first (if any)
    await prisma.siteAssignment.deleteMany({
      where: { campaignId: campaign.id },
    });

    // Delete the campaign
    await prisma.campaign.delete({
      where: { id: parseInt(id) },
    });

    res.status(200).json({ message: "Campaign successfully deleted." });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    res
      .status(500)
      .json({ error: "An error occurred while deleting the campaign." });
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
