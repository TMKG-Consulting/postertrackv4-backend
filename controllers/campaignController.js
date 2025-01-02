const xlsx = require("xlsx");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

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
      .send("Client ID and Account Manager ID are required.");
  }

  if (!req.file) {
    return res.status(400).send("A site list file is required.");
  }

  try {
    // Validate client and account manager
    const client = await prisma.user.findUnique({
      where: { id: parseInt(clientId), role: "CLIENT_AGENCY_USER" },
    });
    const accountManager = await prisma.user.findUnique({
      where: { id: parseInt(accountManagerId), role: "ACCOUNT_MANAGER" },
    });

    if (!client) {
      return res.status(404).send("Client not found.");
    }
    if (!accountManager) {
      return res.status(404).send("Account Manager not found.");
    }

    // Parse the uploaded file
    const { duplicates, data, error } = parseSiteList(req.file.path);

    if (error) {
      return res.status(400).send(error); // Handle missing columns
    }

    if (duplicates.length > 0 && !proceedWithDuplicates) {
      return res.status(400).json({
        message: "Duplicate board locations found.",
        duplicates,
        prompt: "Would you like to proceed with the upload?",
      });
    }

    // Create the campaign
    const campaign = await prisma.campaign.create({
      data: {
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
      select: { id: true, statesCovered: true },
    });

    const siteAssignments = [];
    const stateAuditorMap = {};

    // Map auditors to states they cover
    for (const auditor of fieldAuditors) {
      for (const state of auditor.statesCovered) {
        const normalizedState = state.trim().toLowerCase();
        if (!stateAuditorMap[normalizedState]) {
          stateAuditorMap[normalizedState] = [];
        }
        stateAuditorMap[normalizedState].push(auditor.id);
      }
    }

    // Assign sites to auditors evenly
    for (const [index, site] of data.entries()) {
      const state = site.state.trim().toLowerCase();
      const auditors = stateAuditorMap[state];

      if (auditors && auditors.length > 0) {
        // Distribute sites evenly among auditors for the state
        const auditorId = auditors[index % auditors.length];
        siteAssignments.push({
          campaignId: campaign.id,
          siteCode: site.code || `CODE-${Date.now()}-${index + 1}`, // Autogenerate code if empty
          fieldAuditorId: auditorId,
        });
      } else {
        // Skip allocation if no auditors for the state
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

//View a campaign
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
      return res.status(404).send("Campaign not found.");
    }

    // Check user permissions
    if (
      req.user.role === "ACCOUNT_MANAGER" &&
      campaign.accountManagerId !== req.user.id
    ) {
      return res
        .status(403)
        .send(
          "Permission Denied: You can only access your assigned campaigns."
        );
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
      return res
        .status(403)
        .send(
          "Permission Denied: Only authorized users can access this campaign."
        );
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error retrieving campaign." });
  }
};
