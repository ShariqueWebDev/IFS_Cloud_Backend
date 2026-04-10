const express = require("express");
const cors = require("cors");
const session = require("express-session");
const { RedisStore } = require("connect-redis");
require("dotenv").config();

const { redis } = require("./lib/redis");
const authRoutes = require("./routes/auth");
const lobbyRoutes = require("./routes/lobbies");

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === "production";

// Trust proxy (Render ke peeche hai)
if (isProduction) {
  app.set("trust proxy", 1);
}

// Session config
const sessionConfig = {
  secret: process.env.SESSION_SECRET || "dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    maxAge: 60 * 60 * 1000, // 1 hour
    sameSite: isProduction ? "none" : "lax",
  },
};

// Use Redis session store if available
if (redis) {
  sessionConfig.store = new RedisStore({ client: redis });
  console.log("Using Redis session store");
}

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(session(sessionConfig));

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
