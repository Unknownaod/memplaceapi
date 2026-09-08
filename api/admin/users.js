import { setCors } from "../../lib/cors.js";
import {
  getStaffMember,
  getRoleLevel
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";
import { createAuditLog } from "../../lib/audit.js";


function safeUser(user, minigameUser) {

  return {

    id:
      user?._id || null,

    username:
      user?.username || null,

    discordUsername:
      user?.discordUsername || null,

    avatar:
      user?.avatar || null,

    createdAt:
      minigameUser?.createdAt ||
      null,

    updatedAt:
      minigameUser?.updatedAt ||
      null,

    balance:
      typeof minigameUser?.balance === "number"
        ? minigameUser.balance
        : 0,

    gamesPlayed:
      typeof minigameUser?.gamesPlayed === "number"
        ? minigameUser.gamesPlayed
        : 0,

    gamesWon:
      typeof minigameUser?.gamesWon === "number"
        ? minigameUser.gamesWon
        : 0,

    gamesLost:
      typeof minigameUser?.gamesLost === "number"
        ? minigameUser.gamesLost
        : 0,

    totalWagered:
      typeof minigameUser?.totalWagered === "number"
        ? minigameUser.totalWagered
        : 0,

    totalWon:
      typeof minigameUser?.totalWon === "number"
        ? minigameUser.totalWon
        : 0,

    totalLost:
      typeof minigameUser?.totalLost === "number"
        ? minigameUser.totalLost
        : 0,

    chessRating:
      typeof minigameUser?.chessRating === "number"
        ? minigameUser.chessRating
        : 1200

  };

}


export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }


  try {

    /* ==========================================
       STAFF AUTH
    ========================================== */

    const staff =
      await getStaffMember(req);


    if (!staff) {

      return res.status(403).json({
        success: false,
        error: "Staff access required."
      });

    }


    /*
     * Admin+
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


    /* ==========================================
       DATABASE
    ========================================== */

    const db =
      await getDb();


    const users =
      db.collection("users");


    const minigameUsers =
      db.collection("minigame_users");


    /* ==========================================
       GET USERS
    ========================================== */

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


      /*
       * Search identity users.
       */
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
         * Discord ID search.
         */
        if (
          /^\d{17,20}$/.test(
            search
          )
        ) {

          query.$or.push({
            _id: search
          });

        }

      }


      /*
       * Get actual users.
       */
      const identityUsers =
        await users
          .find(
            query,
            {
              projection: {

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
            _id: 1
          })
          .limit(limit)
          .toArray();


      /*
       * Get corresponding minigame accounts.
       */
      const userIds =
        identityUsers.map(
          user =>
            user._id
        );


      const gameAccounts =
        await minigameUsers
          .find({
            _id: {
              $in: userIds
            }
          })
          .toArray();


      /*
       * Map minigame accounts by ID.
       */
      const gameMap =
        new Map(
          gameAccounts.map(
            account => [
              String(account._id),
              account
            ]
          )
        );


      /*
       * Combine users + minigame accounts.
       */
      const result =
        identityUsers.map(
          user => {

            const gameAccount =
              gameMap.get(
                String(user._id)
              );


            return safeUser(
              user,
              gameAccount
            );

          }
        );


      return res.status(200).json({

        success: true,

        users:
          result,

        count:
          result.length

      });

    }


    /* ==========================================
       BALANCE ADJUSTMENT
    ========================================== */

    if (req.method === "PATCH") {

      /*
       * Manager + Owner.
       */
      if (
        getRoleLevel(staff.role) < 3
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
        Math.abs(amount) >
        1000000000
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


      /*
       * Verify actual Discord account.
       */
      const targetUser =
        await users.findOne({
          _id: discordId
        });


      if (!targetUser) {

        return res.status(404).json({
          success: false,
          error:
            "User not found."
        });

      }


      /*
       * Find actual minigame account.
       */
      let targetGameUser =
        await minigameUsers.findOne({
          _id: discordId
        });


      /*
       * If they have a Memplace account but
       * haven't opened the minigames system yet,
       * create their normal minigame account.
       *
       * This matches /api/auth/me exactly.
       */
      if (!targetGameUser) {

        const now =
          new Date();


        targetGameUser = {

          _id:
            discordId,

          balance:
            1000,

          gamesPlayed:
            0,

          gamesWon:
            0,

          gamesLost:
            0,

          totalWagered:
            0,

          totalWon:
            0,

          totalLost:
            0,

          chessRating:
            1200,

          createdAt:
            now,

          updatedAt:
            now

        };


        await minigameUsers.insertOne(
          targetGameUser
        );

      }


      const currentBalance =
        typeof targetGameUser.balance === "number"
          ? targetGameUser.balance
          : 0;


      const newBalance =
        currentBalance +
        amount;


      if (
        newBalance < 0
      ) {

        return res.status(400).json({
          success: false,
          error:
            "Balance cannot go below zero."
        });

      }


      /*
       * Atomic balance update.
       */
      const result =
        await minigameUsers.updateOne(

          {
            _id:
              discordId,

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


      /*
       * Audit.
       */
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
            targetUser.username ||
            null,

          discordUsername:
            targetUser.discordUsername ||
            null,

          previousBalance:
            currentBalance,

          amount,

          newBalance,

          reason:
            reason ||
            null

        }

      });


      return res.status(200).json({

        success: true,

        message:
          "User balance updated.",

        user: {

          id:
            targetUser._id,

          username:
            targetUser.username ||
            null,

          discordUsername:
            targetUser.discordUsername ||
            null,

          avatar:
            targetUser.avatar ||
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
