# Texas Hold'em - 2-Player Heads-Up Poker

A complete browser-based Texas Hold'em poker game for two players with real-time P2P multiplayer via PeerJS. No server required - works as a static site on GitHub Pages.

## How to Play

### Starting a Game

1. Open the page in two browser windows (or on two different devices).
2. Player 1 (host) enters their name and clicks **Host a Game**.
3. A 6-character room code appears - share it with Player 2.
4. Player 2 enters their name and the room code, then clicks **Join Game**.
5. The game starts automatically when both players are connected.

### Game Rules

- Standard Texas Hold'em heads-up (2-player) poker.
- Each player starts with **$1000 in chips**.
- Blinds: Small blind $10, Big blind $20.
- The dealer button rotates each hand.
- In heads-up play: the dealer posts the small blind and acts first pre-flop.
- Betting rounds: Pre-flop, Flop, Turn, River.
- Available actions: **Fold**, **Check/Call**, **Raise** (use slider to set amount).
- The game ends when one player has 0 chips.

### Hand Rankings (highest to lowest)

1. Royal Flush - A K Q J 10 all same suit
2. Straight Flush - 5 consecutive cards of same suit
3. Four of a Kind - 4 cards of same rank
4. Full House - 3 of a kind + a pair
5. Flush - 5 cards of same suit
6. Straight - 5 consecutive cards
7. Three of a Kind - 3 cards of same rank
8. Two Pair - 2 different pairs
9. Pair - 2 cards of same rank
10. High Card - highest card wins

## Deployment on GitHub Pages

1. Push all files to a GitHub repository.
2. Go to repository Settings > Pages.
3. Set source to the main branch (root folder).
4. Your game will be live at `https://yourusername.github.io/repo-name/`.

The `.nojekyll` file ensures GitHub Pages serves the files correctly.

## Tech Stack

- **Vanilla JavaScript** (ES6+) - no frameworks or build tools
- **PeerJS** (CDN) - WebRTC P2P signaling via free cloud server (0.peerjs.com)
- **CSS3** - green felt poker table, responsive layout
- **HTML5** - single-page app, works offline after first load

## Project Structure

```
index.html        Main HTML page with lobby, game table, controls
css/style.css     All styling (table, cards, controls, responsive)
js/game.js        GameEngine class: deck, dealing, hand evaluation, betting
js/ui.js          UI rendering module: card display, player areas, controls
js/peer.js        PeerJS networking: host/join, state sync, disconnect handling
.nojekyll         Prevents GitHub Pages from treating this as a Jekyll site
README.md         This file
```

## Architecture Notes

- **Host = authoritative**: The host runs the game engine and broadcasts state after every action.
- **Guest = client**: The guest sends actions to the host; the host validates and replies with new state.
- **State hiding**: The host's hole cards are hidden from the guest until showdown.
- **Auto-advance**: After showdown, the next hand starts automatically after 4 seconds.
- **Disconnect handling**: If the opponent disconnects, you win the current pot (auto-fold).
