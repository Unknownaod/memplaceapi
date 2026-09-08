import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../../lib/mongodb.js";


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


function dealerShouldDraw(hand) {

  const total =
    handValue(hand);

  /*
    Dealer stands on all 17s,
    including soft 17.
  */

  return total < 17;
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


    const gameId =
      body?.gameId;


    const action =
      String(body?.action || "")
        .toLowerCase();


    if (
      typeof gameId !== "string" ||
      !gameId
    ) {

      return res.status(400).json({
        success: false,
        error: "gameId is required"
      });

    }


    if (
      action !== "hit" &&
      action !== "stand"
    ) {

      return res.status(400).json({
        success: false,
        error: "Action must be hit or stand"
      });

    }


    const db =
      await getDb();


    const client =
      getMongoClient();


    const session =
      client.startSession();


    try {

      let response;


      await session.withTransaction(
        async () => {

          const game =
            await db
              .collection("blackjack_games")
              .findOne(
                {
                  _id: gameId,
                  userId: user._id
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


          if (
            game.status !== "active"
          ) {

            throw new Error(
              "GAME_SETTLED"
            );

          }


          const playerCards =
            [...game.playerCards];


          const dealerCards =
            [...game.dealerCards];


          const deck =
            [...game.deck];


          let result = null;
          let payout = 0;
          let status = "active";


          /*
            ========================================
            HIT
            ========================================
          */

          if (action === "hit") {

            const card =
              deck.pop();


            if (!card) {

              throw new Error(
                "DECK_EMPTY"
              );

            }


            playerCards.push(card);


            const playerTotal =
              handValue(playerCards);


            /*
              Player busts
            */

            if (
              playerTotal > 21
            ) {

              result = "loss";
              payout = 0;
              status = "settled";

            }


            /*
              21 automatically stands.
            */

            else if (
              playerTotal === 21
            ) {

              while (
                dealerShouldDraw(
                  dealerCards
                )
              ) {

                const dealerCard =
                  deck.pop();


                if (!dealerCard) {
                  break;
                }


                dealerCards.push(
                  dealerCard
                );

              }


              const dealerTotal =
                handValue(dealerCards);


              if (
                dealerTotal > 21
              ) {

                result = "win";
                payout =
                  game.wager * 2;

              } else if (
                playerTotal >
                dealerTotal
              ) {

                result = "win";
                payout =
                  game.wager * 2;

              } else if (
                playerTotal ===
                dealerTotal
              ) {

                result = "push";
                payout =
                  game.wager;

              } else {

                result = "loss";
                payout = 0;

              }


              status = "settled";

            }

          }


          /*
            ========================================
            STAND
            ========================================
          */

          else if (
            action === "stand"
          ) {

            while (
              dealerShouldDraw(
                dealerCards
              )
            ) {

              const dealerCard =
                deck.pop();


              if (!dealerCard) {
                break;
              }


              dealerCards.push(
                dealerCard
              );

            }


            const playerTotal =
              handValue(playerCards);


            const dealerTotal =
              handValue(dealerCards);


            if (
              dealerTotal > 21
            ) {

              result = "win";
              payout =
                game.wager * 2;

            } else if (
              playerTotal >
              dealerTotal
            ) {

              result = "win";
              payout =
                game.wager * 2;

            } else if (
              playerTotal ===
              dealerTotal
            ) {

              result = "push";
              payout =
                game.wager;

            } else {

              result = "loss";
              payout = 0;

            }


            status = "settled";

          }


          const now =
            new Date();


          /*
            ========================================
            UPDATE ACCOUNT
            ========================================
          */

          if (
            status === "settled"
          ) {

            const accountUpdate = {};


            if (payout > 0) {

              accountUpdate.$inc = {
                balance: payout,
                totalWon: payout
              };


              if (
                result === "win"
              ) {

                accountUpdate.$inc.gamesWon =
                  1;

              }

            } else {

              accountUpdate.$inc = {};

            }


            if (
              result === "loss"
            ) {

              accountUpdate.$inc.gamesLost =
                1;

            }


            accountUpdate.$set = {
              updatedAt: now
            };


            const updatedAccount =
              await db
                .collection("minigame_users")
                .findOneAndUpdate(
                  {
                    _id: user._id
                  },
                  accountUpdate,
                  {
                    session,
                    returnDocument: "after"
                  }
                );


            if (!updatedAccount) {

              throw new Error(
                "ACCOUNT_NOT_FOUND"
              );

            }


            response = {
              balance:
                updatedAccount.balance
            };

          } else {

            const account =
              await db
                .collection("minigame_users")
                .findOne(
                  {
                    _id: user._id
                  },
                  {
                    session
                  }
                );


            response = {
              balance:
                account?.balance ?? 0
            };

          }


          /*
            ========================================
            UPDATE GAME
            ========================================
          */

          await db
            .collection("blackjack_games")
            .updateOne(
              {
                _id: gameId,
                userId: user._id,
                status: "active"
              },
              {
                $set: {
                  playerCards,
                  dealerCards,
                  deck,
                  status,
                  result,
                  payout,
                  updatedAt: now,
                  ...(status === "settled"
                    ? {
                        settledAt: now
                      }
                    : {})
                }
              },
              {
                session
              }
            );


          response = {

            ...response,

            gameId,

            status,

            result,

            payout,

            player: {

              cards:
                playerCards,

              total:
                handValue(
                  playerCards
                )

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
                  : handValue(
                      dealerCards
                    )

            }

          };

        }
      );


      return res.status(200).json({
        success: true,
        ...response
      });


    } finally {

      await session.endSession();

    }


  } catch (error) {

    if (
      error.message ===
      "GAME_NOT_FOUND"
    ) {

      return res.status(404).json({
        success: false,
        error: "Game not found"
      });

    }


    if (
      error.message ===
      "GAME_SETTLED"
    ) {

      return res.status(409).json({
        success: false,
        error: "This game has already ended"
      });

    }


    if (
      error.message ===
      "DECK_EMPTY"
    ) {

      return res.status(500).json({
        success: false,
        error: "Game deck is empty"
      });

    }


    console.error(
      "BLACKJACK ACTION ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }

}
