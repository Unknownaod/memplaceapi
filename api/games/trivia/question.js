import crypto from "crypto";

import { setCors } from "../../../lib/cors.js";
import { getAuthenticatedUser } from "../../../lib/auth.js";
import { getDb } from "../../../lib/mongodb.js";


/* ==========================================
   TRIVIA QUESTIONS
========================================== */

const QUESTIONS = [
  {
    id: "q1",
    question: "What is the capital city of Jordan?",
    choices: [
      "Amman",
      "Beirut",
      "Damascus",
      "Baghdad"
    ],
    answer: 0
  },

  {
    id: "q2",
    question: "Which country is home to the city of Dubai?",
    choices: [
      "Qatar",
      "United Arab Emirates",
      "Bahrain",
      "Oman"
    ],
    answer: 1
  },

  {
    id: "q3",
    question: "What is the capital of Lebanon?",
    choices: [
      "Tripoli",
      "Sidon",
      "Beirut",
      "Tyre"
    ],
    answer: 2
  },

  {
    id: "q4",
    question: "Which sea lies between the Arabian Peninsula and Africa?",
    choices: [
      "Mediterranean Sea",
      "Red Sea",
      "Black Sea",
      "Caspian Sea"
    ],
    answer: 1
  },

  {
    id: "q5",
    question: "What is the capital of Egypt?",
    choices: [
      "Alexandria",
      "Giza",
      "Luxor",
      "Cairo"
    ],
    answer: 3
  },

  {
    id: "q6",
    question: "Which country has Baghdad as its capital?",
    choices: [
      "Iraq",
      "Iran",
      "Syria",
      "Kuwait"
    ],
    answer: 0
  },

  {
    id: "q7",
    question: "What is the capital of Syria?",
    choices: [
      "Aleppo",
      "Homs",
      "Damascus",
      "Latakia"
    ],
    answer: 2
  },

  {
    id: "q8",
    question: "Which country is famous for the ancient city of Petra?",
    choices: [
      "Jordan",
      "Lebanon",
      "Egypt",
      "Saudi Arabia"
    ],
    answer: 0
  },

  {
    id: "q9",
    question: "What is the capital of Saudi Arabia?",
    choices: [
      "Jeddah",
      "Riyadh",
      "Mecca",
      "Medina"
    ],
    answer: 1
  },

  {
    id: "q10",
    question: "Which country has Doha as its capital?",
    choices: [
      "Kuwait",
      "Qatar",
      "Bahrain",
      "Oman"
    ],
    answer: 1
  },

  {
    id: "q11",
    question: "What is the capital of Iraq?",
    choices: [
      "Basra",
      "Erbil",
      "Baghdad",
      "Mosul"
    ],
    answer: 2
  },

  {
    id: "q12",
    question: "Which country has Muscat as its capital?",
    choices: [
      "Oman",
      "Yemen",
      "Bahrain",
      "Qatar"
    ],
    answer: 0
  }
];


/* ==========================================
   CONFIG
========================================== */

const QUESTION_TIME =
  15;


/* ==========================================
   HANDLER
========================================== */

export default async function handler(
  req,
  res
) {

  if (setCors(req, res)) {
    return;
  }


  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });

  }


  try {

    const user =
      await getAuthenticatedUser(req);


    if (!user) {

      return res.status(401).json({
        success: false,
        authenticated: false,
        error: "Not authenticated"
      });

    }


    const db =
      await getDb();


    /*
      Make sure the player has a
      minigame account.
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
        error: "Minigame account not found"
      });

    }


    /*
      Pick a random question.
    */

    const index =
      crypto.randomInt(
        0,
        QUESTIONS.length
      );

    const question =
      QUESTIONS[index];


    /*
      Create a unique round ID.
    */

    const roundId =
      crypto.randomBytes(24)
        .toString("hex");


    const now =
      new Date();

    const expiresAt =
      new Date(
        now.getTime() +
        QUESTION_TIME * 1000
      );


    /*
      Store the round server-side.

      IMPORTANT:
      The correct answer is stored
      here but NEVER returned to
      the browser.
    */

    await db
      .collection("trivia_games")
      .insertOne({

        _id: roundId,

        userId:
          user._id,

        questionId:
          question.id,

        correctAnswer:
          question.answer,

        choices:
          question.choices,

        status:
          "active",

        streak:
          minigameUser.triviaStreak || 0,

        createdAt:
          now,

        expiresAt,

        answeredAt:
          null,

        result:
          null,

        reward:
          0
      });


    /*
      Only return safe information.
    */

    return res.status(200).json({

      success: true,

      game: "trivia",

      roundId,

      question: {
        text:
          question.question,

        choices:
          question.choices
      },

      expiresAt:
        expiresAt.toISOString(),

      timeLimit:
        QUESTION_TIME,

      streak:
        minigameUser.triviaStreak || 0

    });

  } catch (error) {

    console.error(
      "TRIVIA QUESTION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });

  }
}
