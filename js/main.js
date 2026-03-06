'use strict';

// ─── App Controller ────────────────────────────────────────────────────────────
// Orchestrates GameEngine, UI, and Network modules.
// dealerButton state is managed by GameEngine and synced via PeerJS state messages.
// smallBlind = 10, bigBlind = 20 (set in GameEngine constructor).

(function () {
  'use strict';

  let game = null;
  let localPlayerIdx = -1;
  let isHost = false;
  let pendingGuestName = null;
  let nextHandTimer = null;
  let gameState = null; // cached for guest

  // ── DOM References ──────────────────────────────────────────────────────────
  const els = {
    playerName: document.getElementById('player-name'),
    roomCodeInput: document.getElementById('room-code-input'),
    btnHost: document.getElementById('btn-host'),
    btnJoin: document.getElementById('btn-join'),
    btnCancel: document.getElementById('btn-cancel'),
    btnCopyCode: document.getElementById('btn-copy-code'),
    roomCodeDisplay: document.getElementById('room-code-display'),
    roomCodeWrapper: document.getElementById('room-code-wrapper'),
    btnFold: document.getElementById('btn-fold'),
    btnCheckCall: document.getElementById('btn-check-call'),
    btnRaise: document.getElementById('btn-raise'),
    raiseSlider: document.getElementById('raise-slider'),
    raiseAmount: document.getElementById('raise-amount'),
    btnNextHand: document.getElementById('btn-next-hand'),
    btnRestart: document.getElementById('btn-restart'),
    btnDisconnect: document.getElementById('btn-disconnect'),
    btnNewGame: document.getElementById('btn-new-game'),
    oppCards: document.getElementById('opp-cards'),
    oppName: document.getElementById('opp-name'),
    oppChips: document.getElementById('opp-chips'),
    oppBet: document.getElementById('opp-bet'),
    oppStatus: document.getElementById('opp-status'),
    oppDealer: document.getElementById('opp-dealer'),
    localCards: document.getElementById('local-cards'),
    localName: document.getElementById('local-name'),
    localChips: document.getElementById('local-chips'),
    localBet: document.getElementById('local-bet'),
    localStatus: document.getElementById('local-status'),
    localDealer: document.getElementById('local-dealer'),
    communityCards: document.getElementById('community-cards'),
    potAmount: document.getElementById('pot-amount'),
    phaseLabel: document.getElementById('phase-label'),
    gameLog: document.getElementById('game-log'),
    bettingControls: document.getElementById('betting-controls'),
    showdownOverlay: document.getElementById('showdown-overlay'),
    showdownMessage: document.getElementById('showdown-message'),
    statusMessage: document.getElementById('status-message'),
  };

  // ── Lobby Events ────────────────────────────────────────────────────────────
  els.btnHost.addEventListener('click', function () {
    const name = (els.playerName.value || 'Andres').trim();
    if (!name) { UI.showError('Enter your name first'); return; }
    isHost = true;
    localPlayerIdx = 0;

    UI.showConnecting('Waiting for opponent to join...');
    els.roomCodeWrapper.style.display = 'flex';

    Network.hostGame(name, {
      onRoomCodeReady: function (code) {
        els.roomCodeDisplay.textContent = code;
      },
      onConnected: function (idx) {
        UI.showStatus('Opponent connected! Starting game...');
      },
      onMessage: handleNetworkMessage,
      onDisconnected: handleDisconnect,
      onError: function (msg) { UI.showError(msg); }
    });
  });

  els.btnJoin.addEventListener('click', function () {
    const name = (els.playerName.value || 'Henning').trim();
    const code = els.roomCodeInput.value.toUpperCase().trim();
    if (!name) { UI.showError('Enter your name first'); return; }
    if (code.length < 6) { UI.showError('Enter a 6-character room code'); return; }
    isHost = false;
    localPlayerIdx = 1;

    UI.showConnecting('Connecting to game...');

    Network.joinGame(code, name, {
      onConnected: function (idx) {
        UI.showStatus('Connected! Waiting for host to start...');
        // Send our name to the host
        Network.sendMessage({ type: 'name', name: name, playerIdx: 1 });
      },
      onMessage: handleNetworkMessage,
      onDisconnected: handleDisconnect,
      onError: function (msg) { UI.showError(msg); }
    });
  });

  els.btnCancel.addEventListener('click', function () {
    Network.disconnect();
    UI.showLobby();
  });

  els.btnCopyCode.addEventListener('click', function () {
    const code = els.roomCodeDisplay.textContent;
    navigator.clipboard.writeText(code).then(function () {
      els.btnCopyCode.textContent = 'Copied!';
      setTimeout(function () { els.btnCopyCode.textContent = 'Copy Code'; }, 2000);
    }).catch(function () {
      els.btnCopyCode.textContent = code;
    });
  });

  els.btnDisconnect.addEventListener('click', function () {
    if (confirm('Leave the game?')) {
      Network.disconnect();
      game = null;
      UI.showLobby();
    }
  });

  // ── Raise Controls Sync ─────────────────────────────────────────────────────
  els.raiseSlider.addEventListener('input', function () {
    els.raiseAmount.value = this.value;
    updateRaiseButton();
  });
  els.raiseAmount.addEventListener('input', function () {
    let v = parseInt(this.value) || 0;
    v = Math.max(parseInt(els.raiseSlider.min), Math.min(parseInt(els.raiseSlider.max), v));
    els.raiseSlider.value = v;
    this.value = v;
    updateRaiseButton();
  });
  function updateRaiseButton() {
    els.btnRaise.textContent = 'Raise to $' + (els.raiseAmount.value || els.raiseSlider.value);
  }

  // ── Betting Action Events ───────────────────────────────────────────────────
  els.btnFold.addEventListener('click', function () { submitAction('fold'); });
  els.btnCheckCall.addEventListener('click', function () {
    const action = this.dataset.action || 'check';
    submitAction(action);
  });
  els.btnRaise.addEventListener('click', function () {
    const amount = parseInt(els.raiseAmount.value) || parseInt(els.raiseSlider.value);
    submitAction('raise', amount);
  });

  function submitAction(action, amount) {
    if (!Network.isConnected()) {
      UI.showError('Not connected to opponent');
      return;
    }

    if (isHost) {
      // Host runs game engine locally
      const result = game.placeBet(localPlayerIdx, action, amount);
      if (result && result.error) {
        UI.showError(result.error);
        return;
      }
      broadcastState();
      updateLocalView();
      checkPhaseTransitions();
    } else {
      // Guest sends action to host
      Network.sendAction(action, amount);
      // Disable controls while waiting for state update
      disableControls();
    }
  }

  function disableControls() {
    els.bettingControls.classList.remove('controls-active');
    ['btn-fold', 'btn-check-call', 'btn-raise'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.disabled = true;
    });
  }

  // ── Showdown / Next Hand ────────────────────────────────────────────────────
  els.btnNextHand.addEventListener('click', function () {
    if (isHost) {
      startNextHand();
    }
    // Guest: wait for host to start next hand
  });

  els.btnRestart.addEventListener('click', function () {
    if (isHost) {
      game.fullReset();
      // Keep player names
      game.players[0].name = Network.getIsHost() ? getLocalName() : 'Host';
      game.players[1].name = pendingGuestName || 'Guest';
      game.players[0].chips = game.startingChips;
      game.players[1].chips = game.startingChips;
      startNextHand();
    }
  });

  els.btnNewGame.addEventListener('click', function () {
    if (isHost) {
      game.fullReset();
      game.players[0].name = getLocalName();
      game.players[1].name = pendingGuestName || 'Guest';
      game.players[0].chips = game.startingChips;
      game.players[1].chips = game.startingChips;
      startNextHand();
    } else {
      UI.showError('Only the host can start a new game');
    }
  });

  function startNextHand() {
    if (nextHandTimer) { clearTimeout(nextHandTimer); nextHandTimer = null; }
    game.startHand();
    broadcastState();
    updateLocalView();
  }

  // ── Network Message Handler ─────────────────────────────────────────────────
  function handleNetworkMessage(msg) {
    switch (msg.type) {
      case 'name':
        // Host receives guest name
        if (isHost && msg.playerIdx === 1) {
          pendingGuestName = msg.name;
          // Now start the game
          initGame(getLocalName(), msg.name);
        }
        break;

      case 'start':
        // Guest receives initial game state (includes dealerButton, smallBlind pot)
        if (!isHost) {
          gameState = msg.state;
          UI.showGame();
          UI.renderTable(gameState, localPlayerIdx);
          els.bettingControls.style.display = 'flex';
        }
        break;

      case 'state':
        // Guest receives updated game state (dealerButton and blind state synced)
        if (!isHost) {
          gameState = msg.state;
          UI.renderTable(gameState, localPlayerIdx);
          handlePhaseOnGuest(gameState);
        }
        break;

      case 'action':
        // Host receives action from guest
        if (isHost && msg.action) {
          const result = game.placeBet(1, msg.action, msg.amount || 0);
          if (result && result.error) {
            console.warn('Guest action error:', result.error);
          } else {
            broadcastState();
            updateLocalView();
            checkPhaseTransitions();
          }
        }
        break;

      case 'nexthand':
        // Host tells guest next hand is starting (already handled via state)
        break;
    }
  }

  function handlePhaseOnGuest(state) {
    if (state.phase === 'showdown' || state.phase === 'gameover') {
      els.btnNextHand.style.display = 'none';
      els.btnRestart.style.display = 'none';
      if (state.phase === 'gameover') {
        UI.showStatus('Game over! Host can restart.');
      } else {
        UI.showStatus('Waiting for next hand...');
      }
    } else {
      UI.showStatus(state.currentPlayerIdx === localPlayerIdx ? 'Your turn' : "Opponent's turn");
    }
  }

  // ── Game Init ───────────────────────────────────────────────────────────────
  function initGame(hostName, guestName) {
    game = new GameEngine();
    game.setPlayerNames(hostName, guestName);
    UI.showGame();
    els.bettingControls.style.display = 'flex';
    els.btnNewGame.style.display = 'inline-flex';
    game.startHand();
    broadcastState(true); // send 'start' message to guest
    updateLocalView();
  }

  function broadcastState(isStart) {
    if (!Network.isConnected()) return;
    // Guest receives state with host's cards hidden; dealerButton included in state
    const stateForGuest = game.getState(1);
    if (isStart) {
      Network.sendStart(stateForGuest);
    } else {
      Network.sendState(stateForGuest);
    }
  }

  function updateLocalView() {
    if (!game) return;
    const state = game.getState(localPlayerIdx);
    UI.renderTable(state, localPlayerIdx);
    checkPhaseTransitions();
  }

  function checkPhaseTransitions() {
    if (!game) return;
    const phase = game.phase;

    if (phase === 'showdown') {
      els.btnNextHand.style.display = isHost ? 'inline-flex' : 'none';
      els.btnRestart.style.display = 'none';
      // Auto-start next hand after 4 seconds (host side)
      if (isHost) {
        if (nextHandTimer) clearTimeout(nextHandTimer);
        nextHandTimer = setTimeout(startNextHand, 4000);
      }
    } else if (phase === 'gameover') {
      els.btnNextHand.style.display = 'none';
      els.btnRestart.style.display = isHost ? 'inline-flex' : 'none';
      els.btnNewGame.style.display = isHost ? 'inline-flex' : 'none';
      if (nextHandTimer) { clearTimeout(nextHandTimer); nextHandTimer = null; }
    } else {
      els.btnNextHand.style.display = 'none';
      els.btnRestart.style.display = 'none';
    }

    if (isHost) {
      const isMyTurn = game.currentPlayerIdx === 0;
      UI.showStatus(isMyTurn ? 'Your turn' : "Opponent's turn");
    }
  }

  function handleDisconnect() {
    UI.showError('Opponent disconnected. The game will end.');
    if (game && game.phase !== 'lobby' && game.phase !== 'showdown' && game.phase !== 'gameover') {
      if (isHost) {
        const guestLost = game.players[1];
        guestLost.folded = true;
        game.endHand(0, 'fold', null, null);
        broadcastState();
        updateLocalView();
      }
    }
  }

  function getLocalName() {
    return (els.playerName.value || (isHost ? 'Andres' : 'Henning')).trim();
  }

  // ── Initialize UI State ─────────────────────────────────────────────────────
  UI.showLobby();

})();
