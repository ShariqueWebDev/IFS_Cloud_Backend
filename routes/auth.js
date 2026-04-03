const express = require("express");
const axios = require("axios");
const router = express.Router();

// POST /auth/login - Direct Access Grant (username + password)
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const tokenResponse = await axios.post(
      process.env.IFS_TOKEN_URL,
      new URLSearchParams({
        grant_type: "password",
        client_id: process.env.IFS_CLIENT_ID,
        client_secret: process.env.IFS_CLIENT_SECRET,
        username,
        password,
        scope: "openid",
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token, expires_in, token_type } =
      tokenResponse.data;

    // Store tokens in session
    req.session.access_token = access_token;
    req.session.refresh_token = refresh_token;

    res.json({
      message: "Login successful",
      token_type,
      expires_in,
    });
  } catch (error) {
    const status = error.response?.status || 500;
    const message =
      error.response?.data?.error_description || "Login failed";
    res.status(status).json({ error: message });
  }
});

// GET /auth/userinfo - Get logged in user info
router.get("/userinfo", async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  try {
    const userResponse = await axios.get(process.env.IFS_USERINFO_URL, {
      headers: { Authorization: `Bearer ${req.session.access_token}` },
    });

    res.json(userResponse.data);
  } catch (error) {
    res.status(401).json({ error: "Failed to get user info" });
  }
});

// POST /auth/refresh - Refresh access token
router.post("/refresh", async (req, res) => {
  if (!req.session.refresh_token) {
    return res.status(401).json({ error: "No refresh token" });
  }

  try {
    const tokenResponse = await axios.post(
      process.env.IFS_TOKEN_URL,
      new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.IFS_CLIENT_ID,
        client_secret: process.env.IFS_CLIENT_SECRET,
        refresh_token: req.session.refresh_token,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    req.session.access_token = tokenResponse.data.access_token;
    req.session.refresh_token = tokenResponse.data.refresh_token;

    res.json({
      message: "Token refreshed",
      expires_in: tokenResponse.data.expires_in,
    });
  } catch (error) {
    res.status(401).json({ error: "Failed to refresh token" });
  }
});

// POST /auth/logout - Logout user
router.post("/logout", async (req, res) => {
  try {
    if (req.session.refresh_token) {
      await axios.post(
        process.env.IFS_LOGOUT_URL,
        new URLSearchParams({
          client_id: process.env.IFS_CLIENT_ID,
          client_secret: process.env.IFS_CLIENT_SECRET,
          refresh_token: req.session.refresh_token,
        }),
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        }
      );
    }
  } catch (error) {
    // Ignore logout errors from IFS
  }

  req.session.destroy();
  res.json({ message: "Logged out successfully" });
});

// GET /auth/status - Check if user is logged in
router.get("/status", (req, res) => {
  res.json({ loggedIn: !!req.session.access_token });
});

module.exports = router;
