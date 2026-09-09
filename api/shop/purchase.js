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


    const db =
      await getDb();

    const client =
      getMongoClient();


    session =
      client.startSession();


    let purchasedItem = null;
    let purchasedItems = [];
    let newBalance = null;


    await session.withTransaction(
      async () => {


        /*
        ==========================================
        FIND SHOP ITEM
        ==========================================
        */

        const item =
          await db
            .collection("shop_items")
            .findOne(
              {
                _id: itemId.trim(),
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


        /*
        ==========================================
        VALIDATE PRICE
        ==========================================
        */

        if (
          !Number.isInteger(item.price) ||
          item.price < 0
        ) {

          throw new Error(
            "INVALID_SHOP_ITEM"
          );

        }


        /*
        ==========================================
        DETERMINE ITEMS BEING PURCHASED
        ==========================================
        */

        let itemIds = [];


        if (
          item.type === "bundle"
        ) {

          if (
            !Array.isArray(item.items) ||
            item.items.length === 0
          ) {

            throw new Error(
              "INVALID_SHOP_BUNDLE"
            );

          }


          itemIds = [
            ...new Set(
              item.items
                .filter(
                  id =>
                    typeof id === "string" &&
                    id.trim()
                )
                .map(
                  id =>
                    id.trim()
                )
            )
          ];


          if (
            itemIds.length === 0
          ) {

            throw new Error(
              "INVALID_SHOP_BUNDLE"
            );

          }

        } else {

          itemIds = [
            item._id
          ];

        }


        /*
        ==========================================
        FIND INCLUDED SHOP ITEMS
        ==========================================
        */

        const includedItems =
          await db
            .collection("shop_items")
            .find(
              {
                _id: {
                  $in: itemIds
                },

                active: true
              },
              {
                session
              }
            )
            .toArray();


        if (
          includedItems.length !==
          itemIds.length
        ) {

          throw new Error(
            "INVALID_SHOP_BUNDLE"
          );

        }


        /*
        ==========================================
        MAKE SURE BUNDLES CANNOT CONTAIN
        OTHER BUNDLES
        ==========================================
        */

        if (
          item.type === "bundle" &&
          includedItems.some(
            includedItem =>
              includedItem.type === "bundle"
          )
        ) {

          throw new Error(
            "INVALID_SHOP_BUNDLE"
          );

        }


        /*
        ==========================================
        CHECK OWNERSHIP
        ==========================================
        */

        const inventoryIds =
          itemIds.map(
            id =>
              `${user._id}:${id}`
          );


        const existingItems =
          await db
            .collection("minigame_inventory")
            .find(
              {
                _id: {
                  $in: inventoryIds
                }
              },
              {
                session
              }
            )
            .toArray();


        if (
          existingItems.length > 0
        ) {

          throw new Error(
            "ITEM_ALREADY_OWNED"
          );

        }


        /*
        ==========================================
        CHECK BUNDLE OWNERSHIP
        ==========================================

        This is normally redundant because owning
        an included item already prevents buying
        the bundle again.

        It is kept here so the bundle itself is
        explicitly treated as an owned product.
        */

        if (
          item.type === "bundle"
        ) {

          const existingBundle =
            await db
              .collection("minigame_inventory")
              .findOne(
                {
                  _id:
                    `${user._id}:${item._id}`,

                  userId:
                    user._id,

                  itemId:
                    item._id
                },
                {
                  session
                }
              );


          if (existingBundle) {

            throw new Error(
              "ITEM_ALREADY_OWNED"
            );

          }

        }


        /*
        ==========================================
        REMOVE BALANCE
        ==========================================
        */

        const balanceUpdate =
          await db
            .collection("minigame_users")
            .findOneAndUpdate(
              {
                _id:
                  user._id,

                balance: {
                  $gte:
                    item.price
                }
              },

              {
                $inc: {
                  balance:
                    -item.price
                },

                $set: {
                  updatedAt:
                    new Date()
                }
              },

              {
                session,

                returnDocument:
                  "after"
              }
            );


        if (!balanceUpdate) {

          throw new Error(
            "INSUFFICIENT_BALANCE"
          );

        }


        /*
        ==========================================
        ADD ITEMS TO INVENTORY
        ==========================================
        */

        const now =
          new Date();


        const inventoryDocuments =
          includedItems.map(
            includedItem => ({

              _id:
                `${user._id}:${includedItem._id}`,

              userId:
                user._id,

              itemId:
                includedItem._id,

              quantity:
                1,

              purchasedAt:
                now,

              updatedAt:
                now

            })
          );


        /*
        ==========================================
        ADD BUNDLE OWNERSHIP RECORD
        ==========================================
        */

        if (
          item.type === "bundle"
        ) {

          inventoryDocuments.push({

            _id:
              `${user._id}:${item._id}`,

            userId:
              user._id,

            itemId:
              item._id,

            quantity:
              1,

            purchasedAt:
              now,

            updatedAt:
              now,

            /*
             * Useful for identifying this
             * record as a bundle ownership
             * record.
             */
            type:
              "bundle",

            includedItems:
              itemIds

          });

        }


        await db
          .collection("minigame_inventory")
          .insertMany(
            inventoryDocuments,
            {
              session
            }
          );


        /*
        ==========================================
        TRANSACTION RECORD
        ==========================================
        */

        await db
          .collection("shop_transactions")
          .insertOne(
            {

              userId:
                user._id,

              itemId:
                item._id,

              itemName:
                item.name,

              price:
                item.price,

              type:
                item.type,

              purchasedItems:
                includedItems.map(
                  includedItem => ({

                    id:
                      includedItem._id,

                    name:
                      includedItem.name,

                    type:
                      includedItem.type

                  })
                ),

              purchasedAt:
                now

            },
            {
              session
            }
          );


        /*
        ==========================================
        RESPONSE DATA
        ==========================================
        */

        purchasedItems =
          includedItems.map(
            includedItem => ({

              id:
                includedItem._id,

              name:
                includedItem.name,

              type:
                includedItem.type

            })
          );


        purchasedItem = {

          id:
            item._id,

          name:
            item.name,

          type:
            item.type,

          price:
            item.price

        };


        newBalance =
          balanceUpdate.balance;

      }
    );


    /*
    ==========================================
    RESPONSE
    ==========================================
    */

    return res.status(200).json({

      success:
        true,

      message:
        purchasedItem?.type === "bundle"
          ? "Bundle purchased successfully."
          : "Item purchased successfully.",

      item:
        purchasedItem,

      purchasedItems:
        purchasedItems,

      balance:
        newBalance

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

        success:
          false,

        error:
          "Shop item not found."

      });

    }


    if (
      error.message ===
      "ITEM_ALREADY_OWNED"
    ) {

      return res.status(409).json({

        success:
          false,

        error:
          "You already own one or more items in this purchase."

      });

    }


    if (
      error.message ===
      "INSUFFICIENT_BALANCE"
    ) {

      return res.status(400).json({

        success:
          false,

        error:
          "Insufficient balance."

      });

    }


    if (
      error.message ===
      "INVALID_SHOP_ITEM"
    ) {

      return res.status(500).json({

        success:
          false,

        error:
          "Shop item has an invalid configuration."

      });

    }


    if (
      error.message ===
      "INVALID_SHOP_BUNDLE"
    ) {

      return res.status(500).json({

        success:
          false,

        error:
          "Shop bundle has an invalid configuration."

      });

    }


    return res.status(500).json({

      success:
        false,

      error:
        "Internal server error"

    });

  } finally {

    if (session) {

      await session.endSession();

    }

  }

}
