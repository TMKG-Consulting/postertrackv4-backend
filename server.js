const express = require("express");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const locationRoutes = require("./routes/locationRoutes");
const industryRoutes = require("./routes/industryRoutes");
const billboardRoutes = require("./routes/billboardRoutes");
const advertiserRoutes = require("./routes/advertiserRoutes");
const brandRoutes = require("./routes/brandRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const searchRoutes = require("./routes/searchRoutes")
const complianceRoutes = require("./routes/complianceRoutes");
const app = express();
require("dotenv").config();

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5000", "https://postertrackv4-frontend.vercel.app"],
    allowedHeaders: ["Content-Type", "Authorization", "auth-token"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);

app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/", userRoutes);
app.use("/", campaignRoutes);
app.use("/", locationRoutes);
app.use("/", industryRoutes);
app.use("/", billboardRoutes);
app.use("/", advertiserRoutes);
app.use("/", brandRoutes);
app.use("/", categoryRoutes);
app.use("/", searchRoutes);
app.use("/", complianceRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
