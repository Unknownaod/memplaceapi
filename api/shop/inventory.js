import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
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

    const user =
      await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        inventory: []
      });
    }

    const db = await getDb();

    const inventory =
      await db
        .collection("minigame_inventory")
        .aggregate([
          {
            $match: {
              userId: user._id
            }
          },
          {
            $lookup: {
              from: "shop_items",
              localField: "itemId",
              foreignField: "_id",
              as: "item"
            }
          },
          {
            $unwind: {
              path: "$item",
              preserveNullAndEmptyArrays: true
            }
          },
          {
            $sort: {
              purchasedAt: -1
            }
          }
        ])
        .toArray();

    return res.status(200).json({
      success: true,
      inventory: inventory.map(item => ({
        id: item._id,
        itemId: item.itemId,
        name:
          item.item?.name ||
          item.itemName ||
          "Unknown Item",
        description:
          item.item?.description ||
          "",
        type:
          item.item?.type ||
          "cosmetic",
        icon:
          item.item?.icon ||
          "✦",
        quantity:
          Number(item.quantity || 1),
        purchasedAt:
          item.purchasedAt
      }))
    });

  } catch (error) {

    console.error(
      "SHOP INVENTORY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
