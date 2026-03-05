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

function evaluate5(cards) {
  const sorted = cards.slice().sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map(c => c.rank);
  const suits = sorted.map(c => c.suit);

  const freq = {};
  for (const r of ranks) freq[r] = (freq[r] || 0) + 1;

  const byCount = {};
  for (const [rank, count] of Object.entries(freq)) {
    if (!byCount[count]) byCount[count] = [];
    byCount[count].push(parseInt(rank));
  }
  for (const k in byCount) byCount[k].sort((a, b) => b - a);

  const counts = Object.values(freq).sort((a, b) => b - a);
  const isFlush = suits.every(s => s === suits[0]);

  let isStraight = false;
  let straightHigh = 0;
  const uniqueRanks = [...new Set(ranks)];
  if (uniqueRanks.length === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    }
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
    const pairs = (byCount[2] || []).slice();
    pairs.sort((a, b) => b - a);
    const kicker = (byCount[1] || [0])[0];
    return [HAND_RANK.TWO_PAIR, pairs[0], pairs[1], kicker];
  }
  if (counts[0] === 2) {
    return [HAND_RANK.PAIR, byCount[2][0], ...(byCount[1] || [])];
  }
  return [HAND_RANK.HIGH_CARD, ...ranks];
}

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

function combinations(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map(c => [first, ...c]),
    ...combinations(rest, k)
  ];
}

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
    this.dealerIdx = 0;
    this.phase = 'lobby';
    this.currentBet = 0;
    this.lastRaiseAmount = this.bigBlind;
    this.handNumber = 0;
    this.log = [];
    this.winner = null;
    this.winReason = null;
    this.playerEvals = [null, null]; // evaluation for each player
    this.showCards = false;
    this.lastPotAwarded = 0; // pot amount before it was awarded (for display)
  }

  setPlayerNames(name0, name1) {
    this.players[0].name = name0;
    this.players[1].name = name1;
    this.addLog('Welcome ' + name0 + ' and ' + name1 + '! Good luck!');
  }

  startHand() {
    this.handNumber++;
    this.deck = shuffle(createDeck());
    this.communityCards = [];
    this.winner = null;
    this.winReason = null;
    this.playerEvals = [null, null];
    this.showCards = false;
    this.pot = 0;
    this.currentBet = 0;
    this.lastRaiseAmount = this.bigBlind;
    this.lastPotAwarded = 0;

    for (const p of this.players) {
      p.hand = [];
      p.bet = 0;
      p.folded = false;
      p.allIn = false;
      p.hasActed = false;
    }

    // Heads-up: dealer = small blind, acts first preflop
    const sbIdx = this.dealerIdx;
    const bbIdx = (this.dealerIdx + 1) % 2;

    this.postBlind(sbIdx, this.smallBlind, 'small blind');
    this.postBlind(bbIdx, this.bigBlind, 'big blind');
    this.currentBet = this.bigBlind;
    this.lastRaiseAmount = this.bigBlind;

    // Deal hole cards
    for (let i = 0; i < 2; i++) {
      for (const p of this.players) {
        p.hand.push(this.deck.pop());
      }
    }

    this.currentPlayerIdx = sbIdx;
    this.phase = 'preflop';

    const sbName = this.players[sbIdx].name;
    const bbName = this.players[bbIdx].name;
    this.addLog('--- Hand #' + this.handNumber + ' ---');
    this.addLog(sbName + ' posts SB $' + this.smallBlind + ', ' + bbName + ' posts BB $' + this.bigBlind);
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
      actions.push('call');
    }

    const maxBet = p.chips + p.bet;
    if (maxBet > this.currentBet) {
      actions.push('raise');
    }

    return actions;
  }

  placeBet(playerIdx, action, raiseToAmount) {
    if (this.phase === 'showdown' || this.phase === 'gameover' || this.phase === 'fold') {
      return { error: 'Hand is over' };
    }
    if (playerIdx !== this.currentPlayerIdx) {
      return { error: 'Not your turn' };
    }

    const p = this.players[playerIdx];
    const opponent = this.players[(playerIdx + 1) % 2];
    const toCall = this.currentBet - p.bet;

    let logMsg = p.name + ': ';

    switch (action) {
      case 'fold':
        p.folded = true;
        p.hasActed = true;
        logMsg += 'folds';
        this.addLog(logMsg);
        this.endHand(opponent.id, 'fold');
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
          ? 'calls all-in for $' + callAmt
          : 'calls $' + callAmt;
        this.addLog(logMsg);
        break;
      }

      case 'raise': {
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
        opponent.hasActed = false;
        this.currentBet = Math.max(this.currentBet, p.bet);
        logMsg += p.allIn
          ? 'goes all-in for $' + p.bet
          : 'raises to $' + p.bet;
        this.addLog(logMsg);
        break;
      }

      default:
        return { error: 'Unknown action' };
    }

    this.advanceTurn();
    return { action: action, success: true };
  }

  advanceTurn() {
    if (this.isBettingRoundComplete()) {
      this.advancePhase();
    } else {
      this.currentPlayerIdx = (this.currentPlayerIdx + 1) % 2;
      if (this.players[this.currentPlayerIdx].allIn) {
        // If next player is all-in, check if round is done
        if (this.isBettingRoundComplete()) {
          this.advancePhase();
        }
        // If not done, the non-all-in player still needs to act
      }
    }
  }

  isBettingRoundComplete() {
    const [p0, p1] = this.players;

    if (p0.folded || p1.folded) return false;
    if (p0.allIn && p1.allIn) return true;
    if (p0.allIn && p1.hasActed && p1.bet >= p0.bet) return true;
    if (p1.allIn && p0.hasActed && p0.bet >= p1.bet) return true;
    if (p0.hasActed && p1.hasActed && p0.bet === p1.bet) return true;

    return false;
  }

  advancePhase() {
    for (const p of this.players) {
      p.bet = 0;
      p.hasActed = false;
    }
    this.currentBet = 0;
    this.lastRaiseAmount = this.bigBlind;

    if (this.phase === 'preflop') {
      this.deck.pop(); // burn
      this.communityCards.push(this.deck.pop(), this.deck.pop(), this.deck.pop());
      this.phase = 'flop';
      this.addLog('Flop: ' + this.communityCards.map(function(c) { return cardStr(c); }).join(' '));
    } else if (this.phase === 'flop') {
      this.deck.pop();
      this.communityCards.push(this.deck.pop());
      this.phase = 'turn';
      this.addLog('Turn: ' + cardStr(this.communityCards[3]));
    } else if (this.phase === 'turn') {
      this.deck.pop();
      this.communityCards.push(this.deck.pop());
      this.phase = 'river';
      this.addLog('River: ' + cardStr(this.communityCards[4]));
    } else if (this.phase === 'river') {
      this.doShowdown();
      return;
    }

    // Post-flop: BB (non-dealer) acts first
    this.currentPlayerIdx = (this.dealerIdx + 1) % 2;
    this.handleAllInSkip();
  }

  handleAllInSkip() {
    const [p0, p1] = this.players;
    if (p0.allIn && p1.allIn) {
      this.runToShowdown();
      return;
    }
    if (this.players[this.currentPlayerIdx].allIn) {
      this.currentPlayerIdx = (this.currentPlayerIdx + 1) % 2;
    }
  }

  runToShowdown() {
    while (this.communityCards.length < 5) {
      if (this.communityCards.length < 3) {
        this.deck.pop();
        while (this.communityCards.length < 3) {
          this.communityCards.push(this.deck.pop());
        }
        this.addLog('Flop: ' + this.communityCards.slice(0, 3).map(function(c) { return cardStr(c); }).join(' '));
      } else if (this.communityCards.length === 3) {
        this.deck.pop();
        this.communityCards.push(this.deck.pop());
        this.addLog('Turn: ' + cardStr(this.communityCards[3]));
      } else if (this.communityCards.length === 4) {
        this.deck.pop();
        this.communityCards.push(this.deck.pop());
        this.addLog('River: ' + cardStr(this.communityCards[4]));
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

    // Store each player's evaluation correctly indexed
    this.playerEvals = [eval0, eval1];

    this.addLog('Showdown: ' + p0.name + ' shows ' + eval0.name + ' | ' + p1.name + ' shows ' + eval1.name);

    const result = determineWinner(eval0, eval1);
    if (result === 0) {
      this.endHand(0, 'showdown');
    } else if (result === 1) {
      this.endHand(1, 'showdown');
    } else {
      this.endHandTie();
    }
  }

  endHand(winnerIdx, reason) {
    const winner = this.players[winnerIdx];
    const loserIdx = (winnerIdx + 1) % 2;
    const loser = this.players[loserIdx];

    this.lastPotAwarded = this.pot;
    winner.chips += this.pot;
    this.winner = winnerIdx;
    this.winReason = reason;

    if (reason === 'fold') {
      this.phase = 'fold';
      this.addLog(winner.name + ' wins $' + this.pot + ' (opponent folded)');
    } else {
      this.addLog(winner.name + ' wins $' + this.pot + ' with ' + this.playerEvals[winnerIdx].name + '!');
    }

    this.pot = 0;

    if (loser.chips === 0) {
      this.phase = 'gameover';
      this.addLog('Game over! ' + winner.name + ' wins everything!');
    }

    // Advance dealer for next hand
    this.dealerIdx = (this.dealerIdx + 1) % 2;
  }

  endHandTie() {
    this.winner = -1;
    this.winReason = 'tie';
    this.lastPotAwarded = this.pot;
    const half = Math.floor(this.pot / 2);
    this.players[0].chips += half;
    this.players[1].chips += (this.pot - half);
    this.addLog('Split pot! $' + this.pot + ' divided equally');
    this.pot = 0;
    this.dealerIdx = (this.dealerIdx + 1) % 2;
  }

  addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 50) this.log.pop();
  }

  // Serialize state for P2P transmission
  getState(forPlayerIdx) {
    return {
      phase: this.phase,
      communityCards: this.communityCards,
      pot: this.pot,
      lastPotAwarded: this.lastPotAwarded,
      currentPlayerIdx: this.currentPlayerIdx,
      dealerIdx: this.dealerIdx,
      currentBet: this.currentBet,
      lastRaiseAmount: this.lastRaiseAmount,
      handNumber: this.handNumber,
      log: this.log,
      winner: this.winner,
      winReason: this.winReason,
      playerEvals: (this.showCards || this.phase === 'fold') ? this.playerEvals : [null, null],
      showCards: this.showCards,
      players: this.players.map(function(p, idx) {
        return {
          id: p.id,
          name: p.name,
          chips: p.chips,
          bet: p.bet,
          folded: p.folded,
          allIn: p.allIn,
          hand: (idx === forPlayerIdx || this.showCards)
            ? p.hand
            : p.hand.map(function() { return { hidden: true }; })
        };
      }.bind(this))
    };
  }
}

window.GameEngine = GameEngine;
window.evaluateHand = evaluateHand;
window.SUIT_SYMBOLS = SUIT_SYMBOLS;
window.RANK_NAMES = RANK_NAMES;
window.HAND_NAMES = HAND_NAMES;
window.cardStr = cardStr;
