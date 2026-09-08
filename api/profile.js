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

    const db = await getDb();

    /*
     * Find the Memplace user.
     *
     * We check both username fields because
     * your existing users may use either one.
     */

    const user =
      await db.collection("users").findOne(
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

    /*
     * Find the user's minigame profile.
     */

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

    /*
     * Return ONLY information that is safe
     * for a public profile.
     */

    return res.status(200).json({

      success: true,

      profile: {

        username:
          user.username ||
          user.discordUsername ||
          username,

        avatar:
          user.avatarUrl ||
          user.avatar ||
          null,

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

        balance:
          Number(
            minigameUser.balance || 0
          ),

        gamesPlayed:
          Number(
            minigameUser.gamesPlayed || 0
          ),

        wins:
          Number(
            minigameUser.wins || 0
          ),

        losses:
          Number(
            minigameUser.losses || 0
          ),

        chessRating:
          Number(
            minigameUser.chessRating || 0
          )

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


function escapeRegex(value) {

  return String(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

}
