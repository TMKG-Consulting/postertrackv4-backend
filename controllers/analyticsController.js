const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getAnalyticsOverview = async (req, res) => {
  try {
    // Perform parallel queries to fetch required counts
    const [
      totalClients,
      totalBrands,
      totalAdvertisers,
      totalFieldAuditors,
      totalSites,
      totalCampaigns,
    ] = await Promise.all([
      prisma.user.count({ where: { role: "CLIENT_AGENCY_USER" } }), // Clients
      prisma.brand.count(), // Brands
      prisma.advertiser.count(), // Advertisers
      prisma.user.count({ where: { role: "FIELD_AUDITOR" } }), // Field Auditors
      prisma.siteAssignment.count(), // Sites
      prisma.campaign.count(), // Campaigns
    ]);

    // Return analytics overview
    res.status(200).json({
      totalClients,
      totalBrands,
      totalAdvertisers,
      totalFieldAuditors,
      totalSites,
      totalCampaigns,
    });
  } catch (error) {
    console.error("Error fetching analytics overview:", error);
    res.status(500).json({ error: "Failed to fetch analytics data." });
  }
};
