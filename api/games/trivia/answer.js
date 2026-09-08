import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../../../lib/mongodb.js";


/* ==========================================
   REWARD CALCULATION
========================================== */

function getReward(
  streak
) {

  if (streak >= 4) {
    return 75;
  }

  if (streak === 3) {
    return 50;
  }

  if (streak === 2) {
    return 35;
  }

  return 25;
}


/* ==========================================
   HANDLER
========================================== */

export default async function handler(
  req,
  res
) {

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


    const roundId =
      body?.roundId;

    const answer =
      body?.answer;


    if (
      typeof roundId !== "string" ||
      !roundId
    ) {

      return res.status(400).json({
        success: false,
        error: "roundId is required"
      });

    }


    if (
      !Number.isInteger(answer) ||
      answer < 0 ||
      answer > 3
    ) {

      return res.status(400).json({
        success: false,
        error: "Invalid answer"
      });

    }


    const db =
      await getDb();

    const client =
      getMongoClient();

    const session =
      client.startSession();


    try {

      let responseData;


      await session.withTransaction(
        async () => {

          const game =
            await db
              .collection("trivia_games")
              .findOne(
                {
                  _id: roundId,
                  userId: user._id
                },
                {
                  session
                }
              );


          if (!game) {

            throw new Error(
              "ROUND_NOT_FOUND"
            );

          }


          /*
            Prevent answering the same
            question twice.
          */

          if (
            game.status !==
            "active"
          ) {

            throw new Error(
              "ROUND_ALREADY_COMPLETED"
            );

          }


          const now =
            new Date();


          /*
            Check the server-side
            expiration time.
          */

          if (
            game.expiresAt &&
            new Date(
              game.expiresAt
            ) <= now
          ) {

            await db
              .collection("trivia_games")
              .updateOne(
                {
                  _id: roundId,
                  userId: user._id,
                  status: "active"
                },
                {
                  $set: {
                    status: "expired",
                    result: "timeout",
                    reward: 0,
                    answeredAt: now
                  }
                },
                {
                  session
                }
              );


            /*
              Reset streak after timeout.
            */

            await db
              .collection("minigame_users")
              .updateOne(
                {
                  _id: user._id
                },
                {
                  $set: {
                    triviaStreak: 0,
                    updatedAt: now
                  },
                  $inc: {
                    gamesPlayed: 1,
                    gamesLost: 1
                  }
                },
                {
                  session
                }
              );


            responseData = {
              success: true,
              result: "timeout",
              correct: false,
              reward: 0,
              streak: 0
            };

            return;
          }


          const correct =
            answer ===
            game.correctAnswer;


          /*
            CORRECT ANSWER
          */

          if (correct) {

            const currentStreak =
              Number(
                game.streak || 0
              );

            const newStreak =
              currentStreak + 1;

            const reward =
              getReward(
                newStreak
              );


            const account =
              await db
                .collection("minigame_users")
                .findOneAndUpdate(
                  {
                    _id: user._id
                  },
                  {
                    $inc: {
                      balance:
                        reward,

                      gamesPlayed:
                        1,

                      gamesWon:
                        1,

                      totalWon:
                        reward
                    },

                    $set: {
                      triviaStreak:
                        newStreak,

                      updatedAt:
                        now
                    }
                  },
                  {
                    session,
                    returnDocument:
                      "after"
                  }
                );


            if (!account) {

              throw new Error(
                "ACCOUNT_NOT_FOUND"
              );

            }


            await db
              .collection("trivia_games")
              .updateOne(
                {
                  _id: roundId,
                  userId: user._id,
                  status: "active"
                },
                {
                  $set: {
                    status: "settled",
                    result: "correct",
                    reward,
                    answeredAt: now
                  }
                },
                {
                  session
                }
              );


            responseData = {

              success: true,

              result:
                "correct",

              correct:
                true,

              reward,

              streak:
                newStreak,

              balance:
                account.balance
            };


            return;
          }


          /*
            WRONG ANSWER
          */

          await db
            .collection("minigame_users")
            .updateOne(
              {
                _id: user._id
              },
              {
                $inc: {
                  gamesPlayed: 1,
                  gamesLost: 1
                },

                $set: {
                  triviaStreak: 0,
                  updatedAt: now
                }
              },
              {
                session
              }
            );


          await db
            .collection("trivia_games")
            .updateOne(
              {
                _id: roundId,
                userId: user._id,
                status: "active"
              },
              {
                $set: {
                  status: "settled",
                  result: "incorrect",
                  reward: 0,
                  answeredAt: now
                }
              },
              {
                session
              }
            );


          const updatedAccount =
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


          responseData = {

            success: true,

            result:
              "incorrect",

            correct:
              false,

            reward:
              0,

            streak:
              0,

            balance:
              updatedAccount?.balance ??
              0
          };

        }
      );


      return res.status(200).json(
        responseData
      );


    } finally {

      await session.endSession();

    }


  } catch (error) {

    if (
      error.message ===
      "ROUND_NOT_FOUND"
    ) {

      return res.status(404).json({
        success: false,
        error: "Trivia round not found"
      });

    }


    if (
      error.message ===
      "ROUND_ALREADY_COMPLETED"
    ) {

      return res.status(409).json({
        success: false,
        error:
          "This trivia round has already been completed"
      });

    }


    if (
      error.message ===
      "ACCOUNT_NOT_FOUND"
    ) {

      return res.status(500).json({
        success: false,
        error:
          "User account not found"
      });

    }


    console.error(
      "TRIVIA ANSWER ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }
}
