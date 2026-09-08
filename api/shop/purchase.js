import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
import { getDb } from "../../lib/mongodb.js";

export default async function handler(req, res) {
  if (setCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
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
        error: "Authentication required."
      });
    }

    const {
      itemId
    } = req.body || {};

    if (
      typeof itemId !== "string" ||
      !itemId.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "Item ID is required."
      });
    }

    const db = await getDb();

    const item =
      await db.collection("shop_items").findOne({
        _id: itemId,
        active: true
      });

    if (!item) {
      return res.status(404).json({
        success: false,
        error: "Shop item not found."
      });
    }

    if (
      !Number.isInteger(item.price) ||
      item.price < 0
    ) {
      return res.status(500).json({
        success: false,
        error: "Shop item has an invalid price."
      });
    }

    const existing =
      await db.collection("inventory").findOne({
        userId: user._id,
        itemId: item._id
      });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: "You already own this item."
      });
    }

    const session =
      db.client?.startSession?.();

    /*
      MongoClient is exposed through getMongoClient
      in the existing MongoDB utility. Import it
      below if transactions are enabled.
    */

    const result =
      await db.collection("minigame_users").findOneAndUpdate(
        {
          _id: user._id,
          balance: {
            $gte: item.price
          }
        },
        {
          $inc: {
            balance: -item.price
          },
          $set: {
            updatedAt: new Date()
          }
        },
        {
          returnDocument: "after"
        }
      );

    if (!result) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance."
      });
    }

    try {

      await db.collection("inventory").insertOne({
        userId: user._id,
        itemId: item._id,
        name: item.name,
        type: item.type,
        purchasedAt: new Date()
      });

    } catch (inventoryError) {

      /*
        Refund the balance if inventory creation
        fails.
      */

      await db.collection("minigame_users").updateOne(
        {
          _id: user._id
        },
        {
          $inc: {
            balance: item.price
          },
          $set: {
            updatedAt: new Date()
          }
        }
      );

      throw inventoryError;
    }

    return res.status(200).json({
      success: true,
      message: "Item purchased successfully.",
      item: {
        id: item._id,
        name: item.name,
        type: item.type
      },
      balance: result.balance
    });

  } catch (error) {

    console.error(
      "SHOP PURCHASE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
