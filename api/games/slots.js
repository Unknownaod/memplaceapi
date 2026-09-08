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


/* ==========================================
   SYMBOLS
========================================== */

const SYMBOLS = [
  "cherry",
  "lemon",
  "orange",
  "grape",
  "bell",
  "seven"
];


/* ==========================================
   GENERATE REEL
========================================== */

function spinReel() {
  return SYMBOLS[
    crypto.randomInt(
      0,
      SYMBOLS.length
    )
  ];
}


/* ==========================================
   CALCULATE PAYOUT
========================================== */

function calculatePayout(
  reels,
  wager
) {

  const [
    first,
    second,
    third
  ] = reels;


  /* ========================================
     THREE SEVENS
  ======================================== */

  if (
    first === "seven" &&
    second === "seven" &&
    third === "seven"
  ) {

    return {
      multiplier: 50,
      payout: wager * 50,
      result: "jackpot"
    };

  }


  /* ========================================
     THREE MATCHING
  ======================================== */

  if (
    first === second &&
    second === third
  ) {

    return {
      multiplier: 10,
      payout: wager * 10,
      result: "three_of_a_kind"
    };

  }


  /* ========================================
     TWO MATCHING
  ======================================== */

  if (
    first === second ||
    second === third ||
    first === third
  ) {

    return {
      multiplier: 1.5,
      payout: Math.floor(
        wager * 1.5
      ),
      result: "two_of_a_kind"
    };

  }


  /* ========================================
     LOSS
  ======================================== */

  return {
    multiplier: 0,
    payout: 0,
    result: "loss"
  };

}


/* ==========================================
   HANDLER
========================================== */

export default async function handler(
  req,
  res
) {

  if (setCors(req, res)) {
    return;
  }


  /* ========================================
     METHOD
  ======================================== */

  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });

  }


  try {

    /* ======================================
       AUTHENTICATION
    ====================================== */

    const user =
      await getAuthenticatedUser(req);


    if (!user) {

      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });

    }


    /* ======================================
       BODY
    ====================================== */

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


    /* ======================================
       WAGER
    ====================================== */

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


    if (
      wager < MIN_WAGER
    ) {

      return res.status(400).json({
        success: false,
        error:
          `Minimum wager is ${MIN_WAGER}`
      });

    }


    if (
      wager > MAX_WAGER
    ) {

      return res.status(400).json({
        success: false,
        error:
          `Maximum wager is ${MAX_WAGER}`
      });

    }


    /* ======================================
       SERVER-SIDE SPIN
    ====================================== */

    const reels = [
      spinReel(),
      spinReel(),
      spinReel()
    ];


    /* ======================================
       CALCULATE RESULT
    ====================================== */

    const {
      multiplier,
      payout,
      result
    } =
      calculatePayout(
        reels,
        wager
      );


    const won =
      payout > 0;


    /* ======================================
       DATABASE
    ====================================== */

    const db =
      await getDb();

    const client =
      getMongoClient();

    const session =
      client.startSession();


    try {

      const gameId =
        crypto.randomBytes(24)
          .toString("hex");

      const now =
        new Date();

      let finalBalance = 0;


      /* ====================================
         TRANSACTION
      ==================================== */

      await session.withTransaction(
        async () => {

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
                    gamesLost: 1,
                    totalLost: wager
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
            .collection("slots_games")
            .insertOne(
              {
                _id: gameId,

                userId: user._id,

                wager,

                reels,

                result,

                multiplier,

                payout,

                won,

                status: "settled",

                createdAt: now,

                settledAt: now
              },
              {
                session
              }
            );

        }
      );


      /* ======================================
         RESPONSE
      ====================================== */

      return res.status(200).json({

        success: true,

        game: "slots",

        gameId,

        wager,

        reels,

        result,

        won,

        multiplier,

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
      "SLOTS ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
