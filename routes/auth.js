const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const router = express.Router();

// GET /auth/login - Redirect to IFS Keycloak login page
router.get("/login", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauth_state = state;

  const params = new URLSearchParams({
    client_id: process.env.IFS_CLIENT_ID,
    redirect_uri: process.env.IFS_REDIRECT_URI,
    response_type: "code",
    scope: "openid",
    state,
  });

  res.json({
    authUrl: `${process.env.IFS_AUTH_URL}?${params.toString()}`,
  });
});

// GET /auth/callback - Handle OAuth callback, exchange code for tokens
router.get("/callback", async (req, res) => {
  const { code, state } = req.query;

  if (!code) {
    return res.status(400).json({ error: "Authorization code missing" });
  }

  if (state !== req.session.oauth_state) {
    return res.status(403).json({ error: "Invalid state parameter" });
  }

  delete req.session.oauth_state;

  try {
    const tokenResponse = await axios.post(
      process.env.IFS_TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: process.env.IFS_CLIENT_ID,
        client_secret: process.env.IFS_CLIENT_SECRET,
        code,
        redirect_uri: process.env.IFS_REDIRECT_URI,
      }),
      {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    const { access_token, refresh_token, expires_in, token_type } =
      tokenResponse.data;

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
      error.response?.data?.error_description || "Token exchange failed";
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
