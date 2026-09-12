import crypto from "crypto";

import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";

const MIN_WAGER = 1;
const MAX_WAGER = 1_000_000;

/*
=========================================================
CRASH GAME

POST /api/games/crash/play

Body:
{
  "action": "start",
  "wager": 100
}

Creates a server-authoritative Crash round.

The crash point is generated ONCE when the round starts.
The frontend never determines the crash point.
=========================================================
*/

function generateCrashPoint() {
  /*
   * Cryptographically secure random value.
   *
   * Most rounds will end at lower multipliers,
   * while very high multipliers remain possible.
   */

  const bytes = crypto.randomBytes(6);

  let random = 0n;

  for (const byte of bytes) {
    random = (random << 8n) + BigInt(byte);
  }

  const max = (1n << 48n) - 1n;

  const normalized =
    Number(random) / Number(max);

  /*
   * House-style crash distribution.

   * Minimum: 1.00x
   * The curve makes high multipliers progressively rarer.
   */

  if (normalized < 0.01) {
    return 1.00;
  }

  const crash =
    1 /
    (1 - normalized);

  /*
   * Keep the game within a sensible maximum.
   */

  const capped =
    Math.min(crash, 1000);

  return Number(
    capped.toFixed(2)
  );
}

function calculateMultiplier(startedAt) {
  const elapsed =
    Math.max(
      0,
      Date.now() -
        new Date(startedAt).getTime()
    );

  /*
   * Exponential acceleration.

   * 0s   = 1.00x
   * 1s   ≈ 1.25x
   * 2s   ≈ 1.56x
   * 3s   ≈ 1.95x
   * 4s   ≈ 2.44x
   * 5s   ≈ 3.05x
   * 8s   ≈ 5.96x
   * 10s  ≈ 9.31x

   * The frontend should use this same formula
   * only for animation. The server remains authoritative.
   */

  const seconds =
    elapsed / 1000;

  const multiplier =
    Math.pow(
      1.25,
      seconds
    );

  return Number(
    Math.max(
      1,
      multiplier
    ).toFixed(2)
  );
}

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
        error: "You must be logged in."
      });
    }

    const db =
      await getDb();

    const {
      action,
      wager
    } = req.body || {};

    /*
    =====================================================
    START
    =====================================================
    */

    if (action === "start") {
      const amount =
        Number(wager);

      if (
        !Number.isFinite(amount) ||
        !Number.isInteger(amount) ||
        amount < MIN_WAGER ||
        amount > MAX_WAGER
      ) {
        return res.status(400).json({
          success: false,
          error:
            `Wager must be an integer between ${MIN_WAGER} and ${MAX_WAGER}.`
        });
      }

      /*
       * Do not allow multiple active Crash rounds
       * for the same player.
       */

      const existing =
        await db.collection("crash_games")
          .findOne({
            userId: user._id,
            status: "active"
          });

      if (existing) {
        return res.status(409).json({
          success: false,
          error:
            "You already have an active Crash game.",
          game: {
            id: existing._id,
            wager: existing.wager,
            startedAt:
              existing.startedAt
          }
        });
      }

      /*
       * Atomically take the wager.
       */

      const balanceResult =
        await db.collection("minigame_users")
          .findOneAndUpdate(
            {
              _id: user._id,
              balance: {
                $gte: amount
              }
            },
            {
              $inc: {
                balance: -amount,
                totalWagered: amount,
                gamesPlayed: 1
              }
            },
            {
              returnDocument: "after"
            }
          );

      if (!balanceResult.value) {
        return res.status(400).json({
          success: false,
          error: "Insufficient balance."
        });
      }

      const startedAt =
        new Date();

      const crashPoint =
        generateCrashPoint();

      const gameId =
        crypto.randomUUID();

      const game = {
        _id: gameId,

        userId: user._id,

        username:
          user.username ||
          user.discordUsername ||
          null,

        wager: amount,

        crashPoint,

        startedAt,

        status: "active",

        cashoutMultiplier: null,

        payout: 0,

        profit: -amount,

        endedAt: null,

        createdAt: startedAt
      };

      try {
        await db
          .collection("crash_games")
          .insertOne(game);
      } catch (error) {
        /*
         * If recording the round fails, refund the wager.
         */

        await db
          .collection("minigame_users")
          .updateOne(
            {
              _id: user._id
            },
            {
              $inc: {
                balance: amount,
                totalWagered: -amount,
                gamesPlayed: -1
              }
            }
          );

        throw error;
      }

      return res.status(200).json({
        success: true,

        game: {
          id: game._id,
          wager: game.wager,
          startedAt:
            game.startedAt,

          /*
           * Do NOT expose crashPoint here.
           */

          status:
            game.status
        },

        balance:
          balanceResult.value.balance
      });
    }

    /*
    =====================================================
    UNKNOWN ACTION
    =====================================================
    */

    return res.status(400).json({
      success: false,
      error:
        "Invalid action. Use 'start'."
    });

  } catch (error) {
    console.error(
      "CRASH PLAY ERROR:",
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

/*
Exported for the cashout route.
*/
export {
  calculateMultiplier
};
