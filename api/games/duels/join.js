import crypto from "crypto";

import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../../lib/mongodb.js";

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

    const gameId =
      body?.gameId;

    if (
      typeof gameId !== "string" ||
      !gameId
    ) {
      return res.status(400).json({
        success: false,
        error: "gameId is required"
      });
    }

    const db =
      await getDb();

    const client =
      getMongoClient();

    const session =
      client.startSession();

    try {

      let response;

      await session.withTransaction(
        async () => {

          /*
            Find the waiting duel.
          */

          const game =
            await db
              .collection("duel_games")
              .findOne(
                {
                  _id: gameId,
                  status: "waiting"
                },
                {
                  session
                }
              );

          if (!game) {
            throw new Error(
              "GAME_NOT_FOUND"
            );
          }

          /*
            Creator cannot join
            their own duel.
          */

          if (
            game.creatorId ===
            user._id
          ) {
            throw new Error(
              "SELF_JOIN"
            );
          }

          /*
            Check expiration.
          */

          if (
            game.expiresAt &&
            new Date(game.expiresAt)
              <= new Date()
          ) {
            throw new Error(
              "GAME_EXPIRED"
            );
          }

          const wager =
            game.wager;

          const now =
            new Date();

          /*
            Lock opponent's wager.
          */

          const opponentAccount =
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

          if (!opponentAccount) {
            throw new Error(
              "INSUFFICIENT_BALANCE"
            );
          }

          /*
            Server-generated rolls.
          */

          const creatorRoll =
            crypto.randomInt(
              1,
              101
            );

          const opponentRoll =
            crypto.randomInt(
              1,
              101
            );

          const pot =
            wager * 2;

          let result;
          let winnerId = null;

          if (
            creatorRoll >
            opponentRoll
          ) {

            result = "creator_win";

            winnerId =
              game.creatorId;

          } else if (
            opponentRoll >
            creatorRoll
          ) {

            result = "opponent_win";

            winnerId =
              user._id;

          } else {

            result = "tie";

          }

          /*
            Settle the pot.
          */

          if (result === "creator_win") {

            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: game.creatorId
                },
                {
                  $inc: {
                    balance: pot,
                    totalWon: pot,
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

          } else if (
            result === "opponent_win"
          ) {

            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: user._id
                },
                {
                  $inc: {
                    balance: pot,
                    totalWon: pot,
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

          } else {

            /*
              Tie:
              Return both wagers.
            */

            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: game.creatorId
                },
                {
                  $inc: {
                    balance: wager
                  },
                  $set: {
                    updatedAt: now
                  }
                },
                {
                  session
                }
              );

            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: user._id
                },
                {
                  $inc: {
                    balance: wager
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

          /*
            Record the completed duel.
          */

          await db
            .collection("duel_games")
            .updateOne(
              {
                _id: gameId,
                status: "waiting"
              },
              {
                $set: {
                  opponentId:
                    user._id,

                  creatorRoll,

                  opponentRoll,

                  winnerId,

                  result,

                  status: "settled",

                  payout:
                    result === "tie"
                      ? wager
                      : pot,

                  updatedAt: now,

                  settledAt: now
                }
              },
              {
                session
              }
            );

          response = {
            gameId,

            wager,

            pot,

            status: "settled",

            result,

            winnerId,

            creator: {
              id: game.creatorId,
              roll: creatorRoll
            },

            opponent: {
              id: user._id,
              roll: opponentRoll
            },

            balance:
              opponentAccount.balance +
              (
                result ===
                "opponent_win"
                  ? pot
                  : result === "tie"
                    ? wager
                    : 0
              )
          };
        }
      );

      return res.status(200).json({
        success: true,
        game: "duels",
        ...response
      });

    } finally {
      await session.endSession();
    }

  } catch (error) {

    if (
      error.message ===
      "GAME_NOT_FOUND"
    ) {
      return res.status(404).json({
        success: false,
        error:
          "Duel not found or is no longer available"
      });
    }

    if (
      error.message ===
      "SELF_JOIN"
    ) {
      return res.status(400).json({
        success: false,
        error:
          "You cannot join your own duel"
      });
    }

    if (
      error.message ===
      "GAME_EXPIRED"
    ) {
      return res.status(410).json({
        success: false,
        error:
          "This duel has expired"
      });
    }

    if (
      error.message ===
      "INSUFFICIENT_BALANCE"
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Insufficient balance"
      });
    }

    console.error(
      "DUEL JOIN ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
