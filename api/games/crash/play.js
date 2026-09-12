import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";

/*
=========================================================
MEMPLACE CRASH
=========================================================

POST /api/games/crash/play

Actions:

START:
{
  "action": "start",
  "wager": 100
}

CASH OUT:
{
  "action": "cashout",
  "gameId": "..."
}

The server controls:
- wager
- crash point
- multiplier
- cashout
- payout
- balance
- game result

The frontend NEVER decides the result.
=========================================================
*/


/* =========================================================
   CONFIG
========================================================= */

const MIN_WAGER = 1;
const MAX_WAGER = 1000000;

const MIN_CRASH = 1.01;


/* =========================================================
   GENERATE CRASH POINT
=========================================================

This generates a crash multiplier between 1.00x
and a potentially very high multiplier.

This is intentionally server-side.

NOTE:
For a production gambling/economy system, replace
Math.random() with crypto.randomInt/randomBytes and
ideally use a provably-fair system.
========================================================= */

function generateCrashPoint() {

  const random =
    Math.random();

  /*
   * Small values create frequent low crashes.
   *
   * 1 / (1 - random)
   * creates a long-tail distribution.
   */

  let crashPoint =
    1 /
    (1 - random);

  /*
   * Round to two decimal places.
   */

  crashPoint =
    Math.floor(
      crashPoint * 100
    ) / 100;

  /*
   * Never crash below 1.01x.
   */

  crashPoint =
    Math.max(
      MIN_CRASH,
      crashPoint
    );

  /*
   * Keep extreme values reasonable.
   */

  crashPoint =
    Math.min(
      100000,
      crashPoint
    );

  return crashPoint;

}


/* =========================================================
   GENERATE GAME ID
========================================================= */

function createGameId() {

  return (
    "crash_" +
    Date.now().toString(36) +
    "_" +
    Math.random()
      .toString(36)
      .slice(2, 12)
  );

}


/* =========================================================
   ROUND STATUS
========================================================= */

function getRoundStatus(
  round
) {

  if (!round) {
    return "unknown";
  }

  if (
    round.status === "cashed_out"
  ) {
    return "cashed_out";
  }

  if (
    round.status === "crashed"
  ) {
    return "crashed";
  }

  if (
    round.status === "active"
  ) {
    return "active";
  }

  return round.status || "unknown";

}


/* =========================================================
   GET ACTIVE ROUND
========================================================= */

async function getActiveRound(
  db,
  userId
) {

  return db
    .collection("crash_games")
    .findOne({
      userId,
      status: "active"
    });
}


/* =========================================================
   MAIN HANDLER
========================================================= */

export default async function handler(
  req,
  res
) {

  /*
   * CORS
   */

  if (
    setCors(req, res)
  ) {
    return;
  }


  /*
   * POST ONLY
   */

  if (
    req.method !== "POST"
  ) {

    return res.status(405).json({

      success: false,

      error:
        "Method not allowed."

    });

  }


  try {

    /*
     * AUTHENTICATION
     */

    const user =
      await getAuthenticatedUser(req);

    if (!user) {

      return res.status(401).json({

        success: false,

        error:
          "Authentication required."

      });

    }


    const db =
      await getDb();


    /*
     * ACTION
     */

    const action =
      typeof req.body?.action === "string"
        ? req.body.action
            .trim()
            .toLowerCase()
        : "";


    /* =====================================================
       START ROUND
    ===================================================== */

    if (
      action === "start"
    ) {

      const wager =
        Number(
          req.body?.wager
        );


      /*
       * VALIDATE WAGER
       */

      if (
        !Number.isInteger(wager) ||
        wager < MIN_WAGER
      ) {

        return res.status(400).json({

          success: false,

          error:
            `Wager must be a whole number of at least ${MIN_WAGER}.`,

          code:
            "INVALID_WAGER"

        });

      }


      if (
        wager > MAX_WAGER
      ) {

        return res.status(400).json({

          success: false,

          error:
            `Maximum wager is ${MAX_WAGER}.`,

          code:
            "WAGER_TOO_HIGH"

        });

      }


      /*
       * DON'T ALLOW MULTIPLE ACTIVE
       * CRASH ROUNDS FOR ONE USER.
       */

      const existingRound =
        await getActiveRound(
          db,
          user._id
        );


      if (
        existingRound
      ) {

        return res.status(409).json({

          success: false,

          error:
            "You already have an active Crash round.",

          code:
            "ACTIVE_ROUND_EXISTS",

          game: {

            gameId:
              existingRound.gameId,

            wager:
              existingRound.wager,

            startedAt:
              existingRound.startedAt

          }

        });

      }


      /*
       * ATOMICALLY TAKE THE WAGER.
       */

      const balanceResult =
        await db
          .collection("minigame_users")
          .findOneAndUpdate(

            {
              _id:
                user._id,

              balance: {
                $gte:
                  wager
              }

            },

            {
              $inc: {

                balance:
                  -wager,

                totalWagered:
                  wager,

                gamesPlayed:
                  1

              },

              $set: {

                updatedAt:
                  new Date()

              }

            },

            {
              returnDocument:
                "after"
            }

          );


      /*
       * INSUFFICIENT BALANCE
       */

      if (
        !balanceResult
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Insufficient balance.",

          code:
            "INSUFFICIENT_BALANCE"

        });

      }


      /*
       * CREATE ROUND
       */

      const gameId =
        createGameId();

      const crashPoint =
        generateCrashPoint();

      const now =
        new Date();


      const game = {

        _id:
          gameId,

        gameId,

        userId:
          user._id,

        username:
          user.username ||
          user.discordUsername ||
          null,

        wager,

        crashPoint,

        status:
          "active",

        currentMultiplier:
          1.00,

        payout:
          0,

        profit:
          -wager,

        startedAt:
          now,

        createdAt:
          now,

        updatedAt:
          now

      };


      try {

        await db
          .collection("crash_games")
          .insertOne(
            game
          );

      } catch (insertError) {

        /*
         * If the round could not be created,
         * refund the wager so the user isn't
         * charged for a game that doesn't exist.
         */

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
                  wager,

                totalWagered:
                  -wager,

                gamesPlayed:
                  -1

              },

              $set: {

                updatedAt:
                  new Date()

              }

            }

          );

        throw insertError;

      }


      /*
       * GET CURRENT BALANCE
       */

      const updatedUser =
        await db
          .collection("minigame_users")
          .findOne(

            {
              _id:
                user._id
            },

            {
              projection: {
                balance: 1
              }
            }

          );


      /*
       * RETURN ROUND
       *
       * IMPORTANT:
       *
       * We DO NOT return crashPoint here.
       *
       * The client should only learn the
       * crash point when the round actually
       * crashes or the player cashes out.
       */

      return res.status(200).json({

        success: true,

        action:
          "start",

        game: {

          gameId,

          wager,

          status:
            "active",

          multiplier:
            1.00,

          startedAt:
            now

        },

        balance:
          Number(
            updatedUser?.balance || 0
          )

      });

    }


    /* =====================================================
       CASH OUT
    ===================================================== */

    if (
      action === "cashout"
    ) {

      const gameId =
        typeof req.body?.gameId === "string"
          ? req.body.gameId.trim()
          : "";


      if (
        !gameId
      ) {

        return res.status(400).json({

          success: false,

          error:
            "Game ID is required.",

          code:
            "INVALID_GAME_ID"

        });

      }


      /*
       * FIND ACTIVE ROUND.
       */

      const round =
        await db
          .collection("crash_games")
          .findOne({

            gameId,

            userId:
              user._id,

            status:
              "active"

          });


      if (
        !round
      ) {

        /*
         * The round may already have crashed
         * or been cashed out.
         */

        const existing =
          await db
            .collection("crash_games")
            .findOne({

              gameId,

              userId:
                user._id

            });


        if (
          existing
        ) {

          return res.status(409).json({

            success: false,

            error:
              "This Crash round is no longer active.",

            code:
              "ROUND_NOT_ACTIVE",

            game: {

              gameId,

              status:
                getRoundStatus(
                  existing
                ),

              multiplier:
                Number(
                  existing.finalMultiplier ||
                  existing.currentMultiplier ||
                  1
                ),

              payout:
                Number(
                  existing.payout || 0
                )

            }

          });

        }


        return res.status(404).json({

          success: false,

          error:
            "Crash round not found.",

          code:
            "ROUND_NOT_FOUND"

        });

      }


      /*
       * CALCULATE CURRENT MULTIPLIER
       *
       * The multiplier grows based on
       * elapsed time.
       */

      const startedAt =
        new Date(
          round.startedAt
        ).getTime();

      const now =
        Date.now();

      const elapsed =
        Math.max(
          0,
          now - startedAt
        );


      /*
       * Approximately 0.25x per second
       * growth at the beginning.
       *
       * The frontend should use the same
       * visual formula for a smooth display,
       * but the server remains authoritative.
       */

      let currentMultiplier =
        1 +
        (
          elapsed / 1000
        ) *
        0.25;


      currentMultiplier =
        Math.floor(
          currentMultiplier *
          100
        ) / 100;


      /*
       * NEVER allow cashing out after
       * the crash point.
       */

      if (
        currentMultiplier >=
        Number(round.crashPoint)
      ) {

        const crashMultiplier =
          Number(
            round.crashPoint
          );


        const crashUpdate =
          await db
            .collection("crash_games")
            .updateOne(

              {
                _id:
                  round._id,

                status:
                  "active"

              },

              {
                $set: {

                  status:
                    "crashed",

                  currentMultiplier:
                    crashMultiplier,

                  finalMultiplier:
                    crashMultiplier,

                  payout:
                    0,

                  profit:
                    -Number(
                      round.wager
                    ),

                  crashedAt:
                    new Date(),

                  updatedAt:
                    new Date()

                }

              }

            );


        if (
          crashUpdate.modifiedCount === 0
        ) {

          return res.status(409).json({

            success: false,

            error:
              "The round has already ended.",

            code:
              "ROUND_ALREADY_ENDED"

          });

        }


        /*
         * Record loss.
         *
         * The original wager was already
         * removed when the round started.
         */

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
                  Number(
                    round.wager
                  ),

                gamesLost:
                  1

              },

              $set: {

                updatedAt:
                  new Date()

              }

            }

          );


        const crashedUser =
          await db
            .collection("minigame_users")
            .findOne(

              {
                _id:
                  user._id
              },

              {
                projection: {
                  balance: 1
                }
              }

            );


        return res.status(200).json({

          success: true,

          action:
            "crashed",

          game: {

            gameId,

            status:
              "crashed",

            multiplier:
              crashMultiplier,

            crashPoint:
              crashMultiplier,

            payout:
              0,

            profit:
              -Number(
                round.wager
              )

          },

          balance:
            Number(
              crashedUser?.balance || 0
            )

        });

      }


      /*
       * PAYOUT
       */

      const payout =
        Math.floor(
          Number(round.wager) *
          currentMultiplier
        );


      const profit =
        payout -
        Number(round.wager);


      /*
       * ATOMICALLY CASH OUT.
       *
       * If another request already cashed
       * this round out, this update won't
       * match.
       */

      const cashoutUpdate =
        await db
          .collection("crash_games")
          .updateOne(

            {
              _id:
                round._id,

              status:
                "active"

            },

            {
              $set: {

                status:
                  "cashed_out",

                currentMultiplier,

                finalMultiplier:
                  currentMultiplier,

                payout,

                profit,

                cashedOutAt:
                  new Date(),

                updatedAt:
                  new Date()

              }

            }

          );


      if (
        cashoutUpdate.modifiedCount === 0
      ) {

        return res.status(409).json({

          success: false,

          error:
            "The round has already ended.",

          code:
            "ROUND_ALREADY_ENDED"

        });

      }


      /*
       * CREDIT PAYOUT.
       */

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
                payout,

              gamesWon:
                1

            },

            $set: {

              updatedAt:
                new Date()

            }

          }

        );


      /*
       * GET FINAL BALANCE.
       */

      const cashedUser =
        await db
          .collection("minigame_users")
          .findOne(

            {
              _id:
                user._id
            },

            {
              projection: {
                balance: 1
              }
            }

          );


      /*
       * SUCCESS
       */

      return res.status(200).json({

        success: true,

        action:
          "cashout",

        game: {

          gameId,

          status:
            "cashed_out",

          multiplier:
            currentMultiplier,

          payout,

          profit

        },

        balance:
          Number(
            cashedUser?.balance || 0
          )

      });

    }


    /* =====================================================
       INVALID ACTION
    ===================================================== */

    return res.status(400).json({

      success: false,

      error:
        "Action must be start or cashout.",

      code:
        "INVALID_ACTION"

    });

  } catch (error) {

    console.error(
      "CRASH PLAY ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        "Internal server error."

    });

  }

}
