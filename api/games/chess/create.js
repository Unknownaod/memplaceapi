import crypto from "crypto";

import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../../lib/mongodb.js";

import {
  createChessGame,
  isValidChessWager,
  MIN_WAGER,
  MAX_WAGER
} from "../../../lib/chess.js";


/*
==========================================
CREATE CHESS GAME
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

    const wager =
      Number(body.wager);


    /*
    ==========================================
    VALIDATE WAGER
    ==========================================
    */

    if (!isValidChessWager(wager)) {
      return res.status(400).json({
        success: false,
        error:
          `Wager must be an integer between ${MIN_WAGER} and ${MAX_WAGER}.`
      });
    }


    /*
    ==========================================
    DATABASE
    ==========================================
    */

    const db = await getDb();
    const mongoClient = getMongoClient();


    /*
    ==========================================
    PREVENT MULTIPLE ACTIVE GAMES
    ==========================================
    */

    const existingGame =
      await db.collection("chess_games").findOne({
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
      });

    if (existingGame) {
      return res.status(409).json({
        success: false,
        error:
          "You already have an active chess game."
      });
    }


    /*
    ==========================================
    CREATE GAME ID
    ==========================================
    */

    const gameId =
      crypto
        .randomBytes(24)
        .toString("hex");


    /*
    ==========================================
    CREATE STARTING BOARD
    ==========================================
    */

    const chess =
      createChessGame();

    const startingFen =
      chess.fen();


    /*
    ==========================================
    GAME DOCUMENT
    ==========================================
    */

    const now = new Date();

    const expiresAt =
      new Date(
        now.getTime() +
        15 * 60 * 1000
      );


    const gameDocument = {

      _id: gameId,

      game: "chess",

      whiteId: user._id,

      blackId: null,

      wager,

      fen: startingFen,

      turn: "w",

      moves: [],

      status: "waiting",

      winnerId: null,

      result: null,

      drawOfferBy: null,

      createdAt: now,

      updatedAt: now,

      expiresAt,

      settledAt: null

    };


    /*
    ==========================================
    TRANSACTION
    ==========================================
    */

    const session =
      mongoClient.startSession();

    try {

      let newBalance = null;

      await session.withTransaction(
        async () => {

          /*
          Deduct the creator's wager.
          */

          const balanceResult =
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
                    totalWagered: wager
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


          newBalance =
            balanceResult.balance;


          /*
          Create the game.
          */

          await db
            .collection("chess_games")
            .insertOne(
              gameDocument,
              {
                session
              }
            );

        }
      );

      /*
      ==========================================
      SUCCESS
      ==========================================
      */

      return res.status(201).json({

        success: true,

        game: "chess",

        gameId,

        status: "waiting",

        color: "white",

        wager,

        balance: newBalance,

        board: {
          fen: startingFen,
          turn: "w"
        },

        expiresAt

      });

    } catch (error) {

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

      throw error;

    } finally {

      await session.endSession();

    }

  } catch (error) {

    console.error(
      "CHESS CREATE ERROR:",
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
