const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

const authToken = (req, res, next) => {
  const token = req.header("auth-token");

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // Attach the user object to the request
    next();
  } catch (error) {
    res.status(403).json({ error: "Invalid token" });
  }
};

const authRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.user.role))
    return res.status(403).send("Permission Denied");
  next();
};

module.exports = { authToken, authRole };
