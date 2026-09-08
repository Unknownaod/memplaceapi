import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";

export default async function handler(req, res) {
  if (setCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });
    }

    const gameId = req.query?.gameId;

    if (
      typeof gameId !== "string" ||
      !gameId.trim()
    ) {
      return res.status(400).json({
        success: false,
        error: "gameId is required"
      });
    }

    const db = await getDb();

    const game = await db
      .collection("duel_games")
      .findOne({
        _id: gameId.trim(),
        $or: [
          {
            creatorId: user._id
          },
          {
            opponentId: user._id
          }
        ]
      });

    if (!game) {
      return res.status(404).json({
        success: false,
        error: "Duel not found"
      });
    }

    /*
      Only return information that belongs
      to this user's duel.
    */

    return res.status(200).json({
      success: true,

      game: "duels",

      gameId: game._id,

      status: game.status,

      wager: game.wager,

      creator: {
        id: game.creatorId,
        roll:
          game.creatorRoll ??
          null
      },

      opponent: game.opponentId
        ? {
            id: game.opponentId,
            roll:
              game.opponentRoll ??
              null
          }
        : null,

      winnerId:
        game.winnerId ??
        null,

      result:
        game.result ??
        null,

      payout:
        game.payout ??
        0,

      createdAt:
        game.createdAt ??
        null,

      settledAt:
        game.settledAt ??
        null,

      cancelledAt:
        game.cancelledAt ??
        null
    });

  } catch (error) {
    console.error(
      "DUEL STATUS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
