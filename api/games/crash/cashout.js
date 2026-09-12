import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
import { getDb } from "../../lib/mongodb.js";

import {
  calculateMultiplier
} from "./play.js";

/*
=========================================================
CRASH CASHOUT

POST /api/games/crash/cashout

Body:
{
  "gameId": "..."
}

The server calculates the multiplier from the
server-side start time.

The client cannot tell the server what multiplier
to cash out at.
=========================================================
*/

export default async function handler(
  req,
  res
) {
  if (setCors(req, res)) {
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    const user =
      await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error:
          "You must be logged in."
      });
    }

    const {
      gameId
    } = req.body || {};

    if (!gameId) {
      return res.status(400).json({
        success: false,
        error:
          "gameId is required."
      });
    }

    const db =
      await getDb();

    /*
     * Fetch the active round.
     */

    const game =
      await db.collection("crash_games")
        .findOne({
          _id: String(gameId),
          userId: user._id,
          status: "active"
        });

    if (!game) {
      return res.status(404).json({
        success: false,
        error:
          "Active Crash game not found."
      });
    }

    /*
     * Calculate the server-authoritative
     * multiplier at this exact moment.
     */

    const multiplier =
      calculateMultiplier(
        game.startedAt
      );

    /*
     * The round has already crashed.
     */

    if (
      multiplier >=
      game.crashPoint
    ) {
      const endedAt =
        new Date();

      const result =
        await db
          .collection("crash_games")
          .findOneAndUpdate(
            {
              _id: game._id,
              userId: user._id,
              status: "active"
            },
            {
              $set: {
                status: "crashed",
                endedAt,
                payout: 0,
                profit: -game.wager
              }
            },
            {
              returnDocument: "after"
            }
          );

      /*
       * If another request already finalized
       * the round, don't pay anything.
       */

      if (!result.value) {
        return res.status(409).json({
          success: false,
          error:
            "This game has already ended."
        });
      }

      await db
        .collection("minigame_users")
        .updateOne(
          {
            _id: user._id
          },
          {
            $inc: {
              totalLost:
                game.wager,
              gamesLost: 1
            }
          }
        );

      const updatedUser =
        await db
          .collection("minigame_users")
          .findOne({
            _id: user._id
          });

      return res.status(200).json({
        success: true,

        result: "crashed",

        game: {
          id: game._id,
          wager: game.wager,
          multiplier:
            game.crashPoint,
          payout: 0,
          profit: -game.wager,
          status: "crashed"
        },

        balance:
          updatedUser?.balance ?? 0
      });
    }

    /*
     * Successful cashout.
     */

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

    /*
     * First finalize the game.
     *
     * This conditional update prevents two
     * simultaneous cashout requests from both
     * paying the player.
     */

    const result =
      await db
        .collection("crash_games")
        .findOneAndUpdate(
          {
            _id: game._id,
            userId: user._id,
            status: "active"
          },
          {
            $set: {
              status: "cashed_out",
              cashoutMultiplier:
                multiplier,
              payout,
              profit,
              endedAt
            }
          },
          {
            returnDocument: "after"
          }
        );

    if (!result.value) {
      return res.status(409).json({
        success: false,
        error:
          "This game has already ended."
      });
    }

    /*
     * Credit payout and update statistics.
     */

    await db
      .collection("minigame_users")
      .updateOne(
        {
          _id: user._id
        },
        {
          $inc: {
            balance: payout,

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
          }
        }
      );

    const updatedUser =
      await db
        .collection("minigame_users")
        .findOne({
          _id: user._id
        });

    return res.status(200).json({
      success: true,

      result: "cashed_out",

      game: {
        id: game._id,

        wager:
          game.wager,

        multiplier,

        payout,

        profit,

        crashPoint:
          game.crashPoint,

        status:
          "cashed_out"
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
        success: false,
        error:
          "Internal server error."
      });
    }
  }
}
