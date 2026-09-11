import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";

/*
=========================================================
PLINKO
Server-authoritative wager game

POST /api/games/plinko/play

Body:
{
  wager: 100,
  risk: "medium"
}

The server decides:
- ball path
- landing slot
- multiplier
- payout
- balance changes

The frontend should only animate the returned path.
=========================================================
*/


/* =========================================================
   CONFIG
========================================================= */

const RISK_CONFIG = {

  low: {
    rows: 10,

    multipliers: [
      0.5,
      0.7,
      1.0,
      1.2,
      1.5,
      1.2,
      1.0,
      0.7,
      0.5
    ]
  },

  medium: {
    rows: 10,

    multipliers: [
      0.2,
      0.5,
      1.0,
      2.0,
      5.0,
      2.0,
      1.0,
      0.5,
      0.2
    ]
  },

  high: {
    rows: 10,

    multipliers: [
      0.0,
      0.2,
      0.5,
      1.0,
      10.0,
      1.0,
      0.5,
      0.2,
      0.0
    ]
  }

};


/* =========================================================
   LIMITS
========================================================= */

const MIN_WAGER = 1;
const MAX_WAGER = 1000000;


/* =========================================================
   RANDOM INTEGER
========================================================= */

function randomInt(min, max) {

  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;

}


/* =========================================================
   GENERATE BALL PATH
=========================================================

Each row produces:

0 = ball moves left
1 = ball moves right

The final number of right movements determines
the landing position.
========================================================= */

function generatePath(rows) {

  const path = [];

  let rights = 0;

  for (
    let i = 0;
    i < rows;
    i++
  ) {

    const direction =
      randomInt(0, 1);

    path.push(direction);

    if (direction === 1) {
      rights++;
    }

  }

  return {
    path,
    rights
  };

}


/* =========================================================
   GET LANDING SLOT
========================================================= */

function getLandingSlot(
  rights,
  rows,
  slotCount
) {

  /*
   * Scale the possible positions into
   * the available multiplier slots.
   */

  const normalized =
    rights / rows;

  let slot =
    Math.round(
      normalized *
      (slotCount - 1)
    );

  slot =
    Math.max(
      0,
      Math.min(
        slotCount - 1,
        slot
      )
    );

  return slot;

}


/* =========================================================
   RECORD GAME
========================================================= */

async function recordGame(
  db,
  userId,
  data
) {

  const now =
    new Date();

  await db
    .collection("plinko_games")
    .insertOne({

      userId,

      wager:
        data.wager,

      risk:
        data.risk,

      multiplier:
        data.multiplier,

      payout:
        data.payout,

      profit:
        data.profit,

      slot:
        data.slot,

      path:
        data.path,

      createdAt:
        now

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


    /*
     * READ REQUEST
     */

    const wager =
      Number(
        req.body?.wager
      );

    const requestedRisk =
      typeof req.body?.risk === "string"
        ? req.body.risk
            .trim()
            .toLowerCase()
        : "medium";


    /*
     * VALIDATE WAGER
     */

    if (
      !Number.isFinite(wager) ||
      !Number.isInteger(wager)
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Wager must be a whole number.",

        code:
          "INVALID_WAGER"

      });

    }


    if (
      wager < MIN_WAGER
    ) {

      return res.status(400).json({

        success: false,

        error:
          `Minimum wager is ${MIN_WAGER}.`,

        code:
          "WAGER_TOO_LOW"

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
     * VALIDATE RISK
     */

    if (
      !Object.prototype.hasOwnProperty.call(
        RISK_CONFIG,
        requestedRisk
      )
    ) {

      return res.status(400).json({

        success: false,

        error:
          "Invalid risk level.",

        code:
          "INVALID_RISK",

        allowedRisk:
          Object.keys(
            RISK_CONFIG
          )

      });

    }


    const risk =
      requestedRisk;

    const config =
      RISK_CONFIG[risk];


    /*
     * DATABASE
     */

    const db =
      await getDb();


    /*
     * MAKE SURE THE USER HAS
     * A MINIGAME ACCOUNT
     */

    const minigameUser =
      await db
        .collection("minigame_users")
        .findOne({
          _id:
            user._id
        });


    if (!minigameUser) {

      return res.status(404).json({

        success: false,

        error:
          "Minigame account not found."

      });

    }


    /*
     * ATOMICALLY REMOVE WAGER
     *
     * This prevents the client from
     * spending more than their balance.
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
     * GENERATE RESULT
     */

    const {
      path,
      rights
    } =
      generatePath(
        config.rows
      );


    /*
     * FIND LANDING SLOT
     */

    const slot =
      getLandingSlot(

        rights,

        config.rows,

        config.multipliers.length

      );


    /*
     * MULTIPLIER
     */

    const multiplier =
      Number(
        config.multipliers[slot]
      );


    /*
     * CALCULATE PAYOUT
     */

    const payout =
      Math.floor(
        wager *
        multiplier
      );


    const profit =
      payout -
      wager;


    /*
     * PAY WINNINGS
     */

    if (
      payout > 0
    ) {

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

    } else {

      /*
       * Complete loss.
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
                wager,

              gamesLost:
                1

            },

            $set: {

              updatedAt:
                new Date()

            }

          }

        );

    }


    /*
     * GET FINAL BALANCE
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
     * RECORD GAME
     */

    await recordGame(

      db,

      user._id,

      {
        wager,

        risk,

        multiplier,

        payout,

        profit,

        slot,

        path

      }

    );


    /*
     * SUCCESS
     */

    return res.status(200).json({

      success: true,

      game: {

        wager,

        risk,

        multiplier,

        payout,

        profit,

        slot,

        path

      },

      balance:
        Number(
          updatedUser?.balance || 0
        )

    });

  } catch (error) {

    console.error(
      "PLINKO PLAY ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        "Internal server error."

    });

  }

}
