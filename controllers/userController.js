const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const prisma = require("../lib/prisma");
const { paginate, PAGE_SIZE } = require("../Helpers/paginate");
const { sendEmail } = require("../Helpers/email");

const normalizeIdArray = (value) => {
  let values = value;

  if (typeof values === "string") {
    try {
      values = JSON.parse(values);
    } catch (error) {
      values = values.split(",").map((item) => item.trim());
    }
  }

  if (!Array.isArray(values)) values = [values];
  const ids = values.map(Number);
  if (ids.length === 0 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error("Coverage selections must contain valid IDs.");
  }

  return [...new Set(ids)];
};

// Create a Super Admin
exports.createSuperAdmin = async (req, res) => {
  const { firstname, lastname, email, phone, password } = req.body;
  if (!firstname || !lastname || !email || !password) {
    return res.status(400).json({
      error: "Firstname, lastname, email, and password are required.",
    });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const superAdmin = await prisma.user.create({
      data: {
        firstname,
        lastname,
        email,
        phone,
        password: hashedPassword,
        role: "SUPER_ADMIN",
      },
    });
    res.status(201).json(superAdmin);
  } catch (error) {
    console.error("Error creating Super Admin:", error);
    res.status(500).json({ error: "Error creating Super Admin account." });
  }
};

// Login for all users
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const normalizedEmail = email.toLowerCase(); // Convert email to lowercase

    // Find user with case-insensitive email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" },
    );

    res.status(200).json({ token });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "Error logging in." });
  }
};

// Function to generate a random password
const generateRandomPassword = () => {
  return crypto.randomBytes(18).toString("base64url");
};

exports.resetUserPassword = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "A valid user ID is required." });
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstname: true,
        email: true,
        password: true,
      },
    });

    if (!targetUser) {
      return res.status(404).json({ error: "User not found." });
    }

    const temporaryPassword = generateRandomPassword();
    const newPasswordHash = await bcrypt.hash(temporaryPassword, 10);

    await prisma.user.update({
      where: { id: targetUser.id },
      data: { password: newPasswordHash },
    });

    try {
      await sendEmail({
        to: targetUser.email,
        subject: "Your MediaTrak password has been reset",
        text: `Hello${targetUser.firstname ? ` ${targetUser.firstname}` : ""},

An administrator reset your MediaTrak password. Use the login details below:

Email: ${targetUser.email}
password: ${temporaryPassword}`,
      });
    } catch (emailError) {
      console.error("Error emailing the reset password:", emailError);

      try {
        const rollback = await prisma.user.updateMany({
          where: { id: targetUser.id, password: newPasswordHash },
          data: { password: targetUser.password },
        });

        if (rollback.count === 1) {
          return res.status(502).json({
            error:
              "Password reset email could not be sent; the password reset was reverted.",
          });
        }
      } catch (rollbackError) {
        console.error(
          "Error reverting password after email failure:",
          rollbackError,
        );
      }

      return res.status(500).json({
        error:
          "Password reset email could not be sent and the password reset could not be confirmed. Contact an administrator.",
      });
    }

    return res.status(200).json({
      message:
        "Password reset successfully. The new login details were emailed to the user.",
      user: { id: targetUser.id, email: targetUser.email },
    });
  } catch (error) {
    console.error("Error resetting user password:", error);
    return res.status(500).json({ error: "Error resetting user password." });
  }
};

// Super Admin or Chief Account Manager creating other users
exports.createUser = async (req, res) => {
  const {
    firstname,
    lastname,
    email,
    phone,
    address,
    role,
    statesCovered,
    citiesCovered,
    name,
    additionalEmail,
    industryId,
    clientIds,
  } = req.body;
  let createdUserId;

  try {
    if (!email || !role) {
      return res.status(400).json({ error: "Email and role are required." });
    }

    const normalizedRole = String(role).trim().toUpperCase();

    const normalizedEmail = email.toLowerCase(); // Convert email to lowercase
    let normalizedAdditionalEmails = []; // Ensure this variable is always declared

    // Check for existing user (case insensitive)
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res
        .status(400)
        .json({ error: "User with this email already exists." });
    }

    // Role-based validations
    if (
      normalizedRole === "CHIEF_ACCOUNT_MANAGER" &&
      req.user.role !== "SUPER_ADMIN"
    ) {
      return res.status(403).json({
        error: "Only Super Admin can create a Chief Account Manager.",
      });
    }

    let normalizedStatesCovered = [];
    let normalizedCitiesCovered = [];

    if (normalizedRole === "FIELD_AUDITOR") {
      if (!firstname || !lastname) {
        return res.status(400).json({
          error: "Firstname and lastname are required for Field Auditor role.",
        });
      }

      try {
        normalizedStatesCovered = normalizeIdArray(statesCovered);
        normalizedCitiesCovered = normalizeIdArray(citiesCovered);
      } catch (error) {
        return res.status(400).json({
          error:
            "Field Auditor creation requires non-empty statesCovered and citiesCovered arrays of valid IDs.",
        });
      }

      const validStates = await prisma.state.findMany({
        where: { id: { in: normalizedStatesCovered } },
      });
      const validCities = await prisma.city.findMany({
        where: { id: { in: normalizedCitiesCovered } },
      });

      if (validStates.length !== normalizedStatesCovered.length) {
        return res
          .status(400)
          .json({ error: "Some provided state IDs are invalid." });
      }
      if (validCities.length !== normalizedCitiesCovered.length) {
        return res.status(400).json({
          error: "Some provided city IDs are invalid.",
        });
      }

      if (
        validCities.some(
          (city) => !normalizedStatesCovered.includes(city.stateId),
        )
      ) {
        return res.status(400).json({
          error: "Every covered city must belong to a selected covered state.",
        });
      }
    }

    if (normalizedRole === "CLIENT_AGENCY_USER") {
      if (!name) {
        return res.status(400).json({
          error:
            "Name (Advertiser ID) is required for Client/Agency User role.",
        });
      }

      if (!Array.isArray(additionalEmail)) {
        return res.status(400).json({
          error: "Additional email must be an array.",
        });
      }

      if (additionalEmail.length > 2) {
        return res.status(400).json({
          error: "Additional email array can only contain up to 2 emails.",
        });
      }

      // Convert additional emails to lowercase
      normalizedAdditionalEmails = additionalEmail.map((email) =>
        email.toLowerCase(),
      );

      if (
        !normalizedAdditionalEmails.every((email) =>
          /^\S+@\S+\.\S+$/.test(email),
        )
      ) {
        return res.status(400).json({
          error: "All additional emails must be valid email addresses.",
        });
      }

      // Validate advertiser ID
      const advertiserExists = await prisma.advertiser.findUnique({
        where: { id: name },
      });

      if (!advertiserExists) {
        return res.status(400).json({
          error: "Provided Advertiser ID does not exist.",
        });
      }

      // Check if advertiser already has a user account
      const advertiserUserExists = await prisma.user.findFirst({
        where: { advertiserId: name },
      });

      if (advertiserUserExists) {
        return res.status(400).json({
          error: "An account already exists for this advertiser.",
        });
      }

      // Validate industry ID
      if (!industryId) {
        return res.status(400).json({
          error: "Industry ID is required for Client/Agency User role.",
        });
      }

      const industryExists = await prisma.industry.findUnique({
        where: { id: industryId },
      });

      if (!industryExists) {
        return res.status(400).json({
          error: "Provided industry ID does not exist.",
        });
      }
    }

    let normalizedClientIds = [];
    if (normalizedRole === "ACCOUNT_MANAGER") {
      if (!Array.isArray(clientIds) || clientIds.length === 0) {
        return res.status(400).json({
          error:
            "Select at least one client to assign to this account manager.",
        });
      }

      normalizedClientIds = [...new Set(clientIds.map(Number))];
      if (normalizedClientIds.some((id) => !Number.isInteger(id) || id <= 0)) {
        return res
          .status(400)
          .json({ error: "clientIds must contain valid client IDs." });
      }

      const clientsToAssign = await prisma.user.findMany({
        where: { id: { in: normalizedClientIds }, role: "CLIENT_AGENCY_USER" },
        select: {
          id: true,
          clientManagerAssignment: { select: { clientId: true } },
        },
      });
      if (clientsToAssign.length !== normalizedClientIds.length) {
        return res
          .status(400)
          .json({ error: "One or more selected clients do not exist." });
      }
      const alreadyAssigned = clientsToAssign.find(
        (client) => client.clientManagerAssignment,
      );
      if (alreadyAssigned) {
        return res.status(400).json({
          error: `Client ${alreadyAssigned.id} already has an account manager. Use the reassignment endpoint to change it.`,
        });
      }
    }

    // Generate a password and hash it
    const generatedPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        firstname:
          normalizedRole === "CLIENT_AGENCY_USER" ? undefined : firstname,
        lastname:
          normalizedRole === "CLIENT_AGENCY_USER" ? undefined : lastname,
        email: normalizedEmail, // Store email in lowercase
        phone,
        address,
        password: hashedPassword,
        role: normalizedRole,
        statesCovered:
          normalizedRole === "FIELD_AUDITOR"
            ? { connect: normalizedStatesCovered.map((id) => ({ id })) }
            : undefined,
        citiesCovered:
          normalizedRole === "FIELD_AUDITOR"
            ? { connect: normalizedCitiesCovered.map((id) => ({ id })) }
            : undefined,
        advertiserId:
          normalizedRole === "CLIENT_AGENCY_USER" ? name : undefined,
        additionalEmail:
          normalizedRole === "CLIENT_AGENCY_USER"
            ? normalizedAdditionalEmails
            : [],
        industryId:
          normalizedRole === "CLIENT_AGENCY_USER" ? industryId : undefined,
        managedClients:
          normalizedRole === "ACCOUNT_MANAGER"
            ? {
                create: normalizedClientIds.map((clientId) => ({
                  client: { connect: { id: clientId } },
                })),
              }
            : undefined,
      },
      include: {
        statesCovered: true,
        citiesCovered: true,
        clientManagerAssignment: {
          include: {
            accountManager: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                email: true,
                role: true,
              },
            },
          },
        },
        managedClients:
          normalizedRole === "ACCOUNT_MANAGER"
            ? {
                include: {
                  client: {
                    select: {
                      id: true,
                      email: true,
                      advertiser: { select: { id: true, name: true } },
                    },
                  },
                },
              }
            : false,
      },
    });
    createdUserId = newUser.id;

    // Send account creation email
    await sendEmail({
      to: normalizedEmail,
      subject: "Your Highcrown Account Details",
      text: `Your account has been created. Here is your login information:
      Email - ${normalizedEmail} 
      Password - ${generatedPassword}`,
    });

    res.status(201).json(newUser);
  } catch (error) {
    console.error("Error creating user:", error);

    if (createdUserId !== undefined) {
      try {
        // Remove assignments first because manager references use ON DELETE RESTRICT.
        await prisma.clientAccountManager.deleteMany({
          where: { accountManagerId: createdUserId },
        });
        await prisma.user.delete({ where: { id: createdUserId } });
      } catch (cleanupError) {
        console.error("Error rolling back user creation:", cleanupError);
        return res.status(500).json({
          error:
            "The account email could not be sent, and the new account could not be removed. Contact an administrator.",
        });
      }

      return res.status(502).json({
        error:
          "The account email could not be sent. The account and its client assignments were removed; please try again later.",
      });
    }

    res.status(500).json({ error: "Error creating user account." });
  }
};

// Fetch All Users
exports.fetchAllUsers = async (req, res) => {
  try {
    if (
      req.user.role !== "SUPER_ADMIN" &&
      req.user.role !== "CHIEF_ACCOUNT_MANAGER"
    ) {
      return res.status(403).json({
        error:
          "Permission Denied: You are not authorized to access this resource.",
      });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstname: true,
        lastname: true,
        advertiserId: true,
        advertiser: {
          select: {
            id: true,
            name: true,
          },
        },
        email: true,
        phone: true,
        address: true,
        role: true,
        statesCovered: true,
        citiesCovered: true,
      },
    });

    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Error fetching users." });
  }
};

// Fetch Single User Information
exports.getUser = async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch the user from the database with statesCovered if they are a Field Auditor
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        advertiserId: true,
        advertiser: {
          select: {
            id: true,
            name: true,
          },
        },
        email: true,
        phone: true,
        address: true,
        profilePicture: true,
        role: true,
        statesCovered: req.user.role === "FIELD_AUDITOR" ? true : false,
        citiesCovered: req.user.role === "FIELD_AUDITOR" ? true : false,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ error: "Error retrieving user details." });
  }
};

//Update a user information
// Initialize Google Cloud Storage with environment-based credentials
const storage = new Storage({
  projectId: process.env.GCLOUD_PROJECT_ID,
  credentials: {
    client_email: process.env.GCLOUD_CLIENT_EMAIL,
    private_key: process.env.GCLOUD_PRIVATE_KEY.replace(/\\n/g, "\n"),
  },
});
const bucket = storage.bucket(process.env.GCLOUD_BUCKET_NAME);

// Function to upload to GCS
const uploadToGCS = async (file) => {
  return new Promise((resolve, reject) => {
    const blob = bucket.file(Date.now() + path.extname(file.originalname)); // Create a unique filename
    const blobStream = blob.createWriteStream({
      resumable: false,
      contentType: file.mimetype, // Ensure the correct content type
    });

    blobStream.on("error", (err) => {
      reject(err);
    });

    blobStream.on("finish", () => {
      blob
        .makePublic()
        .then(() => {
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
          resolve(publicUrl);
        })
        .catch((err) => reject(err));
    });

    // Write the file buffer to GCS
    blobStream.end(file.buffer);
  });
};

//Update User Account
exports.updateUser = async (req, res) => {
  const { id } = req.params; // User ID to update
  const {
    firstname,
    lastname,
    phone,
    address,
    statesCovered,
    citiesCovered,
    additionalEmail,
    status,
    industryId,
    clientIds,
  } = req.body;

  try {
    // Fetch the user to update
    const userToUpdate = await prisma.user.findUnique({
      where: { id: parseInt(id) },
    });

    if (!userToUpdate) {
      return res.status(404).json({ error: "User not found." });
    }

    // Upload image to Google Cloud Storage using the file buffer (if provided)
    let publicUrl = userToUpdate.profilePicture;
    if (req.file) {
      publicUrl = await uploadToGCS(req.file);
    }

    // Handle the status field: ensure it's a boolean regardless of input type
    const booleanStatus =
      status === true || status === "true"
        ? true
        : status === false || status === "false"
          ? false
          : userToUpdate.status; // Fallback to existing value if invalid

    // Role-specific validations
    let parsedStates = [];
    let parsedCities = [];

    if (userToUpdate.role === "FIELD_AUDITOR") {
      if (
        !firstname ||
        !lastname ||
        statesCovered === undefined ||
        citiesCovered === undefined
      ) {
        return res.status(400).json({
          error:
            "Firstname, lastname, statesCovered, and citiesCovered are required for Field Auditor role.",
        });
      }

      const parseCoverageIds = (value, fieldName) => {
        if (typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            if (!Array.isArray(parsed)) throw new Error();
            return parsed.map(Number);
          } catch (error) {
            return [Number(value)];
          }
        }
        if (Array.isArray(value)) return value.map(Number);
        throw new Error(`Invalid ${fieldName} format.`);
      };

      if (typeof citiesCovered === "string") {
        try {
          parsedCities = JSON.parse(citiesCovered);
          if (!Array.isArray(parsedCities)) throw new Error();
        } catch (error) {
          parsedCities = [Number(citiesCovered)];
        }
      } else if (Array.isArray(citiesCovered)) {
        parsedCities = citiesCovered.map(Number);
      } else {
        return res.status(400).json({ error: "Invalid citiesCovered format." });
      }

      try {
        parsedStates = parseCoverageIds(statesCovered, "statesCovered");
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }

      const validStates = await prisma.state.findMany({
        where: { id: { in: parsedStates } },
      });
      if (validStates.length !== parsedStates.length) {
        return res
          .status(400)
          .json({ error: "Some provided state IDs are invalid." });
      }

      const validCities = await prisma.city.findMany({
        where: { id: { in: parsedCities } },
      });

      if (validCities.length !== parsedCities.length) {
        return res.status(400).json({
          error: "Some provided city IDs are invalid.",
        });
      }
    }

    if (userToUpdate.role === "CLIENT_AGENCY_USER") {
      if (!Array.isArray(additionalEmail)) {
        return res.status(400).json({
          error: "Additional email must be an array.",
        });
      }

      if (additionalEmail.length > 2) {
        return res.status(400).json({
          error: "Additional email array can only contain up to 2 emails.",
        });
      }

      if (!additionalEmail.every((email) => /^\S+@\S+\.\S+$/.test(email))) {
        return res.status(400).json({
          error: "All additional emails must be valid email addresses.",
        });
      }

      // Validate industry ID
      if (!industryId) {
        return res.status(400).json({
          error: "Industry ID is required for Client/Agency User role.",
        });
      }

      const industryExists = await prisma.industry.findUnique({
        where: { id: parseInt(industryId) },
      });

      if (!industryExists) {
        return res.status(400).json({
          error: "Provided industry ID does not exist.",
        });
      }
    }

    let parsedClientIds;
    if (userToUpdate.role === "ACCOUNT_MANAGER" && clientIds !== undefined) {
      try {
        parsedClientIds =
          typeof clientIds === "string" ? JSON.parse(clientIds) : clientIds;
      } catch (_error) {
        return res
          .status(400)
          .json({ error: "clientIds must be an array of client IDs." });
      }
      if (!Array.isArray(parsedClientIds)) {
        return res
          .status(400)
          .json({ error: "clientIds must be an array of client IDs." });
      }

      parsedClientIds = [...new Set(parsedClientIds.map(Number))];
      if (
        parsedClientIds.some(
          (clientId) => !Number.isInteger(clientId) || clientId <= 0,
        )
      ) {
        return res
          .status(400)
          .json({ error: "clientIds must contain valid client IDs." });
      }

      const clients = await prisma.user.findMany({
        where: { id: { in: parsedClientIds }, role: "CLIENT_AGENCY_USER" },
        select: { id: true },
      });
      if (clients.length !== parsedClientIds.length) {
        return res
          .status(400)
          .json({ error: "One or more selected clients do not exist." });
      }
    }

    // Update the user
    const updatedUser = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        firstname:
          userToUpdate.role === "CLIENT_AGENCY_USER" ? undefined : firstname,
        lastname:
          userToUpdate.role === "CLIENT_AGENCY_USER" ? undefined : lastname,
        phone,
        address,
        profilePicture: publicUrl,
        statesCovered:
          userToUpdate.role === "FIELD_AUDITOR"
            ? { set: parsedStates.map((stateId) => ({ id: stateId })) }
            : undefined,
        citiesCovered:
          userToUpdate.role === "FIELD_AUDITOR"
            ? {
                set: parsedCities.map((cityId) => ({ id: cityId })),
              }
            : undefined,
        additionalEmail:
          userToUpdate.role === "CLIENT_AGENCY_USER"
            ? additionalEmail
            : undefined,
        industryId:
          userToUpdate.role === "CLIENT_AGENCY_USER"
            ? parseInt(industryId)
            : undefined,
        status: booleanStatus,
      },
      include: {
        statesCovered: true,
        citiesCovered: true,
      },
    });

    if (parsedClientIds !== undefined) {
      await prisma.$transaction([
        prisma.clientAccountManager.deleteMany({
          where: {
            OR: [
              { accountManagerId: userToUpdate.id },
              { clientId: { in: parsedClientIds } },
            ],
          },
        }),
        ...(parsedClientIds.length
          ? [
              prisma.clientAccountManager.createMany({
                data: parsedClientIds.map((clientId) => ({
                  clientId,
                  accountManagerId: userToUpdate.id,
                })),
              }),
            ]
          : []),
      ]);
    }

    if (userToUpdate.role === "ACCOUNT_MANAGER") {
      updatedUser.managedClients = await prisma.clientAccountManager.findMany({
        where: { accountManagerId: userToUpdate.id },
        include: {
          client: {
            select: {
              id: true,
              email: true,
              advertiser: { select: { id: true, name: true } },
            },
          },
        },
      });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Error updating user." });
  }
};

//Get all account managers
exports.getAccountManagers = async (req, res) => {
  const { page = 1, search = "" } = req.query;
  const limit = PAGE_SIZE;

  try {
    const where = {
      OR: [{ role: "ACCOUNT_MANAGER" }, { role: "CHIEF_ACCOUNT_MANAGER" }],
      ...(search
        ? {
            OR: [
              { firstname: { contains: search, mode: "insensitive" } },
              { lastname: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const { data, total, totalPages } = await paginate(
      prisma.user,
      parseInt(page),
      parseInt(limit),
      where,
    );

    const accountManagerIds = data.map((manager) => manager.id);
    const clientAssignments = await prisma.clientAccountManager.findMany({
      where: { accountManagerId: { in: accountManagerIds } },
      include: {
        client: {
          select: {
            id: true,
            email: true,
            advertiser: { select: { id: true, name: true } },
          },
        },
      },
    });
    const clientsByManager = new Map();
    for (const assignment of clientAssignments) {
      if (!clientsByManager.has(assignment.accountManagerId)) {
        clientsByManager.set(assignment.accountManagerId, []);
      }
      clientsByManager.get(assignment.accountManagerId).push(assignment);
    }
    for (const manager of data) {
      manager.managedClients = clientsByManager.get(manager.id) || [];
    }

    res.status(200).json({
      data,
      total,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Error fetching account managers:", error);
    res.status(500).json({ error: "Error fetching account managers." });
  }
};

//Get all field auditors
exports.getFieldAuditors = async (req, res) => {
  const { page = 1, search = "" } = req.query;
  const limit = PAGE_SIZE;

  try {
    const where = {
      role: "FIELD_AUDITOR",
      ...(search
        ? {
            OR: [
              { firstname: { contains: search, mode: "insensitive" } },
              { lastname: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const { data, total, totalPages } = await paginate(
      prisma.user,
      parseInt(page),
      parseInt(limit),
      where,
      {
        statesCovered: true,
        citiesCovered: { include: { state: true } },
      },
    );

    res.status(200).json({
      data,
      total,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Error fetching field auditors:", error);
    res.status(500).json({ error: "Error fetching field auditors." });
  }
};

//Get all clients
exports.getClients = async (req, res) => {
  const { page = 1, search = "" } = req.query;
  const limit = PAGE_SIZE;

  try {
    const where = {
      role: "CLIENT_AGENCY_USER",
      ...(search
        ? {
            advertiser: {
              is: {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            },
          }
        : {}),
    };

    const { data, total, totalPages } = await paginate(
      prisma.user,
      parseInt(page),
      parseInt(limit),
      where,
      {
        advertiser: true,
        industry: true,
        clientManagerAssignment: {
          include: {
            accountManager: {
              select: {
                id: true,
                firstname: true,
                lastname: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    );

    res.status(200).json({
      data,
      total,
      totalPages,
      currentPage: parseInt(page),
    });
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).json({ error: "Error fetching clients." });
  }
};
