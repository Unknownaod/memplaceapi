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

const MIN_WAGER = 1;
const MAX_WAGER = 1_000_000;


/* ==========================================
   CRASH POINT GENERATOR
========================================== */

function generateCrashPoint() {

  const bytes =
    crypto.randomBytes(6);

  let random = 0n;

  for (const byte of bytes) {

    random =
      (random << 8n) +
      BigInt(byte);

  }

  const max =
    (1n << 48n) - 1n;

  const normalized =
    Number(random) /
    Number(max);


  /*
    Small random values can
    immediately crash at 1.00x.
  */

  if (normalized < 0.01) {

    return 1.00;

  }


  /*
    Provably random-style
    crash calculation.
  */

  const crash =
    1 /
    (1 - normalized);


  const capped =
    Math.min(
      crash,
      1000
    );


  return Number(
    capped.toFixed(2)
  );

}


/* ==========================================
   MULTIPLIER CALCULATION
========================================== */

function calculateMultiplier(startedAt) {

  const elapsed =
    Math.max(
      0,
      Date.now() -
      new Date(startedAt).getTime()
    );


  const seconds =
    elapsed / 1000;


  /*
    1.00x
    1.25x after 1 second
    1.56x after 2 seconds
    1.95x after 3 seconds
    etc.
  */

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
       ACTION
    ======================================== */

    const action =
      String(body?.action || "")
        .toLowerCase();


    if (action !== "start") {

      return res.status(400).json({
        success: false,
        error:
          "Invalid action. Use 'start'."
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


      const crashPoint =
        generateCrashPoint();


      /* ======================================
         TRANSACTION
      ====================================== */

      await session.withTransaction(
        async () => {


          /* ==================================
             CHECK ACTIVE GAME
          ================================== */

          const existing =
            await db
              .collection("crash_games")
              .findOne(
                {
                  userId: user._id,
                  status: "active"
                },
                {
                  session
                }
              );


          if (existing) {

            const error =
              new Error(
                "ACTIVE_GAME_EXISTS"
              );

            error.game =
              existing;

            throw error;

          }


          /* ==================================
             DEDUCT WAGER
          ================================== */

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

                    totalWagered:
                      wager,

                    gamesPlayed:
                      1
                  },

                  $set: {
                    updatedAt:
                      now
                  }
                },
                {
                  session,

                  returnDocument:
                    "after"
                }
              );


          /*
            MongoDB Node driver 6.x returns
            the document directly.

            This matches your Dice game.
          */

          if (!account) {

            throw new Error(
              "INSUFFICIENT_BALANCE"
            );

          }


          finalBalance =
            account.balance;


          /* ==================================
             CREATE CRASH GAME
          ================================== */

          await db
            .collection("crash_games")
            .insertOne(
              {
                _id:
                  gameId,

                userId:
                  user._id,

                username:
                  user.username ||
                  user.discordUsername ||
                  null,

                wager,

                crashPoint,

                startedAt:
                  now,

                status:
                  "active",

                cashoutMultiplier:
                  null,

                payout:
                  0,

                profit:
                  -wager,

                endedAt:
                  null,

                createdAt:
                  now
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

        success:
          true,

        game: {

          id:
            gameId,

          gameId:
            gameId,

          wager,

          startedAt:
            now,

          status:
            "active"

        },

        balance:
          finalBalance

      });


    } finally {

      await session.endSession();

    }


  } catch (error) {


    /* ========================================
       ACTIVE GAME
    ======================================== */

    if (
      error.message ===
      "ACTIVE_GAME_EXISTS"
    ) {

      return res.status(409).json({

        success:
          false,

        error:
          "You already have an active Crash game.",

        game: {

          id:
            error.game._id,

          gameId:
            error.game._id,

          wager:
            error.game.wager,

          startedAt:
            error.game.startedAt,

          status:
            error.game.status

        }

      });

    }


    /* ========================================
       INSUFFICIENT BALANCE
    ======================================== */

    if (
      error.message ===
      "INSUFFICIENT_BALANCE"
    ) {

      return res.status(400).json({

        success:
          false,

        error:
          "Insufficient balance"

      });

    }


    /* ========================================
       SERVER ERROR
    ======================================== */

    console.error(
      "CRASH PLAY ERROR:",
      error
    );


    return res.status(500).json({

      success:
        false,

      error:
        "Internal server error"

    });

  }

}


/* ==========================================
   EXPORT MULTIPLIER
========================================== */

export {
  calculateMultiplier
};
