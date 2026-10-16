using System;
using TMPro;
using Unity.Collections;
using Unity.Netcode;
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.Rendering.Universal;

namespace IsolatedVillage.Player
{
    public enum PlayerRole
    {
        Villager,
        Werewolf
    }

    /// <summary>
    /// Networked 2D Player Controller for NGO.
    /// Manages Movement, New Input System, Overhead TMP Nameplate,
    /// and dynamic URP 2D Light2D Night Vision (Villager vs 1.5x Werewolf).
    /// </summary>
    [RequireComponent(typeof(Rigidbody2D), typeof(Collider2D))]
    public class PlayerController2D : NetworkBehaviour
    {
        [Header("Movement Settings")]
        [SerializeField] private float moveSpeed = 5.5f;
        [SerializeField] private Rigidbody2D rb;

        [Header("Visuals & Nameplate")]
        [SerializeField] private SpriteRenderer bodyRenderer;
        [SerializeField] private SpriteRenderer visorRenderer;
        [SerializeField] private TextMeshPro nameplateText;

        [Header("2D URP Night Vision")]
        [SerializeField] private Light2D torchLight;
        [SerializeField] private float villagerLightRadius = 4.0f;
        [SerializeField] private float werewolfLightRadius = 6.0f; // 1.5x Villager Radius

        [Header("Network State")]
        public NetworkVariable<FixedString64Bytes> PlayerName = new NetworkVariable<FixedString64Bytes>(
            "Villager", NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Owner);

        public NetworkVariable<Color> PlayerColor = new NetworkVariable<Color>(
            Color.white, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        public NetworkVariable<PlayerRole> Role = new NetworkVariable<PlayerRole>(
            PlayerRole.Villager, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        public NetworkVariable<bool> IsAlive = new NetworkVariable<bool>(
            true, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        // Input & Cooldowns
        private Vector2 moveInput;
        private float killCooldown = 0f;
        private const float KillCooldownDuration = 15f;

        // Interaction cache
        private Collider2D currentInteractable;

        private void Awake()
        {
            if (rb == null) rb = GetComponent<Rigidbody2D>();
        }

        public override void OnNetworkSpawn()
        {
            // Subscribe to state change callbacks
            PlayerName.OnValueChanged += (prev, current) => UpdateNameplate(current.ToString());
            PlayerColor.OnValueChanged += (prev, current) => UpdateColors(current);
            IsAlive.OnValueChanged += (prev, alive) => UpdateAliveState(alive);
            Role.OnValueChanged += (prev, currentRole) => UpdateTorchVision();

            if (IsOwner)
            {
                // Set initial owner name from local cache
                PlayerName.Value = Networking.GameNetworkManager.Instance.LocalPlayerName;

                // Bind Camera
                Camera mainCam = Camera.main;
                if (mainCam != null)
                {
                    var follow = mainCam.gameObject.AddComponent<SmoothCameraFollow2D>();
                    follow.target = transform;
                }
            }

            // Server assigns distinct color on spawn
            if (IsServer)
            {
                int colorIndex = (int)(OwnerClientId % (ulong)ColorPalette.DistinctColors.Length);
                PlayerColor.Value = ColorPalette.DistinctColors[colorIndex];
            }

            UpdateNameplate(PlayerName.Value.ToString());
            UpdateColors(PlayerColor.Value);
            UpdateAliveState(IsAlive.Value);
            UpdateTorchVision();

            // Listen to Day/Night phase transitions
            if (Networking.GameNetworkManager.Instance != null)
            {
                Networking.GameNetworkManager.Instance.OnPhaseChanged += OnPhaseChanged;
            }
        }

        public override void OnNetworkDespawn()
        {
            if (Networking.GameNetworkManager.Instance != null)
            {
                Networking.GameNetworkManager.Instance.OnPhaseChanged -= OnPhaseChanged;
            }
        }

        private void Update()
        {
            if (!IsOwner || !IsAlive.Value) return;

            // Update Kill Cooldown
            if (killCooldown > 0f)
            {
                killCooldown = Mathf.Max(0f, killCooldown - Time.deltaTime);
            }

            // Keyboard Movement (WASD / Arrows)
            Vector2 keyboardInput = Vector2.zero;
            if (Keyboard.current != null)
            {
                if (Keyboard.current.wKey.isPressed || Keyboard.current.upArrowKey.isPressed) keyboardInput.y += 1f;
                if (Keyboard.current.sKey.isPressed || Keyboard.current.downArrowKey.isPressed) keyboardInput.y -= 1f;
                if (Keyboard.current.aKey.isPressed || Keyboard.current.leftArrowKey.isPressed) keyboardInput.x -= 1f;
                if (Keyboard.current.dKey.isPressed || Keyboard.current.rightArrowKey.isPressed) keyboardInput.x += 1f;
            }

            // Virtual Joystick (Android / Mobile)
            Vector2 touchInput = UI.MobileTouchControlsUI.JoystickInput;
            moveInput = touchInput.sqrMagnitude > 0.05f ? touchInput : keyboardInput.normalized;

            // Flip sprite based on movement direction
            if (moveInput.x > 0.05f) transform.localScale = new Vector3(1, 1, 1);
            else if (moveInput.x < -0.05f) transform.localScale = new Vector3(-1, 1, 1);

            // Actions via Keyboard
            if (Keyboard.current != null)
            {
                if (Keyboard.current.eKey.wasPressedThisFrame || Keyboard.current.spaceKey.wasPressedThisFrame)
                {
                    PerformInteractAction();
                }
                if (Keyboard.current.qKey.wasPressedThisFrame)
                {
                    PerformKillAction();
                }
                if (Keyboard.current.rKey.wasPressedThisFrame)
                {
                    PerformReportAction();
                }
            }
        }

        private void FixedUpdate()
        {
            if (!IsOwner || !IsAlive.Value)
            {
                rb.velocity = Vector2.zero;
                return;
            }

            rb.velocity = moveInput * moveSpeed;
        }

        #region DAY/NIGHT & URP 2D LIGHTING

        private void OnPhaseChanged(Networking.GamePhase phase)
        {
            UpdateTorchVision();
        }

        private void UpdateTorchVision()
        {
            if (torchLight == null) return;

            // Only local player enables their own torchlight
            if (!IsOwner)
            {
                torchLight.enabled = false;
                return;
            }

            var currentPhase = Networking.GameNetworkManager.Instance != null
                ? Networking.GameNetworkManager.Instance.CurrentPhase.Value
                : Networking.GamePhase.Day;

            switch (currentPhase)
            {
                case Networking.GamePhase.Day:
                    torchLight.enabled = false;
                    break;

                case Networking.GamePhase.Dusk:
                    torchLight.enabled = true;
                    torchLight.intensity = 0.6f;
                    torchLight.pointLightOuterRadius = villagerLightRadius;
                    torchLight.color = new Color(1f, 0.95f, 0.8f);
                    break;

                case Networking.GamePhase.Night:
                    torchLight.enabled = true;
                    torchLight.intensity = 1.2f;

                    // STRICT SPEC: Werewolf has 1.5x larger night vision radius!
                    if (Role.Value == PlayerRole.Werewolf)
                    {
                        torchLight.pointLightOuterRadius = werewolfLightRadius; // 6.0f (1.5x)
                        torchLight.color = new Color(1f, 0.85f, 0.85f); // Reddish predatory tint
                    }
                    else
                    {
                        torchLight.pointLightOuterRadius = villagerLightRadius; // 4.0f
                        torchLight.color = new Color(1f, 0.95f, 0.8f); // Warm torch
                    }
                    break;
            }
        }

        #endregion

        #region ACTIONS & RPCS

        public void PerformInteractAction()
        {
            if (currentInteractable == null) return;

            var taskNode = currentInteractable.GetComponent<Environment.VillageMaintenanceNode>();
            if (taskNode != null)
            {
                taskNode.Interact(this);
                return;
            }

            var bell = currentInteractable.GetComponent<Environment.EmergencyBell>();
            if (bell != null)
            {
                Networking.GameNetworkManager.Instance.CallEmergencyMeetingServerRpc(
                    PlayerName.Value.ToString(), $"{PlayerName.Value} rang the Town Square Bell!");
            }
        }

        public void PerformKillAction()
        {
            if (Role.Value != PlayerRole.Werewolf) return;
            if (Networking.GameNetworkManager.Instance.CurrentPhase.Value != Networking.GamePhase.Night) return;
            if (killCooldown > 0f) return;

            // Detect nearest alive Villager within 1.6 units
            Collider2D[] hits = Physics2D.OverlapCircleAll(transform.position, 1.6f);
            foreach (var hit in hits)
            {
                var victim = hit.GetComponent<PlayerController2D>();
                if (victim != null && victim != this && victim.IsAlive.Value && victim.Role.Value == PlayerRole.Villager)
                {
                    killCooldown = KillCooldownDuration;
                    KillVictimServerRpc(victim.OwnerClientId);
                    Debug.Log($"[KILL] Eliminated {victim.PlayerName.Value}!");
                    break;
                }
            }
        }

        [ServerRpc]
        private void KillVictimServerRpc(ulong victimClientId)
        {
            if (!IsServer) return;

            if (NetworkManager.Singleton.ConnectedClients.TryGetValue(victimClientId, out var client))
            {
                var victim = client.PlayerObject.GetComponent<PlayerController2D>();
                if (victim != null && victim.IsAlive.Value)
                {
                    victim.IsAlive.Value = false;
                    // Spawn dead body prefab on server
                    SpawnDeadBody(victim.transform.position, victim.PlayerName.Value.ToString(), victim.PlayerColor.Value);
                    Networking.GameNetworkManager.Instance.CheckWinConditions();
                }
            }
        }

        private void SpawnDeadBody(Vector2 position, string victimName, Color color)
        {
            // Spawn body marker with blood splatter and bone
            GameObject body = new GameObject($"DeadBody_{victimName}");
            body.transform.position = position;
            var sr = body.AddComponent<SpriteRenderer>();
            sr.color = color;
            sr.sortingOrder = 1;

            var col = body.AddComponent<CircleCollider2D>();
            col.isTrigger = true;
            col.radius = 1.0f;

            var bodyTag = body.AddComponent<Environment.DeadBodyMarker>();
            bodyTag.VictimName = victimName;
        }

        public void PerformReportAction()
        {
            Collider2D[] hits = Physics2D.OverlapCircleAll(transform.position, 1.8f);
            foreach (var hit in hits)
            {
                var bodyMarker = hit.GetComponent<Environment.DeadBodyMarker>();
                if (bodyMarker != null)
                {
                    Networking.GameNetworkManager.Instance.CallEmergencyMeetingServerRpc(
                        PlayerName.Value.ToString(), $"{PlayerName.Value} discovered {bodyMarker.VictimName}'s remains!");
                    return;
                }
            }
        }

        private void OnTriggerEnter2D(Collider2D other)
        {
            if (other.CompareTag("Interactable"))
            {
                currentInteractable = other;
            }
        }

        private void OnTriggerExit2D(Collider2D other)
        {
            if (currentInteractable == other)
            {
                currentInteractable = null;
            }
        }

        #endregion

        #region VISUAL HELPERS

        private void UpdateNameplate(string nameStr)
        {
            if (nameplateText != null)
            {
                nameplateText.text = nameStr;
            }
        }

        private void UpdateColors(Color color)
        {
            if (bodyRenderer != null)
            {
                bodyRenderer.color = color;
            }
        }

        private void UpdateAliveState(bool alive)
        {
            if (!alive)
            {
                // Ghost Mode: transparent & disabled collider
                var c = bodyRenderer.color;
                c.a = 0.45f;
                bodyRenderer.color = c;
                nameplateText.text = $"{PlayerName.Value} (GHOST)";
                GetComponent<Collider2D>().enabled = false;
            }
        }

        #endregion
    }

    /// <summary>
    /// Smooth 2D Camera Follow script attached dynamically to Main Camera for local player.
    /// </summary>
    public class SmoothCameraFollow2D : MonoBehaviour
    {
        public Transform target;
        public float smoothSpeed = 8.0f;

        private void LateUpdate()
        {
            if (target == null) return;
            Vector3 desiredPosition = new Vector3(target.position.x, target.position.y, -10f);
            transform.position = Vector3.Lerp(transform.position, desiredPosition, smoothSpeed * Time.deltaTime);
        }
    }

    public static class ColorPalette
    {
        public static readonly Color[] DistinctColors = new Color[]
        {
            new Color(0.94f, 0.27f, 0.27f), // Red
            new Color(0.23f, 0.51f, 0.96f), // Blue
            new Color(0.06f, 0.73f, 0.51f), // Green
            new Color(0.96f, 0.62f, 0.04f), // Yellow
            new Color(0.55f, 0.36f, 0.96f), // Purple
            new Color(0.93f, 0.28f, 0.60f), // Pink
            new Color(0.02f, 0.71f, 0.83f), // Cyan
            new Color(0.98f, 0.45f, 0.09f), // Orange
            new Color(0.52f, 0.80f, 0.09f), // Lime
            new Color(0.39f, 0.40f, 0.95f)  // Indigo
        };
    }
}
