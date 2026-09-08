import { setCors } from "../../lib/cors.js";
import {
  getStaffMember,
  getRoleLevel
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";
import { createAuditLog } from "../../lib/audit.js";

function safeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user._id,

    username:
      user.username ||
      null,

    discordUsername:
      user.discordUsername ||
      null,

    createdAt:
      user.createdAt ||
      user.created_at ||
      null,

    balance:
      typeof user.balance === "number"
        ? user.balance
        : null,

    dailyLastClaim:
      user.dailyLastClaim ||
      user.lastDailyClaim ||
      null,

    dailyStreak:
      typeof user.dailyStreak === "number"
        ? user.dailyStreak
        : (
          typeof user.dailyStreakCount === "number"
            ? user.dailyStreakCount
            : null
        )
  };
}

function canManageEconomy(staff) {
  return (
    staff &&
    getRoleLevel(staff.role) >= 3
  );
}

export default async function handler(req, res) {
  if (setCors(req, res)) {
    return;
  }

  try {
    const staff =
      await getStaffMember(req);

    if (!staff) {
      return res.status(403).json({
        success: false,
        error: "Staff access required."
      });
    }

    /*
     * Users is available to Admin+
     */
    if (
      getRoleLevel(staff.role) < 2
    ) {
      return res.status(403).json({
        success: false,
        error:
          "You do not have permission to access users."
      });
    }

    const db =
      await getDb();

    const users =
      db.collection("users");

    /*
     * ==========================================
     * GET USERS
     * ==========================================
     */

    if (req.method === "GET") {
      const search =
        typeof req.query?.search === "string"
          ? req.query.search.trim()
          : "";

      const limitRaw =
        Number(req.query?.limit);

      const limit =
        Number.isFinite(limitRaw)
          ? Math.min(
              Math.max(
                Math.floor(limitRaw),
                1
              ),
              100
            )
          : 50;

      const query = {};

      if (search) {
        const escaped =
          search.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );

        const regex =
          new RegExp(
            escaped,
            "i"
          );

        query.$or = [
          {
            username: regex
          },
          {
            discordUsername: regex
          }
        ];

        /*
         * Discord IDs are stored as strings.
         */
        if (/^\d{17,20}$/.test(search)) {
          query.$or.push({
            _id: search
          });
        }
      }

      const results =
        await users
          .find(
            query,
            {
              projection: {
                /*
                 * Explicitly exclude sensitive fields.
                 */
                password: 0,
                passwordHash: 0,
                hash: 0,
                token: 0,
                accessToken: 0,
                refreshToken: 0,
                sessionToken: 0
              }
            }
          )
          .sort({
            createdAt: -1,
            _id: 1
          })
          .limit(limit)
          .toArray();

      return res.status(200).json({
        success: true,

        users:
          results.map(
            safeUser
          ),

        count:
          results.length
      });
    }

    /*
     * ==========================================
     * PATCH USER ECONOMY
     * ==========================================
     *
     * Manager + Owner only.
     */

    if (req.method === "PATCH") {
      if (
        !canManageEconomy(staff)
      ) {
        return res.status(403).json({
          success: false,
          error:
            "Only managers and owners can modify user economy."
        });
      }

      const body =
        req.body || {};

      const discordId =
        typeof body.discordId === "string"
          ? body.discordId.trim()
          : "";

      const amount =
        Number(body.amount);

      const reason =
        typeof body.reason === "string"
          ? body.reason.trim()
          : "";

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

      if (
        !Number.isFinite(amount) ||
        amount === 0
      ) {
        return res.status(400).json({
          success: false,
          error:
            "A non-zero amount is required."
        });
      }

      if (
        Math.abs(amount) > 1000000000
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Amount is too large."
        });
      }

      if (
        reason.length > 250
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Reason must be 250 characters or less."
        });
      }

      const target =
        await users.findOne({
          _id: discordId
        });

      if (!target) {
        return res.status(404).json({
          success: false,
          error:
            "User not found."
        });
      }

      const currentBalance =
        typeof target.balance === "number"
          ? target.balance
          : 0;

      const newBalance =
        currentBalance + amount;

      if (newBalance < 0) {
        return res.status(400).json({
          success: false,
          error:
            "Balance cannot go below zero."
        });
      }

      const result =
        await users.updateOne(
          {
            _id: discordId,

            /*
             * Prevent a stale balance from
             * being overwritten.
             */
            balance:
              currentBalance
          },
          {
            $set: {
              balance:
                newBalance,

              updatedAt:
                new Date()
            }
          }
        );

      if (
        result.modifiedCount !== 1
      ) {
        return res.status(409).json({
          success: false,
          error:
            "The user's balance changed before this adjustment could be applied. Please try again."
        });
      }

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
            target.username ||
            null,

          discordUsername:
            target.discordUsername ||
            null,

          previousBalance:
            currentBalance,

          amount,

          newBalance,

          reason:
            reason || null
        }
      });

      return res.status(200).json({
        success: true,

        message:
          "User balance updated.",

        user: {
          id:
            target._id,

          username:
            target.username ||
            null,

          discordUsername:
            target.discordUsername ||
            null,

          balance:
            newBalance
        }
      });
    }

    return res.status(405).json({
      success: false,
      error:
        "Method not allowed."
    });

  } catch (error) {
    console.error(
      "ADMIN USERS ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Internal server error."
    });
  }
}
