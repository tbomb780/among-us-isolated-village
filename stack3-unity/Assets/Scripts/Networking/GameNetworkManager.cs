using System;
using System.Collections;
using System.Collections.Generic;
using System.Threading.Tasks;
using Unity.Collections;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using Unity.Services.Authentication;
using Unity.Services.Core;
using Unity.Services.Lobbies;
using Unity.Services.Lobbies.Models;
using Unity.Services.Relay;
using Unity.Services.Relay.Models;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace IsolatedVillage.Networking
{
    public enum GamePhase
    {
        Day,
        Dusk,
        Night
    }

    public enum GameState
    {
        Lobby,
        Playing,
        Meeting,
        GameOver
    }

    /// <summary>
    /// Master Network Manager handling Unity Netcode for GameObjects (NGO),
    /// Unity Relay & Lobby (Cloud/Unity Play) + Direct IP (LAN), 4-Digit Room Codes,
    /// and authoritative Day/Night synchronization.
    /// </summary>
    public class GameNetworkManager : NetworkBehaviour
    {
        public static GameNetworkManager Instance { get; private set; }

        public const int MaxPlayers = 10;
        public const ushort DefaultPort = 7777;

        [Header("State Synchronization")]
        public NetworkVariable<GameState> CurrentGameState = new NetworkVariable<GameState>(
            GameState.Lobby, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        public NetworkVariable<GamePhase> CurrentPhase = new NetworkVariable<GamePhase>(
            GamePhase.Day, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        public NetworkVariable<float> PhaseTimeRemaining = new NetworkVariable<float>(
            45f, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        public NetworkVariable<int> TasksCompleted = new NetworkVariable<int>(
            0, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        public NetworkVariable<int> TasksTotal = new NetworkVariable<int>(
            8, NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        public NetworkVariable<FixedString32Bytes> RoomCode = new NetworkVariable<FixedString32Bytes>(
            "0000", NetworkVariableReadPermission.Everyone, NetworkVariableWritePermission.Server);

        [Header("Local Player Cache")]
        public string LocalPlayerName = "Villager";
        public string HostLobbyId;

        // Server-Side Meeting & Voting Tracker
        private readonly Dictionary<ulong, string> votes = new Dictionary<ulong, string>();
        private float meetingTimer = 30f;

        // Events
        public event Action<GamePhase> OnPhaseChanged;
        public event Action<string, string> OnMeetingStarted;
        public event Action<string, string, bool> OnMeetingEnded;
        public event Action<string, string> OnGameOver;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private async void Start()
        {
            // Initialize Unity Services for Relay and Lobby
            try
            {
                if (UnityServices.State == ServicesInitializationState.Uninitialized)
                {
                    await UnityServices.InitializeAsync();
                }

                if (!AuthenticationService.Instance.IsSignedIn)
                {
                    await AuthenticationService.Instance.SignInAnonymouslyAsync();
                    Debug.Log($"[SERVICES] Signed into Unity Gaming Services as {AuthenticationService.Instance.PlayerId}");
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"[SERVICES] Cloud Services init failed (LAN mode still available): {ex.Message}");
            }

            CurrentPhase.OnValueChanged += (prev, current) => OnPhaseChanged?.Invoke(current);
        }

        private void Update()
        {
            if (!IsServer || CurrentGameState.Value != GameState.Playing)
            {
                if (IsServer && CurrentGameState.Value == GameState.Meeting)
                {
                    meetingTimer -= Time.deltaTime;
                    if (meetingTimer <= 0f)
                    {
                        TallyVotesServer();
                    }
                }
                return;
            }

            // Authoritative Day/Night Cycle Tick (45s Day -> 5s Dusk -> 45s Night)
            float timeLeft = PhaseTimeRemaining.Value - Time.deltaTime;
            if (timeLeft <= 0f)
            {
                switch (CurrentPhase.Value)
                {
                    case GamePhase.Day:
                        CurrentPhase.Value = GamePhase.Dusk;
                        timeLeft = 5f; // 5 seconds twilight transition
                        break;
                    case GamePhase.Dusk:
                        CurrentPhase.Value = GamePhase.Night;
                        timeLeft = 45f; // 45 seconds pitch black darkness
                        break;
                    case GamePhase.Night:
                        CurrentPhase.Value = GamePhase.Day;
                        timeLeft = 45f; // 45 seconds bright day
                        break;
                }
            }
            PhaseTimeRemaining.Value = timeLeft;
        }

        #region HOSTING & JOINING (RELAY & LAN)

        /// <summary>
        /// Host via Unity Relay + Lobby with a 4-Digit numeric code.
        /// </summary>
        public async Task<bool> HostGameRelay(string playerName)
        {
            LocalPlayerName = playerName;
            try
            {
                // 1. Allocate Relay
                Allocation allocation = await RelayService.Instance.CreateAllocationAsync(MaxPlayers);
                string relayJoinCode = await RelayService.Instance.GetJoinCodeAsync(allocation.AllocationId);

                // 2. Generate Unique 4-Digit Numeric Room Code
                string numericCode = UnityEngine.Random.Range(1000, 9999).ToString();

                // 3. Create Unity Lobby containing 4-digit code and relay join code
                var lobbyOptions = new CreateLobbyOptions
                {
                    IsPrivate = false,
                    Data = new Dictionary<string, DataObject>
                    {
                        { "RoomCode", new DataObject(DataObject.VisibilityOptions.Public, numericCode, DataObject.IndexOptions.S1) },
                        { "RelayJoinCode", new DataObject(DataObject.VisibilityOptions.Member, relayJoinCode) }
                    }
                };

                Lobby lobby = await LobbyService.Instance.CreateLobbyAsync($"Village_{numericCode}", MaxPlayers, lobbyOptions);
                HostLobbyId = lobby.Id;

                // 4. Configure UnityTransport
                var transport = NetworkManager.Singleton.GetComponent<UnityTransport>();
                transport.SetRelayServerData(
                    allocation.RelayServer.IpV4,
                    (ushort)allocation.RelayServer.Port,
                    allocation.AllocationIdBytes,
                    allocation.Key,
                    allocation.ConnectionData
                );

                // 5. Start Host
                NetworkManager.Singleton.StartHost();
                RoomCode.Value = numericCode;
                StartCoroutine(LobbyHeartbeatCoroutine(lobby.Id, 15f));

                Debug.Log($"[HOST] Relay Hosted! 4-Digit Code: {numericCode} (Relay: {relayJoinCode})");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[HOST] Relay Host failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Join via 4-Digit numeric room code using Unity Lobby + Relay.
        /// </summary>
        public async Task<bool> JoinGameRelay(string playerName, string fourDigitCode)
        {
            LocalPlayerName = playerName;
            try
            {
                // Query Lobby matching the 4-digit code
                var queryOptions = new QueryLobbiesOptions
                {
                    Filters = new List<QueryFilter>
                    {
                        new QueryFilter(QueryFilter.FieldOptions.S1, fourDigitCode, QueryFilter.OpOptions.EQ)
                    }
                };

                QueryResponse response = await LobbyService.Instance.QueryLobbiesAsync(queryOptions);
                if (response.Lobbies.Count == 0)
                {
                    Debug.LogWarning($"[JOIN] No active village found with code: {fourDigitCode}");
                    return false;
                }

                Lobby targetLobby = await LobbyService.Instance.JoinLobbyByIdAsync(response.Lobbies[0].Id);
                string relayJoinCode = targetLobby.Data["RelayJoinCode"].Value;

                JoinAllocation joinAllocation = await RelayService.Instance.JoinAllocationAsync(relayJoinCode);

                var transport = NetworkManager.Singleton.GetComponent<UnityTransport>();
                transport.SetRelayServerData(
                    joinAllocation.RelayServer.IpV4,
                    (ushort)joinAllocation.RelayServer.Port,
                    joinAllocation.AllocationIdBytes,
                    joinAllocation.Key,
                    joinAllocation.ConnectionData,
                    joinAllocation.HostConnectionData
                );

                NetworkManager.Singleton.StartClient();
                Debug.Log($"[JOIN] Connected to Village via code {fourDigitCode}!");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"[JOIN] Relay Join failed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Direct LAN Host (Local Wi-Fi).
        /// </summary>
        public bool HostGameLAN(string playerName, ushort port = DefaultPort)
        {
            LocalPlayerName = playerName;
            var transport = NetworkManager.Singleton.GetComponent<UnityTransport>();
            transport.SetConnectionData("0.0.0.0", port);

            string numericCode = UnityEngine.Random.Range(1000, 9999).ToString();
            bool success = NetworkManager.Singleton.StartHost();
            if (success)
            {
                RoomCode.Value = numericCode;
                Debug.Log($"[LAN HOST] Server started on port {port}. Room: {numericCode}");
            }
            return success;
        }

        /// <summary>
        /// Direct LAN Client Join.
        /// </summary>
        public bool JoinGameLAN(string playerName, string hostIp, ushort port = DefaultPort)
        {
            LocalPlayerName = playerName;
            var transport = NetworkManager.Singleton.GetComponent<UnityTransport>();
            transport.SetConnectionData(hostIp, port);

            return NetworkManager.Singleton.StartClient();
        }

        private IEnumerator LobbyHeartbeatCoroutine(string lobbyId, float waitTimeSeconds)
        {
            var delay = new WaitForSecondsRealtime(waitTimeSeconds);
            while (NetworkManager.Singleton.IsServer && !string.IsNullOrEmpty(lobbyId))
            {
                LobbyService.Instance.SendHeartbeatPingAsync(lobbyId);
                yield return delay;
            }
        }

        #endregion

        #region MATCH FLOW & ROLES

        [ServerRpc(RequireOwnership = false)]
        public void StartMatchServerRpc(bool forceStart = false)
        {
            if (!IsServer) return;

            var connectedClients = NetworkManager.Singleton.ConnectedClientsList;
            if (connectedClients.Count < 3 && !forceStart)
            {
                Debug.LogWarning("[START] At least 3 players required to start match.");
                return;
            }

            // Assign Roles: Exactly 1 Werewolf / Shapeshifter, rest Villagers
            int werewolfIndex = UnityEngine.Random.Range(0, connectedClients.Count);

            for (int i = 0; i < connectedClients.Count; i++)
            {
                var client = connectedClients[i];
                var player = client.PlayerObject.GetComponent<Player.PlayerController2D>();
                if (player != null)
                {
                    bool isWerewolf = (i == werewolfIndex);
                    player.Role.Value = isWerewolf ? Player.PlayerRole.Werewolf : Player.PlayerRole.Villager;
                    player.IsAlive.Value = true;
                }
            }

            CurrentGameState.Value = GameState.Playing;
            CurrentPhase.Value = GamePhase.Day;
            PhaseTimeRemaining.Value = 45f;
            TasksCompleted.Value = 0;
            TasksTotal.Value = connectedClients.Count * 2;

            Debug.Log($"[MATCH START] Match began! Werewolf client index: {werewolfIndex}");
        }

        [ServerRpc(RequireOwnership = false)]
        public void CallEmergencyMeetingServerRpc(string callerName, string reason)
        {
            if (!IsServer || CurrentGameState.Value != GameState.Playing) return;

            CurrentGameState.Value = GameState.Meeting;
            meetingTimer = 30f;
            votes.Clear();

            NotifyMeetingStartedClientRpc(callerName, reason);
        }

        [ClientRpc]
        private void NotifyMeetingStartedClientRpc(string callerName, string reason)
        {
            OnMeetingStarted?.Invoke(callerName, reason);
        }

        [ServerRpc(RequireOwnership = false)]
        public void CastVoteServerRpc(ulong voterClientId, string targetIdString)
        {
            if (!IsServer || CurrentGameState.Value != GameState.Meeting) return;

            votes[voterClientId] = targetIdString;

            // Check if all alive players have voted
            int aliveCount = 0;
            foreach (var client in NetworkManager.Singleton.ConnectedClientsList)
            {
                var player = client.PlayerObject.GetComponent<Player.PlayerController2D>();
                if (player != null && player.IsAlive.Value) aliveCount++;
            }

            if (votes.Count >= aliveCount)
            {
                TallyVotesServer();
            }
        }

        private void TallyVotesServer()
        {
            var tally = new Dictionary<string, int>();
            int maxVotes = 0;
            string topTarget = null;
            bool isTie = false;

            foreach (var vote in votes.Values)
            {
                tally[vote] = tally.GetValueOrDefault(vote, 0) + 1;
            }

            foreach (var kvp in tally)
            {
                if (kvp.Key == "SKIP") continue;
                if (kvp.Value > maxVotes)
                {
                    maxVotes = kvp.Value;
                    topTarget = kvp.Key;
                    isTie = false;
                }
                else if (kvp.Value == maxVotes)
                {
                    isTie = true;
                }
            }

            int skipVotes = tally.GetValueOrDefault("SKIP", 0);
            bool wasSkipped = (skipVotes >= maxVotes) || isTie || string.IsNullOrEmpty(topTarget);

            string exiledName = "";
            string exiledRole = "";

            if (!wasSkipped && ulong.TryParse(topTarget, out ulong victimClientId))
            {
                if (NetworkManager.Singleton.ConnectedClients.TryGetValue(victimClientId, out var client))
                {
                    var victim = client.PlayerObject.GetComponent<Player.PlayerController2D>();
                    if (victim != null)
                    {
                        victim.IsAlive.Value = false;
                        exiledName = victim.PlayerName.Value.ToString();
                        exiledRole = victim.Role.Value.ToString();
                    }
                }
            }

            NotifyMeetingEndedClientRpc(exiledName, exiledRole, wasSkipped);

            // Check win conditions or resume day after 5 seconds
            StartCoroutine(ResumeDayAfterExileCoroutine());
        }

        [ClientRpc]
        private void NotifyMeetingEndedClientRpc(string exiledName, string exiledRole, bool wasSkipped)
        {
            OnMeetingEnded?.Invoke(exiledName, exiledRole, wasSkipped);
        }

        private IEnumerator ResumeDayAfterExileCoroutine()
        {
            yield return new WaitForSeconds(5.5f);

            if (CheckWinConditions()) yield break;

            CurrentGameState.Value = GameState.Playing;
            CurrentPhase.Value = GamePhase.Day;
            PhaseTimeRemaining.Value = 45f;
        }

        [ServerRpc(RequireOwnership = false)]
        public void CompleteVillageTaskServerRpc()
        {
            if (!IsServer || CurrentGameState.Value != GameState.Playing) return;

            TasksCompleted.Value++;
            CheckWinConditions();
        }

        public bool CheckWinConditions()
        {
            int aliveWerewolves = 0;
            int aliveVillagers = 0;

            foreach (var client in NetworkManager.Singleton.ConnectedClientsList)
            {
                var player = client.PlayerObject.GetComponent<Player.PlayerController2D>();
                if (player != null && player.IsAlive.Value)
                {
                    if (player.Role.Value == Player.PlayerRole.Werewolf) aliveWerewolves++;
                    else aliveVillagers++;
                }
            }

            if (aliveWerewolves == 0)
            {
                EndMatch("VILLAGERS", "The Village has exiled the Shapeshifter! Peace returns.");
                return true;
            }

            if (aliveWerewolves >= aliveVillagers)
            {
                EndMatch("WEREWOLF", "The Werewolf has overwhelmed the village!");
                return true;
            }

            if (TasksCompleted.Value >= TasksTotal.Value && TasksTotal.Value > 0)
            {
                EndMatch("VILLAGERS", "All village maintenance tasks completed! The village survives.");
                return true;
            }

            return false;
        }

        private void EndMatch(string winner, string reason)
        {
            CurrentGameState.Value = GameState.GameOver;
            NotifyGameOverClientRpc(winner, reason);
        }

        [ClientRpc]
        private void NotifyGameOverClientRpc(string winner, string reason)
        {
            OnGameOver?.Invoke(winner, reason);
        }

        #endregion
    }
}
