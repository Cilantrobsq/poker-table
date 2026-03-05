'use strict';

// ─── PeerJS Networking Module ─────────────────────────────────────────────────

const Network = (function () {
  let peer = null;
  let conn = null;
  let isHost = false;
  let localPlayerIdx = -1;
  let roomCode = '';
  let disconnectTimer = null;
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 5;
  let onMessageCallback = null;
  let onConnectedCallback = null;
  let onDisconnectedCallback = null;
  let onErrorCallback = null;
  let lastHostName = '';
  let lastGuestName = '';
  let lastCallbacks = null;

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  function getPeerOptions() {
    return {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 0,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    };
  }

  function hostGame(localName, callbacks) {
    isHost = true;
    localPlayerIdx = 0;
    roomCode = generateRoomCode();
    lastHostName = localName;
    lastCallbacks = callbacks;
    setCallbacks(callbacks);

    var peerId = 'poker-' + roomCode;

    try {
      peer = new Peer(peerId, getPeerOptions());
    } catch (e) {
      onErrorCallback && onErrorCallback('Failed to initialize PeerJS: ' + e.message);
      return;
    }

    peer.on('open', function (id) {
      console.log('PeerJS: Host peer opened with ID', id);
      reconnectAttempts = 0;
      callbacks.onRoomCodeReady && callbacks.onRoomCodeReady(roomCode);
    });

    peer.on('connection', function (connection) {
      if (conn && conn.open) {
        connection.close();
        return;
      }
      conn = connection;
      setupConnection(conn, localName);
    });

    peer.on('error', function (err) {
      console.error('PeerJS error:', err);
      var msg = err.type === 'unavailable-id'
        ? 'Room code taken, please try again'
        : 'Connection error: ' + (err.message || err.type);
      onErrorCallback && onErrorCallback(msg);
    });

    peer.on('disconnected', function () {
      console.log('PeerJS: Host disconnected from signaling server');
      if (peer && !peer.destroyed && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log('PeerJS: Reconnecting attempt ' + reconnectAttempts);
        setTimeout(function() {
          if (peer && !peer.destroyed) peer.reconnect();
        }, 1000 * reconnectAttempts);
      }
    });
  }

  function joinGame(roomCodeInput, localName, callbacks) {
    isHost = false;
    localPlayerIdx = 1;
    roomCode = roomCodeInput.toUpperCase().trim();
    lastGuestName = localName;
    lastCallbacks = callbacks;
    setCallbacks(callbacks);

    var peerId = 'poker-' + roomCode;

    try {
      peer = new Peer(getPeerOptions());
    } catch (e) {
      onErrorCallback && onErrorCallback('Failed to initialize PeerJS: ' + e.message);
      return;
    }

    peer.on('open', function () {
      console.log('PeerJS: Guest peer opened, connecting to', peerId);
      reconnectAttempts = 0;
      conn = peer.connect(peerId, { reliable: true });
      setupConnection(conn, localName);
    });

    peer.on('error', function (err) {
      console.error('PeerJS error:', err);
      var msg = err.type === 'peer-unavailable'
        ? 'Room not found. Check the code and try again.'
        : 'Connection error: ' + (err.message || err.type);
      onErrorCallback && onErrorCallback(msg);
    });

    peer.on('disconnected', function () {
      console.log('PeerJS: Guest disconnected from signaling server');
      if (peer && !peer.destroyed && reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        setTimeout(function() {
          if (peer && !peer.destroyed) peer.reconnect();
        }, 1000 * reconnectAttempts);
      }
    });
  }

  function setupConnection(connection, localName) {
    connection.on('open', function () {
      console.log('PeerJS: Connection established');
      clearDisconnectTimer();
      reconnectAttempts = 0;

      if (isHost) {
        sendMessage({ type: 'name', name: localName, playerIdx: localPlayerIdx });
      }

      onConnectedCallback && onConnectedCallback(localPlayerIdx);
    });

    connection.on('data', function (data) {
      try {
        var msg = typeof data === 'string' ? JSON.parse(data) : data;
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
    });
  }

  function handleMessage(msg) {
    if (onMessageCallback) {
      onMessageCallback(msg);
    }
  }

  function handleDisconnect() {
    clearDisconnectTimer();
    // Wait 15 seconds for reconnect before firing disconnect
    onErrorCallback && onErrorCallback('Connection lost. Waiting for reconnect...');
    disconnectTimer = setTimeout(function () {
      onDisconnectedCallback && onDisconnectedCallback();
    }, 15000);
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
        return true;
      } catch (e) {
        console.error('Failed to send message:', e);
        return false;
      }
    }
    console.warn('Cannot send: connection not open');
    return false;
  }

  function sendAction(action, amount) {
    sendMessage({ type: 'action', action: action, amount: amount || 0 });
  }

  function sendState(state) {
    sendMessage({ type: 'state', state: state });
  }

  function sendStart(state) {
    sendMessage({ type: 'start', state: state });
  }

  function disconnect() {
    clearDisconnectTimer();
    if (conn) { try { conn.close(); } catch (e) {} conn = null; }
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
    isHost = false;
    localPlayerIdx = -1;
    roomCode = '';
    reconnectAttempts = 0;
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
    hostGame: hostGame,
    joinGame: joinGame,
    sendAction: sendAction,
    sendState: sendState,
    sendStart: sendStart,
    sendMessage: sendMessage,
    disconnect: disconnect,
    isConnected: isConnected,
    getLocalPlayerIdx: getLocalPlayerIdx,
    getIsHost: getIsHost,
    getRoomCode: getRoomCode,
    generateRoomCode: generateRoomCode
  };
})();

window.Network = Network;
