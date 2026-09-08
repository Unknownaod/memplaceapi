import crypto from "crypto";

import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../../lib/mongodb.js";

const MIN_WAGER = 10;
const MAX_WAGER = 10000;

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
    const user =
      await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });
    }

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

    const db =
      await getDb();

    /*
      Prevent a player from creating
      multiple waiting duels.
    */

    const existing =
      await db
        .collection("duel_games")
        .findOne({
          creatorId: user._id,
          status: "waiting"
        });

    if (existing) {
      return res.status(409).json({
        success: false,
        error:
          "You already have a duel waiting for an opponent",
        gameId: existing._id
      });
    }

    const gameId =
      crypto.randomBytes(24)
        .toString("hex");

    const now =
      new Date();

    const client =
      getMongoClient();

    const session =
      client.startSession();

    try {
      let finalBalance = 0;

      await session.withTransaction(
        async () => {

          /*
            Lock the creator's wager.
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

          await db
            .collection("duel_games")
            .insertOne(
              {
                _id: gameId,

                game: "duels",

                creatorId: user._id,

                opponentId: null,

                wager,

                creatorRoll: null,

                opponentRoll: null,

                winnerId: null,

                result: null,

                status: "waiting",

                createdAt: now,

                updatedAt: now,

                expiresAt:
                  new Date(
                    now.getTime() +
                    15 * 60 * 1000
                  )
              },
              {
                session
              }
            );
        }
      );

      return res.status(200).json({
        success: true,

        game: "duels",

        gameId,

        status: "waiting",

        wager,

        balance:
          finalBalance
      });

    } finally {
      await session.endSession();
    }

  } catch (error) {

    if (
      error.message ===
      "INSUFFICIENT_BALANCE"
    ) {
      return res.status(400).json({
        success: false,
        error: "Insufficient balance"
      });
    }

    console.error(
      "DUEL CREATE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
