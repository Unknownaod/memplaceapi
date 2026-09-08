import { setCors } from "../../lib/cors.js";
import {
  getStaffMember,
  getRoleLevel
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";
import { createAuditLog } from "../../lib/audit.js";


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

  if (typeof avatar === "string") {
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
      ".png?size=256"
    );
  }


  return null;
}


/* ==========================================
   SAFE USER RESPONSE
========================================== */

function buildUserResponse(
  user,
  minigameUser
) {

  const minigame =
    minigameUser || null;


  return {

    /* ----------------------------------------
       IDENTITY
    ---------------------------------------- */

    id:
      user?._id || null,

    username:
      user?.username || null,

    discordUsername:
      user?.discordUsername || null,

    avatar:
      normalizeAvatar(user),


    /* ----------------------------------------
       ACCOUNT
    ---------------------------------------- */

    createdAt:
      user?.createdAt ||
      minigame?.createdAt ||
      null,

    updatedAt:
      user?.updatedAt ||
      minigame?.updatedAt ||
      null,


    /* ----------------------------------------
       MINIGAME ACCOUNT
    ---------------------------------------- */

    hasMinigameAccount:
      Boolean(minigame),


    /* ----------------------------------------
       ECONOMY
    ---------------------------------------- */

    balance:
      minigame
        ? Number(minigame.balance || 0)
        : null,


    /* ----------------------------------------
       GENERAL GAME STATS
    ---------------------------------------- */

    gamesPlayed:
      minigame
        ? Number(
            minigame.gamesPlayed || 0
          )
        : 0,

    gamesWon:
      minigame
        ? Number(
            minigame.gamesWon || 0
          )
        : 0,

    gamesLost:
      minigame
        ? Number(
            minigame.gamesLost || 0
          )
        : 0,


    /* ----------------------------------------
       WAGERING STATS
    ---------------------------------------- */

    totalWagered:
      minigame
        ? Number(
            minigame.totalWagered || 0
          )
        : 0,

    totalWon:
      minigame
        ? Number(
            minigame.totalWon || 0
          )
        : 0,

    totalLost:
      minigame
        ? Number(
            minigame.totalLost || 0
          )
        : 0,


    /* ----------------------------------------
       CHESS
    ---------------------------------------- */

    chessRating:
      minigame
        ? Number(
            minigame.chessRating || 1200
          )
        : 1200,


    /* ----------------------------------------
       DAILY
       
       These are returned if they exist in the
       minigame account, without inventing them.
    ---------------------------------------- */

    dailyStreak:
      minigame?.dailyStreak ??
      null,

    dailyLastClaim:
      minigame?.dailyLastClaim ??
      null
  };
}


/* ==========================================
   GET USERS
========================================== */

async function getUsers(
  req,
  res,
  staff
) {

  const db =
    await getDb();


  const usersCollection =
    db.collection("users");

  const minigameCollection =
    db.collection("minigame_users");


  /* ------------------------------------------
     QUERY
  ------------------------------------------ */

  const search =
    typeof req.query.search === "string"
      ? req.query.search.trim()
      : "";


  let limit =
    Number(req.query.limit);


  if (
    !Number.isFinite(limit) ||
    limit <= 0
  ) {
    limit = 100;
  }


  limit =
    Math.min(
      Math.floor(limit),
      250
    );


  /* ------------------------------------------
     BUILD USER QUERY
  ------------------------------------------ */

  const userQuery = {};


  if (search) {

    const safeSearch =
      escapeRegex(search);

    userQuery.$or = [

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

    ];
  }


  /* ------------------------------------------
     LOAD USERS
  ------------------------------------------ */

  const users =
    await usersCollection
      .find(
        userQuery,
        {
          projection: {
            _id: 1,
            username: 1,
            discordUsername: 1,
            avatar: 1,
            createdAt: 1,
            updatedAt: 1
          }
        }
      )
      .sort({
        createdAt: -1
      })
      .limit(limit)
      .toArray();


  if (!users.length) {

    return res.status(200).json({

      success: true,

      users: [],

      count: 0,

      limit

    });
  }


  /* ------------------------------------------
     GET MINIGAME ACCOUNTS
  ------------------------------------------ */

  const userIds =
    users.map(
      user => user._id
    );


  const minigameUsers =
    await minigameCollection
      .find({
        _id: {
          $in: userIds
        }
      })
      .toArray();


  const minigameMap =
    new Map();


  for (
    const minigameUser
    of minigameUsers
  ) {

    minigameMap.set(
      String(minigameUser._id),
      minigameUser
    );
  }


  /* ------------------------------------------
     MERGE DATA
  ------------------------------------------ */

  const responseUsers =
    users.map(user => {

      const minigameUser =
        minigameMap.get(
          String(user._id)
        ) || null;

      return buildUserResponse(
        user,
        minigameUser
      );
    });


  return res.status(200).json({

    success: true,

    users:
      responseUsers,

    count:
      responseUsers.length,

    limit

  });
}


/* ==========================================
   PATCH BALANCE
========================================== */

async function adjustBalance(
  req,
  res,
  staff
) {

  /* ------------------------------------------
     MANAGER / OWNER ONLY
  ------------------------------------------ */

  if (
    getRoleLevel(staff.role) <
    getRoleLevel("manager")
  ) {

    return res.status(403).json({

      success: false,

      error:
        "Only managers and owners can adjust user balances."

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


  /* ------------------------------------------
     VALIDATE ID
  ------------------------------------------ */

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


  /* ------------------------------------------
     VALIDATE AMOUNT
  ------------------------------------------ */

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
        "Balance amount must be a whole number."

    });
  }


  if (Math.abs(amount) > 1000000000) {

    return res.status(400).json({

      success: false,

      error:
        "Balance adjustment is too large."

    });
  }


  /* ------------------------------------------
     REQUIRE REASON
  ------------------------------------------ */

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


  const db =
    await getDb();


  const usersCollection =
    db.collection("users");

  const minigameCollection =
    db.collection("minigame_users");


  /* ------------------------------------------
     FIND USER
  ------------------------------------------ */

  const user =
    await usersCollection.findOne({
      _id: discordId
    });


  if (!user) {

    return res.status(404).json({

      success: false,

      error:
        "User not found."

    });
  }


  /* ------------------------------------------
     FIND MINIGAME ACCOUNT
  ------------------------------------------ */

  const minigameUser =
    await minigameCollection.findOne({
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


  /* ------------------------------------------
     PREVENT NEGATIVE BALANCE
  ------------------------------------------ */

  if (newBalance < 0) {

    return res.status(400).json({

      success: false,

      error:
        "This adjustment would make the user's balance negative."

    });
  }


  /* ------------------------------------------
     UPDATE BALANCE
  ------------------------------------------ */

  const now =
    new Date();


  const result =
    await minigameCollection.updateOne(

      {
        _id: discordId,

        balance: oldBalance
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


  /*
   * If another request changed the balance
   * between the read and update, don't silently
   * overwrite it.
   */

  if (
    result.modifiedCount !== 1
  ) {

    return res.status(409).json({

      success: false,

      error:
        "The user's balance changed before the adjustment could be applied. Please try again."

    });
  }


  /* ------------------------------------------
     AUDIT
  ------------------------------------------ */

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


  /* ------------------------------------------
     RESPONSE
  ------------------------------------------ */

  return res.status(200).json({

    success: true,

    message:
      "User balance updated.",

    user:
      buildUserResponse(
        user,
        {
          ...minigameUser,

          balance:
            newBalance,

          updatedAt:
            now
        }
      )

  });
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

    /* ----------------------------------------
       STAFF AUTH
    ---------------------------------------- */

    const staff =
      await getStaffMember(req);


    if (!staff) {

      return res.status(403).json({

        success: false,

        error:
          "Staff access required."

      });
    }


    /* ----------------------------------------
       USERS PERMISSION
    ---------------------------------------- */

    if (
      !(
        staff.role === "owner" ||
        (
          Array.isArray(
            staff.permissions
          ) &&
          staff.permissions.includes(
            "users"
          )
        )
      )
    ) {

      return res.status(403).json({

        success: false,

        error:
          "You do not have permission to manage users."

      });
    }


    /* ----------------------------------------
       GET
    ---------------------------------------- */

    if (
      req.method === "GET"
    ) {

      return await getUsers(
        req,
        res,
        staff
      );
    }


    /* ----------------------------------------
       PATCH
    ---------------------------------------- */

    if (
      req.method === "PATCH"
    ) {

      return await adjustBalance(
        req,
        res,
        staff
      );
    }


    /* ----------------------------------------
       METHOD NOT ALLOWED
    ---------------------------------------- */

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


    if (!res.headersSent) {

      return res.status(500).json({

        success: false,

        error:
          "Internal server error."

      });
    }
  }
}
