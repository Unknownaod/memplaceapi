import { setCors } from "../lib/cors.js";
import { getDb } from "../lib/mongodb.js";

export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {

    const username =
      typeof req.query?.username === "string"
        ? req.query.username.trim()
        : "";

    if (!username) {
      return res.status(400).json({
        success: false,
        error: "Username is required."
      });
    }

    const db =
      await getDb();


    /* ==========================================
       FIND USER
    ========================================== */

    const user =
      await db
        .collection("users")
        .findOne(
          {
            $or: [
              {
                username: username
              },
              {
                username: {
                  $regex:
                    `^${escapeRegex(username)}$`,
                  $options: "i"
                }
              }
            ]
          },
          {
            projection: {
              _id: 1,
              username: 1,
              discordUsername: 1,
              avatar: 1,
              avatarUrl: 1
            }
          }
        );


    if (!user) {

      return res.status(404).json({
        success: false,
        error: "User not found."
      });

    }


    /* ==========================================
       MINIGAME PROFILE
    ========================================== */

    const minigameUser =
      await db
        .collection("minigame_users")
        .findOne({
          _id: user._id
        });


    if (!minigameUser) {

      return res.status(404).json({
        success: false,
        error: "Minigame profile not found."
      });

    }


    /* ==========================================
       STAFF STATUS
    ========================================== */

    const staff =
      await db
        .collection("staff_users")
        .findOne({
          _id: user._id
        });


    /* ==========================================
       PUBLIC PROFILE
    ========================================== */

    return res.status(200).json({

      success: true,

      profile: {

        /*
         * Discord identity
         */
        id:
          String(user._id),

        username:
          user.username ||
          user.discordUsername ||
          username,

        avatar:
          user.avatarUrl ||
          user.avatar ||
          null,


        /*
         * Profile cosmetics
         */
        equippedNameplate:
          minigameUser.equippedNameplate ||
          null,

        equippedBadge:
          minigameUser.equippedBadge ||
          null,

        equippedTitle:
          minigameUser.equippedTitle ||
          null,

        equippedTheme:
          minigameUser.equippedTheme ||
          null,


        /*
         * Economy
         */
        balance:
          Number(
            minigameUser.balance || 0
          ),

        totalWagered:
          Number(
            minigameUser.totalWagered || 0
          ),

        totalWon:
          Number(
            minigameUser.totalWon || 0
          ),

        totalLost:
          Number(
            minigameUser.totalLost || 0
          ),


        /*
         * Game statistics
         */
        gamesPlayed:
          Number(
            minigameUser.gamesPlayed || 0
          ),

        gamesWon:
          Number(
            minigameUser.gamesWon || 0
          ),

        gamesLost:
          Number(
            minigameUser.gamesLost || 0
          ),

        chessRating:
          Number(
            minigameUser.chessRating || 1200
          ),


        /*
         * Public staff information
         */
        staff:
          staff
            ? {
                role:
                  staff.role || null
              }
            : null

      }

    });


  } catch (error) {

    console.error(
      "PUBLIC PROFILE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error."
    });

  }

}


/* ==========================================
   ESCAPE REGEX
========================================== */

function escapeRegex(value) {

  return String(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

}
