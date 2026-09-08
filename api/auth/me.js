import { setCors } from "../../lib/cors.js";

export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  return res.status(401).json({
    success: false,
    authenticated: false,
    user: null
  });
}
