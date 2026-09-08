import crypto from "crypto";

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


    const game =
      String(body?.game || "").trim();


    const amount =
      Number(body?.amount);


    /* ==========================================
       VALIDATE GAME
    ========================================== */

    const allowedGames = [
      "chess",
      "blackjack",
      "slots",
      "dice",
      "duels",
      "trivia"
    ];


    if (
      !allowedGames.includes(game)
    ) {

      return res.status(400).json({
        success: false,
        error: "Invalid game"
      });

    }


    /* ==========================================
       VALIDATE WAGER
    ========================================== */

    if (
      !Number.isFinite(amount) ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {

      return res.status(400).json({
        success: false,
        error: "Wager amount must be a positive whole number"
      });

    }


    /* ==========================================
       DATABASE
    ========================================== */

    const db =
      await getDb();


    /* ==========================================
       CREATE GAME ID
    ========================================== */

    const gameId =
      crypto.randomBytes(24).toString("hex");


    const now =
      new Date();


    /* ==========================================
       ATOMICALLY DEDUCT WAGER
    ========================================== */

    const account =
      await db
        .collection("minigame_users")
        .findOneAndUpdate(

          {
            _id: user._id,

            balance: {
              $gte: amount
            }
          },

          {
            $inc: {

              balance:
                -amount,

              totalWagered:
                amount,

              gamesPlayed:
                1

            },

            $set: {

              updatedAt:
                now

            }

          },

          {
            returnDocument: "after"
          }

        );


    /* ==========================================
       INSUFFICIENT BALANCE
    ========================================== */

    if (!account) {

      return res.status(400).json({
        success: false,
        error: "Insufficient balance"
      });

    }


    /* ==========================================
       CREATE GAME TRANSACTION
    ========================================== */

    await db.collection("game_transactions").insertOne({

      _id:
        gameId,

      userId:
        user._id,

      game,

      wager:
        amount,

      payout:
        0,

      status:
        "active",

      createdAt:
        now,

      updatedAt:
        now

    });


    /* ==========================================
       RESPONSE
    ========================================== */

    return res.status(200).json({

      success: true,

      gameId,

      game,

      wager:
        amount,

      balance:
        account.balance,

      status:
        "active"

    });


  } catch (error) {

    console.error(
      "GAME CREATE ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
