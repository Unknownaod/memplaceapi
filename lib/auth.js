
import { getDb } from "./mongodb.js";

/* ==========================================
   GET COOKIE
========================================== */

export function getCookie(req, name) {
  const cookieHeader = req.headers.cookie || "";

  const cookies = cookieHeader.split(";");

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) continue;

    const key = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return null;
      }
    }
  }

  return null;
}

/* ==========================================
   GET AUTHENTICATED USER
========================================== */

export async function getAuthenticatedUser(req) {
  try {
    // Get session cookie
    const sessionId = getCookie(req, "mem_session");

    if (!sessionId) {
      return null;
    }

    const db = await getDb();

    /* ==========================================
       FIND SESSION
    ========================================== */

    const session = await db.collection("sessions").findOne({
      _id: sessionId
    });

    if (!session) {
      return null;
    }

    /* ==========================================
       CHECK EXPIRATION
    ========================================== */

    if (
      !session.expiresAt ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      await db.collection("sessions").deleteOne({
        _id: sessionId
      });

      return null;
    }

    /* ==========================================
       FIND USER
    ========================================== */

    const user = await db.collection("users").findOne({
      _id: session.userId
    });

    if (!user) {
      return null;
    }

    return user;

  } catch (error) {
    console.error("GET AUTHENTICATED USER ERROR:", error);
    throw error;
  }
}
