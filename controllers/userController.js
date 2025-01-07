const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();


// Email configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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
    const user = await prisma.user.findUnique({ where: { email } });
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
      from: process.env.EMAIL_USER,
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
    industry,
  } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "User with this email already exists." });
    }

    if (!email || !role) {
      return res.status(400).json({ error: "Email and role are required." });
    }

    if (role === "CHIEF_ACCOUNT_MANAGER" && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        error: "Only Super Admin can create a Chief Account Manager.",
      });
    }

    if (
      role === "FIELD_AUDITOR" &&
      (!firstname ||
        !lastname ||
        !statesCovered ||
        !Array.isArray(statesCovered))
    ) {
      return res.status(400).json({
        error:
          "Firstname, lastname, and states covered are required for Field Auditor role.",
      });
    }

    if (role === "CLIENT_AGENCY_USER") {
      if (!name) {
        return res.status(400).json({
          error: "Name is required for Client/Agency User role.",
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

      if (!additionalEmail.every((email) => /^\S+@\S+\.\S+$/.test(email))) {
        return res.status(400).json({
          error: "All additional emails must be valid email addresses.",
        });
      }
    }

    const generatedPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    const newUser = await prisma.user.create({
      data: {
        firstname: role === "CLIENT_AGENCY_USER" ? undefined : firstname,
        lastname: role === "CLIENT_AGENCY_USER" ? undefined : lastname,
        email,
        phone,
        address,
        password: hashedPassword,
        role,
        statesCovered: role === "FIELD_AUDITOR" ? statesCovered : undefined,
        name: role === "CLIENT_AGENCY_USER" ? name : undefined,
        additionalEmail:
          role === "CLIENT_AGENCY_USER" ? additionalEmail : undefined,
        industry: role === "CLIENT_AGENCY_USER" ? industry : undefined,
      },
    });

    await sendEmail(
      email,
      "Your PosterTrack Account Details",
      `Your account has been created. Here is your login information: 
      Email - ${email} 
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
        name: true,
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
    const userId = req.user.id; // Extract user ID from the token's payload

    // Fetch the user from the database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        name: true,
        email: true,
        phone: true,
        address: true,
        role: true,
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
