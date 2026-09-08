import { setCors } from "../../lib/cors.js";
import {
  getStaffMember,
  getRoleLevel
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";

const VALID_STATUSES = [
  "open",
  "pending",
  "resolved",
  "closed"
];

const VALID_CATEGORIES = [
  "general",
  "account",
  "games",
  "payments",
  "bug",
  "other"
];

export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }

  try {

    /*
    ==========================================
    AUTHENTICATE STAFF
    ==========================================
    */

    const staff =
      await getStaffMember(req);

    if (!staff) {
      return res.status(403).json({
        success: false,
        error: "Staff access required."
      });
    }

    /*
    ==========================================
    PERMISSION HELPERS
    ==========================================
    */

    const staffLevel =
      getRoleLevel(staff.role);

    const canView =
      staffLevel >=
      getRoleLevel("moderator");

    const canManage =
      staffLevel >=
      getRoleLevel("manager");

    if (!canView) {
      return res.status(403).json({
        success: false,
        error:
          "You do not have permission to access support."
      });
    }

    const db =
      await getDb();

    const tickets =
      db.collection("support_tickets");


    /*
    ==========================================
    GET
    ==========================================
    */

    if (req.method === "GET") {

      const {
        id,
        status,
        category,
        search
      } = req.query || {};


      /*
      ------------------------------------------
      SINGLE TICKET
      ------------------------------------------
      */

      if (id) {

        const ticket =
          await tickets.findOne({
            _id: String(id)
          });

        if (!ticket) {
          return res.status(404).json({
            success: false,
            error: "Support ticket not found."
          });
        }

        return res.status(200).json({
          success: true,
          ticket
        });
      }


      /*
      ------------------------------------------
      TICKET LIST
      ------------------------------------------
      */

      const query = {};


      if (
        status &&
        VALID_STATUSES.includes(
          String(status).toLowerCase()
        )
      ) {
        query.status =
          String(status).toLowerCase();
      }


      if (
        category &&
        VALID_CATEGORIES.includes(
          String(category).toLowerCase()
        )
      ) {
        query.category =
          String(category).toLowerCase();
      }


      /*
      ------------------------------------------
      SEARCH
      ------------------------------------------
      */

      if (
        typeof search === "string" &&
        search.trim()
      ) {

        const searchValue =
          search.trim();

        query.$or = [
          {
            subject: {
              $regex:
                searchValue,
              $options: "i"
            }
          },
          {
            userId: {
              $regex:
                searchValue,
              $options: "i"
            }
          },
          {
            username: {
              $regex:
                searchValue,
              $options: "i"
            }
          }
        ];
      }


      const staffTickets =
        await tickets
          .find(query)
          .sort({
            updatedAt: -1,
            createdAt: -1
          })
          .limit(250)
          .toArray();


      return res.status(200).json({
        success: true,
        tickets: staffTickets
      });
    }


    /*
    ==========================================
    PATCH
    ==========================================
    */

    if (req.method === "PATCH") {

      if (!canManage) {
        return res.status(403).json({
          success: false,
          error:
            "Only managers and owners can manage support tickets."
        });
      }

      const body =
        req.body || {};

      const ticketId =
        typeof body.ticketId === "string"
          ? body.ticketId.trim()
          : "";

      if (!ticketId) {
        return res.status(400).json({
          success: false,
          error:
            "Ticket ID is required."
        });
      }

      const ticket =
        await tickets.findOne({
          _id: ticketId
        });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          error:
            "Support ticket not found."
        });
      }


      /*
      ------------------------------------------
      BUILD UPDATE
      ------------------------------------------
      */

      const update = {
        updatedAt:
          new Date()
      };


      /*
      STATUS
      */

      if (
        body.status !== undefined
      ) {

        const newStatus =
          typeof body.status === "string"
            ? body.status
                .trim()
                .toLowerCase()
            : "";

        if (
          !VALID_STATUSES.includes(
            newStatus
          )
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Invalid ticket status."
          });
        }

        update.status =
          newStatus;
      }


      /*
      ASSIGN STAFF MEMBER
      */

      if (
        body.assignedTo !== undefined
      ) {

        if (
          body.assignedTo === null ||
          body.assignedTo === ""
        ) {
          update.assignedTo =
            null;
        } else {

          const assignedId =
            String(
              body.assignedTo
            ).trim();

          const assignedStaff =
            await db
              .collection("staff_users")
              .findOne({
                _id: assignedId
              });

          if (!assignedStaff) {
            return res.status(404).json({
              success: false,
              error:
                "Assigned staff member not found."
            });
          }

          update.assignedTo = {
            id:
              assignedStaff._id,
            username:
              assignedStaff.username ||
              null,
            role:
              assignedStaff.role || null
          };
        }
      }


      /*
      INTERNAL NOTE
      */

      if (
        body.internalNote !== undefined
      ) {

        if (
          typeof body.internalNote !==
          "string"
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Internal note must be text."
          });
        }

        const note =
          body.internalNote.trim();

        if (
          note.length > 4000
        ) {
          return res.status(400).json({
            success: false,
            error:
              "Internal note cannot exceed 4000 characters."
          });
        }

        if (note) {

          const noteObject = {
            id:
              crypto.randomUUID(),
            staffId:
              staff._id,
            username:
              staff.username ||
              null,
            role:
              staff.role,
            message:
              note,
            createdAt:
              new Date()
          };

          update.$push = {
            internalNotes:
              noteObject
          };
        }
      }


      /*
      ------------------------------------------
      UPDATE
      ------------------------------------------
      */

      await tickets.updateOne(
        {
          _id: ticketId
        },
        {
          $set: update
        }
      );


      const updatedTicket =
        await tickets.findOne({
          _id: ticketId
        });


      return res.status(200).json({
        success: true,
        message:
          "Support ticket updated.",
        ticket:
          updatedTicket
      });
    }


    /*
    ==========================================
    POST
    ==========================================
    */

    if (req.method === "POST") {

      /*
      POST IS USED FOR STAFF REPLIES
      */

      const body =
        req.body || {};

      const ticketId =
        typeof body.ticketId === "string"
          ? body.ticketId.trim()
          : "";

      const message =
        typeof body.message === "string"
          ? body.message.trim()
          : "";

      if (!ticketId) {
        return res.status(400).json({
          success: false,
          error:
            "Ticket ID is required."
        });
      }

      if (!message) {
        return res.status(400).json({
          success: false,
          error:
            "Reply message is required."
        });
      }

      if (
        message.length > 4000
      ) {
        return res.status(400).json({
          success: false,
          error:
            "Reply cannot exceed 4000 characters."
        });
      }


      const ticket =
        await tickets.findOne({
          _id: ticketId
        });

      if (!ticket) {
        return res.status(404).json({
          success: false,
          error:
            "Support ticket not found."
        });
      }


      /*
      ------------------------------------------
      STAFF REPLY
      ------------------------------------------
      */

      const reply = {
        id:
          crypto.randomUUID(),

        type:
          "staff",

        staffId:
          staff._id,

        username:
          staff.username ||
          null,

        role:
          staff.role,

        message,

        createdAt:
          new Date()
      };


      /*
      ------------------------------------------
      AUTO-ASSIGN
      ------------------------------------------
      */

      const update = {
        $push: {
          messages:
            reply
        },

        $set: {
          updatedAt:
            new Date()
        }
      };


      /*
      Automatically assign the ticket
      to the staff member replying.
      */

      if (!ticket.assignedTo) {
        update.$set.assignedTo = {
          id:
            staff._id,
          username:
            staff.username ||
            null,
          role:
            staff.role
        };
      }


      /*
      If ticket is currently open,
      move it to pending after a staff reply.
      */

      if (
        ticket.status === "open"
      ) {
        update.$set.status =
          "pending";
      }


      await tickets.updateOne(
        {
          _id: ticketId
        },
        update
      );


      const updatedTicket =
        await tickets.findOne({
          _id: ticketId
        });


      return res.status(201).json({
        success: true,
        message:
          "Reply sent.",
        ticket:
          updatedTicket
      });
    }


    /*
    ==========================================
    DELETE
    ==========================================
    */

    if (req.method === "DELETE") {

      /*
      Tickets should normally never be
      permanently deleted.

      Only the owner can delete one.
      */

      if (
        staff.role !== "owner"
      ) {
        return res.status(403).json({
          success: false,
          error:
            "Only the owner can permanently delete support tickets."
        });
      }

      const body =
        req.body || {};

      const ticketId =
        typeof body.ticketId === "string"
          ? body.ticketId.trim()
          : "";

      if (!ticketId) {
        return res.status(400).json({
          success: false,
          error:
            "Ticket ID is required."
        });
      }

      const result =
        await tickets.deleteOne({
          _id: ticketId
        });

      if (
        result.deletedCount === 0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Support ticket not found."
        });
      }

      return res.status(200).json({
        success: true,
        message:
          "Support ticket permanently deleted."
      });
    }


    /*
    ==========================================
    METHOD NOT ALLOWED
    ==========================================
    */

    return res.status(405).json({
      success: false,
      error:
        "Method not allowed."
    });

  } catch (error) {

    console.error(
      "ADMIN SUPPORT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "Internal server error."
    });
  }
}
