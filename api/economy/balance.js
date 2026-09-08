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
       DATABASE
    ========================================== */

    const db =
      await getDb();


    /* ==========================================
       FIND MINIGAME ACCOUNT
    ========================================== */

    const minigameUser =
      await db.collection("minigame_users").findOne({
        _id: user._id
      });


    if (!minigameUser) {

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

      balance:
        minigameUser.balance || 0

    });


  } catch (error) {

    console.error(
      "ECONOMY BALANCE ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
