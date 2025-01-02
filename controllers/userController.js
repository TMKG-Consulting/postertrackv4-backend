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

//Create a Super Admin
exports.createSuperAdmin = async (req, res) => {
  const { firstname, lastname, email, phone, password } = req.body;
  if (!firstname || !lastname || !email || !password) {
    return res
      .status(400)
      .send("Firstname, lastname, email, and password are required.");
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
    res.status(500).json({ error: "Error creating Super Admin account." });
  }
};

//Login for all users
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).send("Email and password are required.");

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).send("User not found.");

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(401).send("Invalid credentials.");

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );
    res.status(200).json({ token });
  } catch (error) {
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
    permissions,
    statesCovered,
    name,
    additionalEmail,
    industry,
  } = req.body;

  // Check if the email is already in use
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return res
      .status(400)
      .json({ error: "User with this email already exists" });
  }

  if (!email || !role) {
    return res.status(400).send("Email and role are required.");
  }

  if (role === "CHIEF_ACCOUNT_MANAGER" && req.user.role !== "SUPER_ADMIN") {
    return res
      .status(403)
      .send("Only Super Admin can create a Chief Account Manager.");
  }

  if (
    role === "ACCOUNT_MANAGER" &&
    (!firstname || !lastname || !permissions || !Array.isArray(permissions))
  ) {
    return res
      .status(400)
      .send(
        "Firstname, lastname, and permissions are required for Account Manager role."
      );
  }

  if (
    role === "FIELD_AUDITOR" &&
    (!firstname || !lastname || !statesCovered || !Array.isArray(statesCovered))
  ) {
    return res
      .status(400)
      .send(
        "Firstname, lastname, and states covered are required for Field Auditor role."
      );
  }

  if (
    role === "CLIENT_AGENCY_USER" &&
    (!name)
  ) {
    return res
      .status(400)
      .send(
        "Name is required for Client/Agency User role."
      );
  }

  if (
    ![
      "CHIEF_ACCOUNT_MANAGER",
      "ACCOUNT_MANAGER",
      "FIELD_AUDITOR",
      "CLIENT_AGENCY_USER",
    ].includes(role)
  ) {
    return res
      .status(400)
      .send(
        "Invalid role. Allowed roles are CHIEF_ACCOUNT_MANAGER, ACCOUNT_MANAGER, FIELD_AUDITOR, CLIENT_AGENCY_USER."
      );
  }

  const generatedPassword = generateRandomPassword();

  try {
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
        permissions: role === "ACCOUNT_MANAGER" ? permissions : undefined,
        statesCovered: role === "FIELD_AUDITOR" ? statesCovered : undefined,
        name: role === "CLIENT_AGENCY_USER" ? name : undefined,
        additionalEmail:
          role === "CLIENT_AGENCY_USER" ? additionalEmail : undefined,
        industry: role === "CLIENT_AGENCY_USER" ? industry : undefined,
      },
    });

    // Send email with generated password
    await sendEmail(
      email,
      "Your PosterTrack Account Details",
      `Your account has been created. Here is your login information: 
      Email - ${email} 
      Password - ${generatedPassword}`
    );

    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: "Error creating user account." });
  }
};