import { getDb } from "./mongodb.js";
import { getAuthenticatedUser } from "./auth.js";


/* ==========================================
   STAFF ROLES
========================================== */

export const STAFF_ROLES = {
  moderator: {
    level: 1,

    permissions: [
      "dashboard",
      "support"
    ]
  },

  admin: {
    level: 2,

    permissions: [
      "dashboard",
      "support",
      "users",
      "economy",
      "games",
      "shop",
      "daily",
      "leaderboard"
    ]
  },

  manager: {
    level: 3,

    permissions: [
      "dashboard",
      "support",
      "users",
      "economy",
      "games",
      "shop",
      "daily",
      "leaderboard",
      "staff",
      "system"
    ]
  },

  owner: {
    level: 4,

    permissions: [
      "dashboard",
      "support",
      "users",
      "economy",
      "games",
      "shop",
      "daily",
      "leaderboard",
      "staff",
      "system"
    ]
  }
};


/* ==========================================
   ROLE HELPERS
========================================== */

export function getRoleLevel(role) {

  return (
    STAFF_ROLES[role]?.level ||
    0
  );

}


export function getRolePermissions(role) {

  return (
    STAFF_ROLES[role]?.permissions ||
    []
  );

}


export function hasPermission(
  staff,
  permission
) {

  if (!staff) {
    return false;
  }

  if (staff.role === "owner") {
    return true;
  }

  return getRolePermissions(
    staff.role
  ).includes(permission);

}


/* ==========================================
   GET STAFF MEMBER
========================================== */

export async function getStaffMember(req) {

  const user =
    await getAuthenticatedUser(req);

  if (!user) {
    return null;
  }

  const db =
    await getDb();


  let staff =
    await db
      .collection("staff_users")
      .findOne({
        _id: user._id
      });


  /*
   * Bootstrap owner.
   *
   * ADMIN_DISCORD_IDS is only used to
   * create the initial owner account.
   */

  if (!staff) {

    const adminIds =
      String(
        process.env.ADMIN_DISCORD_IDS ||
        ""
      )
        .split(",")
        .map(id => id.trim())
        .filter(Boolean);


    if (
      adminIds.includes(
        String(user._id)
      )
    ) {

      const now =
        new Date();

      const owner = {

        _id: user._id,

        username:
          user.username ||
          null,

        discordUsername:
          user.discordUsername ||
          null,

        role: "owner",

        createdAt: now,

        updatedAt: now

      };


      await db
        .collection("staff_users")
        .updateOne(
          {
            _id: user._id
          },
          {
            $setOnInsert: owner
          },
          {
            upsert: true
          }
        );


      staff =
        await db
          .collection("staff_users")
          .findOne({
            _id: user._id
          });

    }

  }


  if (!staff) {
    return null;
  }


  /*
   * Always calculate permissions
   * from the role.
   */

  staff.permissions =
    getRolePermissions(
      staff.role
    );


  return staff;

}


/* ==========================================
   REQUIRE STAFF
========================================== */

export async function requireStaff(
  req,
  res,
  permission = null
) {

  const staff =
    await getStaffMember(req);


  if (!staff) {

    res.status(403).json({

      success: false,

      error:
        "Staff access required."

    });

    return null;

  }


  if (
    permission &&
    !hasPermission(
      staff,
      permission
    )
  ) {

    res.status(403).json({

      success: false,

      error:
        "You do not have permission to access this section."

    });

    return null;

  }


  return staff;

}
