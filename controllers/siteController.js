const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

exports.getPendingSiteUploads = async (req, res) => {
  const { user } = req; // Assuming `user` object contains the logged-in user's role and ID

  try {
    let pendingSites;

    if (user.role === "SUPER_ADMIN" || user.role === "CHIEF_ACCOUNT_MANAGER") {
      // Super Admin and Chief Account Manager can see all pending site uploads
      pendingSites = await prisma.siteAssignment.findMany({
        where: {
          status: "pending", // Filter only pending sites
        },
        orderBy: { uploadedAt: "asc" }, // Optional sorting by creation date
      });
    } else if (user.role === "ACCOUNT_MANAGER") {
      // Account Managers can see only sites assigned to them
      pendingSites = await prisma.siteAssignment.findMany({
        where: {
          status: "pending",
          assignedToId: user.id, // Filter by assigned account manager
        },
        orderBy: { uploadedAt: "asc" }, // Optional sorting
      });
    } else {
      // Return error for unauthorized roles
      return res
        .status(403)
        .json({ error: "You are not authorized to view this resource." });
    }

    if (pendingSites.length === 0) {
      return res
        .status(404)
        .json({ message: "No pending site uploads found." });
    }

    res.status(200).json(pendingSites);
  } catch (error) {
    console.error("Error fetching pending site uploads:", error);
    res.status(500).json({ error: "Failed to fetch pending site uploads." });
  }
};
