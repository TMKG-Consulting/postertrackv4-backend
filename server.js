const express = require("express");
const userRoutes = require("./routes/userRoutes");
const campaignRoutes = require("./routes/campaignRoutes")
const app = express();
require("dotenv").config();

app.use(express.json());
app.use("/uploads", express.static('uploads'))
app.use("/", userRoutes);
app.use("/", campaignRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
