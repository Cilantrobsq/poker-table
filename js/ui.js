'use strict';

// ─── UI Module ────────────────────────────────────────────────────────────────

var UI = (function () {

  // Track rendered card keys to avoid re-animating unchanged cards
  var lastRenderedCards = {};

  function cardKey(card) {
    if (!card || card.hidden) return 'hidden';
    return card.rank + '-' + card.suit;
  }

  function renderCard(card, faceDown) {
    var el = document.createElement('div');
    el.className = 'card';
    if (faceDown || !card || card.hidden) {
      el.classList.add('card-back');
      el.innerHTML = '';
    } else {
      var isRed = card.suit === 'H' || card.suit === 'D';
      el.classList.add(isRed ? 'card-red' : 'card-black');
      var rankName = window.RANK_NAMES[card.rank] || card.rank;
      var suitSymbol = window.SUIT_SYMBOLS[card.suit] || card.suit;
      el.innerHTML =
        '<span class="card-rank-top">' + rankName + '</span>' +
        '<span class="card-suit-center">' + suitSymbol + '</span>' +
        '<span class="card-rank-bottom">' + rankName + '</span>';
    }
    return el;
  }

  function renderCardsWithAnimation(cards, container, animClass, cacheKey) {
    if (!cards) {
      container.innerHTML = '';
      return;
    }

    var newKeys = cards.map(function(c) { return cardKey(c); }).join(',');
    var oldKeys = lastRenderedCards[cacheKey] || '';

    // Only re-render if cards actually changed
    if (newKeys === oldKeys && container.children.length === cards.length) return;
    lastRenderedCards[cacheKey] = newKeys;

    container.innerHTML = '';
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var cardEl = renderCard(card, card.hidden);
      // Only animate new cards (not ones that were already displayed)
      var wasPresent = oldKeys.indexOf(cardKey(card)) >= 0;
      if (!wasPresent && animClass) {
        cardEl.classList.add(animClass);
        if (animClass === 'card-community-bounce') {
          cardEl.style.animationDelay = (i * 0.08) + 's';
        }
      }
      container.appendChild(cardEl);
    }
  }

  function renderCommunityCards(cards, container) {
    var displayCards = [];
    for (var i = 0; i < 5; i++) {
      if (cards && cards[i]) {
        displayCards.push(cards[i]);
      }
    }

    renderCardsWithAnimation(displayCards, container, 'card-community-bounce', 'community');

    // Fill remaining placeholders
    while (container.children.length < 5) {
      var placeholder = document.createElement('div');
      placeholder.className = 'card card-placeholder';
      container.appendChild(placeholder);
    }
  }

  function renderPlayer(playerData, isLocal, isCurrent, isDealer, container) {
    var nameEl = container.querySelector('.player-name');
    var chipsEl = container.querySelector('.player-chips');
    var betEl = container.querySelector('.player-bet');
    var cardsEl = container.querySelector('.player-cards');
    var statusEl = container.querySelector('.player-status');
    var dealerBtn = container.querySelector('.dealer-btn');

    if (nameEl) nameEl.textContent = playerData.name;
    if (chipsEl) chipsEl.textContent = '$' + playerData.chips;
    if (betEl) {
      betEl.textContent = playerData.bet > 0 ? 'Bet: $' + playerData.bet : '';
    }

    if (dealerBtn) {
      dealerBtn.style.display = isDealer ? 'inline-flex' : 'none';
    }

    var statusText = '';
    if (playerData.folded) statusText = 'Folded';
    else if (playerData.allIn) statusText = 'ALL IN';
    else if (isCurrent && isLocal) statusText = 'Your Turn';
    else if (isCurrent && !isLocal) statusText = 'Thinking...';
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className = 'player-status';
      if (isCurrent && isLocal) statusEl.classList.add('active', 'pulse');
      else if (isCurrent) statusEl.classList.add('opponent-thinking');
      if (playerData.allIn) statusEl.classList.add('allin-badge');
    }

    container.classList.toggle('player-active', isCurrent);
    container.classList.toggle('player-folded', playerData.folded);

    // Render hole cards (with animation caching)
    if (cardsEl) {
      var cacheKey = isLocal ? 'local-cards' : 'opp-cards';
      if (playerData.hand && playerData.hand.length > 0) {
        renderCardsWithAnimation(playerData.hand, cardsEl, 'card-deal-in', cacheKey);
      } else {
        lastRenderedCards[cacheKey] = '';
        cardsEl.innerHTML = '';
        for (var i = 0; i < 2; i++) {
          var ph = document.createElement('div');
          ph.className = 'card card-placeholder';
          cardsEl.appendChild(ph);
        }
      }
    }
  }

  function renderTable(state, localPlayerIdx) {
    if (!state) return;

    var localPlayer = state.players[localPlayerIdx];
    var opponentIdx = (localPlayerIdx + 1) % 2;
    var opponentPlayer = state.players[opponentIdx];

    // Render opponent
    var opponentArea = document.getElementById('player-opponent');
    if (opponentArea) {
      var isOpponentCurrent = state.currentPlayerIdx === opponentIdx;
      var isOpponentDealer = state.dealerIdx === opponentIdx;
      renderPlayer(opponentPlayer, false, isOpponentCurrent, isOpponentDealer, opponentArea);
    }

    // Render local player
    var localArea = document.getElementById('player-local');
    if (localArea) {
      var isLocalCurrent = state.currentPlayerIdx === localPlayerIdx;
      var isLocalDealer = state.dealerIdx === localPlayerIdx;
      renderPlayer(localPlayer, true, isLocalCurrent, isLocalDealer, localArea);
    }

    // Community cards
    var communityEl = document.getElementById('community-cards');
    if (communityEl) {
      renderCommunityCards(state.communityCards, communityEl);
    }

    // Pot (show lastPotAwarded during showdown/fold since pot is zeroed)
    var potEl = document.getElementById('pot-amount');
    if (potEl) {
      var displayPot = state.pot;
      if ((state.phase === 'showdown' || state.phase === 'fold' || state.phase === 'gameover') && state.pot === 0 && state.lastPotAwarded > 0) {
        displayPot = state.lastPotAwarded;
      }
      potEl.textContent = '$' + displayPot;
    }

    // Phase label
    var phaseEl = document.getElementById('phase-label');
    if (phaseEl) {
      var phaseNames = {
        lobby: 'Lobby', preflop: 'Pre-Flop', flop: 'Flop',
        turn: 'Turn', river: 'River', showdown: 'Showdown',
        fold: 'Hand Over', gameover: 'Game Over'
      };
      phaseEl.textContent = phaseNames[state.phase] || state.phase;
    }

    // Game log
    var logEl = document.getElementById('game-log');
    if (logEl && state.log) {
      logEl.innerHTML = state.log.map(function(entry) { return '<div class="log-entry">' + escapeHtml(entry) + '</div>'; }).join('');
    }

    renderControls(state, localPlayerIdx);
    renderShowdown(state, localPlayerIdx);
  }

  function renderControls(state, localPlayerIdx) {
    var controlsEl = document.getElementById('betting-controls');
    if (!controlsEl) return;

    var isMyTurn = state.currentPlayerIdx === localPlayerIdx;
    var phase = state.phase;
    var isActive = isMyTurn && (phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river');

    controlsEl.classList.toggle('controls-active', isActive);
    controlsEl.classList.toggle('controls-waiting', !isActive && phase !== 'showdown' && phase !== 'gameover' && phase !== 'fold' && phase !== 'lobby');

    var foldBtn = document.getElementById('btn-fold');
    var checkCallBtn = document.getElementById('btn-check-call');
    var raiseBtn = document.getElementById('btn-raise');
    var raiseInput = document.getElementById('raise-amount');
    var raiseSlider = document.getElementById('raise-slider');
    var allinBtn = document.getElementById('btn-allin');

    if (!foldBtn) return;

    foldBtn.disabled = !isActive;
    checkCallBtn.disabled = !isActive;
    raiseBtn.disabled = !isActive;
    if (allinBtn) allinBtn.disabled = !isActive;
    if (raiseInput) raiseInput.disabled = !isActive;
    if (raiseSlider) raiseSlider.disabled = !isActive;

    if (isActive) {
      var localPlayer = state.players[localPlayerIdx];
      var toCall = state.currentBet - localPlayer.bet;

      if (toCall === 0) {
        checkCallBtn.textContent = 'Check';
        checkCallBtn.dataset.action = 'check';
        checkCallBtn.className = 'btn';
        checkCallBtn.style.background = 'var(--btn-call)';
        checkCallBtn.style.color = '#fff';
      } else {
        var callAmt = Math.min(toCall, localPlayer.chips);
        if (callAmt >= localPlayer.chips) {
          checkCallBtn.textContent = 'Call All-In $' + callAmt;
        } else {
          checkCallBtn.textContent = 'Call $' + callAmt;
        }
        checkCallBtn.dataset.action = 'call';
        checkCallBtn.className = 'btn';
        checkCallBtn.style.background = 'var(--btn-call)';
        checkCallBtn.style.color = '#fff';
      }

      var minRaise = state.currentBet + (state.lastRaiseAmount || 20);
      var maxRaise = localPlayer.chips + localPlayer.bet;
      if (raiseSlider && raiseInput) {
        raiseSlider.min = Math.min(minRaise, maxRaise);
        raiseSlider.max = maxRaise;
        if (parseInt(raiseSlider.value) < parseInt(raiseSlider.min)) {
          raiseSlider.value = raiseSlider.min;
          raiseInput.value = raiseSlider.min;
        }
        raiseInput.min = raiseSlider.min;
        raiseInput.max = raiseSlider.max;
        raiseBtn.textContent = 'Raise to $' + (raiseInput.value || raiseSlider.min);
      }

      if (raiseBtn) {
        raiseBtn.style.visibility = maxRaise > state.currentBet ? 'visible' : 'hidden';
      }
      if (allinBtn) {
        allinBtn.style.visibility = localPlayer.chips > 0 ? 'visible' : 'hidden';
      }
    } else {
      if (checkCallBtn) checkCallBtn.textContent = 'Check / Call';
      if (raiseBtn) raiseBtn.textContent = 'Raise';
    }

    // Show/hide controls
    var showControls = phase !== 'lobby' && phase !== 'showdown' && phase !== 'gameover' && phase !== 'fold';
    controlsEl.style.display = showControls ? 'flex' : 'none';
  }

  function renderShowdownHands(state, localPlayerIdx) {
    var handsEl = document.getElementById('showdown-hands');
    if (!handsEl) return;
    handsEl.innerHTML = '';

    var showPhases = ['showdown', 'gameover'];
    if (showPhases.indexOf(state.phase) === -1) return;
    if (!state.showCards) return;

    var opponentIdx = (localPlayerIdx + 1) % 2;
    var players = [
      { data: state.players[localPlayerIdx], label: 'You', idx: localPlayerIdx },
      { data: state.players[opponentIdx], label: state.players[opponentIdx].name, idx: opponentIdx }
    ];

    // Get the winner's eval for highlighting
    var winnerEval = null;
    if (state.playerEvals) {
      if (state.winner >= 0) {
        winnerEval = state.playerEvals[state.winner];
      }
    }
    var winCards = winnerEval && winnerEval.cards ? winnerEval.cards : [];

    for (var p = 0; p < players.length; p++) {
      var player = players[p];
      var row = document.createElement('div');
      row.className = 'showdown-player-hand';
      var isWinner = state.winner === player.idx || state.winner === -1;

      var nameSpan = document.createElement('div');
      nameSpan.className = 'showdown-hand-label' + (isWinner && state.winner !== -1 ? ' showdown-winner-label' : '');
      nameSpan.textContent = player.label;
      row.appendChild(nameSpan);

      var cardsRow = document.createElement('div');
      cardsRow.className = 'showdown-cards-row';
      if (player.data.hand) {
        for (var c = 0; c < player.data.hand.length; c++) {
          var card = player.data.hand[c];
          var cardEl = renderCard(card, card.hidden);
          if (isCardInWinning(card, winCards) && isWinner) {
            cardEl.classList.add('card-winner');
          }
          cardEl.classList.add('card-flip-reveal');
          cardEl.style.animationDelay = (c * 0.15) + 's';
          cardsRow.appendChild(cardEl);
        }
      }
      row.appendChild(cardsRow);

      // Hand name from playerEvals (correctly indexed)
      var handNameEl = document.createElement('div');
      handNameEl.className = 'showdown-hand-name';
      if (state.playerEvals && state.playerEvals[player.idx]) {
        handNameEl.textContent = state.playerEvals[player.idx].name;
      }
      row.appendChild(handNameEl);

      handsEl.appendChild(row);
    }
  }

  function renderFoldResult(state, localPlayerIdx) {
    var handsEl = document.getElementById('showdown-hands');
    if (!handsEl) return;
    handsEl.innerHTML = '';
    // No hands to display on fold
  }

  function isCardInWinning(card, winCards) {
    if (!card || card.hidden || !winCards) return false;
    for (var i = 0; i < winCards.length; i++) {
      if (winCards[i].rank === card.rank && winCards[i].suit === card.suit) return true;
    }
    return false;
  }

  function highlightWinningCommunityCards(state) {
    if (!state.playerEvals) return;
    var winnerEval = state.winner >= 0 ? state.playerEvals[state.winner] : null;
    if (!winnerEval || !winnerEval.cards) return;
    var communityEl = document.getElementById('community-cards');
    if (!communityEl) return;
    var cardEls = communityEl.querySelectorAll('.card');
    for (var i = 0; i < cardEls.length; i++) {
      var card = state.communityCards && state.communityCards[i];
      if (card && isCardInWinning(card, winnerEval.cards)) {
        cardEls[i].classList.add('card-winner');
      }
    }
  }

  function renderShowdown(state, localPlayerIdx) {
    var overlay = document.getElementById('showdown-overlay');
    if (!overlay) return;

    if (state.phase === 'showdown') {
      overlay.style.display = 'flex';
      overlay.className = 'showdown-active';
      var msgEl = document.getElementById('showdown-message');
      var potAwardEl = document.getElementById('showdown-pot-award');

      renderShowdownHands(state, localPlayerIdx);
      highlightWinningCommunityCards(state);

      if (msgEl) {
        if (state.winner === -1) {
          msgEl.innerHTML = '<span class="win-text">Split Pot!</span>';
        } else if (state.winner === localPlayerIdx) {
          msgEl.innerHTML = '<span class="win-text">You Win!</span>';
        } else {
          var opponentIdx = (localPlayerIdx + 1) % 2;
          var opponentName = state.players[opponentIdx].name;
          msgEl.innerHTML = '<span class="lose-text">' + escapeHtml(opponentName) + ' Wins</span>';
        }
      }

      if (potAwardEl) {
        var potDisplay = state.lastPotAwarded || state.pot;
        potAwardEl.textContent = potDisplay > 0 ? 'Won $' + potDisplay : '';
      }

    } else if (state.phase === 'fold') {
      overlay.style.display = 'flex';
      overlay.className = 'fold-active';
      renderFoldResult(state, localPlayerIdx);
      var msgEl2 = document.getElementById('showdown-message');
      var potAwardEl2 = document.getElementById('showdown-pot-award');
      if (msgEl2) {
        if (state.winner === localPlayerIdx) {
          msgEl2.innerHTML = '<span class="win-text">Opponent Folded - You Win!</span>';
        } else {
          var oppIdx = (localPlayerIdx + 1) % 2;
          var oppName = state.players[oppIdx].name;
          msgEl2.innerHTML = '<span class="lose-text">You Folded - ' + escapeHtml(oppName) + ' Wins</span>';
        }
      }
      if (potAwardEl2) {
        var foldPot = state.lastPotAwarded || state.pot;
        potAwardEl2.textContent = foldPot > 0 ? 'Won $' + foldPot : '';
      }

    } else if (state.phase === 'gameover') {
      overlay.style.display = 'flex';
      overlay.className = 'showdown-active';
      renderShowdownHands(state, localPlayerIdx);
      highlightWinningCommunityCards(state);
      var msgEl3 = document.getElementById('showdown-message');
      if (msgEl3) {
        if (state.winner === localPlayerIdx) {
          msgEl3.innerHTML = '<span class="win-text gameover-text">GAME OVER - You Win!</span>';
        } else {
          var oIdx = (localPlayerIdx + 1) % 2;
          var oName = state.players[oIdx].name;
          msgEl3.innerHTML = '<span class="lose-text gameover-text">GAME OVER - ' + escapeHtml(oName) + ' Wins</span>';
        }
      }
    } else {
      overlay.style.display = 'none';
      overlay.className = '';
      var hEl = document.getElementById('showdown-hands');
      if (hEl) hEl.innerHTML = '';
      // Clear card animation cache when new hand starts
      lastRenderedCards = {};
    }
  }

  function showLobby() {
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('connecting-screen').style.display = 'none';
    lastRenderedCards = {};
  }

  function showConnecting(msg) {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('connecting-screen').style.display = 'flex';
    var el = document.getElementById('connecting-message');
    if (el) el.textContent = msg || 'Connecting...';
  }

  function showGame() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.getElementById('connecting-screen').style.display = 'none';
  }

  function showError(msg) {
    var el = document.getElementById('error-message');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      el.style.animation = 'none';
      el.offsetHeight; // reflow
      el.style.animation = 'toast-in 0.3s ease-out';
      setTimeout(function() { el.style.display = 'none'; }, 4000);
    }
  }

  function showStatus(msg) {
    var el = document.getElementById('status-message');
    if (el) {
      el.textContent = msg;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    renderTable: renderTable,
    renderCard: renderCard,
    showLobby: showLobby,
    showConnecting: showConnecting,
    showGame: showGame,
    showError: showError,
    showStatus: showStatus
  };
})();

window.UI = UI;
