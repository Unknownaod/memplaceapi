import { setCors } from "../../lib/cors.js";
import { getStaffMember } from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";


/* ==========================================
   HELPERS
========================================== */

function escapeRegex(value) {
  return String(value || "")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


function normalizeAvatar(user) {

  const avatar =
    user?.avatar;

  if (!avatar) {
    return null;
  }


  /* ------------------------------------------
     DIRECT URL
  ------------------------------------------ */

  if (
    typeof avatar === "string" &&
    /^https?:\/\//i.test(avatar)
  ) {
    return avatar;
  }


  /* ------------------------------------------
     OBJECT URL
  ------------------------------------------ */

  if (
    typeof avatar === "object" &&
    avatar.url &&
    /^https?:\/\//i.test(
      String(avatar.url)
    )
  ) {
    return String(avatar.url);
  }


  /* ------------------------------------------
     DISCORD AVATAR HASH
  ------------------------------------------ */

  let avatarHash = null;


  if (
    typeof avatar === "string"
  ) {
    avatarHash = avatar;
  }


  if (
    typeof avatar === "object"
  ) {
    avatarHash =
      avatar.hash ||
      avatar.id ||
      null;
  }


  if (
    avatarHash &&
    user?._id
  ) {

    return (
      "https://cdn.discordapp.com/avatars/" +
      encodeURIComponent(
        String(user._id)
      ) +
      "/" +
      encodeURIComponent(
        String(avatarHash)
      ) +
      ".png?size=128"
    );
  }


  return null;
}


/* ==========================================
   MAIN HANDLER
========================================== */

export default async function handler(
  req,
  res
) {

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
        error:
          "Staff access required."
      });
    }


    /* ========================================
       PERMISSION
    ======================================== */

    const hasPermission =
      staff.role === "owner" ||
      (
        Array.isArray(
          staff.permissions
        ) &&
        staff.permissions.includes(
          "leaderboard"
        )
      );


    if (!hasPermission) {

      return res.status(403).json({
        success: false,
        error:
          "You do not have permission to access the leaderboard."
      });
    }


    /* ========================================
       METHOD
    ======================================== */

    if (
      req.method !== "GET"
    ) {

      return res.status(405).json({
        success: false,
        error:
          "Method not allowed."
      });
    }


    const db =
      await getDb();


    const minigameUsers =
      db.collection(
        "minigame_users"
      );


    const users =
      db.collection(
        "users"
      );


    /* ========================================
       QUERY
    ======================================== */

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : "";


    const sort =
      typeof req.query.sort === "string"
        ? req.query.sort
        : "balance";


    const allowedSorts = [
      "balance",
      "gamesPlayed",
      "gamesWon",
      "gamesLost",
      "totalWagered",
      "totalWon",
      "totalLost",
      "chessRating"
    ];


    const sortField =
      allowedSorts.includes(sort)
        ? sort
        : "balance";


    let limit =
      Number(
        req.query.limit
      );


    if (
      !Number.isFinite(limit) ||
      limit <= 0
    ) {
      limit = 50;
    }


    limit =
      Math.min(
        Math.floor(limit),
        250
      );


    let page =
      Number(
        req.query.page
      );


    if (
      !Number.isFinite(page) ||
      page < 1
    ) {
      page = 1;
    }


    page =
      Math.floor(page);


    const skip =
      (page - 1) *
      limit;


    /* ========================================
       FIND USER IDS IF SEARCHING
    ======================================== */

    let matchingUserIds =
      null;


    if (search) {

      const safeSearch =
        escapeRegex(search);


      const matchingUsers =
        await users
          .find({
            $or: [

              {
                username: {
                  $regex:
                    safeSearch,
                  $options:
                    "i"
                }
              },

              {
                discordUsername: {
                  $regex:
                    safeSearch,
                  $options:
                    "i"
                }
              },

              {
                _id: {
                  $regex:
                    safeSearch,
                  $options:
                    "i"
                }
              }

            ]
          })
          .project({
            _id: 1
          })
          .limit(500)
          .toArray();


      matchingUserIds =
        matchingUsers.map(
          user => user._id
        );


      if (
        matchingUserIds.length === 0
      ) {

        return res.status(200).json({

          success: true,

          leaderboard: [],

          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
          }

        });
      }
    }


    /* ========================================
       COUNT
    ======================================== */

    const countQuery =
      matchingUserIds
        ? {
            _id: {
              $in:
                matchingUserIds
            }
          }
        : {};


    const total =
      await minigameUsers.countDocuments(
        countQuery
      );


    /* ========================================
       LOAD RANKED MINIGAME USERS
    ======================================== */

    const minigameResults =
      await minigameUsers
        .find(
          countQuery
        )
        .sort({
          [sortField]:
            -1,

          _id:
            1
        })
        .skip(skip)
        .limit(limit)
        .toArray();


    /* ========================================
       LOAD USER PROFILES
    ======================================== */

    const userIds =
      minigameResults.map(
        user =>
          user._id
      );


    const userProfiles =
      userIds.length
        ? await users
            .find({
              _id: {
                $in:
                  userIds
              }
            })
            .project({
              _id: 1,
              username: 1,
              discordUsername: 1,
              avatar: 1,
              createdAt: 1,
              updatedAt: 1
            })
            .toArray()
        : [];


    const profileMap =
      new Map();


    for (
      const profile
      of userProfiles
    ) {

      profileMap.set(
        String(
          profile._id
        ),
        profile
      );
    }


    /* ========================================
       BUILD LEADERBOARD
    ======================================== */

    const leaderboard =
      minigameResults.map(
        (minigameUser, index) => {

          const profile =
            profileMap.get(
              String(
                minigameUser._id
              )
            ) || null;


          const rank =
            skip +
            index +
            1;


          return {

            rank,

            id:
              minigameUser._id,

            username:
              profile?.username ||
              null,

            discordUsername:
              profile?.discordUsername ||
              null,

            avatar:
              normalizeAvatar(
                profile
              ),

            createdAt:
              profile?.createdAt ||
              minigameUser.createdAt ||
              null,

            updatedAt:
              profile?.updatedAt ||
              minigameUser.updatedAt ||
              null,


            /* ------------------------------
               ECONOMY
            ------------------------------ */

            balance:
              Number(
                minigameUser.balance ||
                0
              ),


            /* ------------------------------
               GAME STATS
            ------------------------------ */

            gamesPlayed:
              Number(
                minigameUser.gamesPlayed ||
                0
              ),

            gamesWon:
              Number(
                minigameUser.gamesWon ||
                0
              ),

            gamesLost:
              Number(
                minigameUser.gamesLost ||
                0
              ),


            /* ------------------------------
               WAGERING
            ------------------------------ */

            totalWagered:
              Number(
                minigameUser.totalWagered ||
                0
              ),

            totalWon:
              Number(
                minigameUser.totalWon ||
                0
              ),

            totalLost:
              Number(
                minigameUser.totalLost ||
                0
              ),


            /* ------------------------------
               CHESS
            ------------------------------ */

            chessRating:
              Number(
                minigameUser.chessRating ||
                1200
              )

          };

        }
      );


    /* ========================================
       TOTAL PAGES
    ======================================== */

    const totalPages =
      total > 0
        ? Math.ceil(
            total / limit
          )
        : 0;


    /* ========================================
       RESPONSE
    ======================================== */

    return res.status(200).json({

      success: true,

      sort:
        sortField,

      leaderboard,

      pagination: {

        page,

        limit,

        total,

        totalPages

      }

    });


  } catch (error) {

    console.error(
      "ADMIN LEADERBOARD ERROR:",
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
