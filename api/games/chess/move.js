import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../../lib/mongodb.js";

import {
  loadChessGame,
  makeChessMove,
  getChessStatus,
  calculateChessRatings
} from "../../../lib/chess.js";


/*
==========================================
MAKE CHESS MOVE
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
    REQUEST BODY
    ==========================================
    */

    const body = req.body || {};

    const gameId =
      typeof body.gameId === "string"
        ? body.gameId.trim()
        : "";

    const from =
      typeof body.from === "string"
        ? body.from.trim().toLowerCase()
        : "";

    const to =
      typeof body.to === "string"
        ? body.to.trim().toLowerCase()
        : "";

    const promotion =
      body.promotion === undefined ||
      body.promotion === null
        ? undefined
        : String(body.promotion).trim().toLowerCase();


    /*
    ==========================================
    VALIDATE REQUEST
    ==========================================
    */

    if (!gameId) {
      return res.status(400).json({
        success: false,
        error: "gameId is required"
      });
    }

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: "from and to are required"
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

          if (
            game.whiteId === user._id
          ) {
            playerColor = "w";
          }

          if (
            game.blackId === user._id
          ) {
            playerColor = "b";
          }

          if (!playerColor) {
            throw new Error(
              "NOT_A_PLAYER"
            );
          }


          /*
          ==========================================
          VERIFY TURN
          ==========================================
          */

          if (game.turn !== playerColor) {
            throw new Error(
              "NOT_YOUR_TURN"
            );
          }


          /*
          ==========================================
          LOAD BOARD
          ==========================================
          */

          let chess;

          try {

            chess =
              loadChessGame(game.fen);

          } catch {

            throw new Error(
              "INVALID_GAME_POSITION"
            );

          }


          /*
          ==========================================
          VERIFY TURN FROM FEN
          ==========================================
          */

          if (chess.turn() !== playerColor) {
            throw new Error(
              "NOT_YOUR_TURN"
            );
          }


          /*
          ==========================================
          MAKE MOVE
          ==========================================
          */

          let move;

          try {

            move =
              makeChessMove(
                chess,
                from,
                to,
                promotion
              );

          } catch (error) {

            throw new Error(
              "ILLEGAL_MOVE:" +
              error.message
            );

          }


          /*
          ==========================================
          GET NEW GAME STATUS
          ==========================================
          */

          const chessStatus =
            getChessStatus(chess);


          /*
          ==========================================
          BUILD MOVE RECORD
          ==========================================
          */

          const moveNumber =
            (game.moves?.length || 0) + 1;

          const moveRecord = {

            number: moveNumber,

            color:
              playerColor === "w"
                ? "white"
                : "black",

            from: move.from,

            to: move.to,

            promotion:
              move.promotion || null,

            san:
              move.san,

            captured:
              move.captured || null,

            timestamp:
              new Date()

          };


          /*
          ==========================================
          NORMAL MOVE
          ==========================================
          */

          if (!chessStatus.isGameOver) {

            await db
              .collection("chess_games")
              .updateOne(
                {
                  _id: gameId,

                  status: "active",

                  turn: playerColor
                },

                {
                  $set: {

                    fen:
                      chessStatus.fen,

                    turn:
                      chessStatus.turn,

                    updatedAt:
                      new Date()

                  },

                  $push: {
                    moves:
                      moveRecord
                  }
                },

                {
                  session
                }
              );


            response = {

              success: true,

              game: "chess",

              gameId,

              status: "active",

              color:
                playerColor === "w"
                  ? "white"
                  : "black",

              move: moveRecord,

              board: {

                fen:
                  chessStatus.fen,

                turn:
                  chessStatus.turn

              },

              isCheck:
                chessStatus.isCheck,

              isGameOver: false,

              winner: null,

              result: null

            };

            return;

          }


          /*
          ==========================================
          GAME IS OVER
          ==========================================
          */

          let winnerId = null;

          if (
            chessStatus.result === "white"
          ) {
            winnerId =
              game.whiteId;
          }

          if (
            chessStatus.result === "black"
          ) {
            winnerId =
              game.blackId;
          }


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
          CALCULATE RATINGS
          ==========================================
          */

          const ratings =
            calculateChessRatings(
              whiteUser.chessRating || 1200,
              blackUser.chessRating || 1200,
              chessStatus.result
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
          SET GAME RESULT
          ==========================================
          */

          await db
            .collection("chess_games")
            .updateOne(
              {
                _id: gameId,

                status: "active",

                turn: playerColor
              },

              {
                $set: {

                  fen:
                    chessStatus.fen,

                  turn:
                    chessStatus.turn,

                  status:
                    "completed",

                  winnerId,

                  result:
                    chessStatus.result,

                  updatedAt:
                    new Date(),

                  settledAt:
                    new Date(),

                  pot

                },

                $push: {
                  moves:
                    moveRecord
                }

              },

              {
                session
              }
            );


          /*
          ==========================================
          DRAW
          ==========================================
          */

          if (
            chessStatus.result === "draw"
          ) {

            const halfPot =
              game.wager;


            /*
            Return each player's wager.
            */

            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: game.whiteId
                },

                {
                  $inc: {
                    balance: halfPot,

                    gamesPlayed: 1,

                    chessRating:
                      ratings.whiteRating
                      -
                      (whiteUser.chessRating || 1200),

                    totalWon: halfPot
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


            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: game.blackId
                },

                {
                  $inc: {
                    balance: halfPot,

                    gamesPlayed: 1,

                    chessRating:
                      ratings.blackRating
                      -
                      (blackUser.chessRating || 1200),

                    totalWon: halfPot
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


            response = {

              success: true,

              game: "chess",

              gameId,

              status: "completed",

              color:
                playerColor === "w"
                  ? "white"
                  : "black",

              move: moveRecord,

              board: {

                fen:
                  chessStatus.fen,

                turn:
                  chessStatus.turn

              },

              isCheck:
                chessStatus.isCheck,

              isGameOver: true,

              winner: null,

              result: "draw",

              pot,

              payout: halfPot,

              ratings

            };

            return;

          }


          /*
          ==========================================
          WINNER
          ==========================================
          */

          const winnerIsWhite =
            chessStatus.result === "white";

          const winnerUserId =
            winnerIsWhite
              ? game.whiteId
              : game.blackId;

          const loserUserId =
            winnerIsWhite
              ? game.blackId
              : game.whiteId;


          const winnerRating =
            winnerIsWhite
              ? ratings.whiteRating
              : ratings.blackRating;

          const loserRating =
            winnerIsWhite
              ? ratings.blackRating
              : ratings.whiteRating;


          const winnerOldRating =
            winnerIsWhite
              ? whiteUser.chessRating || 1200
              : blackUser.chessRating || 1200;

          const loserOldRating =
            winnerIsWhite
              ? blackUser.chessRating || 1200
              : whiteUser.chessRating || 1200;


          /*
          ==========================================
          PAY WINNER
          ==========================================
          */

          await db
            .collection("minigame_users")
            .updateOne(
              {
                _id: winnerUserId
              },

              {
                $inc: {

                  balance: pot,

                  gamesPlayed: 1,

                  gamesWon: 1,

                  totalWon: pot,

                  chessRating:
                    winnerRating -
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

          await db
            .collection("minigame_users")
            .updateOne(
              {
                _id: loserUserId
              },

              {
                $inc: {

                  gamesPlayed: 1,

                  gamesLost: 1,

                  totalLost: game.wager,

                  chessRating:
                    loserRating -
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

            color:
              playerColor === "w"
                ? "white"
                : "black",

            move: moveRecord,

            board: {

              fen:
                chessStatus.fen,

              turn:
                chessStatus.turn

            },

            isCheck:
              chessStatus.isCheck,

            isGameOver: true,

            winner:
              winnerIsWhite
                ? "white"
                : "black",

            winnerId:
              winnerUserId,

            loserId:
              loserUserId,

            result:
              chessStatus.result,

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
      RETURN RESPONSE
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
        "NOT_YOUR_TURN"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "It is not your turn."
        });
      }


      if (
        error.message?.startsWith(
          "ILLEGAL_MOVE:"
        )
      ) {

        return res.status(400).json({
          success: false,
          error:
            error.message.replace(
              "ILLEGAL_MOVE:",
              ""
            )
        });

      }


      if (
        error.message ===
        "INVALID_GAME_POSITION"
      ) {
        return res.status(500).json({
          success: false,
          error:
            "The chess game position is invalid."
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


      throw error;

    } finally {

      await session.endSession();

    }

  } catch (error) {

    console.error(
      "CHESS MOVE ERROR:",
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
