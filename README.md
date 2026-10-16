# The Isolated Village — 2D Multiplayer Social Deduction Game
### A Complete Playable Vertical Slice across 3 Distinct Tech Stacks

Inspired by *Among Us*, *Mafia*, *Werewolf (Villagers)*, and *The Thing*. 

A secret creature lurks among the villagers. During the Day (45s), villagers explore the village, complete maintenance tasks across 4 buildings, and watch for suspicious behavior. At Dusk (5s), ambient light fades with a dire warning. At Night (45s), pitch darkness consumes the village: villagers' vision shrinks to a narrow torchlight radius, while the Shapeshifter / Werewolf strikes from the shadows with **1.5x enhanced night vision**! Ringing the central Town Square Bell or discovering a body calls an Emergency Meeting to vote out the impostor.

---

## 🏗️ The Three Tech Stacks

| Feature | **Stack 1: Web Native** | **Stack 2: Godot Engine 4.x** | **Stack 3: Unity Engine** |
| :--- | :--- | :--- | :--- |
| **Language / Engine** | JavaScript / HTML5 Canvas | GDScript / Godot 4.3+ | C# / Unity 2022.3+ LTS |
| **Networking** | Node.js + Express + Socket.io | `ENetMultiplayerPeer` & `WebSocketMultiplayerPeer` | Netcode for GameObjects (NGO) + Unity Relay & Lobby |
| **4-Digit Room Codes** | Authoritative Socket.io Rooms | Server-authoritative RPCs | Unity Lobby `S1` index query mapping to Relay join code |
| **Day/Night Lighting** | Offscreen Canvas `destination-out` gradient mask | `CanvasModulate` + `PointLight2D` torchlight | Universal Render Pipeline (URP) `Global Light 2D` + `Point Light 2D` |
| **Night Vision Advantage** | Werewolf: 225px vs Villager: 150px | Werewolf: `scale=1.5` vs Villager: `scale=1.0` | Werewolf: `radius=6.0f` vs Villager: `radius=4.0f` |
| **Cross-Platform Input** | Keyboard (WASD/E/Q/R) + Virtual Touch Analog Stick | InputMap + Touch Joystick (`VirtualJoystick.gd`) | New Input System + On-screen Joystick (`MobileTouchControlsUI.cs`) |
| **Deployment Targets** | Render.com (1-click Cloud) & Local Wi-Fi / LAN | Web (HTML5/WebSocket) & Android APK | Unity Play (WebGL) & Android APK |
| **Directory** | [`stack1-js-web/`](./stack1-js-web) | [`stack2-godot/`](./stack2-godot) | [`stack3-unity/`](./stack3-unity) |

---

## 🎮 Core Gameplay Mechanics (Implemented in All 3 Stacks)

1. **4-Digit Numeric Room Codes (`0000` to `9999`):**
   - Host clicks **HOST GAME** and receives a clean 4-digit code.
   - Friends enter the code on mobile or desktop to join the pre-game village lobby.
2. **The Isolated Village Map (Single Stage):**
   - **Central Campfire Plaza:** Cobblestone town square with flickering flame lighting and the Emergency Town Hall Bell.
   - **4 Interactive Buildings:**
     - *North:* Elder's Great Hall (Translate Ancient Runes task)
     - *East:* Blacksmith Forge (Stoke Bellows task)
     - *South:* Grain Barn & Mill (Clear Mill Gears task)
     - *West:* Apothecary & Clinic (Brew Wolfsbane Elixir task)
   - **Perimeter Boundaries:** Dense forest colliders and perimeter fences preventing wandering outside bounds.
3. **Day / Night Visibility & Fog of War:**
   - **Day Phase (45s):** Bright ambient lighting. High visibility radius across the map.
   - **Dusk Transition (5s):** Ambient light smoothly lerps from day to twilight with audio-visual alerts.
   - **Night Phase (45s):** Pitch-black ambient darkness across the village.
     - Villagers are confined to a narrow circular torchlight radius around their avatar.
     - The **Werewolf / Shapeshifter gains a 1.5x larger night vision radius** with predatory tint.
     - Campfire provides a static warm sanctuary light.
4. **Roles & Win Conditions:**
   - **Villagers:** Win by completing all village maintenance tasks or voting out the Werewolf.
   - **Werewolf:** Wins when alive Werewolves equal or outnumber alive Villagers. Can strike at Night when in close proximity (15s kill cooldown).
5. **Town Hall Meetings & Voting:**
   - Ringing the Town Square Bell or reporting a corpse triggers a 30s emergency meeting.
   - Live voting grid with skip vote support, vote tallying, and dramatic exile verdict reveals.

---

## 🚀 Quick Start Guide

### 1. Stack 1: Web Native (Instant Browser / Cloud Play)
```bash
# From repository root or stack1-js-web directory:
npm install
npm start
```
- Open `http://localhost:3000` to Host.
- Share your local LAN IP (`http://192.168.x.x:3000`) or deploy to **Render.com**.

### 2. Stack 2: Godot 4.x (Web & Android)
- Open Godot 4.3+, click **Import**, select `stack2-godot/project.godot`.
- Run `scenes/Main.tscn` to test locally or export to **Web** / **Android**.

### 3. Stack 3: Unity Engine (Unity Play & Android)
- Open Unity Hub, click **Add**, select `stack3-unity/`.
- Open `Assets/Scenes/MainMenu.unity` and press Play.
- Supports Unity Relay & Lobby for Unity Play WebGL hosting and direct LAN fallback.
