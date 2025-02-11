const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { uploadGCS } = require("../Helpers/gcs");
const { transporter } = require("../Helpers/transporter");
const ExifParser = require("exif-parser");
const { applyWatermarks } = require("../Helpers/watermark");

// exports.complianceUpload = async (req, res) => {
//   const { siteAssignmentId } = req.params;
//   const {
//     siteCode,
//     campaignId,
//     advertiser,
//     brand,
//     city,
//     address,
//     boardType,
//     mediaOwner,
//     message,
//     comment,
//     status,
//     bsv,
//     structureId,
//     posterId,
//     illuminationId,
//     routeId,
//     sideId,
//   } = req.body;

//   const fieldAuditorId = req.user?.id;

//   if (!siteAssignmentId) {
//     return res.status(400).json({ error: "Site Assignment ID is required." });
//   }

//   try {
//     const requiredFields = {
//       siteCode,
//       campaignId,
//       advertiser,
//       brand,
//       city,
//       address,
//       boardType,
//       mediaOwner,
//       message,
//       comment,
//       structureId,
//       posterId,
//       illuminationId,
//       routeId,
//       sideId,
//     };

//     for (const [key, value] of Object.entries(requiredFields)) {
//       if (!value) {
//         return res.status(400).json({ error: `${key} is required.` });
//       }
//     }

//     // Verify site assignment and site code match
//     const siteAssignment = await prisma.siteAssignment.findFirst({
//       where: { id: parseInt(siteAssignmentId), fieldAuditorId },
//     });

//     if (!siteAssignment) {
//       return res.status(404).json({
//         error:
//           "No site assignment found for this auditor or invalid site assignment.",
//       });
//     }

//     if (siteAssignment.siteCode !== siteCode) {
//       return res.status(400).json({
//         error: `Provided site code '${siteCode}' does not match the assigned site code '${siteAssignment.siteCode}'.`,
//       });
//     }

//     const existingReport = await prisma.complianceReport.findFirst({
//       where: { siteCode, campaignId: parseInt(campaignId) },
//     });

//     if (existingReport) {
//       return res.status(409).json({
//         error:
//           "A compliance report already exists for this siteCode and campaign.",
//       });
//     }

//     let imageUrls = [];
//     let capturedTimestamps = [];
//     let geolocations = [];

//     if (req.files?.length > 0) {
//       for (const file of req.files) {
//         try {
//           const buffer = file.buffer;

//           if (!buffer) {
//             return res
//               .status(400)
//               .json({ error: `Invalid file data for '${file.originalname}'` });
//           }

//           const parser = ExifParser.create(buffer);
//           const exifData = parser.parse();

//           const latitude = exifData.tags?.GPSLatitude;
//           const longitude = exifData.tags?.GPSLongitude;
//           if (!latitude || !longitude) {
//             return res.status(400).json({
//               error: `Image '${file.originalname}' must contain GPS geotag information.`,
//             });
//           }

//           const captureDate = exifData.tags.DateTimeOriginal;
//           const timestamp = captureDate
//             ? new Date(captureDate * 1000).toISOString()
//             : "";
//           capturedTimestamps.push(timestamp);
//           geolocations.push({ latitude, longitude });

//           // Apply watermarks
//           const watermarkedBuffer = await applyWatermarks(buffer, captureDate);

//           const uploadedUrl = await uploadGCS({
//             buffer: watermarkedBuffer,
//             filename: file.originalname,
//           });

//           imageUrls.push(uploadedUrl);
//         } catch (error) {
//           return res.status(500).json({
//             error: "Error processing or uploading images.",
//             details: error.message,
//           });
//         }
//       }
//     }

//     const complianceReport = await prisma.complianceReport.create({
//       data: {
//         siteCode,
//         advertiser,
//         brand,
//         city,
//         address,
//         boardType,
//         mediaOwner,
//         message,
//         comment,
//         status: status || "pending",
//         bsv: bsv || "0%",
//         imageUrls,
//         geolocations: JSON.stringify(geolocations),
//         campaign: { connect: { id: parseInt(campaignId) } },
//         Illumination: { connect: { id: parseInt(illuminationId) } },
//         Poster: { connect: { id: parseInt(posterId) } },
//         Route: { connect: { id: parseInt(routeId) } },
//         Side: { connect: { id: parseInt(sideId) } },
//         Structure: { connect: { id: parseInt(structureId) } },
//         FieldAuditor: { connect: { id: parseInt(fieldAuditorId) } },
//         siteAssignment: { connect: { id: parseInt(siteAssignmentId) } },
//       },
//     });

//     res.status(201).json({
//       message: "Compliance report successfully created.",
//       complianceReport,
//     });
//   } catch (error) {
//     console.error("Error creating compliance report:", error);
//     res.status(500).json({
//       error: "An error occurred while creating the compliance report.",
//       details: error.message,
//     });
//   }
// };

exports.complianceUpload = async (req, res) => {
  const { siteAssignmentId } = req.params;
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

    // Verify site assignment and site code match
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

          // Apply watermarks
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

exports.getAllComplianceUploads = async (req, res) => {
  try {
    // Fetch all compliance reports along with their related data
    const complianceReports = await prisma.complianceReport.findMany({
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

    if (complianceReports.length === 0) {
      return res.status(404).json({ message: "No compliance uploads found." });
    }

    res.status(200).json({
      message: "Compliance uploads retrieved successfully.",
      data: complianceReports,
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

// exports.updateComplianceStatus = async (req, res) => {
//   const { id } = req.params;
//   const { status, disapprovalReason } = req.body;

//   if (!id || !status) {
//     return res
//       .status(400)
//       .json({ error: "Compliance ID and status are required." });
//   }

//   try {
//     const complianceReport = await prisma.complianceReport.findUnique({
//       where: { id: parseInt(id) },
//       include: {
//         siteAssignment: true,
//         campaign: {
//           include: {
//             client: { select: { advertiser: true } },
//             accountManager: true,
//           },
//         },
//         Poster: true,
//         Structure: true,
//       },
//     });

//     if (!complianceReport) {
//       return res.status(404).json({ error: "Compliance report not found." });
//     }

//     if (status === "disapproved") {
//       if (!disapprovalReason) {
//         return res
//           .status(400)
//           .json({ error: "Disapproval reason is required." });
//       }

//       // Remove compliance report
//       await prisma.complianceReport.delete({
//         where: { id: parseInt(id) },
//       });

//       // Update site assignment status
//       if (complianceReport.siteAssignmentId) {
//         await prisma.siteAssignment.update({
//           where: { id: complianceReport.siteAssignmentId },
//           data: { status: "disapproved" },
//         });
//       }

//       return res.status(200).json({
//         message: "Compliance report disapproved and removed successfully.",
//       });
//     }

//     // Update compliance report status
//     await prisma.complianceReport.update({
//       where: { id: parseInt(id) },
//       data: { status },
//     });

//     if (complianceReport.siteAssignmentId) {
//       // Update site assignment status
//       await prisma.siteAssignment.update({
//         where: { id: complianceReport.siteAssignmentId },
//         data: { status: status.toLowerCase() },
//       });
//     }

//     if (
//       status === "approved" &&
//       (complianceReport.Poster.name !== "Ok" ||
//         complianceReport.Structure.name !== "Ok")
//     ) {
//       const clientName =
//         complianceReport.campaign?.client?.advertiser || "Client";
//       const aberrationDetails = `
//         Dear ${clientName},

//         Find below details of aberration on your OOH display as captured by our field force:

//         Campaign Code: ${complianceReport.campaign?.campaignID || "N/A"}
//         SITE ID: ${complianceReport.siteCode || "N/A"}
//         Brand: ${complianceReport.brand || "N/A"}
//         City: ${complianceReport.city || "N/A"}
//         Location: ${complianceReport.address || "N/A"}
//         Format: ${complianceReport.boardType || "N/A"}
//         Media Owner: ${complianceReport.mediaOwner || "N/A"}
//         Aberration: (blank)

//         Poster Status: ${complianceReport.Poster.name}
//         Visit Date-Time: ${complianceReport.capturedTimestamps || "N/A"}
//       `;

//       const attachments = complianceReport.imageUrls.map((url) => ({
//         filename: url.split("/").pop(),
//         path: url,
//       }));

//       const clientEmail = complianceReport.campaign?.client?.email;
//       const accountManagerEmail =
//         complianceReport.campaign?.accountManager?.email;

//       if (!clientEmail || !accountManagerEmail) {
//         console.warn("Missing client or account manager email.");
//       }

//       const recipients = [clientEmail, accountManagerEmail].filter(Boolean);

//       try {
//         await transporter.sendMail({
//           from: process.env.EMAIL_USER,
//           to: recipients,
//           subject: "OOH Compliance Aberration Alert!",
//           text: aberrationDetails,
//           attachments,
//         });

//         console.log("Aberration alert email sent successfully.");
//       } catch (emailError) {
//         console.error("Error sending email:", emailError);
//       }
//     }

//     res.status(200).json({
//       message: "Compliance report status successfully updated.",
//     });
//   } catch (error) {
//     console.error("Error updating compliance report status:", error);
//     res.status(500).json({
//       error: "An error occurred while updating compliance report status.",
//     });
//   }
// };

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

    // Parse capturedTimestamps field and get the first timestamp
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
            .toLowerCase(); // Ensure "am/pm" is lowercase
        }
      }
    } catch (error) {
      console.error("Error parsing timestamps:", error);
    }

    if (status === "disapproved") {
      if (!disapprovalReason) {
        return res
          .status(400)
          .json({ error: "Disapproval reason is required." });
      }

      // Remove compliance report
      await prisma.complianceReport.delete({
        where: { id: parseInt(id) },
      });

      // Update site assignment status
      if (complianceReport.siteAssignmentId) {
        await prisma.siteAssignment.update({
          where: { id: complianceReport.siteAssignmentId },
          data: { status: "disapproved" },
        });
      }

      return res.status(200).json({
        message: "Compliance report disapproved and removed successfully.",
      });
    }

    // Update compliance report status
    await prisma.complianceReport.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    if (complianceReport.siteAssignmentId) {
      await prisma.siteAssignment.update({
        where: { id: complianceReport.siteAssignmentId },
        data: { status: status.toLowerCase() },
      });
    }

    if (
      status === "approved" &&
      (complianceReport.Poster.name !== "Ok" ||
        complianceReport.Structure.name !== "Ok")
    ) {
      const clientName =
        complianceReport.campaign?.client?.advertiser.name || "Client";
      const aberrationDetails = `
        Dear ${clientName},

        Find below details of aberration on your OOH display as captured by our field force:

        Campaign Code: ${complianceReport.campaign?.campaignID || "N/A"}
        SITE ID: ${complianceReport.siteCode || "N/A"}
        Brand: ${complianceReport.brand || "N/A"}
        City: ${complianceReport.city || "N/A"}
        Location: ${complianceReport.address || "N/A"}
        Format: ${complianceReport.boardType || "N/A"}
        Media Owner: ${complianceReport.mediaOwner || "N/A"}
        Aberration: (blank)

        Poster Status: ${complianceReport.Poster.name || "N/A"}
        Visit Date-Time: ${visitDateTime}
      `;

      const attachments = complianceReport.imageUrls.map((url) => ({
        filename: url.split("/").pop(),
        path: url,
      }));

      console.log(visitDateTime);

      const clientEmail = complianceReport.campaign?.client?.email;
      const accountManagerEmail =
        complianceReport.campaign?.accountManager?.email;
      const additionalEmails =
        complianceReport.campaign?.client?.additionalEmail;

      if (!clientEmail || !accountManagerEmail) {
        console.warn("Missing client or account manager email.");
      }

      const recipients = [
        clientEmail,
        accountManagerEmail,
        additionalEmails,
      ].filter(Boolean);

      try {
        await transporter.sendMail({
          from: process.env.EMAIL_USER,
          to: recipients,
          subject: "OOH Compliance Aberration Alert!",
          text: aberrationDetails,
          attachments,
        });

        console.log("Aberration alert email sent successfully.");
      } catch (emailError) {
        console.error("Error sending email:", emailError);
      }
    }

    res.status(200).json({
      message: "Compliance report status successfully updated.",
    });
  } catch (error) {
    console.error("Error updating compliance report status:", error);
    res.status(500).json({
      error: "An error occurred while updating compliance report status.",
    });
  }
};

// Controller to fetch pending compliance report sites
exports.getPendingComplianceSites = async (req, res) => {
  try {
    const pendingComplianceReports = await prisma.complianceReport.findMany({
      where: { status: "pending" },
      include: {
        siteAssignment: true,
        campaign: {
          select: {
            campaignID: true,
            client: { select: { advertiser: true } },
          },
        },
      },
    });

    if (!pendingComplianceReports.length) {
      return res.status(404).json({
        message: "No pending compliance reports found.",
      });
    }

    const formattedData = pendingComplianceReports.map((report) => ({
      complianceId: report.id,
      siteCode: report.siteCode,
      campaignId: report.campaign?.campaignID || "N/A",
      advertiser: report.campaign?.client?.advertiser || "Unknown",
      uploadedAt: report.createdAt,
      fieldAuditorId: report.fieldAuditorId,
      status: report.status,
      address: report.siteAssignment?.address || "N/A",
    }));

    res.status(200).json({
      message: "Pending compliance reports retrieved successfully.",
      pendingSites: formattedData,
    });
  } catch (error) {
    console.error("Error fetching pending compliance sites:", error);
    res.status(500).json({
      error: "An error occurred while retrieving pending compliance sites.",
    });
  }
};
