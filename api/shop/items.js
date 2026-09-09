import { setCors } from "../../lib/cors.js";
import { getDb } from "../../lib/mongodb.js";

const INITIAL_ITEMS = [
  {
    _id: "gold-nameplate",
    name: "Gold Nameplate",
    description:
      "A premium gold profile nameplate.",
    price: 500,
    type: "profile_cosmetic",
    icon: "✦",
    active: true,
    sortOrder: 1
  },
  {
    _id: "royal-nameplate",
    name: "Royal Nameplate",
    description:
      "A prestigious royal profile nameplate.",
    price: 1000,
    type: "profile_cosmetic",
    icon: "♛",
    active: true,
    sortOrder: 2
  },
  {
    _id: "diamond-nameplate",
    name: "Diamond Nameplate",
    description:
      "An exclusive diamond profile nameplate.",
    price: 2500,
    type: "profile_cosmetic",
    icon: "◆",
    active: true,
    sortOrder: 3
  },
  {
    _id: "champion-badge",
    name: "Champion Badge",
    description:
      "A prestigious badge for your profile.",
    price: 5000,
    type: "profile_badge",
    icon: "♛",
    active: true,
    sortOrder: 4
  }
];

async function ensureShopCatalog(db) {

  const count =
    await db
      .collection("shop_items")
      .countDocuments();

  if (count > 0) {
    return;
  }

  const now = new Date();

  await db
    .collection("shop_items")
    .insertMany(
      INITIAL_ITEMS.map(item => ({
        ...item,
        createdAt: now,
        updatedAt: now
      }))
    );
}

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

    await ensureShopCatalog(db);

    const items =
      await db
        .collection("shop_items")
        .find({
          active: true
        })
        .sort({
          sortOrder: 1,
          createdAt: 1
        })
        .toArray();


    const formattedItems =
      items.map(item => {

        const formatted = {
          id: item._id,
          name: item.name,
          description: item.description,
          price: item.price,
          type: item.type,
          icon: item.icon,
          active: item.active
        };


        if (item.type === "bundle") {

          formatted.items =
            Array.isArray(item.items)
              ? item.items
              : [];

        }

        return formatted;

      });


    return res.status(200).json({
      success: true,
      items: formattedItems
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

