import crypto from "crypto";
import { getDb } from "../../lib/mongodb.js";


export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }


  try {

    const { code, error } = req.query;


    /* ==========================================
       DISCORD ERROR
    ========================================== */

    if (error) {

      return res.redirect(
        "https://minigames.memplace.xyz/?discord=denied"
      );
    }


    /* ==========================================
       CHECK CODE
    ========================================== */

    if (!code) {

      return res.status(400).json({
        success: false,
        error: "Missing authorization code"
      });
    }


    /* ==========================================
       DISCORD CONFIG
    ========================================== */

    const clientId =
      process.env.DISCORD_CLIENT_ID;

    const clientSecret =
      process.env.DISCORD_CLIENT_SECRET;

    const redirectUri =
      process.env.DISCORD_REDIRECT_URI;


    if (
      !clientId ||
      !clientSecret ||
      !redirectUri
    ) {

      return res.status(500).json({
        success: false,
        error: "Discord OAuth is not configured"
      });
    }


    /* ==========================================
       EXCHANGE CODE FOR TOKEN
    ========================================== */

    const tokenResponse =
      await fetch(
        "https://discord.com/api/oauth2/token",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded"
          },

          body:
            new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri
            })
        }
      );


    if (!tokenResponse.ok) {

      const tokenError =
        await tokenResponse.text();

      console.error(
        "DISCORD TOKEN ERROR:",
        tokenError
      );

      return res.status(500).json({
        success: false,
        error: "Failed to authenticate with Discord",
        details: tokenError
      });
    }


    const tokenData =
      await tokenResponse.json();


    /* ==========================================
       GET DISCORD USER
    ========================================== */

    const discordResponse =
      await fetch(
        "https://discord.com/api/users/@me",
        {
          headers: {
            Authorization:
              `Bearer ${tokenData.access_token}`
          }
        }
      );


    if (!discordResponse.ok) {

      const discordError =
        await discordResponse.text();

      console.error(
        "DISCORD USER ERROR:",
        discordError
      );

      return res.status(500).json({
        success: false,
        error: "Failed to retrieve Discord user",
        details: discordError
      });
    }


    const discordUser =
      await discordResponse.json();


    /* ==========================================
       MONGODB
    ========================================== */

    const db =
      await getDb();


    const now =
      new Date();


    /* ==========================================
       FIND EXISTING USER
    ========================================== */

    const existingUser =
      await db.collection("users").findOne({
        _id: discordUser.id
      });


    /* ==========================================
       CREATE / UPDATE USER
    ========================================== */

    if (existingUser) {

      await db.collection("users").updateOne(
        {
          _id: discordUser.id
        },
        {
          $set: {

            username:
              discordUser.username,

            discordUsername:
              discordUser.username,

            avatar:
              discordUser.avatar,

            updatedAt:
              now
          }
        }
      );

    } else {

      await db.collection("users").insertOne({

        _id:
          discordUser.id,

        username:
          discordUser.username,

        discordUsername:
          discordUser.username,

        avatar:
          discordUser.avatar,

        createdAt:
          now,

        updatedAt:
          now
      });
    }


    /* ==========================================
       CREATE SESSION
    ========================================== */

    const sessionId =
      crypto.randomBytes(32).toString("hex");


    const expiresAt =
      new Date(
        Date.now() +
        30 * 24 * 60 * 60 * 1000
      );


    await db.collection("sessions").insertOne({

      _id:
        sessionId,

      userId:
        discordUser.id,

      createdAt:
        now,

      expiresAt
    });


    /* ==========================================
       SET SESSION COOKIE
    ========================================== */

    res.setHeader(
      "Set-Cookie",
      [
        `mem_session=${encodeURIComponent(sessionId)}`,
        "Path=/",
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=2592000"
      ].join("; ")
    );


    /* ==========================================
       REDIRECT BACK TO MINIGAMES
    ========================================== */

    return res.redirect(
      "https://minigames.memplace.xyz/?discord=connected"
    );


  } catch (error) {

    console.error(
      "DISCORD CALLBACK ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Authentication failed",
      details:
        error?.message ||
        String(error)
    });
  }
}
