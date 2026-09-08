import { setCors } from "../../lib/cors.js";
import { getCookie } from "../../lib/auth.js";
import { getDb } from "../../lib/mongodb.js";


export default async function handler(req, res) {

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

    /* ==========================================
       GET SESSION COOKIE
    ========================================== */

    const sessionId =
      getCookie(req, "mem_session");


    /* ==========================================
       DELETE SESSION
    ========================================== */

    if (sessionId) {

      const db =
        await getDb();

      await db.collection("sessions").deleteOne({
        _id: sessionId
      });
    }


    /* ==========================================
       CLEAR COOKIE
    ========================================== */

    res.setHeader(
      "Set-Cookie",
      [
        "mem_session=",
        "Domain=.memplace.xyz",
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=0"
      ].join("; ")
    );


    /* ==========================================
       RESPONSE
    ========================================== */

    return res.status(200).json({
      success: true,
      authenticated: false
    });


  } catch (error) {

    console.error(
      "LOGOUT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Logout failed"
    });
  }
}
