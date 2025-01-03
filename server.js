const express = require("express");
const cors = require("cors");
const userRoutes = require("./routes/userRoutes");
const campaignRoutes = require("./routes/campaignRoutes");
const app = express();
require("dotenv").config();

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:5000"],
    allowedHeaders: ["Content-Type", "Authorization", "auth-token"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);

app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/", userRoutes);
app.use("/", campaignRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
