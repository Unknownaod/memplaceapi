import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
import { getDb } from "../../lib/mongodb.js";

import {
  calculateMultiplier
} from "./play.js";


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

    /* ========================================
       AUTHENTICATION
    ======================================== */

    const user =
      await getAuthenticatedUser(req);


    if (!user) {

      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });

    }


    /* ========================================
       PARSE BODY
    ======================================== */

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


    /* ========================================
       GAME ID
    ======================================== */

    const gameId =
      String(body?.gameId || "")
        .trim();


    if (!gameId) {

      return res.status(400).json({
        success: false,
        error: "gameId is required"
      });

    }


    /* ========================================
       DATABASE
    ======================================== */

    const db =
      await getDb();


    /* ========================================
       FIND ACTIVE GAME
    ======================================== */

    const game =
      await db
        .collection("crash_games")
        .findOne({
          _id:
            gameId,

          userId:
            user._id,

          status:
            "active"
        });


    if (!game) {

      return res.status(404).json({
        success: false,
        error:
          "Active Crash game not found"
      });

    }


    /* ========================================
       CURRENT MULTIPLIER
    ======================================== */

    const multiplier =
      calculateMultiplier(
        game.startedAt
      );


    /* ========================================
       CRASH CHECK
    ======================================== */

    if (
      multiplier >=
      game.crashPoint
    ) {


      /*
        The player tried to cash out
        after the server-side crash point.
      */

      const endedAt =
        new Date();


      const result =
        await db
          .collection("crash_games")
          .findOneAndUpdate(
            {
              _id:
                game._id,

              userId:
                user._id,

              status:
                "active"
            },
            {
              $set: {

                status:
                  "crashed",

                endedAt,

                cashoutMultiplier:
                  null,

                payout:
                  0,

                profit:
                  -game.wager

              }
            },
            {
              returnDocument:
                "after"
            }
          );


      /*
        MongoDB Node driver 6.x
        returns the document directly.
      */

      if (!result) {

        return res.status(409).json({
          success: false,
          error:
            "This game has already ended"
        });

      }


      /* ======================================
         UPDATE LOSS STATISTICS
      ====================================== */

      await db
        .collection("minigame_users")
        .updateOne(
          {
            _id:
              user._id
          },
          {
            $inc: {

              totalLost:
                game.wager,

              gamesLost:
                1

            },

            $set: {
              updatedAt:
                endedAt
            }
          }
        );


      /* ======================================
         GET UPDATED BALANCE
      ====================================== */

      const updatedUser =
        await db
          .collection("minigame_users")
          .findOne({
            _id:
              user._id
          });


      return res.status(200).json({

        success:
          true,

        result:
          "crashed",

        game: {

          id:
            game._id,

          gameId:
            game._id,

          wager:
            game.wager,

          multiplier:
            game.crashPoint,

          crashPoint:
            game.crashPoint,

          payout:
            0,

          profit:
            -game.wager,

          status:
            "crashed",

          endedAt

        },

        balance:
          updatedUser?.balance ?? 0

      });

    }


    /* ========================================
       CALCULATE PAYOUT
    ======================================== */

    const payout =
      Math.floor(
        game.wager *
        multiplier
      );


    const profit =
      payout -
      game.wager;


    const endedAt =
      new Date();


    /* ========================================
       SETTLE GAME
    ======================================== */

    const result =
      await db
        .collection("crash_games")
        .findOneAndUpdate(
          {
            _id:
              game._id,

            userId:
              user._id,

            status:
              "active"
          },
          {
            $set: {

              status:
                "cashed_out",

              cashoutMultiplier:
                multiplier,

              payout,

              profit,

              endedAt

            }
          },
          {
            returnDocument:
              "after"
          }
        );


    if (!result) {

      return res.status(409).json({
        success: false,
        error:
          "This game has already ended"
      });

    }


    /* ========================================
       PAY PLAYER
    ======================================== */

    await db
      .collection("minigame_users")
      .updateOne(
        {
          _id:
            user._id
        },
        {
          $inc: {

            balance:
              payout,

            totalWon:
              profit > 0
                ? profit
                : 0,

            totalLost:
              profit < 0
                ? Math.abs(profit)
                : 0,

            gamesWon:
              profit > 0
                ? 1
                : 0,

            gamesLost:
              profit < 0
                ? 1
                : 0

          },

          $set: {
            updatedAt:
              endedAt
          }
        }
      );


    /* ========================================
       GET UPDATED BALANCE
    ======================================== */

    const updatedUser =
      await db
        .collection("minigame_users")
        .findOne({
          _id:
            user._id
        });


    /* ========================================
       RESPONSE
    ======================================== */

    return res.status(200).json({

      success:
        true,

      result:
        "cashed_out",

      game: {

        id:
          game._id,

        gameId:
          game._id,

        wager:
          game.wager,

        multiplier,

        payout,

        profit,

        crashPoint:
          game.crashPoint,

        status:
          "cashed_out",

        endedAt

      },

      balance:
        updatedUser?.balance ?? 0

    });


  } catch (error) {

    console.error(
      "CRASH CASHOUT ERROR:",
      error
    );


    if (!res.headersSent) {

      return res.status(500).json({

        success:
          false,

        error:
          "Internal server error"

      });

    }

  }

}
