# The Isolated Village — Unity 2D URP Build (NGO + Unity Relay & Lobby)

A complete, playable vertical slice of a 2D top-down social deduction game built with **Unity 2022.3+ / 2023+ LTS**, **Netcode for GameObjects (NGO)**, **Universal Render Pipeline (URP) 2D Lighting**, and **Unity Relay + Lobby** (for Unity Play WebGL and cross-network multiplayer).

---

## 📁 Project Structure

```text
stack3-unity/
├── Packages/
│   └── manifest.json                 # URP 2D, Netcode for GameObjects, Relay, Lobby, Input System
├── Assets/
│   ├── Scripts/
│   │   ├── Networking/
│   │   │   └── GameNetworkManager.cs # Master NGO manager, Relay/Lobby async, 4-digit codes, Day/Night timers
│   │   ├── Player/
│   │   │   └── PlayerController2D.cs # NetworkBehaviour, New Input System, TMP Nameplate, Light2D (1.5x Werewolf)
│   │   ├── Environment/
│   │   │   └── DayNightVisibilityController.cs # Global Light 2D Day/Night controller, campfire flicker
│   │   ├── UI/
│   │   │   ├── MainMenuUI.cs         # Host/Join UI with 4-digit code and LAN/Relay dropdown
│   │   │   ├── LobbyUI.cs            # Pre-game lobby with player roster and Host Start Match button
│   │   │   ├── TownHallMeetingUI.cs  # Emergency meeting voting modal and exile verdict banner
│   │   │   └── MobileTouchControlsUI.cs # Virtual analog joystick and touch buttons for Android
│   │   └── Utils/
│   │       └── ProceduralSpriteGenerator.cs # Runtime 2D character capsule & light cookie generator
│   └── README.md
```

---

## 💡 Universal Render Pipeline (URP) 2D Lighting Setup

1. **Create 2D Renderer Asset:**
   - In Project window: **Right-Click** -> **Create** -> **Rendering** -> **URP 2D Renderer**. Name it `UniversalRenderer2D`.
   - **Right-Click** -> **Create** -> **Rendering** -> **URP Asset (with Universal Renderer)**. Name it `URP_Asset_2D`.
   - In the inspector of `URP_Asset_2D`, drag `UniversalRenderer2D` into the **Renderer List**.
   - Navigate to **Project Settings** -> **Graphics** -> Set **Scriptable Render Pipeline Settings** to `URP_Asset_2D`.
   - Also set `URP_Asset_2D` under **Project Settings** -> **Quality**.

2. **Global Ambient Light 2D (`DayNightVisibilityController.cs`):**
   - In the scene: **Right-Click** -> **Light** -> **2D** -> **Global Light 2D**.
   - The script smoothly lerps the Global Light 2D:
     - **Day Phase (45s):** `intensity = 1.0f`, `color = Color.white` (Full screen visibility).
     - **Dusk Transition (5s):** Lerps to twilight `intensity = 0.35f`, `color = Color(0.42f, 0.35f, 0.55f)`.
     - **Night Phase (45s):** Pitch-black darkness `intensity = 0.02f`, `color = Color(0.02f, 0.02f, 0.05f)`.

3. **Player Point Light 2D (Flashlight & Werewolf Night Vision):**
   - Attached as a child of the `Player` prefab: **Right-Click** -> **Light** -> **2D** -> **Point Light 2D**.
   - Only the **local owner player** activates their flashlight in the dark:
     - **Villager Torchlight:** `pointLightOuterRadius = 4.0f`, warm torch tint `Color(1.0f, 0.95f, 0.8f)`.
     - **Werewolf / Shapeshifter:** **`pointLightOuterRadius = 6.0f` (1.5x larger vision!)** with predatory tint `Color(1.0f, 0.85f, 0.85f)`.

4. **Central Campfire Light:**
   - In Town Square, add a `PointLight2D` with color `Color(1.0f, 0.7f, 0.35f)`.
   - The script animates procedural flame flicker:
     ```csharp
     campfireLight.intensity = 1.3f + Mathf.Sin(flickerTimer) * 0.15f + Mathf.Cos(flickerTimer * 1.6f) * 0.08f;
     ```

---

## 🌐 4-Digit Room Code & Networking Architecture

`GameNetworkManager.cs` bridges Unity Relay and NGO with a seamless 4-digit code experience:
- **Hosting:**
  1. Requests an allocation from **Unity Relay**.
  2. Generates a random 4-digit numeric code (e.g. `4892`).
  3. Creates a **Unity Lobby** with custom `S1` index query data storing `RoomCode = "4892"`.
  4. Automatically pings heartbeat to keep the lobby alive.
- **Joining:**
  1. Client types the 4-digit code.
  2. Queries Unity Lobby filtered by `RoomCode == "4892"`.
  3. Obtains the Relay Join Code, connects via `UnityTransport.SetRelayServerData()`, and starts client.
- **LAN Direct IP Fallback:**
  - Select **LAN** in the dropdown to connect directly over local Wi-Fi without cloud dependencies.

---

## 📱 Cross-Platform Input (Desktop Keyboard + Android Touch)

- **Desktop Keyboard:** `WASD` / Arrow keys for 8-direction movement.
  - `E` / `Space`: Interact with tasks or ring Town Square bell.
  - `Q`: Strike (Werewolf only, at Night, within 1.6 units, 15s cooldown).
  - `R`: Report dead body.
- **Mobile Touch (`MobileTouchControlsUI.cs`):**
  - Virtual analog thumbstick auto-detects touch/mobile devices and outputs clamped normalized `JoystickInput`.
  - Right-hand touch action buttons for `USE`, `KILL`, and `REPORT`.

---

## 🚀 Build & Deployment Instructions

### A. Publish to Unity Play (WebGL)
1. **File** -> **Build Settings...** -> Switch platform to **WebGL**.
2. **Player Settings...**:
   - **Resolution and Presentation**: Select a responsive WebGL template.
   - **Other Settings** -> **Color Space**: `Linear` (or `Gamma`).
   - **Other Settings** -> **Graphics APIs**: `WebGL 2.0`.
3. In Unity Editor toolbar: **Window** -> **Unity Play** -> **Publish WebGL Project**.
4. Once built, Unity uploads the game to your Unity Play dashboard for instant browser play with Unity Relay!

### B. Android APK Build
1. **File** -> **Build Settings...** -> Switch platform to **Android**.
2. **Player Settings...**:
   - **Identification** -> **Package Name**: `com.yourstudio.isolatedvillage`.
   - **Minimum API Level**: `Android 8.0 (API level 26)` or higher.
   - **Target API Level**: `Automatic (highest installed)`.
   - **Configuration** -> **Scripting Backend**: `IL2CPP`.
   - **Target Architectures**: Check `ARM64`.
3. Click **Build** -> Outputs `isolated_village.apk`.
4. Install on your Android phone using ADB:
   ```bash
   adb install -r isolated_village.apk
   ```
