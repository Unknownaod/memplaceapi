import { getDb } from "./mongodb.js";


/* ==========================================
   GET COOKIE
========================================== */

export function getCookie(req, name) {

  const cookieHeader = req.headers.cookie || "";

  const cookies = cookieHeader
    .split(";")
    .map(cookie => cookie.trim());

  for (const cookie of cookies) {

    const separator =
      cookie.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key =
      cookie.slice(0, separator);

    const value =
      cookie.slice(separator + 1);

    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return null;
}


/* ==========================================
   GET AUTHENTICATED USER
========================================== */

export async function getAuthenticatedUser(req) {

  const sessionId =
    getCookie(req, "mem_session");

  if (!sessionId) {
    return null;
  }

  const db =
    await getDb();


  /* ==========================================
     FIND SESSION
  ========================================== */

  const session =
    await db.collection("sessions").findOne({
      _id: sessionId
    });

  if (!session) {
    return null;
  }


  /* ==========================================
     CHECK EXPIRATION
  ========================================== */

  if (
    session.expiresAt &&
    new Date(session.expiresAt) <= new Date()
  ) {

    await db.collection("sessions").deleteOne({
      _id: sessionId
    });

    return null;
  }


  /* ==========================================
     FIND USER
  ========================================== */

  const user =
    await db.collection("users").findOne({
      _id: session.userId
    });

  if (!user) {
    return null;
  }

  return user;
}
