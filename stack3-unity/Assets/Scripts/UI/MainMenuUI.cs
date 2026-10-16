using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace IsolatedVillage.UI
{
    public class MainMenuUI : MonoBehaviour
    {
        [Header("Inputs")]
        [SerializeField] private TMP_InputField nameInputField;
        [SerializeField] private TMP_InputField codeInputField;
        [SerializeField] private TMP_InputField ipInputField;
        [SerializeField] private TMP_Dropdown modeDropdown;

        [Header("Buttons")]
        [SerializeField] private Button hostButton;
        [SerializeField] private Button joinButton;

        [Header("Status & Screens")]
        [SerializeField] private TextMeshProUGUI statusText;
        [SerializeField] private GameObject mainMenuPanel;
        [SerializeField] private GameObject lobbyPanel;

        private void Start()
        {
            hostButton.onClick.AddListener(OnHostClicked);
            joinButton.onClick.AddListener(OnJoinClicked);
        }

        private async void OnHostClicked()
        {
            string pName = string.IsNullOrWhiteSpace(nameInputField.text) ? "Host" : nameInputField.text.Trim();
            statusText.text = "Hosting village room...";

            bool isRelay = modeDropdown == null || modeDropdown.value == 0;
            bool success;

            if (isRelay)
            {
                success = await Networking.GameNetworkManager.Instance.HostGameRelay(pName);
            }
            else
            {
                success = Networking.GameNetworkManager.Instance.HostGameLAN(pName);
            }

            if (success)
            {
                mainMenuPanel.SetActive(false);
                lobbyPanel.SetActive(true);
            }
            else
            {
                statusText.text = "Failed to host room.";
            }
        }

        private async void OnJoinClicked()
        {
            string pName = string.IsNullOrWhiteSpace(nameInputField.text) ? "Villager" : nameInputField.text.Trim();
            string code = codeInputField.text.Trim();

            bool isRelay = modeDropdown == null || modeDropdown.value == 0;
            bool success;

            if (isRelay)
            {
                if (code.Length != 4)
                {
                    statusText.text = "Please enter a valid 4-digit code.";
                    return;
                }
                statusText.text = $"Searching for village {code}...";
                success = await Networking.GameNetworkManager.Instance.JoinGameRelay(pName, code);
            }
            else
            {
                string ip = string.IsNullOrWhiteSpace(ipInputField.text) ? "127.0.0.1" : ipInputField.text.Trim();
                statusText.text = $"Connecting to {ip}...";
                success = Networking.GameNetworkManager.Instance.JoinGameLAN(pName, ip);
            }

            if (success)
            {
                mainMenuPanel.SetActive(false);
                lobbyPanel.SetActive(true);
            }
            else
            {
                statusText.text = "Failed to join room. Verify code or IP.";
            }
        }
    }

    public class LobbyUI : MonoBehaviour
    {
        [SerializeField] private TextMeshProUGUI roomCodeText;
        [SerializeField] private TextMeshProUGUI playerCountText;
        [SerializeField] private Transform playerListContainer;
        [SerializeField] private GameObject playerCardPrefab;
        [SerializeField] private GameObject hostControlsPanel;
        [SerializeField] private Button startMatchButton;
        [SerializeField] private Button devForceStartButton;

        private void Start()
        {
            startMatchButton.onClick.AddListener(() => Networking.GameNetworkManager.Instance.StartMatchServerRpc(false));
            devForceStartButton.onClick.AddListener(() => Networking.GameNetworkManager.Instance.StartMatchServerRpc(true));
        }

        private void Update()
        {
            var netManager = Networking.GameNetworkManager.Instance;
            if (netManager == null) return;

            // Display 4-digit code
            roomCodeText.text = $"ROOM CODE: {netManager.RoomCode.Value}";

            int count = Unity.Netcode.NetworkManager.Singleton.ConnectedClientsList.Count;
            playerCountText.text = $"Players: {count} / {Networking.GameNetworkManager.MaxPlayers}";

            // Host Controls Visibility
            bool isHost = Unity.Netcode.NetworkManager.Singleton.IsServer;
            hostControlsPanel.SetActive(isHost);
            startMatchButton.interactable = count >= 3;

            // If match started, switch to gameplay HUD
            if (netManager.CurrentGameState.Value == Networking.GameState.Playing)
            {
                gameObject.SetActive(false);
            }
        }
    }
}
