import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";
import {
  loadChessGame,
  getChessStatus
} from "../../../lib/chess.js";


/*
==========================================
CHESS GAME STATUS
==========================================
*/

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

    /*
    ==========================================
    AUTHENTICATION
    ==========================================
    */

    const user =
      await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });
    }


    /*
    ==========================================
    GAME ID
    ==========================================
    */

    const gameId =
      typeof req.query?.gameId === "string"
        ? req.query.gameId.trim()
        : "";

    if (!gameId) {
      return res.status(400).json({
        success: false,
        error: "gameId is required"
      });
    }


    /*
    ==========================================
    DATABASE
    ==========================================
    */

    const db = await getDb();

    const game =
      await db
        .collection("chess_games")
        .findOne({
          _id: gameId
        });


    if (!game) {
      return res.status(404).json({
        success: false,
        error: "Chess game not found."
      });
    }


    /*
    ==========================================
    VERIFY PLAYER
    ==========================================
    */

    let color = null;

    if (game.whiteId === user._id) {
      color = "white";
    }

    if (game.blackId === user._id) {
      color = "black";
    }

    if (!color) {
      return res.status(403).json({
        success: false,
        error:
          "You are not a player in this chess game."
      });
    }


    /*
    ==========================================
    LOAD BOARD
    ==========================================
    */

    let chessStatus = null;

    try {

      const chess =
        loadChessGame(game.fen);

      chessStatus =
        getChessStatus(chess);

    } catch (error) {

      console.error(
        "CHESS STATUS POSITION ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error:
          "The chess game position is invalid."
      });

    }


    /*
    ==========================================
    PLAYER TURN
    ==========================================
    */

    const turn =
      chessStatus.turn === "w"
        ? "white"
        : "black";


    /*
    ==========================================
    EXPIRATION
    ==========================================
    */

    const expiresAt =
      game.expiresAt || null;


    /*
    ==========================================
    RESPONSE
    ==========================================
    */

    return res.status(200).json({

      success: true,

      game: "chess",

      gameId: game._id,

      status: game.status,

      color,

      players: {

        white: {
          id: game.whiteId
        },

        black: {
          id: game.blackId
        }

      },

      wager: game.wager,

      pot:
        game.pot ||
        game.wager * 2,

      board: {

        fen:
          chessStatus.fen,

        turn

      },

      turn,

      isYourTurn:
        turn === color,

      isCheck:
        chessStatus.isCheck,

      isCheckmate:
        chessStatus.isCheckmate,

      isStalemate:
        chessStatus.isStalemate,

      isThreefoldRepetition:
        chessStatus.isThreefoldRepetition,

      isInsufficientMaterial:
        chessStatus.isInsufficientMaterial,

      isGameOver:
        game.status === "completed" ||
        chessStatus.isGameOver,

      winnerId:
        game.winnerId || null,

      result:
        game.result || null,

      drawOfferBy:
        game.drawOfferBy || null,

      moves:
        game.moves || [],

      createdAt:
        game.createdAt,

      updatedAt:
        game.updatedAt,

      expiresAt,

      settledAt:
        game.settledAt || null

    });

  } catch (error) {

    console.error(
      "CHESS STATUS ERROR:",
      error
    );

    if (!res.headersSent) {

      return res.status(500).json({
        success: false,
        error:
          "Internal server error"
      });

    }

  }

}
