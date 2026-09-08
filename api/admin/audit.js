import { setCors } from "../../lib/cors.js";
import {
  getStaffMember,
  getRoleLevel
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";


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
    AUDIT LOGS ARE MANAGER+
    ==========================================
    */

    if (
      getRoleLevel(staff.role) <
      getRoleLevel("manager")
    ) {

      return res.status(403).json({
        success: false,
        error:
          "Only managers and owners can access audit logs."
      });

    }


    /*
    ==========================================
    DATABASE
    ==========================================
    */

    const db =
      await getDb();


    const logs =
      db.collection(
        "staff_audit_logs"
      );


    /*
    ==========================================
    GET
    ==========================================
    */

    if (req.method === "GET") {

      const {
        action,
        staffId,
        targetType,
        targetId,
        search,
        limit,
        before
      } = req.query || {};


      /*
      ------------------------------------------
      BUILD QUERY
      ------------------------------------------
      */

      const query = {};


      /*
      ACTION FILTER
      */

      if (
        typeof action === "string" &&
        action.trim()
      ) {

        query.action =
          action.trim();

      }


      /*
      STAFF FILTER
      */

      if (
        typeof staffId === "string" &&
        staffId.trim()
      ) {

        query.staffId =
          staffId.trim();

      }


      /*
      TARGET TYPE
      */

      if (
        typeof targetType === "string" &&
        targetType.trim()
      ) {

        query.targetType =
          targetType.trim();

      }


      /*
      TARGET ID
      */

      if (
        typeof targetId === "string" &&
        targetId.trim()
      ) {

        query.targetId =
          targetId.trim();

      }


      /*
      SEARCH
      */

      if (
        typeof search === "string" &&
        search.trim()
      ) {

        const searchValue =
          search.trim();

        query.$or = [

          {
            staffUsername: {
              $regex:
                searchValue,
              $options:
                "i"
            }
          },

          {
            staffId: {
              $regex:
                searchValue,
              $options:
                "i"
            }
          },

          {
            targetId: {
              $regex:
                searchValue,
              $options:
                "i"
            }
          },

          {
            action: {
              $regex:
                searchValue,
              $options:
                "i"
            }
          }

        ];

      }


      /*
      PAGINATION
      */

      if (
        typeof before === "string" &&
        before.trim()
      ) {

        const beforeDate =
          new Date(
            before
          );


        if (
          !Number.isNaN(
            beforeDate.getTime()
          )
        ) {

          query.createdAt = {
            $lt:
              beforeDate
          };

        }

      }


      /*
      LIMIT
      */

      let requestedLimit =
        Number(limit);


      if (
        !Number.isInteger(
          requestedLimit
        ) ||
        requestedLimit < 1
      ) {

        requestedLimit =
          100;

      }


      requestedLimit =
        Math.min(
          requestedLimit,
          250
        );


      /*
      ------------------------------------------
      FETCH
      ------------------------------------------
      */

      const auditLogs =
        await logs
          .find(query)
          .sort({
            createdAt: -1
          })
          .limit(
            requestedLimit
          )
          .toArray();


      return res.status(200).json({

        success: true,

        logs:
          auditLogs

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
      "ADMIN AUDIT ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        "Internal server error."

    });

  }

}
