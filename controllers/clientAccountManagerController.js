const prisma = require("../lib/prisma");

exports.assignAccountManager = async (req, res) => {
  const clientId = Number(req.params.clientId);
  const accountManagerId = Number(req.body.accountManagerId);

  if (!Number.isInteger(clientId) || !Number.isInteger(accountManagerId)) {
    return res.status(400).json({ error: "Valid clientId and accountManagerId are required." });
  }

  try {
    const [client, accountManager] = await Promise.all([
      prisma.user.findUnique({ where: { id: clientId }, select: { id: true, role: true } }),
      prisma.user.findUnique({ where: { id: accountManagerId }, select: { id: true, role: true, status: true } }),
    ]);

    if (!client || client.role !== "CLIENT_AGENCY_USER") {
      return res.status(404).json({ error: "Client not found." });
    }
    if (
      !accountManager ||
      !["ACCOUNT_MANAGER", "CHIEF_ACCOUNT_MANAGER"].includes(accountManager.role) ||
      !accountManager.status
    ) {
      return res.status(400).json({ error: "Select an active account manager." });
    }

    const currentAssignment = await prisma.clientAccountManager.findUnique({
      where: { clientId },
      select: { clientId: true },
    });
    if (!currentAssignment) {
      return res.status(400).json({
        error: "This client has no account manager assignment to update. Assign it when creating an account manager.",
      });
    }

    const assignment = await prisma.clientAccountManager.update({
      where: { clientId },
      data: { accountManagerId, assignedAt: new Date() },
      include: {
        client: { select: { id: true, firstname: true, lastname: true, email: true, advertiser: true } },
        accountManager: { select: { id: true, firstname: true, lastname: true, email: true, role: true } },
      },
    });

    return res.status(200).json({ message: "Client account manager assignment saved.", assignment });
  } catch (error) {
    console.error("Error assigning client account manager:", error);
    return res.status(500).json({ error: "Error saving client account manager assignment." });
  }
};

exports.listAssignments = async (_req, res) => {
  try {
    const assignments = await prisma.clientAccountManager.findMany({
      include: {
        client: { select: { id: true, firstname: true, lastname: true, email: true, advertiser: true } },
        accountManager: { select: { id: true, firstname: true, lastname: true, email: true, role: true } },
      },
      orderBy: { assignedAt: "desc" },
    });
    return res.status(200).json({ data: assignments });
  } catch (error) {
    console.error("Error fetching client account manager assignments:", error);
    return res.status(500).json({ error: "Error fetching client account manager assignments." });
  }
};
