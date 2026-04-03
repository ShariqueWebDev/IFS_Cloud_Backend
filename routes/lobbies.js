const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const router = express.Router();

// GET /api/lobbies - Fetch lobbies from IFS with pagination
router.get("/lobbies", authMiddleware, async (req, res) => {
  const top = parseInt(req.query.top) || 9;
  const skip = parseInt(req.query.skip) || 0;

  try {
    const response = await axios.get(
      `${process.env.IFS_HOST}/main/ifsapplications/projection/v1/LobbyConfiguration.svc/LobbyPresObjects`,
      {
        params: {
          $top: top,
          $skip: skip,
          $count: true,
        },
        headers: {
          Authorization: `Bearer ${req.session.access_token}`,
          Accept: "application/json",
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data || "Failed to fetch lobbies";
    res.status(status).json({ error: message });
  }
});

module.exports = router;
