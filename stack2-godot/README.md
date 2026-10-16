# The Isolated Village — Godot 4.x (GDScript + High-Level Multiplayer)

A complete, playable vertical slice of a 2D top-down social deduction game built for **Godot 4.3+** using GDScript, High-Level Multiplayer (`ENetMultiplayerPeer` for LAN/Desktop/Android and `WebSocketMultiplayerPeer` for Web/Cloud), `MultiplayerSynchronizer`, and 2D dynamic radial lighting (`CanvasModulate` + `PointLight2D`).

---

## 📁 Project Architecture & Scene Tree

```text
stack2-godot/
├── project.godot                     # Godot 4 configuration, GL Compatibility, Autoloads
├── resources/
│   └── light_texture.tres            # 512x512 2D radial gradient light texture
├── scripts/
│   ├── NetworkManager.gd             # Autoload singleton: ENet & WebSocket peer routing, 4-digit codes, timer sync
│   ├── Player.gd                     # Character controller, MultiplayerSynchronizer, Nameplate, flashlight radius
│   ├── DayNightCycle.gd              # CanvasModulate controller, campfire flicker, clock & task progress HUD
│   ├── VillageStage.gd               # Stage manager, player spawner, dead body registry, mobile touch hooks
│   ├── VirtualJoystick.gd            # Mobile analog touchscreen stick with deadzone and clamped radius
│   ├── TaskStation.gd                # Area2D maintenance stations across village buildings
│   └── MeetingUI.gd                  # Town Hall emergency discussion & voting modal, exile verdict reveal
└── scenes/
    ├── Main.tscn                     # Main menu: Player name, LAN/WebSocket toggle, Host & Join UI
    ├── Lobby.tscn                    # Pre-game lobby: 4-digit code display, player roster, Host Start Match button
    ├── VillageStage.tscn             # Self-contained village map (4 houses, campfire, boundaries, tasks, CanvasModulate)
    ├── Player.tscn                   # CharacterBody2D with visuals, nameplate, synchronizer, and PointLight2D
    ├── VirtualJoystick.tscn          # Virtual touch thumbstick instance
    └── MeetingUI.tscn                # Emergency meeting voting and verdict overlay
```

---

## 💡 Godot 2D Day/Night Lighting Setup

The dynamic visibility and fog-of-war system is implemented natively using **Godot 4 2D Lighting**:

1. **Ambient Darkness (`CanvasModulate`):**
   - The scene root contains a `CanvasModulate` node controlled by `DayNightCycle.gd`.
   - **Day Phase (45s):** `CanvasModulate.color = Color(1.0, 1.0, 1.0, 1.0)`. Full ambient daylight; entire village is visible.
   - **Dusk Transition (5s):** Smoothly lerps to twilight `Color(0.42, 0.35, 0.55, 1.0)`.
   - **Night Phase (45s):** Pitch-black ambient lighting `Color(0.02, 0.02, 0.06, 1.0)`. Without a light source, everything outside the player's immediate radius is completely black.

2. **Player Flashlight & Vision Radius (`PointLight2D`):**
   - Each player has a child `PointLight2D` utilizing `res://resources/light_texture.tres`.
   - Only the **local authority player** enables their own `PointLight2D` (remote puppet lights are disabled so players cannot see other players' flashlights through walls unless they are within the local light radius).
   - **Villager Vision:** `texture_scale = 1.0`, warm torchlight `Color(1.0, 0.95, 0.8)`.
   - **Shapeshifter / Werewolf Vision:** **`texture_scale = 1.5` (1.5x larger night vision radius!)** with a predatory red hue `Color(1.0, 0.85, 0.85)`.

3. **Campfire Town Square Light:**
   - A static `PointLight2D` at the central campfire `(640, 360)` emits a constant warm orange glow `Color(1.0, 0.7, 0.35)` with an animated sine-wave energy flicker `energy = 1.3 + sin(flicker_time) * 0.18`.

---

## 🕹️ Cross-Platform Input & Mobile Touch Joystick

- **Desktop (Keyboard):** `WASD` or Arrow Keys for movement.
  - `E` or `Space`: Interact (do tasks / ring Town Square bell).
  - `Q`: Kill (Werewolf only, at Night, within 75 units, 15s cooldown).
  - `R`: Report (near dead bodies or emergency bell).
- **Mobile (Android / Touchscreen):**
  - `VirtualJoystick.tscn` automatically activates on touch-enabled devices.
  - Provides a normalized analog directional vector `output_vector` clamped within `max_radius = 60.0` with deadzone filtering.
  - Dedicated on-screen touch buttons for `USE`, `KILL`, and `REPORT` are mapped directly in `VillageStage.tscn`.

---

## 📦 Export Instructions for Web & Android

### 1. Web Export (HTML5 / WebGL)
1. Open Godot 4.3 -> **Project** -> **Export...**
2. Click **Add...** -> **Web**.
3. In Network settings, ensure the game is configured to use `WebSocketMultiplayerPeer` (selectable on the Main Menu).
4. Check **Export With Debug** for testing or uncheck for release.
5. Click **Export Project** -> Output to `build/web/index.html`.
6. Host the `build/web` folder on any HTTPS static host (GitHub Pages, Netlify, Render static site, or itch.io).
   > **Note for Web:** Ensure cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) are enabled on the host for SharedArrayBuffer support in Godot 4 Web exports.

### 2. Android APK Export
1. In Godot -> **Editor** -> **Editor Settings** -> **Export** -> **Android**:
   - Set path to **Android SDK Path** and **Java Keystore / Debug Keystore**.
2. **Project** -> **Export...** -> **Add...** -> **Android**.
3. Under **Permissions**, check:
   - `android.permission.INTERNET`
   - `android.permission.ACCESS_NETWORK_STATE`
   - `android.permission.ACCESS_WIFI_STATE`
4. Under **Screen Orientation**, set to `Sensor Landscape` (`6`).
5. Click **Export Project** -> Saves `isolated_village.apk`.
6. Install via ADB: `adb install -r isolated_village.apk`.
