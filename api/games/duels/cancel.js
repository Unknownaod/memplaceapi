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

      let finalBalance = 0;

      await session.withTransaction(
        async () => {

          const game =
            await db
              .collection("duel_games")
              .findOne(
                {
                  _id: gameId,
                  creatorId: user._id,
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

          const now =
            new Date();

          /*
            Return the creator's wager.
          */

          const account =
            await db
              .collection("minigame_users")
              .findOneAndUpdate(
                {
                  _id: user._id
                },
                {
                  $inc: {
                    balance: game.wager
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
              "ACCOUNT_NOT_FOUND"
            );
          }

          finalBalance =
            account.balance;

          await db
            .collection("duel_games")
            .updateOne(
              {
                _id: gameId,
                creatorId: user._id,
                status: "waiting"
              },
              {
                $set: {
                  status: "cancelled",
                  updatedAt: now,
                  cancelledAt: now
                }
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
        status: "cancelled",
        balance:
          finalBalance
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
          "Duel not found or already closed"
      });
    }

    if (
      error.message ===
      "ACCOUNT_NOT_FOUND"
    ) {
      return res.status(500).json({
        success: false,
        error:
          "User account not found"
      });
    }

    console.error(
      "DUEL CANCEL ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
