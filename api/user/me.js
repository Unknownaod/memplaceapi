import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";
import { getDb } from "../../lib/mongodb.js";


export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }


  if (req.method !== "GET") {

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });

  }


  try {

    /* ==========================================
       AUTHENTICATE USER
    ========================================== */

    const user =
      await getAuthenticatedUser(req);


    if (!user) {

      return res.status(401).json({
        success: false,
        authenticated: false,
        user: null
      });

    }


    /* ==========================================
       DATABASE
    ========================================== */

    const db =
      await getDb();


    const now =
      new Date();


    /* ==========================================
       FIND MINIGAME ACCOUNT
    ========================================== */

    let minigameUser =
      await db
        .collection("minigame_users")
        .findOne({
          _id: user._id
        });


    /* ==========================================
       CREATE MINIGAME ACCOUNT
    ========================================== */

    if (!minigameUser) {

      minigameUser = {

        _id:
          user._id,

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


        /* ==========================================
           SHOP EQUIPMENT
        ========================================== */

        equippedNameplate:
          null,

        equippedBadge:
          null,

        equippedTitle:
          null,


        /* ==========================================
           PROFILE THEME
        ========================================== */

        equippedTheme:
          null,


        createdAt:
          now,

        updatedAt:
          now

      };


      await db
        .collection("minigame_users")
        .insertOne(
          minigameUser
        );


    } else {


      /* ==========================================
         MIGRATE OLDER ACCOUNTS
         
         Adds newly introduced equipment fields
         without overwriting existing equipment.
      ========================================== */

      const updates = {};


      /* ------------------------------------------
         NAMEPLATE
      ------------------------------------------ */

      if (
        !Object.prototype.hasOwnProperty.call(
          minigameUser,
          "equippedNameplate"
        )
      ) {

        updates.equippedNameplate =
          null;

      }


      /* ------------------------------------------
         BADGE
      ------------------------------------------ */

      if (
        !Object.prototype.hasOwnProperty.call(
          minigameUser,
          "equippedBadge"
        )
      ) {

        updates.equippedBadge =
          null;

      }


      /* ------------------------------------------
         TITLE
      ------------------------------------------ */

      if (
        !Object.prototype.hasOwnProperty.call(
          minigameUser,
          "equippedTitle"
        )
      ) {

        updates.equippedTitle =
          null;

      }


      /* ------------------------------------------
         PROFILE THEME
      ------------------------------------------ */

      if (
        !Object.prototype.hasOwnProperty.call(
          minigameUser,
          "equippedTheme"
        )
      ) {

        updates.equippedTheme =
          null;

      }


      /* ==========================================
         APPLY MIGRATION
      ========================================== */

      if (
        Object.keys(updates).length > 0
      ) {

        updates.updatedAt =
          now;


        await db
          .collection("minigame_users")
          .updateOne(

            {
              _id:
                user._id
            },

            {
              $set:
                updates
            }

          );


        minigameUser = {

          ...minigameUser,

          ...updates

        };

      }

    }


    /* ==========================================
       RESPONSE
    ========================================== */

    return res.status(200).json({

      success:
        true,

      authenticated:
        true,


      user: {

        id:
          user._id,

        username:
          user.username,

        discordUsername:
          user.discordUsername,

        avatar:
          user.avatar,


        /* ==========================================
           ECONOMY
        ========================================== */

        balance:
          minigameUser.balance,


        /* ==========================================
           GAME STATS
        ========================================== */

        gamesPlayed:
          minigameUser.gamesPlayed,

        gamesWon:
          minigameUser.gamesWon,

        gamesLost:
          minigameUser.gamesLost,

        totalWagered:
          minigameUser.totalWagered,

        totalWon:
          minigameUser.totalWon,

        totalLost:
          minigameUser.totalLost,


        /* ==========================================
           CHESS
        ========================================== */

        chessRating:
          minigameUser.chessRating,


        /* ==========================================
           EQUIPPED COSMETICS
        ========================================== */

        equippedNameplate:
          minigameUser.equippedNameplate ||
          null,

        equippedBadge:
          minigameUser.equippedBadge ||
          null,

        equippedTitle:
          minigameUser.equippedTitle ||
          null,


        /* ==========================================
           PROFILE THEME
        ========================================== */

        equippedTheme:
          minigameUser.equippedTheme ||
          null

      }

    });


  } catch (error) {

    console.error(
      "USER ME ERROR:",
      error
    );


    return res.status(500).json({

      success:
        false,

      error:
        "Internal server error"

    });

  }

}
