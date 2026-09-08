import { setCors } from "../../lib/cors.js";
import { getDb } from "../../lib/mongodb.js";

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

  try {
    const db = await getDb();

    const items = await db
      .collection("shop_items")
      .find({
        active: true
      })
      .sort({
        sortOrder: 1,
        createdAt: 1
      })
      .toArray();

    return res.status(200).json({
      success: true,
      items: items.map(item => ({
        id: item._id,
        name: item.name,
        description: item.description,
        price: item.price,
        type: item.type,
        icon: item.icon,
        active: item.active
      }))
    });

  } catch (error) {
    console.error(
      "SHOP ITEMS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
