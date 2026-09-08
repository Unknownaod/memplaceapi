import crypto from "crypto";

import { setCors } from "../../lib/cors.js";
import {
  getStaffMember,
  getRoleLevel
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";
import { createAuditLog } from "../../lib/audit.js";


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
    PERMISSION LEVELS
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
            error:
              "Support ticket not found."
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
              $options:
                "i"
            }
          },

          {
            userId: {
              $regex:
                searchValue,
              $options:
                "i"
            }
          },

          {
            username: {
              $regex:
                searchValue,
              $options:
                "i"
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

        tickets:
          staffTickets

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
      ========================================
      BUILD UPDATE OPERATIONS
      ========================================
      */

      const setFields = {

        updatedAt:
          new Date()

      };


      const updateOps = {

        $set:
          setFields

      };


      /*
      ========================================
      STATUS
      ========================================
      */

      let statusChanged =
        false;

      let oldStatus =
        ticket.status || null;

      let newStatus =
        oldStatus;


      if (
        body.status !== undefined
      ) {

        newStatus =
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


        if (
          newStatus !==
          oldStatus
        ) {

          statusChanged =
            true;

          setFields.status =
            newStatus;

        }

      }


      /*
      ========================================
      ASSIGN STAFF MEMBER
      ========================================
      */

      let assignmentChanged =
        false;

      let previousAssignment =
        ticket.assignedTo || null;

      let newAssignment =
        previousAssignment;


      if (
        body.assignedTo !== undefined
      ) {

        if (
          body.assignedTo === null ||
          body.assignedTo === ""
        ) {

          newAssignment =
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
                _id:
                  assignedId
              });


          if (!assignedStaff) {

            return res.status(404).json({
              success: false,
              error:
                "Assigned staff member not found."
            });

          }


          newAssignment = {

            id:
              assignedStaff._id,

            username:
              assignedStaff.username ||
              null,

            role:
              assignedStaff.role ||
              null

          };

        }


        const oldAssignmentId =
          previousAssignment?.id ||
          null;

        const newAssignmentId =
          newAssignment?.id ||
          null;


        if (
          oldAssignmentId !==
          newAssignmentId
        ) {

          assignmentChanged =
            true;

          setFields.assignedTo =
            newAssignment;

        }

      }


      /*
      ========================================
      INTERNAL NOTE
      ========================================
      */

      let internalNoteObject =
        null;


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

          internalNoteObject = {

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


          /*
           * IMPORTANT:
           * $push must be a top-level MongoDB
           * update operator, not inside $set.
           */

          updateOps.$push = {

            internalNotes:
              internalNoteObject

          };

        }

      }


      /*
      ========================================
      NOTHING TO UPDATE
      ========================================
      */

      const hasSetChanges =
        Object.keys(setFields)
          .some(
            key =>
              key !== "updatedAt"
          );


      const hasPush =
        Boolean(
          internalNoteObject
        );


      if (
        !hasSetChanges &&
        !hasPush
      ) {

        return res.status(400).json({
          success: false,
          error:
            "No changes were provided."
        });

      }


      /*
      ========================================
      UPDATE TICKET
      ========================================
      */

      await tickets.updateOne(
        {
          _id:
            ticketId
        },
        updateOps
      );


      /*
      ========================================
      AUDIT — STATUS
      ========================================
      */

      if (statusChanged) {

        await createAuditLog({

          staff,

          action:
            "support_status_changed",

          targetType:
            "support_ticket",

          targetId:
            ticketId,

          details: {

            oldStatus,

            newStatus

          }

        });

      }


      /*
      ========================================
      AUDIT — ASSIGNMENT
      ========================================
      */

      if (assignmentChanged) {

        await createAuditLog({

          staff,

          action:
            "support_assigned",

          targetType:
            "support_ticket",

          targetId:
            ticketId,

          details: {

            previousAssignment,

            newAssignment

          }

        });

      }


      /*
      ========================================
      AUDIT — INTERNAL NOTE
      ========================================
      */

      if (internalNoteObject) {

        await createAuditLog({

          staff,

          action:
            "support_internal_note",

          targetType:
            "support_ticket",

          targetId:
            ticketId,

          details: {

            noteId:
              internalNoteObject.id

          }

        });

      }


      const updatedTicket =
        await tickets.findOne({
          _id:
            ticketId
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
       * POST IS USED FOR STAFF REPLIES
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
          _id:
            ticketId
        });


      if (!ticket) {

        return res.status(404).json({
          success: false,
          error:
            "Support ticket not found."
        });

      }


      /*
      ========================================
      STAFF REPLY
      ========================================
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
      ========================================
      BUILD UPDATE
      ========================================
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
      ========================================
      AUTO-ASSIGN
      ========================================
      */

      let automaticallyAssigned =
        false;


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

        automaticallyAssigned =
          true;

      }


      /*
      ========================================
      OPEN → PENDING
      ========================================
      */

      let automaticallyChangedStatus =
        false;


      if (
        ticket.status ===
        "open"
      ) {

        update.$set.status =
          "pending";

        automaticallyChangedStatus =
          true;

      }


      /*
      ========================================
      UPDATE
      ========================================
      */

      await tickets.updateOne(
        {
          _id:
            ticketId
        },
        update
      );


      /*
      ========================================
      AUDIT — REPLY
      ========================================
      */

      await createAuditLog({

        staff,

        action:
          "support_reply",

        targetType:
          "support_ticket",

        targetId:
          ticketId,

        details: {

          replyId:
            reply.id

        }

      });


      /*
      ========================================
      AUDIT — AUTO ASSIGNMENT
      ========================================
      */

      if (
        automaticallyAssigned
      ) {

        await createAuditLog({

          staff,

          action:
            "support_assigned",

          targetType:
            "support_ticket",

          targetId:
            ticketId,

          details: {

            previousAssignment:
              null,

            newAssignment:
              update.$set.assignedTo,

            reason:
              "automatic_reply_assignment"

          }

        });

      }


      /*
      ========================================
      AUDIT — AUTO STATUS
      ========================================
      */

      if (
        automaticallyChangedStatus
      ) {

        await createAuditLog({

          staff,

          action:
            "support_status_changed",

          targetType:
            "support_ticket",

          targetId:
            ticketId,

          details: {

            oldStatus:
              "open",

            newStatus:
              "pending",

            reason:
              "staff_reply"

          }

        });

      }


      const updatedTicket =
        await tickets.findOne({
          _id:
            ticketId
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
       * Only the owner can permanently
       * delete support tickets.
       */

      if (
        staff.role !==
        "owner"
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


      /*
      ------------------------------------------
      GET TICKET BEFORE DELETING
      ------------------------------------------
      */

      const ticket =
        await tickets.findOne({
          _id:
            ticketId
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
      DELETE
      ------------------------------------------
      */

      const result =
        await tickets.deleteOne({
          _id:
            ticketId
        });


      if (
        result.deletedCount ===
        0
      ) {

        return res.status(404).json({
          success: false,
          error:
            "Support ticket not found."
        });

      }


      /*
      ========================================
      AUDIT — DELETE
      ========================================
      */

      await createAuditLog({

        staff,

        action:
          "support_deleted",

        targetType:
          "support_ticket",

        targetId:
          ticketId,

        details: {

          subject:
            ticket.subject ||
            null,

          userId:
            ticket.userId ||
            null,

          username:
            ticket.username ||
            null,

          status:
            ticket.status ||
            null,

          category:
            ticket.category ||
            null

        }

      });


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
