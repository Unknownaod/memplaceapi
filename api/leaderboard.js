import { setCors } from "../lib/cors.js";
import { getDb } from "../lib/mongodb.js";

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

    const db =
      await getDb();


    /*
     * ==========================================
     * GET TOP USERS
     * ==========================================
     */

    const users =
      await db
        .collection("minigame_users")
        .find({})
        .sort({
          balance: -1
        })
        .limit(100)
        .toArray();


    const userIds =
      users.map(
        user => user._id
      );


    /*
     * ==========================================
     * GET ACCOUNT INFORMATION
     * ==========================================
     */

    const accounts =
      await db
        .collection("users")
        .find({
          _id: {
            $in: userIds
          }
        })
        .project({
          username: 1,
          discordUsername: 1,
          avatar: 1
        })
        .toArray();


    const accountMap =
      new Map(
        accounts.map(
          account => [
            account._id,
            account
          ]
        )
      );


    /*
     * ==========================================
     * GET STAFF INFORMATION
     *
     * Any user with a record in staff_users
     * is considered staff.
     * ==========================================
     */

    const staffUsers =
      await db
        .collection("staff_users")
        .find({
          _id: {
            $in: userIds
          }
        })
        .project({
          role: 1
        })
        .toArray();


    const staffMap =
      new Map(
        staffUsers.map(
          staff => [
            staff._id,
            staff
          ]
        )
      );


    /*
     * ==========================================
     * BUILD LEADERBOARD
     * ==========================================
     */

    const leaderboard =
      users.map(
        (user, index) => {

          const account =
            accountMap.get(
              user._id
            );


          const staff =
            staffMap.get(
              user._id
            );


          return {

            rank:
              index + 1,


            id:
              user._id,


            username:
              account?.username ||
              account?.discordUsername ||
              "Unknown User",


            discordUsername:
              account?.discordUsername ||
              null,


            avatar:
              account?.avatar ||
              null,


            /*
             * Staff badge information
             */

            isStaff:
              !!staff,


            staffRole:
              staff?.role ||
              null,


            balance:
              Number(
                user.balance || 0
              ),


            gamesPlayed:
              Number(
                user.gamesPlayed || 0
              ),


            gamesWon:
              Number(
                user.gamesWon || 0
              ),


            gamesLost:
              Number(
                user.gamesLost || 0
              ),


            chessRating:
              Number(
                user.chessRating || 1200
              )

          };

        }
      );


    /*
     * ==========================================
     * RESPONSE
     * ==========================================
     */

    return res.status(200).json({

      success: true,

      leaderboard

    });


  } catch (error) {

    console.error(
      "LEADERBOARD ERROR:",
      error
    );


    return res.status(500).json({

      success: false,

      error:
        "Internal server error"

    });

  }

}
