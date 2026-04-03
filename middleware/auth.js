// Middleware to check if user is logged in
const authMiddleware = (req, res, next) => {
  if (!req.session.access_token) {
    return res
      .status(401)
      .json({ error: "Not logged in. Please login first." });
  }
  next();
};

module.exports = authMiddleware;
