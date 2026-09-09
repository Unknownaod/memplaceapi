import { setCors } from "../../lib/cors.js";

import {
  requireStaff
} from "../../lib/staff.js";

import {
  createAuditLog
} from "../../lib/audit.js";

import {
  getDb
} from "../../lib/mongodb.js";


/* ==========================================
   ALLOWED SHOP ITEM TYPES
========================================== */

const ALLOWED_TYPES = new Set([
  "profile_cosmetic",
  "profile_title",
  "profile_badge",
  "profile_theme",
  "bundle"
]);


/* ==========================================
   CLEAN ITEM
========================================== */

function cleanItem(item) {

  if (!item) {
    return null;
  }

  return {

    _id:
      item._id,

    name:
      item.name || "",

    description:
      item.description || "",

    price:
      Number(item.price) || 0,

    type:
      item.type || "profile_cosmetic",

    icon:
      item.icon || "",

    image:
      item.image || null,

    active:
      item.active !== false,

    limited:
      item.limited === true,

    /*
     * Bundles contain an array of
     * shop item IDs.
     *
     * Normal items simply return [].
     */
    items:
      Array.isArray(item.items)
        ? item.items
        : [],

    createdAt:
      item.createdAt || null,

    updatedAt:
      item.updatedAt || null

  };

}


/* ==========================================
   CREATE STRING ITEM ID
========================================== */

function createItemId(name) {

  const base =
    String(name || "")
      .toLowerCase()
      .trim()

      /*
       * Remove apostrophes.
       */
      .replace(
        /['’]/g,
        ""
      )

      /*
       * Replace anything that
       * isn't a letter or number
       * with a dash.
       */
      .replace(
        /[^a-z0-9]+/g,
        "-"
      )

      /*
       * Remove dashes from
       * the beginning/end.
       */
      .replace(
        /^-+|-+$/g,
        ""
      );


  return (
    base ||
    `item-${Date.now()}`
  );

}


/* ==========================================
   CLEAN BUNDLE ITEMS
========================================== */

function cleanBundleItems(items) {

  if (!Array.isArray(items)) {
    return [];
  }

  return [
    ...new Set(
      items
        .map(item =>
          String(item || "").trim()
        )
        .filter(Boolean)
    )
  ];

}


/* ==========================================
   HANDLER
========================================== */

export default async function handler(
  req,
  res
) {

  if (setCors(req, res)) {
    return;
  }


  /*
   * Every Shop admin operation
   * requires the Shop permission.
   */

  const staff =
    await requireStaff(
      req,
      res,
      "shop"
    );


  if (!staff) {
    return;
  }


  const db =
    await getDb();

  const collection =
    db.collection("shop_items");


  /* ==========================================
     GET SHOP ITEMS
  ========================================== */

  if (req.method === "GET") {

    try {

      const items =
        await collection
          .find({})
          .sort({
            createdAt: -1
          })
          .toArray();


      return res.status(200).json({

        success: true,

        items:
          items.map(
            cleanItem
          )

      });

    } catch (error) {

      console.error(
        "ADMIN SHOP GET:",
        error
      );

      return res.status(500).json({

        success: false,

        error:
          "Failed to load shop items."

      });

    }

  }


  /* ==========================================
     CREATE ITEM
  ========================================== */

  if (req.method === "POST") {

    /*
     * Only Manager and Owner
     * can modify Shop configuration.
     */

    if (
      staff.role !== "manager" &&
      staff.role !== "owner"
    ) {

      return res.status(403).json({

        success: false,

        error:
          "Only Managers and Owners can modify the shop."

      });

    }


    try {

      const {
        name,
        description,
        price,
        type,
        icon,
        image,
        active,
        limited,
        items
      } = req.body || {};


      /* ==========================================
         CLEAN INPUT
      ========================================== */

      const cleanName =
        String(
          name || ""
        ).trim();


      const cleanDescription =
        String(
          description || ""
        ).trim();


      const cleanType =
        String(
          type ||
          "profile_cosmetic"
        ).trim();


      const cleanIcon =
        String(
          icon || ""
        ).trim();


      const cleanImage =
        image
          ? String(image).trim()
          : null;


      const cleanPrice =
        Number(price);


      const cleanBundleItems =
        cleanBundleItemsInput(items);


      /* ==========================================
         VALIDATE NAME
      ========================================== */

      if (!cleanName) {

        return res.status(400).json({

          success: false,

          error:
            "Item name is required."

        });

      }


      if (
        cleanName.length > 100
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Item name is too long."

        });

      }


      /* ==========================================
         VALIDATE DESCRIPTION
      ========================================== */

      if (
        cleanDescription.length > 500
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Description is too long."

        });

      }


      /* ==========================================
         VALIDATE ITEM TYPE
      ========================================== */

      if (
        !ALLOWED_TYPES.has(
          cleanType
        )
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Invalid item type.",

          allowedTypes:
            Array.from(
              ALLOWED_TYPES
            )

        });

      }


      /* ==========================================
         VALIDATE PRICE
      ========================================== */

      if (
        !Number.isInteger(
          cleanPrice
        ) ||
        cleanPrice < 0
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Price must be a whole number greater than or equal to zero."

        });

      }


      /* ==========================================
         VALIDATE BUNDLE
      ========================================== */

      if (
        cleanType === "bundle"
      ) {

        if (
          cleanBundleItems.length < 2
        ) {

          return res.status(400).json({

            success: false,

            error:
              "A bundle must contain at least 2 items."

          });

        }


        /*
         * Bundles cannot contain other bundles.
         *
         * This keeps the structure simple:
         *
         * Bundle
         *   ├── Item
         *   ├── Item
         *   └── Item
         */

        const bundleItems =
          await collection
            .find({

              _id: {
                $in:
                  cleanBundleItems
              },

              active:
                true,

              type: {
                $ne:
                  "bundle"
              }

            })
            .project({
              _id: 1
            })
            .toArray();


        const validIds =
          new Set(
            bundleItems.map(
              item =>
                String(item._id)
            )
          );


        const invalidIds =
          cleanBundleItems.filter(
            id =>
              !validIds.has(
                String(id)
              )
          );


        if (
          invalidIds.length > 0
        ) {

          return res.status(400).json({

            success: false,

            error:
              "One or more bundle items are invalid, inactive, or are another bundle.",

            invalidItems:
              invalidIds

          });

        }

      }


      /* ==========================================
         GENERATE STRING ID
      ========================================== */

      let itemId =
        createItemId(
          cleanName
        );


      if (!itemId) {

        return res.status(400).json({

          success: false,

          error:
            "Unable to generate a valid item ID."

        });

      }


      /* ==========================================
         PREVENT DUPLICATE ITEM ID
      ========================================== */

      const existingId =
        await collection.findOne({
          _id:
            itemId
        });


      if (existingId) {

        return res.status(409).json({

          success: false,

          error:
            "A shop item with that ID already exists."

        });

      }


      /* ==========================================
         PREVENT DUPLICATE ITEM NAME
      ========================================== */

      const escapedName =
        cleanName.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&"
        );


      const existing =
        await collection.findOne({

          name: {

            $regex:
              `^${escapedName}$`,

            $options:
              "i"

          }

        });


      if (existing) {

        return res.status(409).json({

          success: false,

          error:
            "A shop item with that name already exists."

        });

      }


      /* ==========================================
         CREATE ITEM
      ========================================== */

      const now =
        new Date();


      const item = {

        /*
         * IMPORTANT:
         * Explicit string ID.
         *
         * This is required by the
         * purchase/equip systems.
         */
        _id:
          itemId,

        name:
          cleanName,

        description:
          cleanDescription,

        price:
          cleanPrice,

        /*
         * One of:
         *
         * profile_cosmetic
         * profile_title
         * profile_badge
         * profile_theme
         * bundle
         */
        type:
          cleanType,

        icon:
          cleanIcon,

        image:
          cleanImage,

        active:
          active !== false,

        limited:
          limited === true,

        /*
         * Only bundles actually contain
         * item IDs.
         */
        items:
          cleanType === "bundle"
            ? cleanBundleItems
            : [],

        createdAt:
          now,

        updatedAt:
          now

      };


      /* ==========================================
         INSERT
      ========================================== */

      await collection.insertOne(
        item
      );


      /* ==========================================
         AUDIT LOG
      ========================================== */

      await createAuditLog({

        staff,

        action:
          "shop_item_created",

        targetType:
          "shop_item",

        targetId:
          itemId,

        details: {

          name:
            cleanName,

          price:
            cleanPrice,

          type:
            cleanType,

          active:
            active !== false,

          limited:
            limited === true,

          items:
            cleanType === "bundle"
              ? cleanBundleItems
              : []

        }

      });


      /* ==========================================
         RESPONSE
      ========================================== */

      return res.status(201).json({

        success: true,

        item:
          cleanItem(
            item
          )

      });


    } catch (error) {

      console.error(
        "ADMIN SHOP CREATE:",
        error
      );

      return res.status(500).json({

        success: false,

        error:
          "Failed to create shop item."

      });

    }

  }


  /* ==========================================
     METHOD NOT ALLOWED
  ========================================== */

  return res.status(405).json({

    success: false,

    error:
      "Method not allowed."

  });

}


/* ==========================================
   BUNDLE ITEM CLEANER
========================================== */

function cleanBundleItemsInput(
  items
) {

  if (!Array.isArray(items)) {
    return [];
  }

  return [
    ...new Set(
      items
        .map(item =>
          String(item || "").trim()
        )
        .filter(Boolean)
    )
  ];

}
