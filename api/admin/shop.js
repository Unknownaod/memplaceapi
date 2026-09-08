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

function cleanItem(item) {

  if (!item) {
    return null;
  }

  return {
    _id: item._id,
    name: item.name || "",
    description: item.description || "",
    price: Number(item.price) || 0,
    icon: item.icon || "",
    image: item.image || null,
    active: item.active !== false,
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };

}


export default async function handler(
  req,
  res
) {

  if (setCors(req, res)) {
    return;
  }


  /*
   * Every Shop admin operation requires
   * the Shop permission.
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
     * Only Manager and Owner can
     * modify Shop configuration.
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
        icon,
        image,
        active
      } = req.body || {};


      const cleanName =
        String(
          name || ""
        ).trim();

      const cleanDescription =
        String(
          description || ""
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


      if (
        cleanDescription.length > 500
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Description is too long."
        });

      }


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


      /*
       * Prevent duplicate item names.
       */

      const existing =
        await collection.findOne({
          name: {
            $regex:
              `^${cleanName.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              )}$`,
            $options: "i"
          }
        });


      if (existing) {

        return res.status(409).json({
          success: false,
          error:
            "A shop item with that name already exists."
        });

      }


      const now =
        new Date();


      const item = {
        name: cleanName,

        description:
          cleanDescription,

        price:
          cleanPrice,

        icon:
          cleanIcon,

        image:
          cleanImage,

        active:
          active !== false,

        createdAt:
          now,

        updatedAt:
          now
      };


      const result =
        await collection.insertOne(
          item
        );


      const created =
        await collection.findOne({
          _id:
            result.insertedId
        });


      await createAuditLog({
        staff,

        action:
          "shop_item_created",

        targetType:
          "shop_item",

        targetId:
          result.insertedId.toString(),

        details: {
          name:
            cleanName,

          price:
            cleanPrice,

          active:
            active !== false
        }
      });


      return res.status(201).json({
        success: true,

        item:
          cleanItem(
            created
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


  return res.status(405).json({
    success: false,
    error:
      "Method not allowed."
  });

}
