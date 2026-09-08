import { setCors } from "../../lib/cors.js";
import {
  requireStaff
} from "../../lib/staff.js";
import {
  createAuditLog
} from "../../lib/audit.js";
import {
  getDb
} from "../../lib/mongodb.js";


export default async function handler(
  req,
  res
) {

  if (setCors(req, res)) {
    return;
  }


  const staff =
    await requireStaff(
      req,
      res,
      "daily"
    );


  if (!staff) {
    return;
  }


  const db =
    await getDb();


  const minigameUsers =
    db.collection(
      "minigame_users"
    );


  /* ==========================================
     GET
  ========================================== */

  if (req.method === "GET") {

    try {

      const accounts =
        await minigameUsers
          .find(
            {},
            {
              projection: {
                _id: 1,
                balance: 1,
                dailyStreak: 1,
                dailyLastClaim: 1
              }
            }
          )
          .sort({
            dailyLastClaim: -1
          })
          .toArray();


      const userIds =
        accounts.map(
          account =>
            account._id
        );


      const profiles =
        await db
          .collection("users")
          .find(
            {
              _id: {
                $in: userIds
              }
            },
            {
              projection: {
                _id: 1,
                username: 1,
                discordUsername: 1,
                avatar: 1
              }
            }
          )
          .toArray();


      const profileMap =
        new Map(
          profiles.map(
            profile => [
              String(
                profile._id
              ),
              profile
            ]
          )
        );


      let claimedUsers = 0;
      let neverClaimed = 0;
      let activeStreaks = 0;


      const users =
        accounts.map(
          account => {

            const profile =
              profileMap.get(
                String(
                  account._id
                )
              );


            const streak =
              Number(
                account.dailyStreak
              ) || 0;


            if (
              account.dailyLastClaim
            ) {
              claimedUsers++;
            } else {
              neverClaimed++;
            }


            if (
              streak > 0
            ) {
              activeStreaks++;
            }


            return {

              id:
                String(
                  account._id
                ),

              username:
                profile?.username ||
                null,

              discordUsername:
                profile?.discordUsername ||
                null,

              avatar:
                profile?.avatar ||
                null,

              dailyStreak:
                streak,

              dailyLastClaim:
                account.dailyLastClaim ||
                null

            };

          }
        );


      return res.status(200).json({

        success: true,

        baseReward: 250,

        stats: {

          totalUsers:
            accounts.length,

          claimedUsers,

          neverClaimed,

          activeStreaks

        },

        users

      });

    } catch (error) {

      console.error(
        "ADMIN DAILY GET:",
        error
      );


      return res.status(500).json({

        success: false,

        error:
          "Failed to load daily reward data."

      });

    }

  }


  /* ==========================================
     PATCH — RESET USER
  ========================================== */

  if (
    req.method === "PATCH"
  ) {

    if (
      staff.role !== "manager" &&
      staff.role !== "owner"
    ) {

      return res.status(403).json({

        success: false,

        error:
          "Only Managers and Owners can reset daily rewards."

      });

    }


    try {

      const {
        userId
      } = req.body || {};


      if (!userId) {

        return res.status(400).json({

          success: false,

          error:
            "User ID is required."

        });

      }


      const existing =
        await minigameUsers.findOne({

          _id:
            String(userId)

        });


      if (!existing) {

        return res.status(404).json({

          success: false,

          error:
            "Minigame account not found."

        });

      }


      await minigameUsers.updateOne(

        {
          _id:
            String(userId)
        },

        {
          $set: {
            dailyStreak: 0,

            dailyLastClaim: null
          }
        }

      );


      await createAuditLog({

        staff,

        action:
          "daily_reward_reset",

        targetType:
          "user",

        targetId:
          String(userId),

        details: {

          previousStreak:
            Number(
              existing.dailyStreak
            ) || 0,

          previousLastClaim:
            existing.dailyLastClaim ||
            null

        }

      });


      return res.status(200).json({

        success: true

      });

    } catch (error) {

      console.error(
        "ADMIN DAILY PATCH:",
        error
      );


      return res.status(500).json({

        success: false,

        error:
          "Failed to reset daily reward."

      });

    }

  }


  return res.status(405).json({

    success: false,

    error:
      "Method not allowed."

  });

}
