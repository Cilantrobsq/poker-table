'use strict';

// ─── PeerJS Networking Module ─────────────────────────────────────────────────
// Handles P2P connection using PeerJS (free cloud signaling via 0.peerjs.com)
//
// Architecture:
//   Host: creates a Peer with ID = "poker-" + roomCode, runs authoritative game state
//   Guest: connects to host's Peer ID, sends actions, receives state updates
//
// Message protocol:
//   host -> guest: { type: 'state', state: <GameState> }
//   host -> guest: { type: 'start', state: <GameState> }
//   host -> guest: { type: 'chat', text: <string> }
//   guest -> host: { type: 'action', action: <string>, amount: <number> }
//   guest -> host: { type: 'name', name: <string> }
//   guest -> host: { type: 'ready' }

const Network = (function () {
  let peer = null;
  let conn = null;
  let isHost = false;
  let localPlayerIdx = -1; // 0 = host, 1 = guest
  let roomCode = '';
  let disconnectTimer = null;
  let onMessageCallback = null;
  let onConnectedCallback = null;
  let onDisconnectedCallback = null;
  let onErrorCallback = null;

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function getPeerOptions() {
    // Use PeerJS free cloud server (0.peerjs.com)
    return {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 0
    };
  }

  // Host: create a peer and wait for a guest to connect
  function hostGame(localName, callbacks) {
    isHost = true;
    localPlayerIdx = 0;
    roomCode = generateRoomCode();
    setCallbacks(callbacks);

    const peerId = 'poker-' + roomCode;

    try {
      peer = new Peer(peerId, getPeerOptions());
    } catch (e) {
      onErrorCallback && onErrorCallback('Failed to initialize PeerJS: ' + e.message);
      return;
    }

    peer.on('open', function (id) {
      console.log('PeerJS: Host peer opened with ID', id);
      callbacks.onRoomCodeReady && callbacks.onRoomCodeReady(roomCode);
    });

    peer.on('connection', function (connection) {
      if (conn) {
        // Already have a connection, reject
        connection.close();
        return;
      }
      conn = connection;
      setupConnection(conn, localName);
    });

    peer.on('error', function (err) {
      console.error('PeerJS error:', err);
      const msg = err.type === 'unavailable-id'
        ? 'Room code taken, please try again'
        : 'Connection error: ' + err.message;
      onErrorCallback && onErrorCallback(msg);
    });

    peer.on('disconnected', function () {
      console.log('PeerJS: Peer disconnected from signaling server');
      // Try to reconnect
      if (peer && !peer.destroyed) {
        peer.reconnect();
      }
    });
  }

  // Guest: connect to a host's room
  function joinGame(roomCodeInput, localName, callbacks) {
    isHost = false;
    localPlayerIdx = 1;
    roomCode = roomCodeInput.toUpperCase().trim();
    setCallbacks(callbacks);

    const peerId = 'poker-' + roomCode;

    try {
      peer = new Peer(getPeerOptions());
    } catch (e) {
      onErrorCallback && onErrorCallback('Failed to initialize PeerJS: ' + e.message);
      return;
    }

    peer.on('open', function () {
      console.log('PeerJS: Guest peer opened, connecting to', peerId);
      conn = peer.connect(peerId, { reliable: true });
      setupConnection(conn, localName);
    });

    peer.on('error', function (err) {
      console.error('PeerJS error:', err);
      const msg = err.type === 'peer-unavailable'
        ? 'Room not found. Check the code and try again.'
        : 'Connection error: ' + err.message;
      onErrorCallback && onErrorCallback(msg);
    });
  }

  function setupConnection(connection, localName) {
    connection.on('open', function () {
      console.log('PeerJS: Connection established');
      clearDisconnectTimer();

      // Exchange names
      sendMessage({ type: 'name', name: localName, playerIdx: localPlayerIdx });

      onConnectedCallback && onConnectedCallback(localPlayerIdx);
    });

    connection.on('data', function (data) {
      try {
        const msg = typeof data === 'string' ? JSON.parse(data) : data;
        handleMessage(msg);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    });

    connection.on('close', function () {
      console.log('PeerJS: Connection closed');
      handleDisconnect();
    });

    connection.on('error', function (err) {
      console.error('PeerJS connection error:', err);
      onErrorCallback && onErrorCallback('Connection error: ' + err.message);
    });
  }

  function handleMessage(msg) {
    console.log('PeerJS received:', msg.type);
    if (onMessageCallback) {
      onMessageCallback(msg);
    }
  }

  function handleDisconnect() {
    clearDisconnectTimer();
    // Give 30 seconds for reconnect before firing disconnect callback
    disconnectTimer = setTimeout(function () {
      onDisconnectedCallback && onDisconnectedCallback();
    }, 30000);
    onErrorCallback && onErrorCallback('Opponent disconnected. Waiting 30s for reconnect...');
  }

  function clearDisconnectTimer() {
    if (disconnectTimer) {
      clearTimeout(disconnectTimer);
      disconnectTimer = null;
    }
  }

  function sendMessage(msg) {
    if (conn && conn.open) {
      try {
        conn.send(msg);
      } catch (e) {
        console.error('Failed to send message:', e);
        onErrorCallback && onErrorCallback('Failed to send message: ' + e.message);
      }
    } else {
      console.warn('Cannot send: connection not open');
    }
  }

  function sendAction(action, amount) {
    sendMessage({ type: 'action', action, amount: amount || 0 });
  }

  function sendState(state, forPlayerIdx) {
    // Host calls this to broadcast state to guest
    sendMessage({ type: 'state', state });
  }

  function sendStart(state) {
    sendMessage({ type: 'start', state });
  }

  function disconnect() {
    clearDisconnectTimer();
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    isHost = false;
    localPlayerIdx = -1;
    roomCode = '';
  }

  function setCallbacks(cbs) {
    onMessageCallback = cbs.onMessage || null;
    onConnectedCallback = cbs.onConnected || null;
    onDisconnectedCallback = cbs.onDisconnected || null;
    onErrorCallback = cbs.onError || null;
  }

  function isConnected() {
    return conn && conn.open;
  }

  function getLocalPlayerIdx() { return localPlayerIdx; }
  function getIsHost() { return isHost; }
  function getRoomCode() { return roomCode; }

  return {
    hostGame,
    joinGame,
    sendAction,
    sendState,
    sendStart,
    sendMessage,
    disconnect,
    isConnected,
    getLocalPlayerIdx,
    getIsHost,
    getRoomCode,
    generateRoomCode
  };
})();

window.Network = Network;
