import { setCors } from "../lib/cors.js";
import { getAuthenticatedUser } from "../lib/auth.js";
import { getDb } from "../lib/mongodb.js";
import { randomUUID } from "crypto";


const MAX_SUBJECT_LENGTH = 120;
const MAX_MESSAGE_LENGTH = 4000;

const VALID_CATEGORIES = [
  "General",
  "Account",
  "Games",
  "Payments / Economy",
  "Bug Report",
  "Other"
];


export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }


  /* ==========================================
     AUTHENTICATION
  ========================================== */

  const user =
    await getAuthenticatedUser(req);


  if (!user) {

    return res.status(401).json({
      success: false,
      authenticated: false,
      error: "You must be logged in."
    });

  }


  try {

    const db =
      await getDb();


    /* ==========================================
       GET USER TICKETS
    ========================================== */

    if (req.method === "GET") {

      const tickets =
        await db
          .collection("support_tickets")
          .find({
            userId: user._id
          })
          .sort({
            createdAt: -1
          })
          .limit(50)
          .toArray();


      return res.status(200).json({
        success: true,

        tickets:
          tickets.map(ticket => ({
            id: ticket._id,
            subject: ticket.subject,
            category: ticket.category,
            message: ticket.message,
            status: ticket.status,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt
          }))
      });

    }


    /* ==========================================
       CREATE TICKET
    ========================================== */

    if (req.method === "POST") {

      const body =
        req.body || {};


      const subject =
        typeof body.subject === "string"
          ? body.subject.trim()
          : "";


      const category =
        typeof body.category === "string"
          ? body.category.trim()
          : "";


      const message =
        typeof body.message === "string"
          ? body.message.trim()
          : "";


      /* ==========================================
         VALIDATION
      ========================================== */

      if (!subject) {

        return res.status(400).json({
          success: false,
          error: "Subject is required."
        });

      }


      if (
        subject.length >
        MAX_SUBJECT_LENGTH
      ) {

        return res.status(400).json({
          success: false,
          error:
            `Subject must be ${MAX_SUBJECT_LENGTH} characters or less.`
        });

      }


      if (
        !VALID_CATEGORIES.includes(
          category
        )
      ) {

        return res.status(400).json({
          success: false,
          error: "Invalid support category."
        });

      }


      if (!message) {

        return res.status(400).json({
          success: false,
          error: "Message is required."
        });

      }


      if (
        message.length >
        MAX_MESSAGE_LENGTH
      ) {

        return res.status(400).json({
          success: false,
          error:
            `Message must be ${MAX_MESSAGE_LENGTH} characters or less.`
        });

      }


      /* ==========================================
         BASIC SPAM PROTECTION
      ========================================== */

      const recentTicket =
        await db
          .collection("support_tickets")
          .findOne(
            {
              userId: user._id,

              createdAt: {
                $gte:
                  new Date(
                    Date.now() -
                    60 * 1000
                  )
              }
            },
            {
              sort: {
                createdAt: -1
              }
            }
          );


      if (recentTicket) {

        return res.status(429).json({
          success: false,
          error:
            "Please wait a minute before opening another ticket."
        });

      }


      /* ==========================================
         CREATE TICKET
      ========================================== */

      const now =
        new Date();


      const ticket = {

        _id:
          randomUUID(),

        userId:
          user._id,

        username:
          user.username ||
          null,

        discordUsername:
          user.discordUsername ||
          null,

        category,

        subject,

        message,

        status:
          "open",

        createdAt:
          now,

        updatedAt:
          now

      };


      await db
        .collection("support_tickets")
        .insertOne(
          ticket
        );


      return res.status(201).json({

        success: true,

        ticket: {
          id: ticket._id,
          subject: ticket.subject,
          category: ticket.category,
          status: ticket.status,
          createdAt: ticket.createdAt
        }

      });

    }


    /* ==========================================
       METHOD NOT ALLOWED
    ========================================== */

    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });


  } catch (error) {

    console.error(
      "SUPPORT ERROR:",
      error
    );


    return res.status(500).json({
      success: false,
      error: "Internal server error."
    });

  }

}
