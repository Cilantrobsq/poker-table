'use strict';

// ─── UI Module ────────────────────────────────────────────────────────────────
// Handles all DOM rendering. Pure display logic, no game state mutation.

const UI = (function () {

  // Render a single card element
  function renderCard(card, faceDown) {
    const el = document.createElement('div');
    el.className = 'card';
    if (faceDown || !card || card.hidden) {
      el.classList.add('card-back');
      el.innerHTML = '';
    } else {
      const isRed = card.suit === 'H' || card.suit === 'D';
      el.classList.add(isRed ? 'card-red' : 'card-black');
      const rankName = window.RANK_NAMES[card.rank] || card.rank;
      const suitSymbol = window.SUIT_SYMBOLS[card.suit] || card.suit;
      el.innerHTML = `
        <span class="card-rank-top">${rankName}</span>
        <span class="card-suit-center">${suitSymbol}</span>
        <span class="card-rank-bottom">${rankName}</span>
      `;
    }
    return el;
  }

  function renderCards(cards, container, faceDown) {
    container.innerHTML = '';
    if (!cards || cards.length === 0) {
      // Show placeholder cards
      const count = faceDown ? 2 : 5;
      for (let i = 0; i < count; i++) {
        const placeholder = document.createElement('div');
        placeholder.className = 'card card-placeholder';
        container.appendChild(placeholder);
      }
      return;
    }
    for (const card of cards) {
      container.appendChild(renderCard(card, faceDown && !card.hidden && card.suit !== undefined ? false : false));
    }
  }

  function renderCommunityCards(cards, container) {
    container.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const card = cards && cards[i];
      if (card) {
        container.appendChild(renderCard(card, false));
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'card card-placeholder';
        container.appendChild(placeholder);
      }
    }
  }

  // Render a player area (opponent at top, local player at bottom)
  function renderPlayer(playerData, isLocal, isCurrent, isDealer, container) {
    const nameEl = container.querySelector('.player-name');
    const chipsEl = container.querySelector('.player-chips');
    const betEl = container.querySelector('.player-bet');
    const cardsEl = container.querySelector('.player-cards');
    const statusEl = container.querySelector('.player-status');
    const dealerBtn = container.querySelector('.dealer-btn');

    if (nameEl) nameEl.textContent = playerData.name;
    if (chipsEl) chipsEl.textContent = `$${playerData.chips}`;
    if (betEl) {
      betEl.textContent = playerData.bet > 0 ? `Bet: $${playerData.bet}` : '';
    }

    if (dealerBtn) {
      dealerBtn.style.display = isDealer ? 'inline-flex' : 'none';
    }

    // Status badges
    let statusText = '';
    if (playerData.folded) statusText = 'Folded';
    else if (playerData.allIn) statusText = 'All In';
    else if (isCurrent) statusText = 'Your Turn';
    if (statusEl) {
      statusEl.textContent = statusText;
      statusEl.className = 'player-status' + (isCurrent ? ' active' : '');
    }

    // Turn highlight
    container.classList.toggle('player-active', isCurrent);
    container.classList.toggle('player-folded', playerData.folded);

    // Render cards
    if (cardsEl) {
      cardsEl.innerHTML = '';
      const isOpponent = !isLocal;
      if (playerData.hand && playerData.hand.length > 0) {
        for (const card of playerData.hand) {
          cardsEl.appendChild(renderCard(card, isOpponent && card.hidden));
        }
      } else {
        for (let i = 0; i < 2; i++) {
          const ph = document.createElement('div');
          ph.className = 'card card-placeholder';
          cardsEl.appendChild(ph);
        }
      }
    }
  }

  // Main render function - renders the full game table
  function renderTable(state, localPlayerIdx) {
    if (!state) return;

    const localPlayer = state.players[localPlayerIdx];
    const opponentIdx = (localPlayerIdx + 1) % 2;
    const opponentPlayer = state.players[opponentIdx];

    // Render opponent (top)
    const opponentArea = document.getElementById('player-opponent');
    if (opponentArea) {
      const isOpponentCurrent = state.currentPlayerIdx === opponentIdx;
      const isOpponentDealer = state.dealerIdx === opponentIdx;
      renderPlayer(opponentPlayer, false, isOpponentCurrent, isOpponentDealer, opponentArea);
    }

    // Render local player (bottom)
    const localArea = document.getElementById('player-local');
    if (localArea) {
      const isLocalCurrent = state.currentPlayerIdx === localPlayerIdx;
      const isLocalDealer = state.dealerIdx === localPlayerIdx;
      renderPlayer(localPlayer, true, isLocalCurrent, isLocalDealer, localArea);
    }

    // Render community cards
    const communityEl = document.getElementById('community-cards');
    if (communityEl) {
      renderCommunityCards(state.communityCards, communityEl);
    }

    // Pot
    const potEl = document.getElementById('pot-amount');
    if (potEl) potEl.textContent = `$${state.pot}`;

    // Phase label
    const phaseEl = document.getElementById('phase-label');
    if (phaseEl) {
      const phaseNames = {
        lobby: 'Lobby', preflop: 'Pre-Flop', flop: 'Flop',
        turn: 'Turn', river: 'River', showdown: 'Showdown', gameover: 'Game Over'
      };
      phaseEl.textContent = phaseNames[state.phase] || state.phase;
    }

    // Game log
    const logEl = document.getElementById('game-log');
    if (logEl && state.log) {
      logEl.innerHTML = state.log.map(entry => `<div class="log-entry">${escapeHtml(entry)}</div>`).join('');
    }

    // Betting controls
    renderControls(state, localPlayerIdx);

    // Showdown overlay
    renderShowdown(state, localPlayerIdx);
  }

  function renderControls(state, localPlayerIdx) {
    const controlsEl = document.getElementById('betting-controls');
    if (!controlsEl) return;

    const isMyTurn = state.currentPlayerIdx === localPlayerIdx;
    const phase = state.phase;
    const isActive = isMyTurn && (phase === 'preflop' || phase === 'flop' || phase === 'turn' || phase === 'river');

    controlsEl.classList.toggle('controls-active', isActive);

    const foldBtn = document.getElementById('btn-fold');
    const checkCallBtn = document.getElementById('btn-check-call');
    const raiseBtn = document.getElementById('btn-raise');
    const raiseInput = document.getElementById('raise-amount');
    const raiseSlider = document.getElementById('raise-slider');

    if (!foldBtn) return;

    foldBtn.disabled = !isActive;
    checkCallBtn.disabled = !isActive;
    raiseBtn.disabled = !isActive;
    if (raiseInput) raiseInput.disabled = !isActive;
    if (raiseSlider) raiseSlider.disabled = !isActive;

    if (isActive) {
      const localPlayer = state.players[localPlayerIdx];
      const toCall = state.currentBet - localPlayer.bet;

      // Check/Call button label
      if (toCall === 0) {
        checkCallBtn.textContent = 'Check';
        checkCallBtn.dataset.action = 'check';
      } else {
        const callAmt = Math.min(toCall, localPlayer.chips);
        checkCallBtn.textContent = callAmt >= localPlayer.chips
          ? `Call All-In $${callAmt}`
          : `Call $${callAmt}`;
        checkCallBtn.dataset.action = 'call';
      }

      // Raise slider range
      const minRaise = state.currentBet + (state.lastRaiseAmount || state.bigBlind || 20);
      const maxRaise = localPlayer.chips + localPlayer.bet;
      if (raiseSlider && raiseInput) {
        raiseSlider.min = Math.min(minRaise, maxRaise);
        raiseSlider.max = maxRaise;
        if (parseInt(raiseSlider.value) < parseInt(raiseSlider.min)) {
          raiseSlider.value = raiseSlider.min;
          raiseInput.value = raiseSlider.min;
        }
        raiseBtn.textContent = `Raise to $${raiseInput.value || raiseSlider.min}`;
      }

      // Hide raise if can't raise more
      if (raiseBtn) {
        raiseBtn.style.visibility = maxRaise > state.currentBet ? 'visible' : 'hidden';
      }
    } else {
      if (checkCallBtn) checkCallBtn.textContent = 'Check / Call';
      if (raiseBtn) raiseBtn.textContent = 'Raise';
    }

    // Show/hide controls based on game phase
    const showControls = phase !== 'lobby' && phase !== 'showdown' && phase !== 'gameover';
    controlsEl.style.display = showControls ? 'flex' : 'none';
  }

  function renderShowdown(state, localPlayerIdx) {
    const overlay = document.getElementById('showdown-overlay');
    if (!overlay) return;

    if (state.phase === 'showdown') {
      overlay.style.display = 'flex';
      const msgEl = document.getElementById('showdown-message');
      if (msgEl) {
        if (state.winner === -1) {
          msgEl.textContent = 'Split Pot!';
        } else if (state.winner === localPlayerIdx) {
          const hand = state.winningHand;
          msgEl.innerHTML = `<span class="win-text">You Win!</span><br><small>${hand ? hand.name : ''}</small>`;
        } else {
          const opponentIdx = (localPlayerIdx + 1) % 2;
          const opponentName = state.players[opponentIdx].name;
          const hand = state.winningHand;
          msgEl.innerHTML = `<span class="lose-text">${opponentName} Wins</span><br><small>${hand ? hand.name : ''}</small>`;
        }
      }
    } else if (state.phase === 'gameover') {
      overlay.style.display = 'flex';
      const msgEl = document.getElementById('showdown-message');
      if (msgEl) {
        if (state.winner === localPlayerIdx) {
          msgEl.innerHTML = '<span class="win-text">Game Over - You Win!</span>';
        } else {
          const opponentIdx = (localPlayerIdx + 1) % 2;
          const opponentName = state.players[opponentIdx].name;
          msgEl.innerHTML = `<span class="lose-text">Game Over - ${opponentName} Wins</span>`;
        }
      }
    } else {
      overlay.style.display = 'none';
    }
  }

  function showLobby() {
    document.getElementById('lobby-screen').style.display = 'flex';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('connecting-screen').style.display = 'none';
  }

  function showConnecting(msg) {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'none';
    document.getElementById('connecting-screen').style.display = 'flex';
    const el = document.getElementById('connecting-message');
    if (el) el.textContent = msg || 'Connecting...';
  }

  function showGame() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'flex';
    document.getElementById('connecting-screen').style.display = 'none';
  }

  function showError(msg) {
    const el = document.getElementById('error-message');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
  }

  function showStatus(msg) {
    const el = document.getElementById('status-message');
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
    renderTable,
    renderCard,
    showLobby,
    showConnecting,
    showGame,
    showError,
    showStatus
  };
})();

window.UI = UI;
