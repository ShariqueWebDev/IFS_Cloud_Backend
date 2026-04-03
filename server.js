const express = require("express");
const cors = require("cors");
const session = require("express-session");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const lobbyRoutes = require("./routes/lobbies");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // true in production (HTTPS)
      httpOnly: true,
      maxAge: 60 * 60 * 1000, // 1 hour
    },
  })
);

// Routes
app.use("/auth", authRoutes);
app.use("/api", lobbyRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ message: "IFS Cloud Backend is running", port: PORT });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
