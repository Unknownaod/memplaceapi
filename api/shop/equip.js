import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
import { getDb } from "../../lib/mongodb.js";


/* ==========================================
   ALLOWED EQUIPMENT TYPES
========================================== */

const EQUIPMENT_TYPES = new Set([
  "profile_cosmetic",
  "profile_badge",
  "profile_theme",
  "profile_title"
]);


/* ==========================================
   PROFILE TITLE ITEMS
==========================================

   Supports older shop items where a title
   was accidentally created as profile_cosmetic.

========================================== */

const PROFILE_TITLE_ITEMS = new Set([
  "legendary-title"
]);


/* ==========================================
   GET EQUIPMENT FIELD
========================================== */

function getEquipmentField(item) {

  /* ------------------------------------------
     PROFILE TITLE

     New correct type:
       profile_title

     Older title items:
       profile_cosmetic + legendary-title
  ------------------------------------------ */

  if (
    item.type === "profile_title"
  ) {

    return "equippedTitle";

  }


  if (
    item.type === "profile_cosmetic" &&
    PROFILE_TITLE_ITEMS.has(
      String(item._id)
    )
  ) {

    return "equippedTitle";

  }


  /* ------------------------------------------
     PROFILE NAMEPLATE
  ------------------------------------------ */

  if (
    item.type === "profile_cosmetic"
  ) {

    return "equippedNameplate";

  }


  /* ------------------------------------------
     PROFILE BADGE
  ------------------------------------------ */

  if (
    item.type === "profile_badge"
  ) {

    return "equippedBadge";

  }


  /* ------------------------------------------
     PROFILE THEME
  ------------------------------------------ */

  if (
    item.type === "profile_theme"
  ) {

    return "equippedTheme";

  }


  return null;

}


/* ==========================================
   GET EQUIPMENT STATE

   Returns the ACTUAL current equipment
   from the database instead of assuming
   unrelated slots are null.
========================================== */

async function getCurrentEquipment(
  db,
  userId
) {

  const minigameUser =
    await db
      .collection("minigame_users")
      .findOne(
        {
          _id: userId
        },
        {
          projection: {
            equippedNameplate: 1,
            equippedBadge: 1,
            equippedTheme: 1,
            equippedTitle: 1
          }
        }
      );


  return {

    equippedNameplate:
      minigameUser?.equippedNameplate ||
      null,

    equippedBadge:
      minigameUser?.equippedBadge ||
      null,

    equippedTheme:
      minigameUser?.equippedTheme ||
      null,

    equippedTitle:
      minigameUser?.equippedTitle ||
      null

  };

}


/* ==========================================
   HANDLER
========================================== */

export default async function handler(
  req,
  res
) {

  if (
    setCors(req, res)
  ) {
    return;
  }


  /* ==========================================
     METHOD
  ========================================== */

  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({

      success: false,

      error:
        "Method not allowed"

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

        error:
          "Authentication required"

      });

    }


    /* ==========================================
       VALIDATE ITEM ID
    ========================================== */

    const itemId =
      typeof req.body?.itemId === "string"

        ? req.body.itemId.trim()

        : "";


    if (!itemId) {

      return res.status(400).json({

        success: false,

        error:
          "Item ID is required",

        code:
          "INVALID_SHOP_ITEM"

      });

    }


    /* ==========================================
       VALIDATE ACTION
    ========================================== */

    const action =
      typeof req.body?.action === "string"

        ? req.body.action
            .trim()
            .toLowerCase()

        : "equip";


    if (
      action !== "equip" &&
      action !== "unequip"
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Action must be equip or unequip",

        code:
          "INVALID_ACTION"

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

          _id:
            itemId

        });


    if (!item) {

      return res.status(404).json({

        success: false,

        error:
          "Shop item not found",

        code:
          "SHOP_ITEM_NOT_FOUND"

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

        error:
          "This item cannot be equipped",

        code:
          "ITEM_NOT_EQUIPPABLE"

      });

    }


    /* ==========================================
       DETERMINE EQUIPMENT SLOT
    ========================================== */

    const equipmentField =
      getEquipmentField(item);


    if (!equipmentField) {

      return res.status(400).json({

        success: false,

        error:
          "This item has no valid equipment slot",

        code:
          "INVALID_EQUIPMENT_SLOT"

      });

    }


    /* ==========================================
       CHECK OWNERSHIP

       Ownership is required for both
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

        error:
          "You do not own this item",

        code:
          "ITEM_NOT_OWNED"

      });

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


      /* ==========================================
         CHECK ACCOUNT
      ========================================== */

      if (
        result.matchedCount === 0
      ) {

        return res.status(404).json({

          success: false,

          error:
            "Minigame account not found"

        });

      }


      /* ==========================================
         GET REAL CURRENT EQUIPMENT
      ========================================== */

      const equipment =
        await getCurrentEquipment(
          db,
          user._id
        );


      /* ==========================================
         RESPONSE
      ========================================== */

      return res.status(200).json({

        success: true,

        action:
          "equip",

        equipped: {

          itemId:
            item._id,

          name:
            item.name,

          type:
            item.type,

          icon:
            item.icon ||
            "✦",

          slot:
            equipmentField

        },

        equipment

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


    /* ==========================================
       MAKE SURE ITEM WAS EQUIPPED
    ========================================== */

    if (
      result.matchedCount === 0
    ) {

      return res.status(400).json({

        success: false,

        error:
          "This item is not currently equipped",

        code:
          "ITEM_NOT_EQUIPPED"

      });

    }


    /* ==========================================
       GET REAL CURRENT EQUIPMENT
    ========================================== */

    const equipment =
      await getCurrentEquipment(
        db,
        user._id
      );


    /* ==========================================
       RESPONSE
    ========================================== */

    return res.status(200).json({

      success: true,

      action:
        "unequip",

      unequipped: {

        itemId:
          item._id,

        name:
          item.name,

        type:
          item.type,

        icon:
          item.icon ||
          "✦",

        slot:
          equipmentField

      },

      equipment

    });


  } catch (error) {

    console.error(
      "SHOP EQUIP ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        "Internal server error"

    });

  }

}
