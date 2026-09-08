import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../../lib/mongodb.js";

import {
  calculateChessRatings
} from "../../../lib/chess.js";


/*
==========================================
RESIGN CHESS GAME
==========================================
*/

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
    REQUEST
    ==========================================
    */

    const body = req.body || {};

    const gameId =
      typeof body.gameId === "string"
        ? body.gameId.trim()
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
    const mongoClient = getMongoClient();

    const session =
      mongoClient.startSession();


    try {

      let response = null;

      await session.withTransaction(
        async () => {

          /*
          ==========================================
          FIND GAME
          ==========================================
          */

          const game =
            await db
              .collection("chess_games")
              .findOne(
                {
                  _id: gameId
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
          ==========================================
          GAME MUST BE ACTIVE
          ==========================================
          */

          if (game.status !== "active") {
            throw new Error(
              "GAME_NOT_ACTIVE"
            );
          }


          /*
          ==========================================
          VERIFY PLAYER
          ==========================================
          */

          let playerColor = null;

          if (game.whiteId === user._id) {
            playerColor = "white";
          }

          if (game.blackId === user._id) {
            playerColor = "black";
          }

          if (!playerColor) {
            throw new Error(
              "NOT_A_PLAYER"
            );
          }


          /*
          ==========================================
          DETERMINE WINNER
          ==========================================
          */

          const winnerColor =
            playerColor === "white"
              ? "black"
              : "white";

          const winnerId =
            winnerColor === "white"
              ? game.whiteId
              : game.blackId;

          const loserId =
            playerColor === "white"
              ? game.whiteId
              : game.blackId;


          /*
          ==========================================
          LOAD PLAYER RECORDS
          ==========================================
          */

          const whiteUser =
            await db
              .collection("minigame_users")
              .findOne(
                {
                  _id: game.whiteId
                },
                {
                  session
                }
              );

          const blackUser =
            await db
              .collection("minigame_users")
              .findOne(
                {
                  _id: game.blackId
                },
                {
                  session
                }
              );


          if (!whiteUser || !blackUser) {
            throw new Error(
              "PLAYER_RECORD_NOT_FOUND"
            );
          }


          /*
          ==========================================
          RATINGS
          ==========================================
          */

          const ratings =
            calculateChessRatings(
              whiteUser.chessRating || 1200,
              blackUser.chessRating || 1200,
              winnerColor
            );


          /*
          ==========================================
          POT
          ==========================================
          */

          const pot =
            game.wager * 2;


          /*
          ==========================================
          MARK GAME COMPLETED
          ==========================================
          */

          const updateResult =
            await db
              .collection("chess_games")
              .updateOne(
                {
                  _id: gameId,
                  status: "active"
                },

                {
                  $set: {

                    status: "completed",

                    winnerId,

                    result:
                      winnerColor,

                    updatedAt:
                      new Date(),

                    settledAt:
                      new Date(),

                    pot

                  }
                },

                {
                  session
                }
              );


          /*
          ==========================================
          PROTECT AGAINST DOUBLE SETTLEMENT
          ==========================================
          */

          if (
            updateResult.modifiedCount !== 1
          ) {
            throw new Error(
              "GAME_ALREADY_SETTLED"
            );
          }


          /*
          ==========================================
          PAY WINNER
          ==========================================
          */

          const winnerOldRating =
            winnerColor === "white"
              ? whiteUser.chessRating || 1200
              : blackUser.chessRating || 1200;

          const winnerNewRating =
            winnerColor === "white"
              ? ratings.whiteRating
              : ratings.blackRating;


          await db
            .collection("minigame_users")
            .updateOne(
              {
                _id: winnerId
              },

              {
                $inc: {

                  balance: pot,

                  gamesPlayed: 1,

                  gamesWon: 1,

                  totalWon: pot,

                  chessRating:
                    winnerNewRating -
                    winnerOldRating

                },

                $set: {
                  updatedAt:
                    new Date()
                }
              },

              {
                session
              }
            );


          /*
          ==========================================
          UPDATE LOSER
          ==========================================
          */

          const loserOldRating =
            playerColor === "white"
              ? whiteUser.chessRating || 1200
              : blackUser.chessRating || 1200;

          const loserNewRating =
            playerColor === "white"
              ? ratings.whiteRating
              : ratings.blackRating;


          await db
            .collection("minigame_users")
            .updateOne(
              {
                _id: loserId
              },

              {
                $inc: {

                  gamesPlayed: 1,

                  gamesLost: 1,

                  totalLost: game.wager,

                  chessRating:
                    loserNewRating -
                    loserOldRating

                },

                $set: {
                  updatedAt:
                    new Date()
                }
              },

              {
                session
              }
            );


          /*
          ==========================================
          RESPONSE
          ==========================================
          */

          response = {

            success: true,

            game: "chess",

            gameId,

            status: "completed",

            color: playerColor,

            resigned: true,

            winner:
              winnerColor,

            winnerId,

            loserId,

            result:
              winnerColor,

            pot,

            payout: pot,

            ratings: {

              whiteRating:
                ratings.whiteRating,

              blackRating:
                ratings.blackRating

            }

          };

        }
      );


      /*
      ==========================================
      SUCCESS
      ==========================================
      */

      return res.status(200).json(
        response
      );


    } catch (error) {

      /*
      ==========================================
      KNOWN ERRORS
      ==========================================
      */

      if (
        error.message ===
        "GAME_NOT_FOUND"
      ) {
        return res.status(404).json({
          success: false,
          error: "Chess game not found."
        });
      }


      if (
        error.message ===
        "GAME_NOT_ACTIVE"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "This chess game is no longer active."
        });
      }


      if (
        error.message ===
        "NOT_A_PLAYER"
      ) {
        return res.status(403).json({
          success: false,
          error:
            "You are not a player in this chess game."
        });
      }


      if (
        error.message ===
        "PLAYER_RECORD_NOT_FOUND"
      ) {
        return res.status(500).json({
          success: false,
          error:
            "Chess player record not found."
        });
      }


      if (
        error.message ===
        "GAME_ALREADY_SETTLED"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "This chess game has already been settled."
        });
      }


      throw error;

    } finally {

      await session.endSession();

    }

  } catch (error) {

    console.error(
      "CHESS RESIGN ERROR:",
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
