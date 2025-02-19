const nodemailer = require("nodemailer");

// Configure email transport
const transporter = nodemailer.createTransport({
  host: "mail.postertrack.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

module.exports = {transporter};