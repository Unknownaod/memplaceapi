import { setCors } from "../../lib/cors.js";
import {
  getStaffMember,
  getRolePermissions
} from "../../lib/staff.js";

export default async function handler(req, res) {

  if (setCors(req, res)) {
    return;
  }

  if (req.method !== "GET") {

    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });

  }

  try {

    const staff =
      await getStaffMember(req);


    if (!staff) {

      return res.status(403).json({
        success: false,
        staff: false,
        error: "Staff access required."
      });

    }


    return res.status(200).json({

      success: true,

      staff: true,

      user: {

        id: staff._id,

        username:
          staff.username,

        discordUsername:
          staff.discordUsername

      },

      role:
        staff.role,

      permissions:
        getRolePermissions(
          staff.role
        )

    });

  } catch (error) {

    console.error(
      "ADMIN ME ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      error:
        "Internal server error."

    });

  }

}
