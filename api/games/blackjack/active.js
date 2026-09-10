import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";


/*
==========================================
GET ACTIVE BLACKJACK GAME
==========================================

GET /api/games/blackjack/active

Returns the currently active Blackjack
game belonging to the authenticated user.

If there is no active game:

{
  success: true,
  active: false,
  game: null
}

If there is an active game:

{
  success: true,
  active: true,
  game: {
    gameId,
    wager,
    status,
    player: {
      cards,
      total
    },
    dealer: {
      cards,
      total
    },
    createdAt,
    updatedAt
  }
}
*/


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

  while (
    total > 21 &&
    aces > 0
  ) {

    total -= 10;
    aces--;

  }

  return total;
}


export default async function handler(req, res) {

  /*
  ==========================================
  CORS
  ==========================================
  */

  if (setCors(req, res)) {
    return;
  }


  /*
  ==========================================
  METHOD
  ==========================================
  */

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
    DATABASE
    ==========================================
    */

    const db =
      await getDb();


    /*
    ==========================================
    FIND ACTIVE GAME
    ==========================================
    */

    const game =
      await db
        .collection("blackjack_games")
        .findOne({
          userId: user._id,
          status: "active"
        });


    /*
    ==========================================
    NO ACTIVE GAME
    ==========================================
    */

    if (!game) {

      return res.status(200).json({

        success: true,

        active: false,

        game: null

      });

    }


    /*
    ==========================================
    CALCULATE TOTALS
    ==========================================
    */

    const playerTotal =
      handValue(
        game.playerCards || []
      );


    /*
    ==========================================
    HIDE DEALER SECOND CARD
    ==========================================
    */

    const dealerCards =
      game.dealerCards || [];


    const hiddenDealerCards = [];


    if (dealerCards.length > 0) {

      hiddenDealerCards.push(
        dealerCards[0]
      );

    }


    if (dealerCards.length > 1) {

      hiddenDealerCards.push({
        hidden: true
      });

    }


    /*
    ==========================================
    RETURN ACTIVE GAME
    ==========================================
    */

    return res.status(200).json({

      success: true,

      active: true,

      game: {

        gameId:
          game._id,

        gameType:
          "blackjack",

        wager:
          game.wager,

        status:
          game.status,

        player: {

          cards:
            game.playerCards || [],

          total:
            playerTotal

        },

        dealer: {

          cards:
            hiddenDealerCards,

          total:
            null

        },

        createdAt:
          game.createdAt,

        updatedAt:
          game.updatedAt

      }

    });


  } catch (error) {

    console.error(
      "BLACKJACK ACTIVE ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        "Internal server error"

    });

  }

}
