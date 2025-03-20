const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const ExifParser = require("exif-parser");
const { uploadGCS } = require("../Helpers/gcs");
const { applyWatermarks } = require("../Helpers/watermark");

exports.competitiveUpload = async (req, res) => {
  try {
    let { brand, advertiser, boardType, category, region, state, city } =
      req.body;
    const fieldAuditorId = req.user?.id;

    // Ensure category is an array (even if a single category is provided)
    let categoryIds = Array.isArray(category) ? category : [category];
    categoryIds = categoryIds.map((id) => parseInt(id));

    // Check if brand exists and fetch its advertiser and category
    let brandRecord = await prisma.brand.findFirst({
      where: { name: brand },
      include: {
        advertiser: true,
        category: true,
      },
    });

    if (brandRecord) {
      // If brand exists, use its advertiser and category
      advertiser = brandRecord.advertiser.name;
      categoryIds = [brandRecord.categoryId]; // Use the brand's existing category
    } else {
      // If brand does not exist, ensure advertiser is created
      let advertiserRecord = await prisma.advertiser.findUnique({
        where: { name: advertiser },
        include: { advertiserCategories: true },
      });

      if (!advertiserRecord) {
        // Create new advertiser and assign categories
        advertiserRecord = await prisma.advertiser.create({
          data: {
            name: advertiser,
            advertiserCategories: {
              create: categoryIds.map((categoryId) => ({
                category: { connect: { id: categoryId } },
              })),
            },
          },
        });
      } else {
        // Ensure all selected categories are assigned to the advertiser
        const existingCategoryIds = advertiserRecord.advertiserCategories.map(
          (cat) => cat.categoryId
        );
        const newCategoryIds = categoryIds.filter(
          (categoryId) => !existingCategoryIds.includes(categoryId)
        );

        if (newCategoryIds.length > 0) {
          await prisma.advertiser.update({
            where: { id: advertiserRecord.id },
            data: {
              advertiserCategories: {
                create: newCategoryIds.map((categoryId) => ({
                  category: { connect: { id: categoryId } },
                })),
              },
            },
          });
        }
      }

      // Create the new brand and link it to the advertiser
      brandRecord = await prisma.brand.create({
        data: {
          name: brand,
          advertiserId: advertiserRecord.id,
          categoryId: categoryIds[0], // Use the first category
        },
      });
    }

    let images = [];
    let capturedTimestamps = [];
    let geolocations = [];

    // Process and Upload Images
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
            return res
              .status(400)
              .json({
                error: `Image '${file.originalname}' must contain GPS geotag information.`,
              });
          }

          const captureDate = exifData.tags?.DateTimeOriginal;
          if (!captureDate) {
            return res
              .status(400)
              .json({
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

          images.push(uploadedUrl);
        } catch (error) {
          return res
            .status(500)
            .json({
              error: "Error processing or uploading images.",
              details: error.message,
            });
        }
      }
    } else {
      return res.status(400).json({ error: "At least one image is required." });
    }

    // Create Competitive Report Entry
    const newEntry = await prisma.competitiveReport.create({
      data: {
        FieldAuditor: { connect: { id: parseInt(fieldAuditorId) } },
        images,
        geolocations: JSON.stringify(geolocations),
        capturedTimestamps: JSON.stringify(capturedTimestamps),
        advertiser: { connect: { id: parseInt(brandRecord.advertiserId) } },
        brand: { connect: { id: parseInt(brandRecord.id) } },
        boardType: { connect: { id: parseInt(boardType) } },
        category: { connect: { id: parseInt(categoryIds[0]) } },
        region: { connect: { id: parseInt(region) } },
        state: { connect: { id: parseInt(state) } },
        city: { connect: { id: parseInt(city) } },
      },
    });

    res.status(201).json(newEntry);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error creating competitive entry" });
  }
};

exports.viewCompetitiveUpload = async (req, res) => {
  const { id } = req.params;

  try {
    // Fetch a single compliance report by its ID
    const competitiveReport = await prisma.competitiveReport.findUnique({
      where: { id: parseInt(id) },
      include: {
        advertiser: true,
        brand: true,
        category: true,
        boardType: true,
        region: true,
        state: true,
        city: true,
        FieldAuditor: {
          select: {
            id: true,
            firstname: true,
            lastname: true,
          },
        },
      },
    });

    if (!competitiveReport) {
      return res.status(404).json({ message: "Competitive upload not found." });
    }

    res.status(200).json({
      message: "Competitive upload retrieved successfully.",
      data: competitiveReport,
    });
  } catch (error) {
    console.error("Error fetching competitive upload:", error);
    res.status(500).json({
      error: "An error occurred while fetching the competitive upload.",
      details: error.message,
    });
  }
};

exports.getCompetitiveUploads = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const uploads = await prisma.competitiveReport.findMany({
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        advertiser: true,
        brand: true,
        boardType: true,
        category: true,
        region: true,
        state: true,
        city: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const total = await prisma.competitiveReport.count();

    res.status(200).json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      uploads,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error retrieving competitive uploads" });
  }
};

exports.getCompetitiveMapData = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "Advertiser ID is required." });
    }

    const advertiserIdInt = parseInt(id);

    // Step 1: Get Advertiser's Name
    const advertiser = await prisma.advertiser.findUnique({
      where: { id: advertiserIdInt },
      select: {
        name: true,
        advertiserCategories: { select: { categoryId: true } },
      },
    });

    if (!advertiser) {
      return res.status(404).json({ error: "Advertiser not found." });
    }

    const advertiserName = advertiser.name;
    const categoryIds = advertiser.advertiserCategories.map(
      (cat) => cat.categoryId
    );

    console.log("Advertiser Name:", advertiserName);
    console.log("Category IDs:", categoryIds);

    // Step 2: Find Compliance Reports for the Advertiser
    const complianceReports = await prisma.complianceReport.findMany({
      where: { advertiser: advertiserName }, // Now checking the correct field
    });

    const advertiserHasComplianceReport = complianceReports.length > 0;
    console.log("Has Compliance Report:", advertiserHasComplianceReport);

    // Step 3: Find Competitors
    const competitors = await prisma.advertiser.findMany({
      where: {
        advertiserCategories: { some: { categoryId: { in: categoryIds } } },
        NOT: { id: advertiserIdInt }, // Exclude the client itself
      },
    });

    const competitorIds = competitors.map((comp) => comp.id);
    console.log("Competitor IDs:", competitorIds);

    let advertiserComplianceData = [];
    let advertiserCompetitiveData = [];
    let competitorData = [];

    if (advertiserHasComplianceReport) {
      // Step 4A: If Advertiser has a Compliance Report
      advertiserComplianceData = complianceReports;

      // Get competitor's competitive reports (excluding client's uploads)
      competitorData = await prisma.competitiveReport.findMany({
        where: { advertiserId: { in: competitorIds } },
      });

      console.log("Returning compliance report vs competitors.");
    } else {
      // Step 4B: If No Compliance Report, Use Competitive Uploads
      advertiserCompetitiveData = await prisma.competitiveReport.findMany({
        where: { advertiserId: advertiserIdInt },
      });

      // Get all competitive reports (including client's own)
      competitorData = await prisma.competitiveReport.findMany({
        where: { advertiserId: { in: [...competitorIds, advertiserIdInt] } },
      });

      console.log("Returning client's competitive uploads vs competitors.");
    }

    res.status(200).json({
      advertiserComplianceData,
      advertiserCompetitiveData,
      competitorData,
      advertiserHasComplianceReport,
    });
  } catch (error) {
    console.error("Error fetching competitive map data:", error);
    res.status(500).json({ message: "Error fetching competitive map data" });
  }
};
