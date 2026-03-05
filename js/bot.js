'use strict';

// AI Bot for solo play mode
// Basic strategy: evaluate hand strength relative to board, bet accordingly, bluff sometimes

var PokerBot = (function () {

  // Rough hand strength: 0.0 (trash) to 1.0 (nuts)
  function evaluateStrength(hand, communityCards, phase) {
    if (!hand || hand.length < 2) return 0.3;

    var c1 = hand[0], c2 = hand[1];
    var r1 = c1.rank, r2 = c2.rank;
    var suited = c1.suit === c2.suit;
    var paired = r1 === r2;
    var highCard = Math.max(r1, r2);
    var gap = Math.abs(r1 - r2);

    // Preflop strength estimate
    var preflopStr = 0;
    if (paired) {
      preflopStr = 0.5 + (r1 / 14) * 0.5; // pocket pair: 0.5-1.0
    } else {
      preflopStr = (highCard / 14) * 0.4; // high card value
      if (suited) preflopStr += 0.08;
      if (gap <= 2) preflopStr += 0.06; // connected
      if (gap === 0) preflopStr += 0.1; // pair bonus already handled
      // Premium hands
      if (r1 >= 13 && r2 >= 13) preflopStr = 0.9; // AK, AQ, KQ
      if (r1 === 14 && r2 === 14) preflopStr = 0.98; // AA
      if (r1 === 13 && r2 === 13) preflopStr = 0.95; // KK
      if (r1 === 12 && r2 === 12) preflopStr = 0.92; // QQ
    }

    if (phase === 'preflop' || !communityCards || communityCards.length === 0) {
      return Math.min(1, Math.max(0, preflopStr));
    }

    // Post-flop: use actual hand evaluation
    var allCards = hand.concat(communityCards);
    if (allCards.length >= 5) {
      var evalResult = window.evaluateHand(allCards);
      var handRank = evalResult.value[0]; // 0-9
      // Map hand rank to strength
      // 0=high card, 1=pair, 2=two pair, 3=trips, 4=straight, 5=flush, 6=full house, 7=quads, 8=straight flush, 9=royal
      var postStr = [0.15, 0.35, 0.55, 0.7, 0.78, 0.82, 0.9, 0.95, 0.98, 1.0][handRank] || 0.15;

      // Adjust based on kicker/relative strength within rank
      if (handRank === 1) { // pair
        var pairRank = evalResult.value[1];
        // Top pair vs bottom pair
        var boardRanks = communityCards.map(function(c) { return c.rank; }).sort(function(a,b) { return b-a; });
        if (pairRank >= boardRanks[0]) postStr += 0.08; // top pair or overpair
        else if (pairRank < boardRanks[boardRanks.length-1]) postStr -= 0.1; // underpair
      }

      return Math.min(1, Math.max(0, postStr));
    }

    return preflopStr;
  }

  // Decide action: returns { action: 'fold'|'check'|'call'|'raise', amount: number }
  function decide(state, botPlayerIdx) {
    var bot = state.players[botPlayerIdx];
    var opponent = state.players[(botPlayerIdx + 1) % 2];
    var toCall = state.currentBet - bot.bet;
    var potSize = state.pot;
    var strength = evaluateStrength(bot.hand, state.communityCards, state.phase);

    // Add some randomness for unpredictability
    var rand = Math.random();
    var bluffFactor = Math.random(); // 0-1, higher = more willing to bluff

    // Can we raise?
    var canRaise = (bot.chips + bot.bet) > state.currentBet;
    var maxBet = bot.chips + bot.bet;

    // Facing a bet
    if (toCall > 0) {
      var potOdds = toCall / (potSize + toCall);

      // Strong hand: raise or call
      if (strength > 0.7) {
        if (canRaise && rand > 0.3) {
          // Raise: size based on strength
          var raiseSize = Math.floor(potSize * (0.5 + strength));
          var raiseTo = Math.max(state.currentBet + (state.lastRaiseAmount || 20), state.currentBet + raiseSize);
          raiseTo = Math.min(raiseTo, maxBet);
          return { action: 'raise', amount: raiseTo };
        }
        return { action: 'call' };
      }

      // Medium hand: call if pot odds are right, occasionally raise as semi-bluff
      if (strength > 0.4) {
        if (potOdds < strength) {
          // Sometimes raise as semi-bluff
          if (canRaise && bluffFactor > 0.75 && rand > 0.6) {
            var semiBluffTo = Math.max(state.currentBet + (state.lastRaiseAmount || 20), Math.floor(state.currentBet * 2.2));
            semiBluffTo = Math.min(semiBluffTo, maxBet);
            return { action: 'raise', amount: semiBluffTo };
          }
          return { action: 'call' };
        }
        // Marginal: sometimes call anyway
        if (rand > 0.5 && toCall < bot.chips * 0.15) {
          return { action: 'call' };
        }
        return { action: 'fold' };
      }

      // Weak hand: mostly fold, occasional bluff raise
      if (bluffFactor > 0.88 && canRaise && rand > 0.7 && toCall < potSize * 0.3) {
        // Bluff raise
        var bluffTo = Math.max(state.currentBet + (state.lastRaiseAmount || 20), Math.floor(potSize * 0.75) + state.currentBet);
        bluffTo = Math.min(bluffTo, maxBet);
        return { action: 'raise', amount: bluffTo };
      }

      // Cheap call sometimes with weak hands
      if (toCall <= state.players[botPlayerIdx].chips * 0.05 && rand > 0.5) {
        return { action: 'call' };
      }

      return { action: 'fold' };
    }

    // No bet to call (can check or bet)
    if (strength > 0.65) {
      if (canRaise && rand > 0.25) {
        // Value bet
        var valueBet = Math.floor(potSize * (0.4 + strength * 0.4));
        var valueTo = Math.max(state.currentBet + (state.lastRaiseAmount || 20), valueBet);
        valueTo = Math.min(valueTo, maxBet);
        return { action: 'raise', amount: valueTo };
      }
      // Slow play sometimes
      return { action: 'check' };
    }

    if (strength > 0.35) {
      // Medium: check mostly, sometimes small bet
      if (canRaise && rand > 0.65) {
        var smallBet = Math.max(state.currentBet + (state.lastRaiseAmount || 20), Math.floor(potSize * 0.4));
        smallBet = Math.min(smallBet, maxBet);
        return { action: 'raise', amount: smallBet };
      }
      return { action: 'check' };
    }

    // Weak hand: check, occasionally bluff
    if (bluffFactor > 0.82 && canRaise && rand > 0.7) {
      var bluffBet = Math.max(state.currentBet + (state.lastRaiseAmount || 20), Math.floor(potSize * 0.6));
      bluffBet = Math.min(bluffBet, maxBet);
      return { action: 'raise', amount: bluffBet };
    }

    return { action: 'check' };
  }

  return {
    decide: decide,
    evaluateStrength: evaluateStrength
  };
})();

window.PokerBot = PokerBot;
