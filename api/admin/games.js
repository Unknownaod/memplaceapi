import { setCors } from "../../lib/cors.js";
import {
  requireStaff,
  hasPermission
} from "../../lib/staff.js";
import { getDb } from "../../lib/mongodb.js";

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
    const staff = await requireStaff(
      req,
      res,
      "games"
    );

    if (!staff) {
      return;
    }

    const db = await getDb();

    const usersCollection =
      db.collection("minigame_users");

    /*
     * ==========================================
     * GLOBAL GAME STATISTICS
     * ==========================================
     */

    const aggregate = await usersCollection
      .aggregate([
        {
          $group: {
            _id: null,

            users: {
              $sum: 1
            },

            gamesPlayed: {
              $sum: {
                $ifNull: [
                  "$gamesPlayed",
                  0
                ]
              }
            },

            gamesWon: {
              $sum: {
                $ifNull: [
                  "$gamesWon",
                  0
                ]
              }
            },

            gamesLost: {
              $sum: {
                $ifNull: [
                  "$gamesLost",
                  0
                ]
              }
            },

            totalWagered: {
              $sum: {
                $ifNull: [
                  "$totalWagered",
                  0
                ]
              }
            },

            totalWon: {
              $sum: {
                $ifNull: [
                  "$totalWon",
                  0
                ]
              }
            },

            totalLost: {
              $sum: {
                $ifNull: [
                  "$totalLost",
                  0
                ]
              }
            }
          }
        }
      ])
      .toArray();

    const stats =
      aggregate[0] || {
        users: 0,
        gamesPlayed: 0,
        gamesWon: 0,
        gamesLost: 0,
        totalWagered: 0,
        totalWon: 0,
        totalLost: 0
      };

    const gamesPlayed =
      Number(stats.gamesPlayed) || 0;

    const gamesWon =
      Number(stats.gamesWon) || 0;

    const gamesLost =
      Number(stats.gamesLost) || 0;

    const totalWagered =
      Number(stats.totalWagered) || 0;

    const totalWon =
      Number(stats.totalWon) || 0;

    const totalLost =
      Number(stats.totalLost) || 0;

    const completedGames =
      gamesWon + gamesLost;

    const winRate =
      completedGames > 0
        ? (gamesWon / completedGames) * 100
        : 0;

    const averageWager =
      gamesPlayed > 0
        ? totalWagered / gamesPlayed
        : 0;

    /*
     * ==========================================
     * GAME CATALOG
     *
     * These are the actual games available
     * in the minigame application.
     * ==========================================
     */

    const games = [
      {
        id: "blackjack",
        name: "Blackjack",
        description:
          "Server-authoritative blackjack with wagers and payouts.",
        route: "/blackjack",
        category: "Casino",
        status: "active"
      },

      {
        id: "dice",
        name: "Dice",
        description:
          "Wager-based dice game with server-side randomization.",
        route: "/dice",
        category: "Casino",
        status: "active"
      },

      {
        id: "slots",
        name: "Slots",
        description:
          "Slot machine game with wager-based payouts.",
        route: "/slots",
        category: "Casino",
        status: "active"
      },

      {
        id: "duels",
        name: "Duels",
        description:
          "Player-versus-player wagered dice duels.",
        route: "/duels",
        category: "PvP",
        status: "active"
      },

      {
        id: "trivia",
        name: "Trivia",
        description:
          "Timed trivia rounds with streak rewards.",
        route: "/trivia",
        category: "Trivia",
        status: "active"
      },

      {
        id: "chess",
        name: "Chess",
        description:
          "Server-managed chess matches with player ratings.",
        route: "/chess",
        category: "Strategy",
        status: "active"
      }
    ];

    /*
     * ==========================================
     * CHESS RATING STATISTICS
     * ==========================================
     */

    const chessRatingAggregate =
      await usersCollection
        .aggregate([
          {
            $match: {
              chessRating: {
                $type: "number"
              }
            }
          },
          {
            $group: {
              _id: null,

              players: {
                $sum: 1
              },

              averageRating: {
                $avg: "$chessRating"
              },

              highestRating: {
                $max: "$chessRating"
              },

              lowestRating: {
                $min: "$chessRating"
              }
            }
          }
        ])
        .toArray();

    const chessStats =
      chessRatingAggregate[0] || {
        players: 0,
        averageRating: 0,
        highestRating: 0,
        lowestRating: 0
      };

    /*
     * ==========================================
     * TOP PLAYERS
     * ==========================================
     */

    const topPlayers =
      await usersCollection
        .find(
          {},
          {
            projection: {
              _id: 1,
              balance: 1,
              gamesPlayed: 1,
              gamesWon: 1,
              gamesLost: 1,
              totalWagered: 1,
              totalWon: 1,
              totalLost: 1,
              chessRating: 1
            }
          }
        )
        .sort({
          gamesPlayed: -1
        })
        .limit(10)
        .toArray();

    /*
     * ==========================================
     * USER PROFILE JOIN
     * ==========================================
     */

    const playerIds =
      topPlayers.map(
        player => player._id
      );

    const profiles =
      playerIds.length
        ? await db
            .collection("users")
            .find(
              {
                _id: {
                  $in: playerIds
                }
              },
              {
                projection: {
                  _id: 1,
                  username: 1,
                  discordUsername: 1,
                  avatar: 1
                }
              }
            )
            .toArray()
        : [];

    const profileMap =
      new Map(
        profiles.map(profile => [
          String(profile._id),
          profile
        ])
      );

    const players =
      topPlayers.map(player => {
        const profile =
          profileMap.get(
            String(player._id)
          );

        return {
          id: player._id,

          username:
            profile?.username ||
            null,

          discordUsername:
            profile?.discordUsername ||
            null,

          avatar:
            profile?.avatar ||
            null,

          balance:
            Number(player.balance) || 0,

          gamesPlayed:
            Number(player.gamesPlayed) || 0,

          gamesWon:
            Number(player.gamesWon) || 0,

          gamesLost:
            Number(player.gamesLost) || 0,

          totalWagered:
            Number(player.totalWagered) || 0,

          totalWon:
            Number(player.totalWon) || 0,

          totalLost:
            Number(player.totalLost) || 0,

          chessRating:
            Number(player.chessRating) || 1200
        };
      });

    /*
     * ==========================================
     * RESPONSE
     * ==========================================
     */

    return res.status(200).json({
      success: true,

      permissions: {
        canView: hasPermission(
          staff,
          "games"
        )
      },

      games,

      stats: {
        users:
          Number(stats.users) || 0,

        gamesPlayed,

        gamesWon,

        gamesLost,

        completedGames,

        winRate:
          Number(winRate.toFixed(2)),

        totalWagered,

        totalWon,

        totalLost,

        averageWager:
          Number(
            averageWager.toFixed(2)
          )
      },

      chess: {
        players:
          Number(chessStats.players) || 0,

        averageRating:
          Number(
            Number(
              chessStats.averageRating
            || 0
            ).toFixed(0)
          ),

        highestRating:
          Number(
            chessStats.highestRating
          ) || 0,

        lowestRating:
          Number(
            chessStats.lowestRating
          ) || 0
      },

      topPlayers
    });

  } catch (error) {
    console.error(
      "ADMIN GAMES ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error."
    });
  }
}
