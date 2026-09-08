import express from "express";
import { pathToFileURL } from "url";
import path from "path";
import { fileURLToPath } from "url";

const app = express();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());


/*
==========================================
CORS
==========================================
*/

app.use((req, res, next) => {

  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://minigames.memplace.xyz"
  );

  res.setHeader(
    "Access-Control-Allow-Credentials",
    "true"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  res.setHeader(
    "Access-Control-Max-Age",
    "86400"
  );


  /*
  ==========================================
  PREFLIGHT REQUEST
  ==========================================
  */

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();

});


/*
==========================================
LOAD API HANDLER
==========================================
*/

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


/*
==========================================
API ROUTER
==========================================
*/

app.use("/api", async (req, res) => {

  try {

    let routePath = req.path
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");

    if (!routePath) {

      return res.status(404).json({
        success: false,
        error: "API route not found"
      });

    }

    const handler =
      await loadHandler(routePath);

    if (typeof handler !== "function") {

      return res.status(500).json({
        success: false,
        error: "API handler is invalid"
      });

    }

    await handler(req, res);

  } catch (error) {

    console.error(
      "API ROUTE ERROR:",
      error
    );

    if (!res.headersSent) {

      if (
        error.code === "ERR_MODULE_NOT_FOUND" ||
        error.code === "MODULE_NOT_FOUND"
      ) {

        return res.status(404).json({
          success: false,
          error: "API route not found"
        });

      }

      return res.status(500).json({
        success: false,
        error: "Internal server error"
      });

    }

  }

});


/*
==========================================
HEALTH CHECK
==========================================
*/

app.get("/", (req, res) => {

  res.status(200).json({
    success: true,
    service: "memplace-api",
    status: "online"
  });

});


/*
==========================================
START SERVER
==========================================
*/

app.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Memplace API listening on port ${PORT}`
  );

});
