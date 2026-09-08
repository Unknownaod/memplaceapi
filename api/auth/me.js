import { setCors } from "../../lib/cors.js";
import { getAuthenticatedUser } from "../../lib/auth.js";


export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }


  if (req.method !== "GET") {

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
        user: null
      });
    }


    return res.status(200).json({
      success: true,
      authenticated: true,

      user: {
        id: user._id,
        username: user.username,
        discordUsername: user.discordUsername,
        avatar: user.avatar
      }
    });

  } catch (error) {

    console.error(
      "AUTH ME ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
