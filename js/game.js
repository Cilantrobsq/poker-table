'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────

const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8',
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A'
};
const SUITS = ['C', 'D', 'H', 'S'];
const SUIT_SYMBOLS = { C: '\u2663', D: '\u2666', H: '\u2665', S: '\u2660' };

const HAND_RANK = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, THREE_OF_A_KIND: 3,
  STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9
};

const HAND_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind',
  'Straight Flush', 'Royal Flush'
];

// ─── Deck Utilities ───────────────────────────────────────────────────────────

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

// Fisher-Yates shuffle (in place, returns shuffled copy)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardStr(card) {
  if (!card || card.hidden) return '[?]';
  return RANK_NAMES[card.rank] + SUIT_SYMBOLS[card.suit];
}

// ─── Hand Evaluator ───────────────────────────────────────────────────────────

// Evaluate a 5-card hand. Returns array for comparison.
// [handRank, ...tiebreakers] (higher is better, compare element by element)
function evaluate5(cards) {
  const sorted = cards.slice().sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);

  // Rank frequency map
  const freq = {};
  for (const r of ranks) freq[r] = (freq[r] || 0) + 1;

  // Group ranks by their frequency count
  const byCount = {};
  for (const [rank, count] of Object.entries(freq)) {
    if (!byCount[count]) byCount[count] = [];
    byCount[count].push(parseInt(rank));
  }
  for (const k in byCount) byCount[k].sort((a, b) => b - a);

  const counts = Object.values(freq).sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);

  // Check straight
  let isStraight = false;
  let straightHigh = 0;
  const uniqueRanks = [...new Set(ranks)];
  if (uniqueRanks.length === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    }
    // Ace-low straight: A-5-4-3-2 (wheel)
    if (ranks[0] === 14 && ranks[1] === 5 && ranks[2] === 4 && ranks[3] === 3 && ranks[4] === 2) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  if (isFlush && isStraight && straightHigh === 14) {
    return [HAND_RANK.ROYAL_FLUSH, 14];
  }
  if (isFlush && isStraight) {
    return [HAND_RANK.STRAIGHT_FLUSH, straightHigh];
  }
  if (counts[0] === 4) {
    return [HAND_RANK.FOUR_OF_A_KIND, byCount[4][0], ...(byCount[1] || [])];
  }
  if (counts[0] === 3 && counts[1] === 2) {
    return [HAND_RANK.FULL_HOUSE, byCount[3][0], byCount[2][0]];
  }
  if (isFlush) {
    return [HAND_RANK.FLUSH, ...ranks];
  }
  if (isStraight) {
    return [HAND_RANK.STRAIGHT, straightHigh];
  }
  if (counts[0] === 3) {
    return [HAND_RANK.THREE_OF_A_KIND, byCount[3][0], ...(byCount[1] || [])];
  }
  if (counts[0] === 2 && counts[1] === 2) {
    // byCount[2] has two pairs; ensure ordered high, low
    const pairs = (byCount[2] || []).slice();
    pairs.sort((a, b) => b - a);
    const kicker = (byCount[1] || [byCount[1]])[0];
    return [HAND_RANK.TWO_PAIR, pairs[0], pairs[1], kicker];
  }
  if (counts[0] === 2) {
    return [HAND_RANK.PAIR, byCount[2][0], ...(byCount[1] || [])];
  }
  return [HAND_RANK.HIGH_CARD, ...ranks];
}

// Compare two hand value arrays. Returns 1 if h1 > h2, -1 if h1 < h2, 0 if tie.
function compareHandValues(h1, h2) {
  const len = Math.max(h1.length, h2.length);
  for (let i = 0; i < len; i++) {
    const a = h1[i] !== undefined ? h1[i] : 0;
    const b = h2[i] !== undefined ? h2[i] : 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

// All C(n,k) combinations
function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k)
  ];
}

// Evaluate the best 5-card hand from 7 cards (hole + community)
function evaluateHand(cards) {
  const combs = combinations(cards, 5);
  let bestValue = null;
  let bestCards = null;
  for (const combo of combs) {
    const val = evaluate5(combo);
    if (bestValue === null || compareHandValues(val, bestValue) > 0) {
      bestValue = val;
      bestCards = combo;
    }
  }
  return {
    value: bestValue,
    cards: bestCards,
    name: HAND_NAMES[bestValue[0]]
  };
}

// Returns 0 if eval0 wins, 1 if eval1 wins, -1 for tie
function determineWinner(eval0, eval1) {
  const cmp = compareHandValues(eval0.value, eval1.value);
  if (cmp > 0) return 0;
  if (cmp < 0) return 1;
  return -1;
}

// ─── Game Engine ──────────────────────────────────────────────────────────────

class GameEngine {
  constructor() {
    this.smallBlind = 10;
    this.bigBlind = 20;
    this.startingChips = 1000;
    this.fullReset();
  }

  fullReset() {
    this.players = [
      { id: 0, name: 'Player 1', chips: this.startingChips, hand: [], bet: 0, folded: false, allIn: false, hasActed: false },
      { id: 1, name: 'Player 2', chips: this.startingChips, hand: [], bet: 0, folded: false, allIn: false, hasActed: false }
    ];
    this.pot = 0;
    this.communityCards = [];
    this.deck = [];
    this.currentPlayerIdx = 0;
    this.dealerButton = 0;
    this.phase = 'lobby';
    this.currentBet = 0;
    this.lastRaiseAmount = this.bigBlind;
    this.handNumber = 0;
    this.log = [];
    this.winner = null;
    this.winningHand = null;
    this.losingHand = null;
    this.showCards = false;
  }

  setPlayerNames(name0, name1) {
    this.players[0].name = name0;
    this.players[1].name = name1;
    this.addLog(`Welcome ${name0} and ${name1}! Good luck!`);
  }

  startHand() {
    // Reset hand state (not chips)
    this.handNumber++;
    this.deck = shuffle(createDeck());
    this.communityCards = [];
    this.winner = null;
    this.winningHand = null;
    this.losingHand = null;
    this.showCards = false;
    this.pot = 0;
    this.currentBet = 0;
    this.lastRaiseAmount = this.bigBlind;

    for (const p of this.players) {
      p.hand = [];
      p.bet = 0;
      p.folded = false;
      p.allIn = false;
      p.hasActed = false;
    }

    // In heads-up: dealer = small blind (acts first preflop, last postflop)
    const sbIdx = this.dealerButton;
    const bbIdx = (this.dealerButton + 1) % 2;

    this.postBlind(sbIdx, this.smallBlind, 'small blind');
    this.postBlind(bbIdx, this.bigBlind, 'big blind');
    this.currentBet = this.bigBlind;
    this.lastRaiseAmount = this.bigBlind;

    // Deal 2 hole cards to each player
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) {
        p.hand.push(this.deck.pop());
      }
    }

    // Preflop: dealer (SB) acts first in heads-up
    this.currentPlayerIdx = sbIdx;
    this.phase = 'preflop';

    const sbName = this.players[sbIdx].name;
    const bbName = this.players[bbIdx].name;
    this.addLog(`--- Hand #${this.handNumber} ---`);
    this.addLog(`${sbName} posts SB $${this.smallBlind}, ${bbName} posts BB $${this.bigBlind}`);
  }

  postBlind(playerIdx, amount, blindType) {
    const p = this.players[playerIdx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.bet += actual;
    this.pot += actual;
    if (p.chips === 0) {
      p.allIn = true;
    }
  }

  getValidActions(playerIdx) {
    if (playerIdx !== this.currentPlayerIdx) return [];
    const p = this.players[playerIdx];
    const toCall = this.currentBet - p.bet;
    const actions = ['fold'];

    if (toCall === 0) {
      actions.push('check');
    } else {
      const callAmt = Math.min(toCall, p.chips);
      actions.push('call'); // even if it's an all-in call
    }

    // Can raise if they have chips beyond what's needed to call
    const minRaiseTotal = this.currentBet + this.lastRaiseAmount;
    const maxBet = p.chips + p.bet;
    if (maxBet > this.currentBet) {
      if (maxBet >= minRaiseTotal) {
        actions.push('raise');
      } else {
        // Can only all-in raise (less than min raise)
        if (!actions.includes('raise')) actions.push('raise');
      }
    }

    return actions;
  }

  placeBet(playerIdx, action, raiseToAmount) {
    if (playerIdx !== this.currentPlayerIdx) {
      return { error: 'Not your turn' };
    }

    const p = this.players[playerIdx];
    const opponent = this.players[(playerIdx + 1) % 2];
    const toCall = this.currentBet - p.bet;

    let logMsg = `${p.name}: `;

    switch (action) {
      case 'fold':
        p.folded = true;
        p.hasActed = true;
        logMsg += 'folds';
        this.addLog(logMsg);
        this.endHand(opponent.id, 'fold', null, null);
        return { action: 'fold' };

      case 'check':
        if (toCall > 0) return { error: 'Cannot check, must call or fold' };
        p.hasActed = true;
        logMsg += 'checks';
        this.addLog(logMsg);
        break;

      case 'call': {
        const callAmt = Math.min(toCall, p.chips);
        p.chips -= callAmt;
        p.bet += callAmt;
        this.pot += callAmt;
        p.hasActed = true;
        if (p.chips === 0) p.allIn = true;
        logMsg += callAmt < toCall
          ? `calls all-in for $${callAmt}`
          : `calls $${callAmt}`;
        this.addLog(logMsg);
        break;
      }

      case 'raise': {
        // raiseToAmount = total bet amount this player will have
        const total = raiseToAmount || (this.currentBet + this.lastRaiseAmount);
        const clampedTotal = Math.min(total, p.chips + p.bet);
        if (clampedTotal <= p.bet) return { error: 'Raise amount too low' };

        const diff = clampedTotal - p.bet;
        const raisePortion = clampedTotal - this.currentBet;
        if (raisePortion > 0) {
          this.lastRaiseAmount = Math.max(raisePortion, this.lastRaiseAmount);
        }
        p.chips -= diff;
        p.bet = clampedTotal;
        this.pot += diff;
        p.hasActed = true;
        if (p.chips === 0) p.allIn = true;
        // Opponent must act again
        opponent.hasActed = false;
        this.currentBet = Math.max(this.currentBet, p.bet);
        logMsg += p.allIn
          ? `goes all-in for $${p.bet}`
          : `raises to $${p.bet}`;
        this.addLog(logMsg);
        break;
      }

      default:
        return { error: 'Unknown action' };
    }

    this.advanceTurn();
    return { action, success: true };
  }

  advanceTurn() {
    // Check if betting round is complete
    if (this.isBettingRoundComplete()) {
      this.advancePhase();
    } else {
      // Move to next active player
      this.currentPlayerIdx = (this.currentPlayerIdx + 1) % 2;
      // If that player is all-in, check again
      if (this.players[this.currentPlayerIdx].allIn) {
        this.advanceTurn(); // will either advance phase or find next player
      }
    }
  }

  isBettingRoundComplete() {
    const [p0, p1] = this.players;

    // If someone folded, it's handled in placeBet directly
    if (p0.folded || p1.folded) return false;

    // Both all-in: no more betting possible
    if (p0.allIn && p1.allIn) return true;

    // One all-in: other player has matched or went all-in too
    if (p0.allIn && p1.hasActed && p1.bet >= p0.bet) return true;
    if (p1.allIn && p0.hasActed && p0.bet >= p1.bet) return true;

    // Both have acted and bets are equal
    if (p0.hasActed && p1.hasActed && p0.bet === p1.bet) return true;

    return false;
  }

  advancePhase() {
    // Reset bets and acted flags for new round
    for (const p of this.players) {
      p.bet = 0;
      p.hasActed = false;
    }
    this.currentBet = 0;
    this.lastRaiseAmount = this.bigBlind;

    if (this.phase === 'preflop') {
      // Deal flop
      this.deck.pop(); // burn
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.phase = 'flop';
      this.addLog(`Flop: ${this.communityCards.map(c => cardStr(c)).join(' ')}`);
    } else if (this.phase === 'flop') {
      this.deck.pop(); // burn
      this.communityCards.push(this.deck.pop());
      this.phase = 'turn';
      this.addLog(`Turn: ${cardStr(this.communityCards[3])}`);
    } else if (this.phase === 'turn') {
      this.deck.pop(); // burn
      this.communityCards.push(this.deck.pop());
      this.phase = 'river';
      this.addLog(`River: ${cardStr(this.communityCards[4])}`);
    } else if (this.phase === 'river') {
      this.doShowdown();
      return;
    }

    // Post-flop: non-dealer acts first (big blind position, which is dealer+1)
    this.currentPlayerIdx = (this.dealerButton + 1) % 2;

    // Handle case where that player is all-in
    this.handleAllInSkip();
  }

  handleAllInSkip() {
    const [p0, p1] = this.players;
    if (p0.allIn && p1.allIn) {
      this.runToShowdown();
      return;
    }
    // If current player is all-in, switch to opponent
    if (this.players[this.currentPlayerIdx].allIn) {
      this.currentPlayerIdx = (this.currentPlayerIdx + 1) % 2;
    }
  }

  runToShowdown() {
    // Deal remaining community cards without betting
    while (this.communityCards.length < 5) {
      if (this.communityCards.length < 3) {
        this.deck.pop();
        while (this.communityCards.length < 3) {
          this.communityCards.push(this.deck.pop());
        }
        this.addLog(`Flop: ${this.communityCards.slice(0, 3).map(c => cardStr(c)).join(' ')}`);
      } else if (this.communityCards.length === 3) {
        this.deck.pop();
        this.communityCards.push(this.deck.pop());
        this.addLog(`Turn: ${cardStr(this.communityCards[3])}`);
      } else if (this.communityCards.length === 4) {
        this.deck.pop();
        this.communityCards.push(this.deck.pop());
        this.addLog(`River: ${cardStr(this.communityCards[4])}`);
      }
    }
    this.doShowdown();
  }

  doShowdown() {
    this.phase = 'showdown';
    this.showCards = true;
    const [p0, p1] = this.players;

    const eval0 = evaluateHand([...p0.hand, ...this.communityCards]);
    const eval1 = evaluateHand([...p1.hand, ...this.communityCards]);

    this.addLog(`Showdown: ${p0.name} shows ${eval0.name} | ${p1.name} shows ${eval1.name}`);

    const result = determineWinner(eval0, eval1);
    if (result === 0) {
      this.endHand(0, 'showdown', eval0, eval1);
    } else if (result === 1) {
      this.endHand(1, 'showdown', eval0, eval1);
    } else {
      this.endHandTie(eval0, eval1);
    }
  }

  endHand(winnerIdx, reason, winEval, loseEval) {
    const winner = this.players[winnerIdx];
    const loserIdx = (winnerIdx + 1) % 2;
    const loser = this.players[loserIdx];

    winner.chips += this.pot;
    this.winner = winnerIdx;

    if (reason === 'showdown') {
      this.winningHand = winnerIdx === 0 ? winEval : loseEval;
      this.losingHand = winnerIdx === 0 ? loseEval : winEval;
      this.addLog(`${winner.name} wins $${this.pot} with ${(winnerIdx === 0 ? winEval : loseEval).name}!`);
    } else {
      this.addLog(`${winner.name} wins $${this.pot} (opponent folded)`);
    }

    this.pot = 0;

    if (loser.chips === 0) {
      this.phase = 'gameover';
      this.addLog(`Game over! ${winner.name} wins everything!`);
    }

    // Advance dealer button for next hand
    this.dealerButton = (this.dealerButton + 1) % 2;
  }

  endHandTie(eval0, eval1) {
    this.winner = -1;
    this.winningHand = eval0;
    this.losingHand = eval1;
    const half = Math.floor(this.pot / 2);
    this.players[0].chips += half;
    this.players[1].chips += (this.pot - half);
    this.pot = 0;
    this.addLog(`Split pot! ${eval0.name} vs ${eval1.name}`);
    this.dealerButton = (this.dealerButton + 1) % 2;
  }

  addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 30) this.log.pop();
  }

  // Serialize state for P2P transmission; hide opponent's hole cards unless showdown
  getState(forPlayerIdx) {
    return {
      phase: this.phase,
      communityCards: this.communityCards,
      pot: this.pot,
      currentPlayerIdx: this.currentPlayerIdx,
      dealerButton: this.dealerButton,
      currentBet: this.currentBet,
      lastRaiseAmount: this.lastRaiseAmount,
      handNumber: this.handNumber,
      log: this.log,
      winner: this.winner,
      winningHand: this.winningHand,
      losingHand: this.losingHand,
      showCards: this.showCards,
      players: this.players.map((p, idx) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        // Show cards only if it's the local player's hand or if showdown
        hand: (idx === forPlayerIdx || this.showCards)
          ? p.hand
          : p.hand.map(() => ({ hidden: true }))
      }))
    };
  }
}

// Expose to global scope
window.GameEngine = GameEngine;
window.evaluateHand = evaluateHand;
window.SUIT_SYMBOLS = SUIT_SYMBOLS;
window.RANK_NAMES = RANK_NAMES;
window.HAND_NAMES = HAND_NAMES;
window.cardStr = cardStr;
