import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../lib/mongodb.js";

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

  let session = null;

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
    const client = getMongoClient();

    session = client.startSession();

    let purchasedItem = null;
    let newBalance = null;

    await session.withTransaction(
      async () => {

        const item =
          await db.collection("shop_items").findOne(
            {
              _id: itemId,
              active: true
            },
            {
              session
            }
          );

        if (!item) {
          throw new Error(
            "SHOP_ITEM_NOT_FOUND"
          );
        }

        if (
          !Number.isInteger(item.price) ||
          item.price < 0
        ) {
          throw new Error(
            "INVALID_SHOP_ITEM"
          );
        }

        const inventoryId =
          `${user._id}:${item._id}`;

        const existing =
          await db.collection("minigame_inventory")
            .findOne(
              {
                _id: inventoryId
              },
              {
                session
              }
            );

        if (existing) {
          throw new Error(
            "ITEM_ALREADY_OWNED"
          );
        }

        const balanceUpdate =
          await db
            .collection("minigame_users")
            .findOneAndUpdate(
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
                session,
                returnDocument: "after"
              }
            );

        if (!balanceUpdate) {
          throw new Error(
            "INSUFFICIENT_BALANCE"
          );
        }

        const now = new Date();

        await db
          .collection("minigame_inventory")
          .insertOne(
            {
              _id: inventoryId,
              userId: user._id,
              itemId: item._id,
              quantity: 1,
              purchasedAt: now,
              updatedAt: now
            },
            {
              session
            }
          );

        await db
          .collection("shop_transactions")
          .insertOne(
            {
              userId: user._id,
              itemId: item._id,
              itemName: item.name,
              price: item.price,
              type: item.type,
              purchasedAt: now
            },
            {
              session
            }
          );

        purchasedItem = {
          id: item._id,
          name: item.name,
          type: item.type,
          price: item.price
        };

        newBalance =
          balanceUpdate.balance;
      }
    );

    return res.status(200).json({
      success: true,
      message: "Item purchased successfully.",
      item: purchasedItem,
      balance: newBalance
    });

  } catch (error) {

    console.error(
      "SHOP PURCHASE ERROR:",
      error
    );

    if (
      error.message ===
      "SHOP_ITEM_NOT_FOUND"
    ) {
      return res.status(404).json({
        success: false,
        error: "Shop item not found."
      });
    }

    if (
      error.message ===
      "ITEM_ALREADY_OWNED"
    ) {
      return res.status(409).json({
        success: false,
        error: "You already own this item."
      });
    }

    if (
      error.message ===
      "INSUFFICIENT_BALANCE"
    ) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance."
      });
    }

    if (
      error.message ===
      "INVALID_SHOP_ITEM"
    ) {
      return res.status(500).json({
        success: false,
        error: "Shop item has an invalid configuration."
      });
    }

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  } finally {

    if (session) {
      await session.endSession();
    }

  }
}
