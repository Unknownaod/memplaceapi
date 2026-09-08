import { setCors } from "../lib/cors.js";
import { getAuthenticatedUser } from "../lib/auth.js";
import { getDb } from "../lib/mongodb.js";

const PAGE_SIZE = 25;

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
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({
        success: false,
        authenticated: false,
        history: []
      });
    }

    const db = await getDb();

    const requestedPage =
      Number.parseInt(req.query?.page || "1", 10);

    const page =
      Number.isInteger(requestedPage) &&
      requestedPage > 0
        ? requestedPage
        : 1;

    const skip =
      (page - 1) * PAGE_SIZE;

    /*
      ------------------------------------------------
      DICE
      ------------------------------------------------
    */

    const dice = await db
      .collection("dice_games")
      .find({
        userId: user._id
      })
      .sort({
        createdAt: -1
      })
      .toArray();

    /*
      ------------------------------------------------
      TRIVIA
      ------------------------------------------------
    */

    const trivia = await db
      .collection("trivia_games")
      .find({
        userId: user._id
      })
      .sort({
        createdAt: -1
      })
      .toArray();

    /*
      ------------------------------------------------
      DAILY REWARDS
      ------------------------------------------------
    */

    const daily = await db
      .collection("daily_transactions")
      .find({
        userId: user._id
      })
      .sort({
        claimedAt: -1
      })
      .toArray();

    /*
      ------------------------------------------------
      SHOP
      ------------------------------------------------
    */

    const shop = await db
      .collection("shop_transactions")
      .find({
        userId: user._id
      })
      .sort({
        purchasedAt: -1
      })
      .toArray();

    /*
      ------------------------------------------------
      DUELS
      ------------------------------------------------

      Duel documents can contain different fields
      depending on whether the user created or joined
      the duel, so we normalize them below.
    */

    const duels = await db
      .collection("duels")
      .find({
        $or: [
          {
            creatorId: user._id
          },
          {
            challengerId: user._id
          },
          {
            opponentId: user._id
          }
        ]
      })
      .sort({
        createdAt: -1
      })
      .toArray();

    /*
      ------------------------------------------------
      CHESS
      ------------------------------------------------
    */

    const chess = await db
      .collection("chess_games")
      .find({
        $or: [
          {
            whitePlayerId: user._id
          },
          {
            blackPlayerId: user._id
          },
          {
            whiteId: user._id
          },
          {
            blackId: user._id
          }
        ]
      })
      .sort({
        createdAt: -1
      })
      .toArray();

    /*
      ------------------------------------------------
      BLACKJACK
      ------------------------------------------------

      Blackjack games use the existing blackjack
      collection when available.
    */

    const blackjack = await db
      .collection("blackjack_games")
      .find({
        userId: user._id
      })
      .sort({
        createdAt: -1
      })
      .toArray();


    const history = [];


    /* ==========================================
       DICE
    ========================================== */

    for (const game of dice) {

      const won =
        game.won === true;

      const payout =
        Number(game.payout || 0);

      const wager =
        Number(game.wager || 0);

      history.push({
        type: "game",
        game: "Dice",
        icon: "🎲",

        result:
          game.status === "active"
            ? "Active"
            : won
              ? "Won"
              : "Lost",

        amount:
          won
            ? payout - wager
            : -wager,

        wager,

        timestamp:
          game.settledAt ||
          game.createdAt,

        details:
          game.roll !== undefined
            ? `Rolled ${game.roll}`
            : "Dice game"
      });

    }


    /* ==========================================
       TRIVIA
    ========================================== */

    for (const game of trivia) {

      const reward =
        Number(game.reward || 0);

      let amount = 0;

      let result =
        "Incorrect";

      if (game.result === "correct") {

        amount =
          reward;

        result =
          "Correct";

      } else if (
        game.result === "timeout"
      ) {

        result =
          "Timed Out";

      }

      history.push({
        type: "game",
        game: "Trivia",
        icon: "🧠",
        result,
        amount,
        wager: 0,

        timestamp:
          game.answeredAt ||
          game.createdAt,

        details:
          game.streak
            ? `Streak: ${game.streak}`
            : "Trivia question"
      });

    }


    /* ==========================================
       DAILY
    ========================================== */

    for (const reward of daily) {

      const amount =
        Number(
          reward.amount || 0
        );

      history.push({
        type: "daily",
        game: "Daily Reward",
        icon: "🎁",
        result: "Claimed",
        amount,
        wager: 0,

        timestamp:
          reward.claimedAt,

        details:
          reward.streak
            ? `Streak: ${reward.streak}`
            : "Daily reward"
      });

    }


    /* ==========================================
       SHOP
    ========================================== */

    for (const purchase of shop) {

      const price =
        Number(
          purchase.price || 0
        );

      history.push({
        type: "shop",
        game: "Shop",
        icon: "🛒",
        result: "Purchased",
        amount: -price,
        wager: 0,

        timestamp:
          purchase.purchasedAt,

        details:
          purchase.itemName ||
          "Shop item"
      });

    }


    /* ==========================================
       DUELS
    ========================================== */

    for (const duel of duels) {

      const creatorId =
        duel.creatorId ||
        duel.createdBy ||
        null;

      const opponentId =
        duel.opponentId ||
        duel.challengerId ||
        duel.joinedBy ||
        null;

      const isCreator =
        creatorId === user._id;

      let result =
        duel.status || "Unknown";

      let amount = 0;

      const wager =
        Number(
          duel.wager ||
          duel.amount ||
          0
        );

      if (
        duel.winnerId ||
        duel.winner
      ) {

        const winnerId =
          duel.winnerId ||
          duel.winner;

        if (
          winnerId === user._id
        ) {

          result = "Won";

          amount =
            Number(
              duel.payout ||
              wager * 2 ||
              0
            ) - wager;

        } else {

          result = "Lost";

          amount =
            -wager;

        }

      } else if (
        duel.status === "cancelled" ||
        duel.status === "canceled"
      ) {

        result = "Cancelled";

      }

      history.push({
        type: "game",
        game: "Duel",
        icon: "⚔️",
        result,
        amount,
        wager,

        timestamp:
          duel.completedAt ||
          duel.settledAt ||
          duel.updatedAt ||
          duel.createdAt,

        details:
          isCreator
            ? "Created duel"
            : opponentId
              ? "Joined duel"
              : "Duel"
      });

    }


    /* ==========================================
       CHESS
    ========================================== */

    for (const game of chess) {

      const whiteId =
        game.whitePlayerId ||
        game.whiteId ||
        null;

      const blackId =
        game.blackPlayerId ||
        game.blackId ||
        null;

      const isWhite =
        whiteId === user._id;

      let result =
        "In Progress";

      let amount = 0;

      const wager =
        Number(
          game.wager || 0
        );

      const gameResult =
        game.result ||
        game.winner ||
        null;

      if (gameResult) {

        if (
          gameResult === "draw"
        ) {

          result = "Draw";

          amount = 0;

        } else {

          const won =
            (
              gameResult === "white" &&
              isWhite
            ) ||
            (
              gameResult === "black" &&
              !isWhite
            );

          if (won) {

            result = "Won";

            amount =
              Number(
                game.payout ||
                wager * 2 ||
                0
              ) - wager;

          } else {

            result = "Lost";

            amount =
              -wager;

          }

        }

      } else if (
        game.status === "completed"
      ) {

        result = "Completed";

      }

      history.push({
        type: "game",
        game: "Chess",
        icon: "♟",
        result,
        amount,
        wager,

        timestamp:
          game.completedAt ||
          game.settledAt ||
          game.updatedAt ||
          game.createdAt,

        details:
          isWhite
            ? "Played as White"
            : "Played as Black"
      });

    }


    /* ==========================================
       BLACKJACK
    ========================================== */

    for (const game of blackjack) {

      const wager =
        Number(
          game.wager || 0
        );

      const payout =
        Number(
          game.payout || 0
        );

      let result =
        game.result ||
        game.status ||
        "Completed";

      let amount = 0;

      if (
        game.result === "win" ||
        game.result === "won"
      ) {

        result = "Won";

        amount =
          payout - wager;

      } else if (
        game.result === "loss" ||
        game.result === "lost"
      ) {

        result = "Lost";

        amount =
          -wager;

      } else if (
        game.result === "push" ||
        game.result === "draw"
      ) {

        result = "Push";

        amount = 0;

      }

      history.push({
        type: "game",
        game: "Blackjack",
        icon: "🃏",
        result,
        amount,
        wager,

        timestamp:
          game.settledAt ||
          game.completedAt ||
          game.updatedAt ||
          game.createdAt,

        details:
          "Blackjack game"
      });

    }


    /* ==========================================
       SORT
    ========================================== */

    history.sort(
      (a, b) => {

        const aTime =
          a.timestamp
            ? new Date(a.timestamp).getTime()
            : 0;

        const bTime =
          b.timestamp
            ? new Date(b.timestamp).getTime()
            : 0;

        return bTime - aTime;
      }
    );


    const total =
      history.length;

    const paginated =
      history.slice(
        skip,
        skip + PAGE_SIZE
      );

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total / PAGE_SIZE
        )
      );


    return res.status(200).json({
      success: true,

      page,

      pageSize:
        PAGE_SIZE,

      total,

      totalPages,

      hasNextPage:
        page < totalPages,

      hasPreviousPage:
        page > 1,

      history:
        paginated
    });

  } catch (error) {

    console.error(
      "HISTORY ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}
