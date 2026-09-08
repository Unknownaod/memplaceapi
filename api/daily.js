import { setCors } from "../lib/cors.js";
import { getAuthenticatedUser } from "../lib/auth.js";
import {
  getDb,
  getMongoClient
} from "../lib/mongodb.js";

const DAILY_REWARD = 250;

const DAY_MS =
  24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (setCors(req, res)) {
    return;
  }

  const user =
    await getAuthenticatedUser(req);

  if (!user) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: "Authentication required."
    });
  }

  const db = await getDb();

  /* ==========================================
     GET DAILY STATUS
  ========================================== */

  if (req.method === "GET") {

    try {

      const daily =
        await db
          .collection("daily_rewards")
          .findOne({
            _id: user._id
          });

      const now =
        Date.now();

      const lastClaim =
        daily?.lastClaimAt
          ? new Date(
              daily.lastClaimAt
            ).getTime()
          : 0;

      const elapsed =
        lastClaim
          ? now - lastClaim
          : DAY_MS;

      const canClaim =
        elapsed >= DAY_MS;

      const cooldown =
        canClaim
          ? 0
          : DAY_MS - elapsed;

      return res.status(200).json({
        success: true,
        canClaim,
        cooldown,
        reward: DAILY_REWARD,
        streak:
          Number(
            daily?.streak || 0
          ),
        lastClaimAt:
          daily?.lastClaimAt || null
      });

    } catch (error) {

      console.error(
        "DAILY STATUS ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error: "Internal server error"
      });
    }
  }


  /* ==========================================
     CLAIM DAILY REWARD
  ========================================== */

  if (req.method === "POST") {

    let session = null;

    try {

      const client =
        getMongoClient();

      session =
        client.startSession();

      let newBalance = 0;
      let newStreak = 1;
      let claimedAt = null;

      await session.withTransaction(
        async () => {

          const now =
            new Date();

          const dailyCollection =
            db.collection(
              "daily_rewards"
            );

          const userCollection =
            db.collection(
              "minigame_users"
            );

          const existing =
            await dailyCollection.findOne(
              {
                _id: user._id
              },
              {
                session
              }
            );

          if (existing?.lastClaimAt) {

            const lastClaim =
              new Date(
                existing.lastClaimAt
              ).getTime();

            const elapsed =
              now.getTime() -
              lastClaim;

            if (
              elapsed <
              DAY_MS
            ) {

              throw new Error(
                "DAILY_COOLDOWN"
              );
            }

            /*
              Continue the streak if they claimed
              within 48 hours.

              Otherwise the streak resets.
            */

            if (
              elapsed <=
              DAY_MS * 2
            ) {
              newStreak =
                Number(
                  existing.streak || 0
                ) + 1;
            } else {
              newStreak = 1;
            }

          } else {

            newStreak = 1;

          }


          const updatedUser =
            await userCollection
              .findOneAndUpdate(
                {
                  _id: user._id
                },
                {
                  $inc: {
                    balance:
                      DAILY_REWARD
                  },
                  $set: {
                    updatedAt: now
                  }
                },
                {
                  session,
                  returnDocument:
                    "after"
                }
              );

          if (!updatedUser) {

            throw new Error(
              "MINIGAME_USER_NOT_FOUND"
            );
          }


          await dailyCollection
            .updateOne(
              {
                _id: user._id
              },
              {
                $set: {
                  lastClaimAt: now,
                  streak: newStreak,
                  updatedAt: now
                },
                $setOnInsert: {
                  userId: user._id,
                  createdAt: now
                }
              },
              {
                upsert: true,
                session
              }
            );


          await db
            .collection(
              "daily_transactions"
            )
            .insertOne(
              {
                userId: user._id,
                amount: DAILY_REWARD,
                streak: newStreak,
                claimedAt: now
              },
              {
                session
              }
            );


          newBalance =
            Number(
              updatedUser.balance || 0
            );

          claimedAt =
            now;
        }
      );


      return res.status(200).json({
        success: true,
        message:
          "Daily reward claimed.",
        reward:
          DAILY_REWARD,
        streak:
          newStreak,
        balance:
          newBalance,
        claimedAt
      });

    } catch (error) {

      if (
        error.message ===
        "DAILY_COOLDOWN"
      ) {

        return res.status(429).json({
          success: false,
          error:
            "Your daily reward is still on cooldown."
        });
      }

      if (
        error.message ===
        "MINIGAME_USER_NOT_FOUND"
      ) {

        return res.status(404).json({
          success: false,
          error:
            "Minigame user account not found."
        });
      }

      console.error(
        "DAILY CLAIM ERROR:",
        error
      );

      return res.status(500).json({
        success: false,
        error: "Internal server error"
      });

    } finally {

      if (session) {
        await session.endSession();
      }

    }
  }


  return res.status(405).json({
    success: false,
    error: "Method not allowed"
  });
}
