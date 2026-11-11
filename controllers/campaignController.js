const xlsx = require("xlsx");
const prisma = require("../lib/prisma");
const { campaignPaginate, PAGE_SIZE } = require("../Helpers/paginate");

const normalizeCityName = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const coverageKey = (stateName, cityName) =>
  `${normalizeCityName(stateName)}|${normalizeCityName(cityName)}`;

const getClientIdsForAccountManager = async (accountManagerId) => {
  const assignments = await prisma.clientAccountManager.findMany({
    where: { accountManagerId },
    select: { clientId: true },
  });
  return assignments.map(({ clientId }) => clientId);
};

const editDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const citySimilarity = (uploadedName, databaseName) => {
  const uploaded = normalizeCityName(uploadedName);
  const database = normalizeCityName(databaseName);
  if (!uploaded || !database) return 0;
  if (uploaded === database) return 1;

  const uploadedWords = uploaded.split(" ");
  const databaseWords = database.split(" ");
  if (
    uploadedWords.length > 1 &&
    [...uploadedWords].sort().join(" ") === [...databaseWords].sort().join(" ")
  ) {
    return 0.99;
  }

  const uploadedSet = new Set(uploadedWords);
  const databaseSet = new Set(databaseWords);
  const smallerSet = uploadedSet.size <= databaseSet.size ? uploadedSet : databaseSet;
  const largerSet = uploadedSet.size <= databaseSet.size ? databaseSet : uploadedSet;
  if ([...smallerSet].every((word) => largerSet.has(word))) return 0.9;

  const compactUploaded = uploaded.replace(/\s/g, "");
  const compactDatabase = database.replace(/\s/g, "");
  if (Math.min(compactUploaded.length, compactDatabase.length) < 5) return 0;
  return 1 - editDistance(compactUploaded, compactDatabase) /
    Math.max(compactUploaded.length, compactDatabase.length);
};

const findMatchingCities = (uploadedName, cities, exactCitiesByName) => {
  const normalized = normalizeCityName(uploadedName);
  const exactMatches = exactCitiesByName.get(normalized);
  if (exactMatches?.length) return exactMatches;

  const ranked = cities
    .map((city) => ({ city, score: citySimilarity(uploadedName, city.name) }))
    .filter(({ score }) => score >= 0.8)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return [];

  const bestScore = ranked[0].score;
  const closeMatches = ranked.filter(({ score }) => bestScore - score < 0.06);
  return closeMatches.map(({ city }) => city);
};

const parseClientCampaignSiteList = (filePath) => {
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  if (!rows.length) return { error: "The uploaded file is empty." };

  const expectedColumns = 9;
  const header = rows[0].map((value) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
  );
  const hasHeader =
    header.length === expectedColumns &&
    ["sn", "sno", "serialnumber"].includes(header[0]);
  const startIndex = hasHeader ? 1 : 0;
  const siteList = [];

  for (let rowIndex = startIndex; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (row.every((value) => String(value ?? "").trim() === "")) continue;

    if (row.length !== expectedColumns) {
      return {
        error: `Row ${rowIndex + 1} must have exactly ${expectedColumns} columns.`,
      };
    }

    const [serialNumber, city, location, mediaOwner, brand, category, boardType, batch, company] =
      row.map((value) => String(value ?? "").trim());

    if (!city || !location || !mediaOwner || !brand || !category || !boardType || !company) {
      return {
        error: `Row ${rowIndex + 1} must include city, location, media owner, brand, category, board type, and company.`,
      };
    }

    siteList.push({
      code: serialNumber || `ROW-${rowIndex + 1}`,
      city,
      location,
      mediaOwner,
      brand,
      category,
      format: boardType,
      batch,
      company,
    });
  }

  if (!siteList.length) return { error: "No valid site rows found in the file." };
  return { data: siteList };
};

exports.createCampaign = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "A site list file is required." });
  }

  let createdCampaignIds = [];

  try {
    const { data, error } = parseClientCampaignSiteList(req.file.path);

    if (error) {
      return res.status(400).json({ error });
    }

    const clients = await prisma.user.findMany({
      where: { role: "CLIENT_AGENCY_USER" },
      include: { advertiser: true },
    });
    const clientNames = new Map();
    for (const client of clients) {
      const names = [
        client.advertiser?.name,
        `${client.firstname || ""} ${client.lastname || ""}`.trim(),
      ].filter(Boolean);
      for (const name of names) {
        const key = name.trim().toLowerCase();
        if (!clientNames.has(key)) clientNames.set(key, []);
        clientNames.get(key).push(client);
      }
    }

    const cities = await prisma.city.findMany({ include: { state: true } });
    const citiesByName = new Map();
    for (const city of cities) {
      const key = normalizeCityName(city.name);
      if (!citiesByName.has(key)) citiesByName.set(key, []);
      citiesByName.get(key).push(city);
    }

    const groupedSites = new Map();
    const codesByClient = new Map();
    for (const site of data) {
      const matchingClients = clientNames.get(site.company.trim().toLowerCase()) || [];
      const uniqueClients = [...new Map(matchingClients.map((client) => [client.id, client])).values()];
      if (uniqueClients.length !== 1) {
        return res.status(400).json({
          error:
            uniqueClients.length === 0
              ? `No existing client matches company '${site.company}'.`
              : `Company '${site.company}' matches multiple client records.`,
        });
      }

      const matchingCities = findMatchingCities(site.city, cities, citiesByName);
      if (matchingCities.length !== 1) {
        return res.status(400).json({
          error:
            matchingCities.length === 0
              ? `City '${site.city}' on row for '${site.company}' could not be matched to a database city.`
              : `City '${site.city}' matches multiple database cities. The upload must provide a name that uniquely identifies its city.`,
        });
      }

      const client = uniqueClients[0];
      const city = matchingCities[0];
      if (!groupedSites.has(client.id)) {
        groupedSites.set(client.id, {
          client,
          sites: [],
        });
        codesByClient.set(client.id, new Set());
      }

      const siteCodes = codesByClient.get(client.id);
      if (siteCodes.has(site.code)) {
        return res.status(400).json({
          error: `Duplicate S/N '${site.code}' for company '${site.company}'.`,
        });
      }
      siteCodes.add(site.code);
      groupedSites.get(client.id).sites.push({
        ...site,
        city: city.name,
        state: city.state.name,
      });
    }

    const clientIds = [...groupedSites.keys()];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const existingCampaigns = await prisma.campaign.findMany({
      where: {
        clientId: { in: clientIds },
        uploadedAt: { gte: monthStart, lt: nextMonthStart },
      },
      select: { clientId: true },
    });

    const existingThisMonth = new Set(existingCampaigns.map((campaign) => campaign.clientId));
    if (existingThisMonth.size) {
      const duplicateCompany = [...groupedSites.entries()].find(([clientId]) =>
        existingThisMonth.has(clientId)
      )?.[1].client;
      return res.status(400).json({
        error: `A campaign already exists this month for '${duplicateCompany?.advertiser?.name || "one of the uploaded clients"}'.`,
      });
    }

    const clientAssignments = await prisma.clientAccountManager.findMany({
      where: { clientId: { in: clientIds } },
      include: {
        accountManager: { select: { id: true, role: true, status: true } },
      },
    });
    const accountManagerByClient = new Map(
      clientAssignments.map((assignment) => [assignment.clientId, assignment.accountManager])
    );

    for (const [clientId, group] of groupedSites) {
      const accountManager = accountManagerByClient.get(clientId);
      if (
        !accountManager ||
        !["ACCOUNT_MANAGER", "CHIEF_ACCOUNT_MANAGER"].includes(accountManager.role) ||
        !accountManager.status
      ) {
        return res.status(400).json({
          error: `No active account manager is assigned to '${group.client.advertiser?.name || group.client.email}'. Assign the client to a manager before uploading the campaign.`,
        });
      }
    }

    const fieldAuditors = await prisma.user.findMany({
      where: { role: "FIELD_AUDITOR", status: true },
      include: {
        citiesCovered: { include: { state: { select: { name: true } } } },
      },
    });
    const cityAuditorMap = {};

    for (const auditor of fieldAuditors) {
      for (const city of auditor.citiesCovered) {
        const key = coverageKey(city.state.name, city.name);
        if (!cityAuditorMap[key]) {
          cityAuditorMap[key] = [];
        }
        cityAuditorMap[key].push(auditor.id);
      }
    }

    const auditorOffsets = new Map();

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
    const monthCode = monthNames[now.getMonth()].slice(0, 3).toUpperCase();
    const yearCode = String(now.getFullYear()).slice(-2);
    const reservedCampaignIds = new Set();
    const campaigns = [];

    for (const [clientId, group] of groupedSites) {
      const advertiserName = group.client.advertiser?.name || `${group.client.firstname || ""} ${group.client.lastname || ""}`.trim();
      const baseId = `${advertiserName.slice(0, 3).toUpperCase()}${monthCode}${yearCode}`;
      let campaignID = baseId;
      let suffix = 1;
      while (
        reservedCampaignIds.has(campaignID) ||
        (await prisma.campaign.findUnique({ where: { campaignID } }))
      ) {
        campaignID = `${baseId}-${suffix++}`;
      }
      reservedCampaignIds.add(campaignID);

      const accountManager = accountManagerByClient.get(clientId);
      const siteAssignments = group.sites.map((site) => {
        const key = coverageKey(site.state, site.city);
        const auditors = cityAuditorMap[key] || [];
        const offset = auditorOffsets.get(key) || 0;
        if (auditors.length) auditorOffsets.set(key, offset + 1);
        return {
          siteCode: site.code,
          fieldAuditorId: auditors.length ? auditors[offset % auditors.length] : null,
          status: auditors.length ? "pending" : "unassigned",
        };
      });

      const campaign = await prisma.campaign.create({
        data: {
          campaignID,
          clientId,
          accountManagerId: accountManager.id,
          siteList: group.sites,
          totalSites: group.sites.length,
          siteAssignments: { create: siteAssignments },
        },
        include: { siteAssignments: true },
      });
      campaigns.push(campaign);
      createdCampaignIds.push(campaign.id);
    }

    return res.status(201).json({
      message: `Created ${campaigns.length} client campaigns from the uploaded site list.`,
      campaigns,
    });
  } catch (error) {
    console.error(error);
    if (createdCampaignIds.length) {
      try {
        await prisma.siteAssignment.deleteMany({
          where: { campaignId: { in: createdCampaignIds } },
        });
        await prisma.campaign.deleteMany({
          where: { id: { in: createdCampaignIds } },
        });
      } catch (rollbackError) {
        console.error("Error rolling back imported campaigns:", rollbackError);
      }
    }
    res.status(500).json({ error: "Error creating campaign." });
  }
};

exports.addSitesToCampaign = async (req, res) => {
  const { campaignId } = req.body;

  if (!campaignId) {
    return res.status(400).json({ error: "Campaign ID is required." });
  }

  if (!req.file) {
    return res.status(400).json({ error: "A site list file is required." });
  }

  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: parseInt(campaignId) },
      include: { client: { include: { advertiser: true } } },
    });

    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found." });
    }

    const existingSiteList = Array.isArray(campaign.siteList)
      ? campaign.siteList
      : [];

    const { data, error } = parseClientCampaignSiteList(req.file.path);

    if (error) {
      return res.status(400).json({ error });
    }

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: "No valid site data found." });
    }

    const expectedCompanyNames = [
      campaign.client.advertiser?.name,
      `${campaign.client.firstname || ""} ${campaign.client.lastname || ""}`.trim(),
    ]
      .filter(Boolean)
      .map(normalizeCityName);
    const existingCodes = new Set(
      existingSiteList.map((site) => normalizeCityName(site.code)).filter(Boolean)
    );
    const cities = await prisma.city.findMany({ include: { state: true } });
    const citiesByName = new Map();
    for (const city of cities) {
      const key = normalizeCityName(city.name);
      if (!citiesByName.has(key)) citiesByName.set(key, []);
      citiesByName.get(key).push(city);
    }

    const normalizedSites = [];
    for (const site of data) {
      if (!expectedCompanyNames.includes(normalizeCityName(site.company))) {
        return res.status(400).json({
          error: `Company '${site.company}' does not match the client for campaign '${campaign.campaignID}'.`,
        });
      }

      const matchingCities = findMatchingCities(site.city, cities, citiesByName);
      if (matchingCities.length !== 1) {
        return res.status(400).json({
          error: matchingCities.length
            ? `City '${site.city}' matches multiple database cities.`
            : `City '${site.city}' could not be matched to a database city.`,
        });
      }

      const siteCodeKey = normalizeCityName(site.code);
      if (existingCodes.has(siteCodeKey)) {
        return res.status(400).json({ error: `Duplicate S/N '${site.code}' in this campaign.` });
      }
      existingCodes.add(siteCodeKey);

      const matchedCity = matchingCities[0];
      normalizedSites.push({
        ...site,
        city: matchedCity.name,
        state: matchedCity.state.name,
      });
    }

    const updatedSiteList = [...existingSiteList, ...normalizedSites];

    const fieldAuditors = await prisma.user.findMany({
      where: { role: "FIELD_AUDITOR", status: true },
      include: {
        citiesCovered: { include: { state: { select: { name: true } } } },
      },
    });

    const cityAuditorMap = fieldAuditors.reduce((map, auditor) => {
      auditor.citiesCovered.forEach((city) => {
        const key = coverageKey(city.state.name, city.name);
        if (!map[key]) map[key] = [];
        map[key].push(auditor.id);
      });
      return map;
    }, {});

    const auditorOffsets = new Map();
    const siteAssignments = normalizedSites.map((site, index) => {
      const key = coverageKey(site.state, site.city);
      const auditors = cityAuditorMap[key] || [];
      const offset = auditorOffsets.get(key) || 0;
      if (auditors.length) auditorOffsets.set(key, offset + 1);

      return {
        campaignId: campaign.id,
        siteCode: site.code || `CODE-${Date.now()}-${index + 1}`,
        fieldAuditorId: auditors.length ? auditors[offset % auditors.length] : null,
        status: auditors.length ? "pending" : "unassigned",
      };
    });

    const [updatedCampaign] = await prisma.$transaction([
      prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          siteList: updatedSiteList,
          totalSites: updatedSiteList.length,
          editedAt: new Date(),
        },
      }),
      prisma.siteAssignment.createMany({ data: siteAssignments }),
    ]);

    return res.status(200).json({
      message: "Sites added using the campaign site list format; sites without city coverage are marked unassigned.",
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
    const { page = 1, search = "" } = req.query;
    const limit = PAGE_SIZE;

    // Define role-based filters
    let whereClause = {};
    if (role === "SUPER_ADMIN" || role === "CHIEF_ACCOUNT_MANAGER") {
      whereClause = {}; // No filter for these roles
    } else if (role === "ACCOUNT_MANAGER") {
      whereClause = { accountManagerId: userId }; // Filter for ACCOUNT_MANAGER
    } else {
      return res.status(403).json({
        error:
          "Permission Denied: You are not authorized to access this resource.",
      });
    }

    // Apply search filter on advertiser name
    if (search) {
      whereClause.client = {
        advertiser: {
          name: {
            contains: search,
            mode: "insensitive",
          },
        },
      };
    }

    // Fetch paginated campaigns
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
              email: true,
              advertiser: true, // Ensure advertiser relation is included
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
              status: true,
            },
          },
        },
      }
    );

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
        ComplianceReport: {
          select: {
            status: true,
            disapprovalReason: true,
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
        category: siteData?.category || "N/A",
        city: siteData?.city || "N/A",
        boardType: siteData?.format || "N/A",
        batch: siteData?.batch || "N/A",
        mediaOwner: siteData?.mediaOwner || "N/A",
        mainCampaignId: assignment.campaignId || "N/A",
        campaignID: assignment.campaign?.campaignID || "N/A",
        uploadedAt: assignment.campaign?.uploadedAt,
        advertiser: assignment.campaign?.client?.advertiser || "Unknown",
        status: assignment.status,
        disapprovalReason:
          assignment.ComplianceReport?.find(
            (report) => report.status === "disapproved"
          )?.disapprovalReason || null,
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
    if (![
      "SUPER_ADMIN",
      "CHIEF_ACCOUNT_MANAGER",
      "ACCOUNT_MANAGER",
    ].includes(req.user.role)) {
      return res.status(403).json({ error: "You are not authorized to view campaign allocations." });
    }

    const where =
      req.user.role === "ACCOUNT_MANAGER"
        ? { clientId: { in: await getClientIdsForAccountManager(req.user.id) } }
        : {};
    const campaigns = await prisma.campaign.findMany({
      where,
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
        campaign.siteAssignments
          .map((assignment) => assignment.fieldAuditorId)
          .filter((auditorId) => auditorId !== null)
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

    if (req.user.role === "ACCOUNT_MANAGER") {
      const clientAssignment = await prisma.clientAccountManager.findUnique({
        where: { clientId: campaign.clientId },
        select: { accountManagerId: true },
      });
      if (clientAssignment?.accountManagerId !== req.user.id) {
        return res.status(403).json({ error: "You can only view allocations for clients assigned to you." });
      }
    } else if (!["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER"].includes(req.user.role)) {
      return res.status(403).json({ error: "You are not authorized to view campaign allocations." });
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

exports.getUnassignedSiteAssignments = async (req, res) => {
  try {
    let campaignIds;
    if (req.user.role === "ACCOUNT_MANAGER") {
      const clientIds = await getClientIdsForAccountManager(req.user.id);
      const assignedCampaigns = await prisma.campaign.findMany({
        where: { clientId: { in: clientIds } },
        select: { id: true },
      });
      campaignIds = assignedCampaigns.map(({ id }) => id);
    }
    const where = {
      fieldAuditorId: null,
      ...(campaignIds ? { campaignId: { in: campaignIds } } : {}),
    };
    const assignments = await prisma.siteAssignment.findMany({
      where,
      include: {
        campaign: {
          select: {
            id: true,
            campaignID: true,
            siteList: true,
            client: { select: { advertiser: true } },
          },
        },
      },
      orderBy: { uploadedAt: "desc" },
    });

    const data = assignments.map((assignment) => ({
      ...assignment,
      site: Array.isArray(assignment.campaign.siteList)
        ? assignment.campaign.siteList.find(
            (site) => String(site.code) === String(assignment.siteCode)
          ) || null
        : null,
    }));
    return res.status(200).json({ data, total: data.length });
  } catch (error) {
    console.error("Error fetching unassigned sites:", error);
    return res.status(500).json({ error: "Error fetching unassigned sites." });
  }
};

exports.assignSiteToAuditor = async (req, res) => {
  const assignmentId = Number(req.params.id);
  const fieldAuditorId = Number(req.body.fieldAuditorId);
  if (!Number.isInteger(assignmentId) || !Number.isInteger(fieldAuditorId)) {
    return res.status(400).json({ error: "Valid assignment ID and fieldAuditorId are required." });
  }

  try {
    const assignment = await prisma.siteAssignment.findUnique({
      where: { id: assignmentId },
      include: { campaign: true },
    });
    if (!assignment) return res.status(404).json({ error: "Site assignment not found." });

    if (
      req.user.role === "ACCOUNT_MANAGER" &&
      (await prisma.clientAccountManager.findUnique({
        where: { clientId: assignment.campaign.clientId },
        select: { accountManagerId: true },
      }))?.accountManagerId !== req.user.id
    ) {
      return res.status(403).json({ error: "You can only assign sites for clients assigned to you." });
    }
    if (!["SUPER_ADMIN", "CHIEF_ACCOUNT_MANAGER", "ACCOUNT_MANAGER"].includes(req.user.role)) {
      return res.status(403).json({ error: "You are not authorized to assign sites." });
    }

    const auditor = await prisma.user.findFirst({
      where: { id: fieldAuditorId, role: "FIELD_AUDITOR", status: true },
      include: {
        citiesCovered: { include: { state: { select: { name: true } } } },
      },
    });
    if (!auditor) {
      return res.status(400).json({ error: "Select an active field auditor." });
    }

    const site = Array.isArray(assignment.campaign.siteList)
      ? assignment.campaign.siteList.find(
          (item) => String(item.code) === String(assignment.siteCode)
        )
      : null;
    if (!site?.city || !site?.state) {
      return res.status(400).json({ error: "The site city and state could not be resolved." });
    }

    const auditorCoversSite = auditor.citiesCovered.some(
      (city) => coverageKey(city.state.name, city.name) === coverageKey(site.state, site.city)
    );
    if (!auditorCoversSite) {
      return res.status(400).json({
        error: `${auditor.firstname || "The selected auditor"} does not cover ${site.city}, ${site.state}.`,
      });
    }

    const updated = await prisma.siteAssignment.update({
      where: { id: assignmentId },
      data: { fieldAuditorId: auditor.id, status: "pending", editedAt: new Date() },
      include: {
        fieldAuditor: { select: { id: true, firstname: true, lastname: true } },
      },
    });
    return res.status(200).json({ message: "Site assigned to field auditor.", assignment: updated });
  } catch (error) {
    console.error("Error assigning site to auditor:", error);
    return res.status(500).json({ error: "Error assigning site to auditor." });
  }
};
