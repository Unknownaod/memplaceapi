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

    /* ==========================================
       AUTHENTICATE USER
    ========================================== */

    const user =
      await getAuthenticatedUser(req);


    if (!user) {

      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });

    }


    /* ==========================================
       READ REQUEST BODY
    ========================================== */

    let body;

    try {

      body =
        typeof req.body === "string"
          ? JSON.parse(req.body)
          : req.body;

    } catch {

      return res.status(400).json({
        success: false,
        error: "Invalid JSON body"
      });

    }


    const amount =
      Number(body?.amount);


    /* ==========================================
       VALIDATE PAYOUT
    ========================================== */

    if (
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {

      return res.status(400).json({
        success: false,
        error: "Payout amount must be a positive whole number"
      });

    }


    /* ==========================================
       DATABASE
    ========================================== */

    const db =
      await getDb();


    /* ==========================================
       ADD PAYOUT
    ========================================== */

    const result =
      await db.collection("minigame_users").findOneAndUpdate(

        {
          _id: user._id
        },

        {
          $inc: {

            balance:
              amount,

            totalWon:
              amount

          },

          $set: {

            updatedAt:
              new Date()

          }

        },

        {
          returnDocument: "after"
        }

      );


    /* ==========================================
       ACCOUNT NOT FOUND
    ========================================== */

    if (!result) {

      return res.status(404).json({
        success: false,
        error: "Minigame account not found"
      });

    }


    /* ==========================================
       RESPONSE
    ========================================== */

    return res.status(200).json({

      success: true,

      payout:
        amount,

      balance:
        result.balance,

      totalWon:
        result.totalWon

    });


  } catch (error) {

    console.error(
      "ECONOMY PAYOUT ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
