const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { Storage } = require("@google-cloud/storage");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const { paginate } = require("../Helpers/paginate");
const { transporter } = require("../Helpers/transporter");

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
      { expiresIn: "12h" }
    );

    res.status(200).json({ token });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "Error logging in." });
  }
};

// Function to generate a random password
const generateRandomPassword = () => {
  return Math.random().toString(36).slice(-8);
};

// Function to send email
const sendEmail = async (to, subject, text) => {
  try {
    await transporter.sendMail({
      from: `"TMKG Media Audit" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    });
  } catch (error) {
    console.error("Error sending email:", error);
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
    name,
    additionalEmail,
    industryId,
  } = req.body;

  try {
    if (!email || !role) {
      return res.status(400).json({ error: "Email and role are required." });
    }

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
    if (role === "CHIEF_ACCOUNT_MANAGER" && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        error: "Only Super Admin can create a Chief Account Manager.",
      });
    }

    if (role === "FIELD_AUDITOR") {
      if (!firstname || !lastname || !Array.isArray(statesCovered)) {
        return res.status(400).json({
          error:
            "Firstname, lastname, and statesCovered (array of state IDs) are required for Field Auditor role.",
        });
      }

      // Validate state IDs
      const validStates = await prisma.state.findMany({
        where: { id: { in: statesCovered } },
      });

      if (validStates.length !== statesCovered.length) {
        return res.status(400).json({
          error: "Some provided state IDs are invalid.",
        });
      }
    }

    if (role === "CLIENT_AGENCY_USER") {
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
        email.toLowerCase()
      );

      if (
        !normalizedAdditionalEmails.every((email) =>
          /^\S+@\S+\.\S+$/.test(email)
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

    // Generate a password and hash it
    const generatedPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        firstname: role === "CLIENT_AGENCY_USER" ? undefined : firstname,
        lastname: role === "CLIENT_AGENCY_USER" ? undefined : lastname,
        email: normalizedEmail, // Store email in lowercase
        phone,
        address,
        password: hashedPassword,
        role,
        statesCovered:
          role === "FIELD_AUDITOR"
            ? { connect: statesCovered.map((id) => ({ id })) }
            : undefined,
        advertiserId: role === "CLIENT_AGENCY_USER" ? name : undefined,
        additionalEmail:
          role === "CLIENT_AGENCY_USER" ? normalizedAdditionalEmails : [],
        industryId: role === "CLIENT_AGENCY_USER" ? industryId : undefined,
      },
    });

    // Send account creation email
    await sendEmail(
      normalizedEmail,
      "Your PosterTrack Account Details",
      `Your account has been created. Here is your login information: 
      Email - ${normalizedEmail} 
      Password - ${generatedPassword}`
    );

    res.status(201).json(newUser);
  } catch (error) {
    console.error("Error creating user:", error);
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
        email: true,
        phone: true,
        address: true,
        role: true,
        statesCovered: true,
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
        email: true,
        phone: true,
        address: true,
        profilePicture: true,
        role: true,
        statesCovered: req.user.role === "FIELD_AUDITOR" ? true : false,
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
    additionalEmail,
    status,
    industryId,
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

    if (userToUpdate.role === "FIELD_AUDITOR") {
      if (!firstname || !lastname || !statesCovered) {
        return res.status(400).json({
          error:
            "Firstname, lastname, and statesCovered are required for Field Auditor role.",
        });
      }

      if (typeof statesCovered === "string") {
        // If it's a JSON string (e.g., "[33, 45, 56]"), parse it
        try {
          parsedStates = JSON.parse(statesCovered);
          if (!Array.isArray(parsedStates)) throw new Error();
        } catch (error) {
          parsedStates = [Number(statesCovered)]; // Handle single number as string
        }
      } else if (Array.isArray(statesCovered)) {
        parsedStates = statesCovered.map(Number); // Convert all elements to numbers
      } else {
        return res.status(400).json({ error: "Invalid statesCovered format." });
      }

      // Validate state IDs
      const validStates = await prisma.state.findMany({
        where: { id: { in: parsedStates } },
      });

      if (validStates.length !== parsedStates.length) {
        return res.status(400).json({
          error: "Some provided state IDs are invalid.",
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
            ? {
                set: parsedStates.map((stateId) => ({ id: stateId })), // REPLACING existing states
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
      },
    });

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Error updating user." });
  }
};

//Get all account managers
exports.getAccountManagers = async (req, res) => {
  const { page = 1, limit = 10, search = "" } = req.query;

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
      where
    );

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
  const { page = 1, limit = 10, search = "" } = req.query;

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
      { statesCovered: true }
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
  const { page = 1, limit = 10, search = "" } = req.query;

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
      { advertiser: true, industry: true }
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
