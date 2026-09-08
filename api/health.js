import { setCors } from "../lib/cors.js";

export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }

  res.status(200).json({
    success: true,
    service: "Memplace API",
    status: "online"
  });
}
