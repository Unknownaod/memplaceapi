import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";

export default async function handler(req, res) {

  setCors(req, res);

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {

    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: "Authentication required."
      });
    }

    const db = await getDb();

    const games = await db
      .collection("chess_games")
      .find({
        $or: [
          { whiteId: user._id },
          { blackId: user._id }
        ],
        status: {
          $in: ["waiting", "active"]
        }
      })
      .sort({
        updatedAt: -1
      })
      .toArray();

    const activeGames = games.map(game => {

      const isWhite = game.whiteId === user._id;

      return {
        gameId: game._id,

        status: game.status,

        color: isWhite
          ? "white"
          : "black",

        whiteId: game.whiteId || null,
        blackId: game.blackId || null,

        opponentId: isWhite
          ? (game.blackId || null)
          : (game.whiteId || null),

        wager: game.wager || 0,
        pot: game.pot || ((game.wager || 0) * 2),

        createdAt: game.createdAt || null,
        updatedAt: game.updatedAt || null,
        expiresAt: game.expiresAt || null
      };

    });

    return res.status(200).json({
      success: true,
      games: activeGames
    });

  } catch (error) {

    console.error(
      "CHESS ACTIVE GAMES ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Unable to load active games."
    });

  }

}
