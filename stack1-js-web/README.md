# The Isolated Village — 2D Social Deduction (Stack 1: Web Native)

A complete, playable vertical slice of a 2D top-down social deduction game inspired by *Among Us*, *Mafia*, *Werewolf*, and *The Thing*. Built with **Node.js, Express, Socket.io, and HTML5 Canvas**.

---

## 📁 Project Structure

```
stack1-js-web/
├── package.json          # Node dependencies (Express, Socket.io) & scripts
├── server.js             # Authoritative server (4-digit codes, timer sync, roles, meetings)
└── public/
    ├── index.html        # Responsive UI overlays, Canvas viewport, modals
    ├── style.css         # Dark gothic styling, mobile touch layout, parchment modals
    └── game.js           # 2D Canvas engine, destination-in visibility mask, virtual joystick
```

---

## 🚀 Local & LAN Setup (Wi-Fi Multiplayer)

The server binds to `0.0.0.0` and auto-detects all network adapters, printing local IP addresses for seamless play across laptops, Android phones, and iPhones on the same Wi-Fi.

### Step 1: Install Dependencies
```bash
cd stack1-js-web
npm install
```

### Step 2: Start the Server
```bash
npm start
```

### Step 3: Connect Devices
The terminal displays:
```text
====================================================
  AMONG US: ISOLATED VILLAGE - WEB NODE.JS SERVER   
====================================================
> Server running locally at:  http://localhost:3000
> LAN Play URLs for friends & mobile devices:
   * http://192.168.1.X:3000
> Cloud Ready: PORT=3000 on 0.0.0.0
====================================================
```
- **Host Player:** Open `http://localhost:3000` in your desktop browser. Enter name and click **HOST GAME**. You will receive a unique **4-Digit Code** (e.g. `4892`).
- **LAN Friends / Mobile Phones:** Open `http://<YOUR-LAN-IP>:3000` on any phone or browser connected to the same Wi-Fi. Enter name, type the 4-digit code, and click **JOIN**.

---

## ☁️ Cloud Deployment on Render.com

This stack is 100% configured for instant deployment on **Render.com** (Free Web Service tier):

1. **Push to GitHub**: Push your project repository to GitHub.
2. **Create New Web Service**:
   - Go to [dashboard.render.com](https://dashboard.render.com) -> **New +** -> **Web Service**.
   - Connect your GitHub repository.
3. **Configure Service Settings**:
   - **Name:** `isolated-village` (or any unique name)
   - **Root Directory:** `stack1-js-web`
   - **Environment:** `Node`
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** `Free`
4. **Environment Variables**:
   - `PORT`: `10000` (Render sets this automatically; `server.js` listens to `process.env.PORT`).
5. **Deploy**:
   - Click **Create Web Service**. Once deployed, Render gives you a live HTTPS URL: `https://isolated-village.onrender.com`.
   - Players anywhere in the world can open the link in any mobile or desktop browser and join using 4-digit room codes with zero installation!

---

## 🎮 Gameplay Features Implemented

1. **4-Digit Room Code System**:
   - Host generates a random unique numeric room code (`0000` to `9999`).
   - One-click copy button in the lobby.
2. **Pre-Game Village Lobby**:
   - Spawns players in the village square.
   - Overhead nameplates with color badges and Host crown (`👑`).
   - Host can click `START MATCH` (requires 3+ players) or `DEV FORCE START` (for 1+ player testing).
3. **Day / Night Visibility & Fog of War**:
   - **Day Phase (45s):** Full ambient daylight. Complete map visibility.
   - **Dusk Transition (5s):** Ambient light smoothly lerps from day to dusk with visual warnings.
   - **Night Phase (45s):** Pitch darkness across the village. Implemented via an offscreen canvas and `destination-out` radial mask:
     - **Villager Torchlight:** 150px radius.
     - **Werewolf / The Thing:** **225px radius (1.5x larger vision)** with subtle red hunt aura.
     - **Central Campfire:** 170px radius warm amber glow.
     - Outside light radii, everything is completely hidden in darkness.
4. **Roles & Win Conditions**:
   - **Villagers:** Repair 4 village maintenance stations (Elder's Hall runes, Blacksmith forge bellows, Grain Mill gears, Apothecary elixir) or vote out the Werewolf.
   - **Werewolf / Shapeshifter:** Blend in during Day, hunt isolated villagers at Night when within strike distance (15s cooldown).
5. **Cross-Platform Controls**:
   - **Desktop:** `WASD` / Arrow keys for 8-direction movement. `E` or `Space` to interact with tasks/bell. `Q` to strike (Werewolf). `R` to report dead body.
   - **Mobile / Touchscreen:** Virtual left analog thumbstick + right touch action buttons (`USE`, `KILL`, `REPORT`).
6. **Town Hall Meetings & Voting**:
   - Triggered by dead body reports or ringing the Town Square Emergency Bell.
   - 30-second discussion & voting round with skip option and checkmarks for votes cast.
   - Dramatic exile verdict screen revealing whether the exiled player was the Werewolf or an innocent Villager.
