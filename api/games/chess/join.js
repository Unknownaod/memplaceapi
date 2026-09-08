import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../../lib/mongodb.js";


/*
==========================================
JOIN CHESS GAME
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
          FIND WAITING GAME
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
          GAME MUST BE WAITING
          ==========================================
          */

          if (game.status !== "waiting") {
            throw new Error(
              "GAME_NOT_WAITING"
            );
          }


          /*
          ==========================================
          CREATOR CANNOT JOIN OWN GAME
          ==========================================
          */

          if (
            game.whiteId === user._id
          ) {
            throw new Error(
              "SELF_JOIN"
            );
          }


          /*
          ==========================================
          CHECK EXPIRATION
          ==========================================
          */

          if (
            game.expiresAt &&
            new Date(game.expiresAt) <=
              new Date()
          ) {

            /*
            Refund the creator because
            nobody joined before expiration.
            */

            const refund =
              await db
                .collection("minigame_users")
                .findOneAndUpdate(
                  {
                    _id: game.whiteId
                  },

                  {
                    $inc: {
                      balance: game.wager
                    },

                    $set: {
                      updatedAt: new Date()
                    }
                  },

                  {
                    session,
                    returnDocument: "after"
                  }
                );


            if (!refund) {
              throw new Error(
                "CREATOR_NOT_FOUND"
              );
            }


            await db
              .collection("chess_games")
              .updateOne(
                {
                  _id: gameId,
                  status: "waiting"
                },

                {
                  $set: {
                    status: "cancelled",
                    result: "expired",
                    updatedAt: new Date(),
                    settledAt: new Date()
                  }
                },

                {
                  session
                }
              );


            throw new Error(
              "GAME_EXPIRED"
            );
          }


          /*
          ==========================================
          PREVENT MULTIPLE ACTIVE GAMES
          ==========================================
          */

          const existingGame =
            await db
              .collection("chess_games")
              .findOne(
                {
                  $or: [
                    {
                      whiteId: user._id
                    },
                    {
                      blackId: user._id
                    }
                  ],

                  status: {
                    $in: [
                      "waiting",
                      "active"
                    ]
                  }
                },

                {
                  session
                }
              );


          if (existingGame) {
            throw new Error(
              "ALREADY_IN_GAME"
            );
          }


          /*
          ==========================================
          DEDUCT OPPONENT WAGER
          ==========================================
          */

          const balanceResult =
            await db
              .collection("minigame_users")
              .findOneAndUpdate(
                {
                  _id: user._id,

                  balance: {
                    $gte: game.wager
                  }
                },

                {
                  $inc: {
                    balance: -game.wager,
                    totalWagered: game.wager,
                    gamesPlayed: 1
                  },

                  $set: {
                    updatedAt: new Date()
                  }
                },

                {
                  session,
                  returnDocument: "after"
                }
              );


          if (!balanceResult) {
            throw new Error(
              "INSUFFICIENT_BALANCE"
            );
          }


          /*
          ==========================================
          MARK GAME ACTIVE
          ==========================================
          */

          const updateResult =
            await db
              .collection("chess_games")
              .updateOne(
                {
                  _id: gameId,

                  status: "waiting",

                  blackId: null
                },

                {
                  $set: {
                    blackId: user._id,

                    status: "active",

                    turn: "w",

                    updatedAt: new Date(),

                    expiresAt: null
                  }
                },

                {
                  session
                }
              );


          /*
          This protects against two people
          attempting to join simultaneously.
          */

          if (
            updateResult.modifiedCount !== 1
          ) {
            throw new Error(
              "GAME_ALREADY_JOINED"
            );
          }


          /*
          ==========================================
          RESPONSE
          ==========================================
          */

          response = {
            success: true,

            game: "chess",

            gameId: gameId,

            status: "active",

            color: "black",

            white: {
              id: game.whiteId
            },

            black: {
              id: user._id
            },

            wager: game.wager,

            pot: game.wager * 2,

            balance:
              balanceResult.balance,

            board: {
              fen: game.fen,

              turn: "w"
            },

            moves: []

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
        "GAME_NOT_WAITING"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "This chess game is no longer waiting for an opponent."
        });
      }


      if (
        error.message ===
        "SELF_JOIN"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "You cannot join your own chess game."
        });
      }


      if (
        error.message ===
        "GAME_EXPIRED"
      ) {
        return res.status(410).json({
          success: false,
          error:
            "This chess game expired before an opponent joined."
        });
      }


      if (
        error.message ===
        "ALREADY_IN_GAME"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "You already have an active chess game."
        });
      }


      if (
        error.message ===
        "INSUFFICIENT_BALANCE"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Insufficient balance."
        });
      }


      if (
        error.message ===
        "GAME_ALREADY_JOINED"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "Another player already joined this game."
        });
      }


      throw error;

    } finally {

      await session.endSession();

    }

  } catch (error) {

    console.error(
      "CHESS JOIN ERROR:",
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
