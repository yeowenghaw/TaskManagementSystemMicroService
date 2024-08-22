const nodemailer = require("nodemailer");
const dotenv = require("dotenv");

// config.env file variables
// show the path that stores our config variables
dotenv.config({ path: "./config/config.env" });

// Create a transporter using your email service provider's SMTP settings
const transporter = nodemailer.createTransport({
  service: "gmail", // Use your email service provider (e.g., 'gmail')
  auth: {
    user: process.env.EMAILUSER, // Your email address
    pass: process.env.EMAILPASSWORD // Your email password or app-specific password
  },
  tls: {
    rejectUnauthorized: false // Bypass SSL verification
  }
});

module.exports = transporter;
