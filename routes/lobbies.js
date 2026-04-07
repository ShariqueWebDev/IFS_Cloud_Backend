const express = require("express");
const axios = require("axios");
const authMiddleware = require("../middleware/auth");
const router = express.Router();

// GET /api/lobbies - Fetch ALL lobbies from IFS (auto-paginate)
router.get("/lobbies", authMiddleware, async (req, res) => {
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

    res.json({
      value: allLobbies,
      "@odata.count": totalCount,
    });
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

  try {
    const url = `${process.env.IFS_HOST}/main/ifsapplications/web/server/lobby/page/${pageId}`;
    console.log("--- LOBBY PAGE API ---");
    console.log("URL:", url);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${req.session.access_token}`,
        Accept: "application/json",
      },
    });

    console.log("STATUS:", response.status);
    console.log("RESPONSE:", JSON.stringify(response.data, null, 2).slice(0, 2000));
    console.log("--- END ---");

    res.json(response.data);
  } catch (error) {
    console.log("--- LOBBY PAGE ERROR ---");
    console.log("STATUS:", error.response?.status);
    console.log("ERROR:", JSON.stringify(error.response?.data, null, 2)?.slice(0, 1000));
    console.log("--- END ---");
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
      ids.map((id) =>
        axios
          .get(
            `${process.env.IFS_HOST}/main/ifsapplications/projection/v1/KPIDetailsHandling.svc/CentralKpiSet`,
            {
              params: {
                $select: "Measure",
                $filter: `Id eq '${id}'`,
                $top: 25,
                $skip: 0,
              },
              headers: {
                Authorization: `Bearer ${req.session.access_token}`,
                Accept: "application/json",
              },
            }
          )
          .then((r) => {
            // Inject the Id back since $select=Measure doesn't return it
            const data = r.data;
            if (data.value && data.value.length > 0) {
              data.value[0].Id = id;
            } else if (data.Measure !== undefined) {
              data.Id = id;
            }
            console.log(`KPI ${id} OK:`, JSON.stringify(data).slice(0, 200));
            return data;
          })
          .catch((err) => {
            console.log(`KPI ${id} error:`, err.response?.status, err.response?.data?.error?.message || err.message);
            return null;
          })
      )
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
