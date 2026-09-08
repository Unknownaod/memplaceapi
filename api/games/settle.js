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
       READ BODY
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


    const gameId =
      String(body?.gameId || "").trim();


    const result =
      String(body?.result || "").trim().toLowerCase();


    if (!gameId) {

      return res.status(400).json({
        success: false,
        error: "gameId is required"
      });

    }


    /* ==========================================
       DATABASE
    ========================================== */

    const db =
      await getDb();


    /* ==========================================
       FIND ACTIVE GAME
    ========================================== */

    const game =
      await db.collection("game_transactions").findOne({
        _id: gameId,
        userId: user._id,
        status: "active"
      });


    if (!game) {

      return res.status(404).json({
        success: false,
        error: "Active game not found"
      });

    }


    /* ==========================================
       DETERMINE PAYOUT
       
       IMPORTANT:
       This is intentionally conservative.
       Individual games should eventually
       determine their own server-side result.
    ========================================== */

    let payout = 0;
    let gamesWon = 0;
    let gamesLost = 0;


    if (result === "win") {

      payout =
        game.wager * 2;

      gamesWon = 1;

    } else if (result === "push" || result === "draw") {

      payout =
        game.wager;

    } else if (result === "loss" || result === "lose") {

      payout = 0;

      gamesLost = 1;

    } else {

      return res.status(400).json({
        success: false,
        error: "Invalid game result"
      });

    }


    const now =
      new Date();


    /* ==========================================
       SETTLE GAME
       
       status: active -> settled
       
       The status condition makes the
       settlement idempotent.
    ========================================== */

    const settledGame =
      await db.collection("game_transactions")
        .findOneAndUpdate(

          {
            _id: gameId,
            userId: user._id,
            status: "active"
          },

          {
            $set: {

              status:
                "settled",

              result,

              payout,

              settledAt:
                now,

              updatedAt:
                now

            }

          },

          {
            returnDocument: "after"
          }

        );


    /* ==========================================
       PREVENT DOUBLE SETTLEMENT
    ========================================== */

    if (!settledGame) {

      return res.status(409).json({
        success: false,
        error: "Game has already been settled"
      });

    }


    /* ==========================================
       UPDATE ACCOUNT
    ========================================== */

    const accountUpdate = {

      $set: {
        updatedAt: now
      }
    };


    if (payout > 0) {

      accountUpdate.$inc = {

        balance:
          payout,

        totalWon:
          payout

      };

    }


    if (gamesWon > 0 || gamesLost > 0) {

      accountUpdate.$inc = {

        ...(accountUpdate.$inc || {}),

        gamesWon,

        gamesLost

      };

    }


    const account =
      await db.collection("minigame_users")
        .findOneAndUpdate(

          {
            _id: user._id
          },

          accountUpdate,

          {
            returnDocument: "after"
          }

        );


    if (!account) {

      return res.status(500).json({
        success: false,
        error: "Minigame account not found"
      });

    }


    /* ==========================================
       RESPONSE
    ========================================== */

    return res.status(200).json({

      success: true,

      gameId,

      game:
        game.game,

      result,

      wager:
        game.wager,

      payout,

      balance:
        account.balance,

      status:
        "settled"

    });


  } catch (error) {

    console.error(
      "GAME SETTLE ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
