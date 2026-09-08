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
CHESS DRAW SYSTEM
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

    const action =
      typeof body.action === "string"
        ? body.action.trim().toLowerCase()
        : "";


    if (!gameId) {
      return res.status(400).json({
        success: false,
        error: "gameId is required"
      });
    }


    if (
      ![
        "offer",
        "accept",
        "decline",
        "cancel"
      ].includes(action)
    ) {
      return res.status(400).json({
        success: false,
        error:
          "action must be offer, accept, decline, or cancel."
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
          CURRENT DRAW OFFER
          ==========================================
          */

          const currentOffer =
            game.drawOfferBy || null;


          /*
          ==========================================
          OFFER DRAW
          ==========================================
          */

          if (action === "offer") {

            /*
            Cannot offer a draw when
            one already exists.
            */

            if (currentOffer) {
              throw new Error(
                "DRAW_OFFER_EXISTS"
              );
            }


            await db
              .collection("chess_games")
              .updateOne(
                {
                  _id: gameId,

                  status: "active",

                  drawOfferBy: null
                },

                {
                  $set: {
                    drawOfferBy: user._id,
                    updatedAt: new Date()
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

              action: "offer",

              drawOfferBy:
                user._id

            };

            return;
          }


          /*
          ==========================================
          DECLINE DRAW
          ==========================================
          */

          if (action === "decline") {

            /*
            There must be an offer.
            */

            if (!currentOffer) {
              throw new Error(
                "NO_DRAW_OFFER"
              );
            }


            /*
            You cannot decline
            your own offer.
            */

            if (
              currentOffer === user._id
            ) {
              throw new Error(
                "OWN_DRAW_OFFER"
              );
            }


            await db
              .collection("chess_games")
              .updateOne(
                {
                  _id: gameId,

                  status: "active",

                  drawOfferBy:
                    currentOffer
                },

                {
                  $set: {
                    drawOfferBy: null,
                    updatedAt: new Date()
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

              action: "decline",

              drawOfferBy: null

            };

            return;
          }


          /*
          ==========================================
          CANCEL DRAW OFFER
          ==========================================
          */

          if (action === "cancel") {

            if (!currentOffer) {
              throw new Error(
                "NO_DRAW_OFFER"
              );
            }


            /*
            Only the player who made
            the offer can cancel it.
            */

            if (
              currentOffer !== user._id
            ) {
              throw new Error(
                "NOT_DRAW_OFFER_OWNER"
              );
            }


            await db
              .collection("chess_games")
              .updateOne(
                {
                  _id: gameId,

                  status: "active",

                  drawOfferBy:
                    user._id
                },

                {
                  $set: {
                    drawOfferBy: null,
                    updatedAt: new Date()
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

              action: "cancel",

              drawOfferBy: null

            };

            return;
          }


          /*
          ==========================================
          ACCEPT DRAW
          ==========================================
          */

          if (action === "accept") {

            /*
            There must be an offer.
            */

            if (!currentOffer) {
              throw new Error(
                "NO_DRAW_OFFER"
              );
            }


            /*
            You cannot accept
            your own offer.
            */

            if (
              currentOffer === user._id
            ) {
              throw new Error(
                "OWN_DRAW_OFFER"
              );
            }


            /*
            ==========================================
            LOAD PLAYERS
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
                "draw"
              );


            /*
            ==========================================
            POT
            ==========================================
            */

            const pot =
              game.wager * 2;


            /*
            Each player receives
            their original wager back.
            */

            const payout =
              game.wager;


            /*
            ==========================================
            COMPLETE GAME
            ==========================================
            */

            const updateResult =
              await db
                .collection("chess_games")
                .updateOne(
                  {
                    _id: gameId,

                    status: "active",

                    drawOfferBy:
                      currentOffer
                  },

                  {
                    $set: {

                      status: "completed",

                      winnerId: null,

                      result: "draw",

                      drawOfferBy: null,

                      pot,

                      updatedAt:
                        new Date(),

                      settledAt:
                        new Date()

                    }
                  },

                  {
                    session
                  }
                );


            /*
            Protect against simultaneous
            settlement attempts.
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
            UPDATE WHITE
            ==========================================
            */

            const whiteOldRating =
              whiteUser.chessRating || 1200;


            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: game.whiteId
                },

                {
                  $inc: {

                    balance: payout,

                    gamesPlayed: 1,

                    totalWon: payout,

                    chessRating:
                      ratings.whiteRating -
                      whiteOldRating

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
            UPDATE BLACK
            ==========================================
            */

            const blackOldRating =
              blackUser.chessRating || 1200;


            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: game.blackId
                },

                {
                  $inc: {

                    balance: payout,

                    gamesPlayed: 1,

                    totalWon: payout,

                    chessRating:
                      ratings.blackRating -
                      blackOldRating

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

              action: "accept",

              result: "draw",

              winner: null,

              winnerId: null,

              pot,

              payout,

              ratings: {

                whiteRating:
                  ratings.whiteRating,

                blackRating:
                  ratings.blackRating

              }

            };

          }

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
        "DRAW_OFFER_EXISTS"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "A draw offer is already pending."
        });
      }


      if (
        error.message ===
        "NO_DRAW_OFFER"
      ) {
        return res.status(409).json({
          success: false,
          error:
            "There is no pending draw offer."
        });
      }


      if (
        error.message ===
        "OWN_DRAW_OFFER"
      ) {
        return res.status(400).json({
          success: false,
          error:
            "You cannot accept or decline your own draw offer."
        });
      }


      if (
        error.message ===
        "NOT_DRAW_OFFER_OWNER"
      ) {
        return res.status(403).json({
          success: false,
          error:
            "Only the player who made the draw offer can cancel it."
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
      "CHESS DRAW ERROR:",
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
