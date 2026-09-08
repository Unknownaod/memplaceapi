import { setCors } from "../../lib/cors.js";
import {
  getStaffMember,
  getRoleLevel
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";
import { createAuditLog } from "../../lib/audit.js";


/* ==========================================
   MAIN HANDLER
========================================== */

export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }


  try {

    /* ========================================
       STAFF AUTH
    ======================================== */

    const staff =
      await getStaffMember(req);


    if (!staff) {

      return res.status(403).json({
        success: false,
        error: "Staff access required."
      });
    }


    /* ========================================
       ECONOMY PERMISSION
    ======================================== */

    const hasEconomyPermission =
      staff.role === "owner" ||
      (
        Array.isArray(staff.permissions) &&
        staff.permissions.includes("economy")
      );


    if (!hasEconomyPermission) {

      return res.status(403).json({
        success: false,
        error:
          "You do not have permission to access the economy."
      });
    }


    const db =
      await getDb();


    const minigameUsers =
      db.collection("minigame_users");


    const users =
      db.collection("users");


    const auditLogs =
      db.collection("staff_audit_logs");


    /* ========================================
       GET ECONOMY
    ======================================== */

    if (req.method === "GET") {

      /* --------------------------------------
         GLOBAL ECONOMY STATS
      -------------------------------------- */

      const statsResult =
        await minigameUsers.aggregate([
          {
            $group: {
              _id: null,

              totalUsers: {
                $sum: 1
              },

              totalBalance: {
                $sum: {
                  $ifNull: [
                    "$balance",
                    0
                  ]
                }
              },

              totalWagered: {
                $sum: {
                  $ifNull: [
                    "$totalWagered",
                    0
                  ]
                }
              },

              totalWon: {
                $sum: {
                  $ifNull: [
                    "$totalWon",
                    0
                  ]
                }
              },

              totalLost: {
                $sum: {
                  $ifNull: [
                    "$totalLost",
                    0
                  ]
                }
              },

              totalGamesPlayed: {
                $sum: {
                  $ifNull: [
                    "$gamesPlayed",
                    0
                  ]
                }
              },

              averageBalance: {
                $avg: {
                  $ifNull: [
                    "$balance",
                    0
                  ]
                }
              },

              largestBalance: {
                $max: {
                  $ifNull: [
                    "$balance",
                    0
                  ]
                }
              },

              smallestBalance: {
                $min: {
                  $ifNull: [
                    "$balance",
                    0
                  ]
                }
              }
            }
          }
        ])
        .toArray();


      const stats =
        statsResult[0] || {
          totalUsers: 0,
          totalBalance: 0,
          totalWagered: 0,
          totalWon: 0,
          totalLost: 0,
          totalGamesPlayed: 0,
          averageBalance: 0,
          largestBalance: 0,
          smallestBalance: 0
        };


      /* --------------------------------------
         USERS WITH POSITIVE BALANCE
      -------------------------------------- */

      const fundedUsers =
        await minigameUsers.countDocuments({
          balance: {
            $gt: 0
          }
        });


      /* --------------------------------------
         ZERO BALANCE USERS
      -------------------------------------- */

      const zeroBalanceUsers =
        await minigameUsers.countDocuments({
          balance: 0
        });


      /* --------------------------------------
         NEGATIVE BALANCE USERS
         
         Should normally be zero.
      -------------------------------------- */

      const negativeBalanceUsers =
        await minigameUsers.countDocuments({
          balance: {
            $lt: 0
          }
        });


      /* --------------------------------------
         RECENT BALANCE ADJUSTMENTS
      -------------------------------------- */

      const recentAdjustments =
        await auditLogs
          .find({
            action:
              "user_balance_adjusted"
          })
          .sort({
            createdAt: -1
          })
          .limit(25)
          .toArray();


      const adjustmentUserIds =
        recentAdjustments
          .map(log => log.targetId)
          .filter(Boolean);


      const adjustmentUsers =
        adjustmentUserIds.length
          ? await users
              .find({
                _id: {
                  $in: adjustmentUserIds
                }
              })
              .project({
                _id: 1,
                username: 1,
                discordUsername: 1,
                avatar: 1
              })
              .toArray()
          : [];


      const adjustmentUserMap =
        new Map(
          adjustmentUsers.map(user => [
            String(user._id),
            user
          ])
        );


      const adjustments =
        recentAdjustments.map(log => {

          const targetUser =
            adjustmentUserMap.get(
              String(log.targetId)
            ) || null;


          return {

            id:
              String(log._id),

            createdAt:
              log.createdAt || null,

            staffId:
              log.staffId || null,

            staffUsername:
              log.staffUsername || null,

            staffRole:
              log.staffRole || null,

            targetId:
              log.targetId || null,

            targetUsername:
              targetUser?.username ||
              log.details?.username ||
              null,

            targetDiscordUsername:
              targetUser?.discordUsername ||
              log.details?.discordUsername ||
              null,

            amount:
              Number(
                log.details?.amount || 0
              ),

            oldBalance:
              Number(
                log.details?.oldBalance || 0
              ),

            newBalance:
              Number(
                log.details?.newBalance || 0
              ),

            reason:
              log.details?.reason ||
              "No reason provided."
          };
        });


      /* --------------------------------------
         RESPONSE
      -------------------------------------- */

      return res.status(200).json({

        success: true,

        economy: {

          totalUsers:
            Number(
              stats.totalUsers || 0
            ),

          fundedUsers,

          zeroBalanceUsers,

          negativeBalanceUsers,

          totalBalance:
            Number(
              stats.totalBalance || 0
            ),

          totalWagered:
            Number(
              stats.totalWagered || 0
            ),

          totalWon:
            Number(
              stats.totalWon || 0
            ),

          totalLost:
            Number(
              stats.totalLost || 0
            ),

          totalGamesPlayed:
            Number(
              stats.totalGamesPlayed || 0
            ),

          averageBalance:
            Number(
              stats.averageBalance || 0
            ),

          largestBalance:
            Number(
              stats.largestBalance || 0
            ),

          smallestBalance:
            Number(
              stats.smallestBalance || 0
            ),

          recentAdjustments:
            adjustments
        }
      });
    }


    /* ========================================
       PATCH
       
       Direct balance adjustment.
    ======================================== */

    if (req.method === "PATCH") {

      /* --------------------------------------
         MANAGER / OWNER ONLY
      -------------------------------------- */

      if (
        getRoleLevel(staff.role) <
        getRoleLevel("manager")
      ) {

        return res.status(403).json({
          success: false,
          error:
            "Only managers and owners can adjust balances."
        });
      }


      const body =
        req.body || {};


      const discordId =
        typeof body.discordId === "string"
          ? body.discordId.trim()
          : "";


      const reason =
        typeof body.reason === "string"
          ? body.reason.trim()
          : "";


      const amount =
        Number(body.amount);


      /* --------------------------------------
         VALIDATE ID
      -------------------------------------- */

      if (!discordId) {

        return res.status(400).json({
          success: false,
          error:
            "Discord user ID is required."
        });
      }


      if (
        !/^\d{17,20}$/.test(
          discordId
        )
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Invalid Discord user ID."
        });
      }


      /* --------------------------------------
         VALIDATE AMOUNT
      -------------------------------------- */

      if (
        !Number.isFinite(amount) ||
        amount === 0
      ) {

        return res.status(400).json({
          success: false,
          error:
            "A valid non-zero amount is required."
        });
      }


      if (
        !Number.isSafeInteger(amount)
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Amount must be a whole number."
        });
      }


      if (
        Math.abs(amount) >
        1000000000
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Adjustment amount is too large."
        });
      }


      /* --------------------------------------
         REASON
      -------------------------------------- */

      if (!reason) {

        return res.status(400).json({
          success: false,
          error:
            "A reason is required."
        });
      }


      if (reason.length > 500) {

        return res.status(400).json({
          success: false,
          error:
            "Reason cannot exceed 500 characters."
        });
      }


      /* --------------------------------------
         FIND USER
      -------------------------------------- */

      const user =
        await users.findOne({
          _id: discordId
        });


      if (!user) {

        return res.status(404).json({
          success: false,
          error:
            "User not found."
        });
      }


      /* --------------------------------------
         FIND MINIGAME ACCOUNT
      -------------------------------------- */

      const minigameUser =
        await minigameUsers.findOne({
          _id: discordId
        });


      if (!minigameUser) {

        return res.status(404).json({
          success: false,
          error:
            "That user does not have a minigame account."
        });
      }


      const oldBalance =
        Number(
          minigameUser.balance || 0
        );


      const newBalance =
        oldBalance + amount;


      /* --------------------------------------
         PREVENT NEGATIVE BALANCE
      -------------------------------------- */

      if (newBalance < 0) {

        return res.status(400).json({
          success: false,
          error:
            "This adjustment would make the balance negative."
        });
      }


      /* --------------------------------------
         ATOMIC UPDATE
      -------------------------------------- */

      const now =
        new Date();


      const result =
        await minigameUsers.updateOne(

          {
            _id: discordId,

            balance:
              oldBalance
          },

          {
            $set: {

              balance:
                newBalance,

              updatedAt:
                now
            }
          }

        );


      if (
        result.modifiedCount !== 1
      ) {

        return res.status(409).json({
          success: false,
          error:
            "The user's balance changed before the adjustment could be applied. Please try again."
        });
      }


      /* --------------------------------------
         AUDIT LOG
      -------------------------------------- */

      await createAuditLog({

        staff,

        action:
          "user_balance_adjusted",

        targetType:
          "user",

        targetId:
          discordId,

        details: {

          username:
            user.username ||
            null,

          discordUsername:
            user.discordUsername ||
            null,

          amount,

          oldBalance,

          newBalance,

          reason

        }
      });


      /* --------------------------------------
         RESPONSE
      -------------------------------------- */

      return res.status(200).json({

        success: true,

        message:
          "Balance updated.",

        adjustment: {

          discordId,

          amount,

          oldBalance,

          newBalance,

          reason,

          updatedAt:
            now

        }

      });
    }


    /* ========================================
       METHOD NOT ALLOWED
    ======================================== */

    return res.status(405).json({
      success: false,
      error:
        "Method not allowed."
    });


  } catch (error) {

    console.error(
      "ADMIN ECONOMY ERROR:",
      error
    );


    if (!res.headersSent) {

      return res.status(500).json({
        success: false,
        error:
          "Internal server error."
      });
    }
  }
}
