const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const { getCache, setCache } = require("../lib/redis");
const router = express.Router();

const CACHE_TTL = {
  LOBBIES: 600,      // 10 min
  LOBBY_PAGE: 600,   // 10 min
  KPI: 300,          // 5 min
};

// GET /api/lobbies - Fetch ALL lobbies from IFS (auto-paginate)
router.get("/lobbies", authMiddleware, async (req, res) => {
  // Check cache first
  const cacheKey = "lobbies:all";
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log("Lobbies served from cache");
    return res.json(cached);
  }

  const batchSize = 500;
  let allLobbies = [];
  let skip = 0;
  let totalCount = 0;

  try {
    while (true) {
      const response = await axios.get(
        `${process.env.IFS_HOST}/main/ifsapplications/projection/v1/LobbyConfiguration.svc/LobbyPresObjects`,
        {
          params: {
            $top: batchSize,
            $skip: skip,
            $count: true,
          },
          headers: {
            Authorization: `Bearer ${req.session.access_token}`,
            Accept: "application/json",
          },
        }
      );

      const batch = response.data.value || [];
      totalCount = response.data["@odata.count"] || 0;
      allLobbies.push(...batch);

      if (batch.length < batchSize || allLobbies.length >= totalCount) {
        break;
      }
      skip += batchSize;
    }

    const result = {
      value: allLobbies,
      "@odata.count": totalCount,
    };

    // Cache the result
    await setCache(cacheKey, result, CACHE_TTL.LOBBIES);
    res.json(result);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data || "Failed to fetch lobbies";
    res.status(status).json({ error: message });
  }
});

// GET /api/lobbies/:pageId/page - Fetch lobby page config (layout, elements, KPIs)
router.get("/lobbies/:pageId/page", authMiddleware, async (req, res) => {
  const rawPageId = req.params.pageId;
  const pageId = rawPageId.replace(/^lobbyPage/i, "");

  // Check cache first
  const cacheKey = `lobby:page:${pageId}`;
  const cached = await getCache(cacheKey);
  if (cached) {
    console.log(`Lobby page ${pageId} served from cache`);
    return res.json(cached);
  }

  try {
    const url = `${process.env.IFS_HOST}/main/ifsapplications/web/server/lobby/page/${pageId}`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${req.session.access_token}`,
        Accept: "application/json",
      },
    });

    // Cache the result
    await setCache(cacheKey, response.data, CACHE_TTL.LOBBY_PAGE);
    res.json(response.data);
  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data || "Failed to fetch lobby page";
    res.status(status).json({ error: message });
  }
});

// POST /api/kpi/bulk - Fetch multiple KPIs by IDs
router.post("/kpi/bulk", authMiddleware, async (req, res) => {
  const { ids } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids array is required" });
  }

  try {
    const results = await Promise.all(
      ids.map(async (id) => {
        // Check cache for each KPI
        const cacheKey = `kpi:${id}`;
        const cached = await getCache(cacheKey);
        if (cached) return cached;

        return axios
          .get(
            `${process.env.IFS_HOST}/main/ifsapplications/projection/v1/KPIDetailsHandling.svc/CentralKpiSet(Id='${id}')`,
            {
              headers: {
                Authorization: `Bearer ${req.session.access_token}`,
                Accept: "application/json",
              },
            }
          )
          .then(async (r) => {
            const kpi = { Id: r.data.Id || id, Measure: r.data.Measure };
            await setCache(cacheKey, kpi, CACHE_TTL.KPI);
            return kpi;
          })
          .catch((err) => {
            console.log(`KPI ${id} error:`, err.response?.status, err.response?.data?.error?.message || err.message);
            return null;
          });
      })
    );

    res.json({ kpis: results.filter(Boolean) });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch KPI data" });
  }
});

// GET /api/ifs-image - Proxy IFS images (bypass CORS)
router.get("/ifs-image", authMiddleware, async (req, res) => {
  const { path } = req.query;
  if (!path) {
    return res.status(400).json({ error: "path is required" });
  }

  try {
    const response = await axios.get(
      `${process.env.IFS_HOST}${path}`,
      {
        headers: {
          Authorization: `Bearer ${req.session.access_token}`,
        },
        responseType: "arraybuffer",
      }
    );

    const contentType = response.headers["content-type"] || "image/jpeg";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(response.data);
  } catch (error) {
    res.status(404).json({ error: "Image not found" });
  }
});

module.exports = router;
