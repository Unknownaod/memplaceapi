import { Chess } from "chess.js";

/*
==========================================
CHESS CONSTANTS
==========================================
*/

export const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export const MIN_WAGER = 10;
export const MAX_WAGER = 10000;


/*
==========================================
CREATE CHESS BOARD
==========================================
*/

export function createChessGame() {
  return new Chess(STARTING_FEN);
}


/*
==========================================
LOAD CHESS GAME FROM FEN
==========================================
*/

export function loadChessGame(fen) {
  if (
    typeof fen !== "string" ||
    !fen.trim()
  ) {
    throw new Error("Invalid chess position.");
  }

  return new Chess(fen);
}


/*
==========================================
VALIDATE WAGER
==========================================
*/

export function isValidChessWager(wager) {
  return (
    Number.isInteger(wager) &&
    wager >= MIN_WAGER &&
    wager <= MAX_WAGER
  );
}


/*
==========================================
VALIDATE SQUARE
==========================================
*/

export function isValidSquare(square) {
  return (
    typeof square === "string" &&
    /^[a-h][1-8]$/.test(square)
  );
}


/*
==========================================
VALIDATE PROMOTION
==========================================
*/

export function isValidPromotion(promotion) {
  if (promotion === undefined || promotion === null) {
    return true;
  }

  return ["q", "r", "b", "n"].includes(
    String(promotion).toLowerCase()
  );
}


/*
==========================================
GET GAME STATUS
==========================================
*/

export function getChessStatus(chess) {
  const isCheckmate = chess.isCheckmate();
  const isStalemate = chess.isStalemate();
  const isThreefold = chess.isThreefoldRepetition();
  const isInsufficient =
    chess.isInsufficientMaterial();

  const isDraw =
    isStalemate ||
    isThreefold ||
    isInsufficient;

  const isGameOver =
    isCheckmate ||
    isDraw;

  let result = null;

  if (isCheckmate) {
    result =
      chess.turn() === "w"
        ? "black"
        : "white";
  } else if (isDraw) {
    result = "draw";
  }

  return {
    isGameOver,
    isCheck: chess.isCheck(),
    isCheckmate,
    isStalemate,
    isThreefoldRepetition: isThreefold,
    isInsufficientMaterial: isInsufficient,
    result,
    turn: chess.turn(),
    fen: chess.fen()
  };
}


/*
==========================================
MAKE MOVE
==========================================
*/

export function makeChessMove(
  chess,
  from,
  to,
  promotion
) {
  if (!isValidSquare(from)) {
    throw new Error("Invalid source square.");
  }

  if (!isValidSquare(to)) {
    throw new Error("Invalid destination square.");
  }

  if (!isValidPromotion(promotion)) {
    throw new Error("Invalid promotion piece.");
  }

  const move = {
    from,
    to
  };

  if (promotion) {
    move.promotion =
      String(promotion).toLowerCase();
  }

  return chess.move(move);
}


/*
==========================================
GET LEGAL MOVES
==========================================
*/

export function getLegalMoves(
  chess,
  square = null
) {
  if (square !== null) {
    if (!isValidSquare(square)) {
      return [];
    }

    return chess.moves({
      square,
      verbose: true
    });
  }

  return chess.moves({
    verbose: true
  });
}


/*
==========================================
ELO RATING
==========================================
*/

export function calculateElo(
  playerRating,
  opponentRating,
  score,
  kFactor = 32
) {
  const expected =
    1 /
    (
      1 +
      Math.pow(
        10,
        (opponentRating - playerRating) / 400
      )
    );

  return Math.round(
    playerRating +
    kFactor * (score - expected)
  );
}


/*
==========================================
CALCULATE FINAL RATINGS
==========================================
*/

export function calculateChessRatings(
  whiteRating,
  blackRating,
  result
) {
  let whiteScore;
  let blackScore;

  if (result === "white") {
    whiteScore = 1;
    blackScore = 0;
  } else if (result === "black") {
    whiteScore = 0;
    blackScore = 1;
  } else {
    whiteScore = 0.5;
    blackScore = 0.5;
  }

  const newWhiteRating =
    calculateElo(
      whiteRating,
      blackRating,
      whiteScore
    );

  const newBlackRating =
    calculateElo(
      blackRating,
      whiteRating,
      blackScore
    );

  return {
    whiteRating: Math.max(
      100,
      newWhiteRating
    ),

    blackRating: Math.max(
      100,
      newBlackRating
    )
  };
}
