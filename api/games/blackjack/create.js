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


    const deck =
      shuffle(createDeck());


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


    const playerBlackjack =
      isBlackjack(playerCards);


    const dealerBlackjack =
      isBlackjack(dealerCards);


    const gameId =
      crypto.randomBytes(24).toString("hex");


    const now =
      new Date();


    let status = "active";
    let result = null;
    let payout = 0;


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

        payout =
          amount +
          Math.floor(amount * 1.5);

      } else {

        result = "loss";
        payout = 0;

      }

    }


    const session =
      db.client?.startSession?.();


    /*
      getDb() currently returns the DB object, so use
      the underlying MongoClient only if exposed.

      If your current mongodb.js does not expose the client,
      use the atomic version below instead.
    */

    if (!session) {

      return res.status(500).json({
        success: false,
        error: "Database transaction is not available"
      });

    }


    try {

      let finalBalance = 0;


      await session.withTransaction(
        async () => {

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
                  session,
                  returnDocument: "after"
                }
              );


          if (!account) {

            throw new Error(
              "INSUFFICIENT_BALANCE"
            );

          }


          finalBalance =
            account.balance;


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
                },
                {
                  session
                }
              );


            finalBalance += payout;

          }


          if (result === "loss") {

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
                },
                {
                  session
                }
              );

          }


          await db
            .collection("blackjack_games")
            .insertOne(
              {
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
                  ? {
                      settledAt: now
                    }
                  : {})
              },
              {
                session
              }
            );

        }
      );


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

          cards:
            status === "active"
              ? [
                  dealerCards[0],
                  {
                    hidden: true
                  }
                ]
              : dealerCards,

          total:
            status === "active"
              ? null
              : dealerTotal

        },

        balance:
          finalBalance

      });


    } finally {

      await session.endSession();

    }


  } catch (error) {

    if (
      error.message ===
      "INSUFFICIENT_BALANCE"
    ) {

      return res.status(400).json({
        success: false,
        error: "Insufficient balance"
      });

    }


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
