import { setCors } from "../../lib/cors.js";
import {
  requireStaff,
  getStaffMember,
  getRoleLevel,
  STAFF_ROLES
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";
import { getAuthenticatedUser } from "../../lib/auth.js";


/* ==========================================
   VALID ROLES
========================================== */

const VALID_ROLES = [
  "moderator",
  "admin",
  "manager"
];


/* ==========================================
   HANDLER
========================================== */

export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }


  try {

    /*
     * Every request to this endpoint requires
     * staff access.
     */

    const staff =
      await getStaffMember(req);


    if (!staff) {

      return res.status(403).json({
        success: false,
        error: "Staff access required."
      });

    }


    const db =
      await getDb();


    /* ========================================
       GET STAFF
    ======================================== */

    if (req.method === "GET") {

      /*
       * Only staff with the "staff"
       * permission can view the staff list.
       */

      if (
        staff.role !== "owner" &&
        !(
          Array.isArray(staff.permissions) &&
          staff.permissions.includes("staff")
        )
      ) {

        return res.status(403).json({
          success: false,
          error:
            "You do not have permission to manage staff."
        });

      }


      const staffMembers =
        await db
          .collection("staff_users")
          .find({})
          .sort({
            createdAt: 1
          })
          .toArray();


      return res.status(200).json({

        success: true,

        staff: staffMembers.map(member => ({

          id: member._id,

          username:
            member.username || null,

          discordUsername:
            member.discordUsername || null,

          role:
            member.role,

          createdAt:
            member.createdAt || null,

          updatedAt:
            member.updatedAt || null

        }))

      });

    }


    /* ========================================
       POST — ADD STAFF
    ======================================== */

    if (req.method === "POST") {

      /*
       * Only managers and owners can add staff.
       */

      if (
        staff.role !== "owner" &&
        getRoleLevel(staff.role) <
          getRoleLevel("manager")
      ) {

        return res.status(403).json({
          success: false,
          error:
            "Only managers and owners can add staff."
        });

      }


      const body =
        req.body || {};


      const discordId =
        typeof body.discordId === "string"
          ? body.discordId.trim()
          : "";


      const role =
        typeof body.role === "string"
          ? body.role.trim().toLowerCase()
          : "";


      if (!discordId) {

        return res.status(400).json({
          success: false,
          error:
            "Discord user ID is required."
        });

      }


      if (!/^\d{17,20}$/.test(discordId)) {

        return res.status(400).json({
          success: false,
          error:
            "Invalid Discord user ID."
        });

      }


      if (!VALID_ROLES.includes(role)) {

        return res.status(400).json({
          success: false,
          error:
            "Invalid staff role."
        });

      }


      /*
       * Managers can only create roles below
       * their own role.
       *
       * Owner can create anything.
       */

      if (
        staff.role !== "owner" &&
        getRoleLevel(role) >=
          getRoleLevel(staff.role)
      ) {

        return res.status(403).json({
          success: false,
          error:
            "You cannot create a staff member with a role equal to or higher than your own."
        });

      }


      /*
       * Make sure the Discord account actually
       * exists in the site's users collection.
       */

      const user =
        await db
          .collection("users")
          .findOne({
            _id: discordId
          });


      if (!user) {

        return res.status(404).json({
          success: false,
          error:
            "That Discord user does not have an account on the minigames website."
        });

      }


      /*
       * Check whether they're already staff.
       */

      const existing =
        await db
          .collection("staff_users")
          .findOne({
            _id: discordId
          });


      if (existing) {

        return res.status(409).json({
          success: false,
          error:
            "That user is already a staff member."
        });

      }


      const now =
        new Date();


      const newStaff = {

        _id: discordId,

        username:
          user.username ||
          null,

        discordUsername:
          user.discordUsername ||
          null,

        role,

        createdAt:
          now,

        updatedAt:
          now

      };


      await db
        .collection("staff_users")
        .insertOne(newStaff);


      return res.status(201).json({

        success: true,

        message:
          "Staff member added.",

        staff: {

          id:
            newStaff._id,

          username:
            newStaff.username,

          discordUsername:
            newStaff.discordUsername,

          role:
            newStaff.role,

          createdAt:
            newStaff.createdAt

        }

      });

    }


    /* ========================================
       PATCH — CHANGE ROLE
    ======================================== */

    if (req.method === "PATCH") {

      /*
       * Only managers and owners can change
       * staff roles.
       */

      if (
        staff.role !== "owner" &&
        getRoleLevel(staff.role) <
          getRoleLevel("manager")
      ) {

        return res.status(403).json({
          success: false,
          error:
            "Only managers and owners can change staff roles."
        });

      }


      const body =
        req.body || {};


      const discordId =
        typeof body.discordId === "string"
          ? body.discordId.trim()
          : "";


      const newRole =
        typeof body.role === "string"
          ? body.role.trim().toLowerCase()
          : "";


      if (!discordId) {

        return res.status(400).json({
          success: false,
          error:
            "Discord user ID is required."
        });

      }


      if (!VALID_ROLES.includes(newRole)) {

        return res.status(400).json({
          success: false,
          error:
            "Invalid staff role."
        });

      }


      /*
       * Never allow modification of the owner
       * through this endpoint.
       */

      const target =
        await db
          .collection("staff_users")
          .findOne({
            _id: discordId
          });


      if (!target) {

        return res.status(404).json({
          success: false,
          error:
            "Staff member not found."
        });

      }


      if (target.role === "owner") {

        return res.status(403).json({
          success: false,
          error:
            "The owner role cannot be changed."
        });

      }


      /*
       * A manager cannot modify another manager
       * or promote someone to manager.
       */

      if (
        staff.role !== "owner" &&
        (
          getRoleLevel(target.role) >=
            getRoleLevel(staff.role) ||
          getRoleLevel(newRole) >=
            getRoleLevel(staff.role)
        )
      ) {

        return res.status(403).json({
          success: false,
          error:
            "You cannot manage a staff member with an equal or higher role."
        });

      }


      const now =
        new Date();


      await db
        .collection("staff_users")
        .updateOne(
          {
            _id: discordId
          },
          {
            $set: {
              role: newRole,
              updatedAt: now
            }
          }
        );


      return res.status(200).json({

        success: true,

        message:
          "Staff role updated.",

        staff: {

          id:
            target._id,

          username:
            target.username || null,

          discordUsername:
            target.discordUsername || null,

          role:
            newRole,

          updatedAt:
            now

        }

      });

    }


    /* ========================================
       DELETE — REMOVE STAFF
    ======================================== */

    if (req.method === "DELETE") {

      /*
       * Only managers and owners can remove staff.
       */

      if (
        staff.role !== "owner" &&
        getRoleLevel(staff.role) <
          getRoleLevel("manager")
      ) {

        return res.status(403).json({
          success: false,
          error:
            "Only managers and owners can remove staff."
        });

      }


      const body =
        req.body || {};


      const discordId =
        typeof body.discordId === "string"
          ? body.discordId.trim()
          : "";


      if (!discordId) {

        return res.status(400).json({
          success: false,
          error:
            "Discord user ID is required."
        });

      }


      const target =
        await db
          .collection("staff_users")
          .findOne({
            _id: discordId
          });


      if (!target) {

        return res.status(404).json({
          success: false,
          error:
            "Staff member not found."
        });

      }


      /*
       * Owner cannot be removed.
       */

      if (target.role === "owner") {

        return res.status(403).json({
          success: false,
          error:
            "The owner cannot be removed."
        });

      }


      /*
       * Managers cannot remove managers.
       */

      if (
        staff.role !== "owner" &&
        getRoleLevel(target.role) >=
          getRoleLevel(staff.role)
      ) {

        return res.status(403).json({
          success: false,
          error:
            "You cannot remove a staff member with an equal or higher role."
        });

      }


      await db
        .collection("staff_users")
        .deleteOne({
          _id: discordId
        });


      return res.status(200).json({

        success: true,

        message:
          "Staff member removed."

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
      "ADMIN STAFF ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        "Internal server error."

    });

  }

}
