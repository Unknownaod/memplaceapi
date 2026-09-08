import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
import { getDb } from "../../lib/mongodb.js";


/* ==========================================
   ALLOWED EQUIPMENT TYPES
========================================== */

const EQUIPMENT_TYPES = new Set([
  "profile_cosmetic",
  "profile_badge"
]);


/* ==========================================
   HANDLER
========================================== */

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

    /* ==========================================
       AUTHENTICATE USER
    ========================================== */

    const user =
      await getAuthenticatedUser(req);


    if (!user) {

      return res.status(401).json({
        success: false,
        error: "Authentication required"
      });

    }


    /* ==========================================
       VALIDATE REQUEST
    ========================================== */

    const itemId =
      typeof req.body?.itemId === "string"
        ? req.body.itemId.trim()
        : "";


    const action =
      typeof req.body?.action === "string"
        ? req.body.action.trim().toLowerCase()
        : "equip";


    if (!itemId) {

      return res.status(400).json({
        success: false,
        error: "Item ID is required",
        code: "INVALID_SHOP_ITEM"
      });

    }


    if (
      action !== "equip" &&
      action !== "unequip"
    ) {

      return res.status(400).json({
        success: false,
        error: "Action must be equip or unequip",
        code: "INVALID_ACTION"
      });

    }


    /* ==========================================
       DATABASE
    ========================================== */

    const db =
      await getDb();


    /* ==========================================
       FIND SHOP ITEM
    ========================================== */

    const item =
      await db
        .collection("shop_items")
        .findOne({
          _id: itemId
        });


    if (!item) {

      return res.status(404).json({
        success: false,
        error: "Shop item not found",
        code: "SHOP_ITEM_NOT_FOUND"
      });

    }


    /* ==========================================
       CHECK ITEM TYPE
    ========================================== */

    if (
      !EQUIPMENT_TYPES.has(
        item.type
      )
    ) {

      return res.status(400).json({
        success: false,
        error: "This item cannot be equipped",
        code: "ITEM_NOT_EQUIPPABLE"
      });

    }


    /* ==========================================
       CHECK OWNERSHIP
       
       We require ownership for BOTH
       equip and unequip.
    ========================================== */

    const inventory =
      await db
        .collection("minigame_inventory")
        .findOne({
          _id:
            `${user._id}:${item._id}`,

          userId:
            user._id,

          itemId:
            item._id
        });


    if (!inventory) {

      return res.status(403).json({
        success: false,
        error: "You do not own this item",
        code: "ITEM_NOT_OWNED"
      });

    }


    /* ==========================================
       DETERMINE EQUIPMENT SLOT
    ========================================== */

    let equipmentField;


    if (
      item.type ===
      "profile_cosmetic"
    ) {

      equipmentField =
        "equippedNameplate";

    } else if (
      item.type ===
      "profile_badge"
    ) {

      equipmentField =
        "equippedBadge";

    }


    /* ==========================================
       EQUIP
    ========================================== */

    if (
      action === "equip"
    ) {

      const result =
        await db
          .collection("minigame_users")
          .updateOne(
            {
              _id:
                user._id
            },

            {
              $set: {
                [equipmentField]:
                  item._id,

                updatedAt:
                  new Date()
              }
            }
          );


      if (
        result.matchedCount === 0
      ) {

        return res.status(404).json({
          success: false,
          error: "Minigame account not found"
        });

      }


      return res.status(200).json({

        success: true,

        action: "equip",

        equipped: {
          itemId:
            item._id,

          name:
            item.name,

          type:
            item.type,

          icon:
            item.icon,

          slot:
            equipmentField
        },

        equipment: {

          equippedNameplate:
            equipmentField ===
            "equippedNameplate"
              ? item._id
              : null,

          equippedBadge:
            equipmentField ===
            "equippedBadge"
              ? item._id
              : null
        }

      });

    }


    /* ==========================================
       UNEQUIP
    ========================================== */

    const result =
      await db
        .collection("minigame_users")
        .updateOne(
          {
            _id:
              user._id,

            [equipmentField]:
              item._id
          },

          {
            $set: {
              [equipmentField]:
                null,

              updatedAt:
                new Date()
            }
          }
        );


    if (
      result.matchedCount === 0
    ) {

      return res.status(400).json({
        success: false,
        error: "This item is not currently equipped",
        code: "ITEM_NOT_EQUIPPED"
      });

    }


    /* ==========================================
       RESPONSE
    ========================================== */

    return res.status(200).json({

      success: true,

      action: "unequip",

      unequipped: {
        itemId:
          item._id,

        name:
          item.name,

        type:
          item.type,

        icon:
          item.icon,

        slot:
          equipmentField
      },

      equipment: {

        equippedNameplate:
          equipmentField ===
          "equippedNameplate"
            ? null
            : undefined,

        equippedBadge:
          equipmentField ===
          "equippedBadge"
            ? null
            : undefined
      }

    });


  } catch (error) {

    console.error(
      "SHOP EQUIP ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
