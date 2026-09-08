import crypto from "crypto";

import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../lib/mongodb.js";


/* ==========================================
   CONSTANTS
========================================== */

const MIN_WAGER = 10;
const MAX_WAGER = 10000;

const MIN_TARGET = 2;
const MAX_TARGET = 98;


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
       VALIDATE WAGER
    ======================================== */

    const wager =
      Number(body?.wager);

    if (
      !Number.isInteger(wager) ||
      wager <= 0
    ) {

      return res.status(400).json({
        success: false,
        error:
          "Wager amount must be a positive whole number"
      });

    }


    if (wager < MIN_WAGER) {

      return res.status(400).json({
        success: false,
        error:
          `Minimum wager is ${MIN_WAGER}`
      });

    }


    if (wager > MAX_WAGER) {

      return res.status(400).json({
        success: false,
        error:
          `Maximum wager is ${MAX_WAGER}`
      });

    }


    /* ========================================
       VALIDATE TARGET
    ======================================== */

    const target =
      Number(body?.target);

    if (
      !Number.isInteger(target)
    ) {

      return res.status(400).json({
        success: false,
        error:
          "Target must be a whole number"
      });

    }


    if (
      target < MIN_TARGET ||
      target > MAX_TARGET
    ) {

      return res.status(400).json({
        success: false,
        error:
          `Target must be between ${MIN_TARGET} and ${MAX_TARGET}`
      });

    }


    /* ========================================
       VALIDATE DIRECTION
    ======================================== */

    const direction =
      String(body?.direction || "")
        .toLowerCase();


    if (
      direction !== "over" &&
      direction !== "under"
    ) {

      return res.status(400).json({
        success: false,
        error:
          "Direction must be over or under"
      });

    }


    /* ========================================
       CALCULATE WIN PROBABILITY
    ======================================== */

    let winningNumbers;

    if (direction === "under") {

      winningNumbers =
        target - 1;

    } else {

      winningNumbers =
        100 - target;

    }


    const winProbability =
      winningNumbers / 100;


    /*
      House edge = 1%

      Payout multiplier is based
      on the probability of winning.

      Example:

      50% chance
      → approximately 1.98x

      25% chance
      → approximately 3.96x
    */

    const HOUSE_EDGE = 0.01;

    const multiplier =
      (1 / winProbability) *
      (1 - HOUSE_EDGE);


    /* ========================================
       GENERATE SERVER-SIDE ROLL
    ======================================== */

    const roll =
      crypto.randomInt(1, 101);


    /* ========================================
       DETERMINE RESULT
    ======================================== */

    let won;

    if (direction === "under") {

      won =
        roll < target;

    } else {

      won =
        roll > target;

    }


    let payout = 0;

    if (won) {

      payout =
        Math.floor(
          wager * multiplier
        );

    }


    /* ========================================
       DATABASE
    ======================================== */

    const db =
      await getDb();

    const client =
      getMongoClient();

    const session =
      client.startSession();


    try {

      let finalBalance = 0;

      const gameId =
        crypto.randomBytes(24)
          .toString("hex");

      const now =
        new Date();


      /* ======================================
         TRANSACTION
      ====================================== */

      await session.withTransaction(
        async () => {

          /*
            Deduct wager.

            This is atomic so the user
            cannot spend the same balance
            twice through concurrent requests.
          */

          const account =
            await db
              .collection("minigame_users")
              .findOneAndUpdate(
                {
                  _id: user._id,
                  balance: {
                    $gte: wager
                  }
                },
                {
                  $inc: {
                    balance: -wager,
                    totalWagered: wager,
                    gamesPlayed: 1
                  },
                  $set: {
                    updatedAt: now
                  }
                },
                {
                  session,
                  returnDocument: "after"
                }
              );


          if (!account) {

            throw new Error(
              "INSUFFICIENT_BALANCE"
            );

          }


          finalBalance =
            account.balance;


          /* ==================================
             PAYOUT
          ================================== */

          if (won) {

            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: user._id
                },
                {
                  $inc: {
                    balance: payout,
                    totalWon: payout,
                    gamesWon: 1
                  },
                  $set: {
                    updatedAt: now
                  }
                },
                {
                  session
                }
              );


            finalBalance += payout;

          } else {

            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: user._id
                },
                {
                  $inc: {
                    gamesLost: 1
                  },
                  $set: {
                    updatedAt: now
                  }
                },
                {
                  session
                }
              );

          }


          /* ==================================
             RECORD GAME
          ================================== */

          await db
            .collection("dice_games")
            .insertOne(
              {
                _id: gameId,

                userId: user._id,

                wager,

                target,

                direction,

                roll,

                won,

                multiplier:

                  Number(
                    multiplier.toFixed(4)
                  ),

                payout,

                createdAt: now,

                settledAt: now,

                status: "settled"
              },
              {
                session
              }
            );

        }
      );


      /* ========================================
         RESPONSE
      ======================================== */

      return res.status(200).json({

        success: true,

        game: "dice",

        gameId,

        wager,

        target,

        direction,

        roll,

        won,

        multiplier:
          Number(
            multiplier.toFixed(4)
          ),

        payout,

        balance:
          finalBalance

      });


    } finally {

      await session.endSession();

    }


  } catch (error) {


    /* ========================================
       INSUFFICIENT BALANCE
    ======================================== */

    if (
      error.message ===
      "INSUFFICIENT_BALANCE"
    ) {

      return res.status(400).json({
        success: false,
        error: "Insufficient balance"
      });

    }


    /* ========================================
       SERVER ERROR
    ======================================== */

    console.error(
      "DICE ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
