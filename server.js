import express from "express";
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());

// ==========================================
// ROUTE LOADER
// ==========================================

async function loadHandler(routePath) {
  const filePath = path.join(
    __dirname,
    "api",
    `${routePath}.js`
  );

  const module = await import(
    pathToFileURL(filePath).href
  );

  return module.default;
}

// ==========================================
// API ROUTER
// ==========================================

app.all("/api/*", async (req, res) => {
  try {
    const routePath = req.path
      .replace(/^\/api\//, "")
      .replace(/\/$/, "");

    const handler = await loadHandler(routePath);

    if (typeof handler !== "function") {
      return res.status(500).json({
        success: false,
        error: "API handler is invalid"
      });
    }

    await handler(req, res);

  } catch (error) {
    console.error("API ROUTE ERROR:", error);

    if (!res.headersSent) {
      res.status(404).json({
        success: false,
        error: "API route not found"
      });
    }
  }
});

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    service: "memplace-api",
    status: "online"
  });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Memplace API listening on port ${PORT}`
  );
});
