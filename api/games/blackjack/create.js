import crypto from "crypto";

import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";


function createDeck() {

  const suits = [
    "hearts",
    "diamonds",
    "clubs",
    "spades"
  ];

  const ranks = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A"
  ];

  const deck = [];

  for (const suit of suits) {

    for (const rank of ranks) {

      deck.push({
        suit,
        rank
      });

    }

  }

  return deck;
}


function shuffle(deck) {

  for (let i = deck.length - 1; i > 0; i--) {

    const j =
      crypto.randomInt(0, i + 1);

    [
      deck[i],
      deck[j]
    ] = [
      deck[j],
      deck[i]
    ];

  }

  return deck;
}


function cardValue(card) {

  if (
    ["J", "Q", "K"].includes(card.rank)
  ) {
    return 10;
  }

  if (card.rank === "A") {
    return 11;
  }

  return Number(card.rank);
}


function handValue(hand) {

  let total = 0;
  let aces = 0;

  for (const card of hand) {

    total += cardValue(card);

    if (card.rank === "A") {
      aces++;
    }

  }

  while (total > 21 && aces > 0) {

    total -= 10;
    aces--;

  }

  return total;
}


function isBlackjack(hand) {

  return (
    hand.length === 2 &&
    handValue(hand) === 21
  );

}


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

    /* ==========================================
       AUTH
    ========================================== */

    const user =
      await getAuthenticatedUser(req);


    if (!user) {

      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });

    }


    /* ==========================================
       BODY
    ========================================== */

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


    const amount =
      Number(body?.amount);


    if (
      !Number.isInteger(amount) ||
      amount <= 0
    ) {

      return res.status(400).json({
        success: false,
        error: "Wager amount must be a positive whole number"
      });

    }


    /* ==========================================
       WAGER LIMIT
    ========================================== */

    const MIN_WAGER = 10;
    const MAX_WAGER = 10000;


    if (amount < MIN_WAGER) {

      return res.status(400).json({
        success: false,
        error: `Minimum wager is ${MIN_WAGER}`
      });

    }


    if (amount > MAX_WAGER) {

      return res.status(400).json({
        success: false,
        error: `Maximum wager is ${MAX_WAGER}`
      });

    }


    const db =
      await getDb();


    /* ==========================================
       PREVENT MULTIPLE ACTIVE BLACKJACK GAMES
    ========================================== */

    const existing =
      await db.collection("blackjack_games").findOne({
        userId: user._id,
        status: "active"
      });


    if (existing) {

      return res.status(409).json({
        success: false,
        error: "You already have an active Blackjack game",
        gameId: existing._id
      });

    }


    /* ==========================================
       CREATE DECK
    ========================================== */

    const deck =
      shuffle(createDeck());


    /* ==========================================
       DEAL INITIAL CARDS
    ========================================== */

    const playerCards = [
      deck.pop(),
      deck.pop()
    ];

    const dealerCards = [
      deck.pop(),
      deck.pop()
    ];


    const playerTotal =
      handValue(playerCards);


    const dealerTotal =
      handValue(dealerCards);


    const gameId =
      crypto.randomBytes(24).toString("hex");


    const now =
      new Date();


    /* ==========================================
       DETERMINE INITIAL RESULT
    ========================================== */

    let status = "active";
    let result = null;
    let payout = 0;


    const playerBlackjack =
      isBlackjack(playerCards);


    const dealerBlackjack =
      isBlackjack(dealerCards);


    if (
      playerBlackjack ||
      dealerBlackjack
    ) {

      status = "settled";


      if (
        playerBlackjack &&
        dealerBlackjack
      ) {

        result = "push";
        payout = amount;

      } else if (playerBlackjack) {

        result = "blackjack";

        // 3:2 payout + original wager
        payout =
          amount +
          Math.floor(amount * 1.5);

      } else {

        result = "loss";
        payout = 0;

      }

    }


    /* ==========================================
       DEDUCT WAGER
    ========================================== */

    const account =
      await db
        .collection("minigame_users")
        .findOneAndUpdate(

          {
            _id: user._id,
            balance: {
              $gte: amount
            }
          },

          {
            $inc: {
              balance: -amount,
              totalWagered: amount,
              gamesPlayed: 1
            },

            $set: {
              updatedAt: now
            }

          },

          {
            returnDocument: "after"
          }

        );


    if (!account) {

      return res.status(400).json({
        success: false,
        error: "Insufficient balance"
      });

    }


    /* ==========================================
       PAY IMMEDIATE RESULT
    ========================================== */

    if (payout > 0) {

      await db
        .collection("minigame_users")
        .updateOne(

          {
            _id: user._id
          },

          {
            $inc: {
              balance: payout,
              totalWon: payout,
              ...(result === "blackjack"
                ? { gamesWon: 1 }
                : {})
            },

            $set: {
              updatedAt: now
            }

          }

        );

    } else if (result === "loss") {

      await db
        .collection("minigame_users")
        .updateOne(

          {
            _id: user._id
          },

          {
            $inc: {
              gamesLost: 1
            },

            $set: {
              updatedAt: now
            }

          }

        );

    }


    /* ==========================================
       STORE GAME
       
       The deck stays server-side.
    ========================================== */

    await db.collection("blackjack_games").insertOne({

      _id: gameId,

      userId:
        user._id,

      wager:
        amount,

      deck,

      playerCards,

      dealerCards,

      status,

      result,

      payout,

      createdAt:
        now,

      updatedAt:
        now,

      ...(status === "settled"
        ? { settledAt: now }
        : {})

    });


    /* ==========================================
       RESPONSE
    ========================================== */

    return res.status(200).json({

      success: true,

      gameId,

      game: "blackjack",

      wager:
        amount,

      status,

      result,

      payout,

      player: {

        cards:
          playerCards,

        total:
          playerTotal

      },

      dealer: {

        cards: status === "active"
          ? [
              dealerCards[0],
              {
                hidden: true
              }
            ]
          : dealerCards,

        total: status === "active"
          ? null
          : dealerTotal

      },

      balance:
        account.balance +
        payout

    });


  } catch (error) {

    console.error(
      "BLACKJACK CREATE ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
