using System.Collections;
using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace IsolatedVillage.UI
{
    public class TownHallMeetingUI : MonoBehaviour
    {
        [Header("Panels")]
        [SerializeField] private GameObject meetingModal;
        [SerializeField] private GameObject exilePanel;

        [Header("Header")]
        [SerializeField] private TextMeshProUGUI meetingTitleText;
        [SerializeField] private TextMeshProUGUI meetingReasonText;
        [SerializeField] private TextMeshProUGUI timerText;

        [Header("Voting Elements")]
        [SerializeField] private Transform votingGrid;
        [SerializeField] private GameObject voteButtonPrefab;
        [SerializeField] private Button skipVoteButton;

        [Header("Exile Reveal")]
        [SerializeField] private TextMeshProUGUI exileHeadlineText;
        [SerializeField] private TextMeshProUGUI exileSubtextText;

        private bool hasVoted = false;

        private void Start()
        {
            meetingModal.SetActive(false);
            exilePanel.SetActive(false);

            skipVoteButton.onClick.AddListener(OnSkipClicked);

            if (Networking.GameNetworkManager.Instance != null)
            {
                Networking.GameNetworkManager.Instance.OnMeetingStarted += OpenMeeting;
                Networking.GameNetworkManager.Instance.OnMeetingEnded += CloseMeetingWithExile;
            }
        }

        private void OpenMeeting(string caller, string reason)
        {
            hasVoted = false;
            meetingModal.SetActive(true);
            exilePanel.SetActive(false);

            meetingTitleText.text = "🔔 TOWN HALL EMERGENCY MEETING";
            meetingReasonText.text = reason;

            PopulateVotingButtons();
        }

        private void PopulateVotingButtons()
        {
            foreach (Transform child in votingGrid)
            {
                Destroy(child.gameObject);
            }

            ulong localClientId = Unity.Netcode.NetworkManager.Singleton.LocalClientId;

            foreach (var client in Unity.Netcode.NetworkManager.Singleton.ConnectedClientsList)
            {
                var player = client.PlayerObject.GetComponent<Player.PlayerController2D>();
                if (player == null) continue;

                GameObject btnObj = new GameObject($"VoteBtn_{player.PlayerName.Value}");
                btnObj.transform.SetParent(votingGrid, false);

                var img = btnObj.AddComponent<Image>();
                img.color = new Color(0.15f, 0.2f, 0.3f);

                var btn = btnObj.AddComponent<Button>();
                ulong targetId = client.ClientId;

                GameObject textObj = new GameObject("Text");
                textObj.transform.SetParent(btnObj.transform, false);
                var tmp = textObj.AddComponent<TextMeshProUGUI>();
                tmp.text = $"{player.PlayerName.Value} {(targetId == localClientId ? "(You)" : "")}";
                tmp.alignment = TextAlignmentOptions.Center;
                tmp.fontSize = 18;

                if (player.IsAlive.Value && targetId != localClientId)
                {
                    btn.onClick.AddListener(() => CastVote(targetId.ToString()));
                }
                else
                {
                    btn.interactable = false;
                    if (!player.IsAlive.Value) tmp.text += " [DEAD]";
                }
            }
        }

        private void CastVote(string targetIdString)
        {
            if (hasVoted) return;
            hasVoted = true;

            ulong localId = Unity.Netcode.NetworkManager.Singleton.LocalClientId;
            Networking.GameNetworkManager.Instance.CastVoteServerRpc(localId, targetIdString);
            Debug.Log($"[VOTE] Voted for {targetIdString}");
        }

        private void OnSkipClicked()
        {
            if (hasVoted) return;
            hasVoted = true;

            ulong localId = Unity.Netcode.NetworkManager.Singleton.LocalClientId;
            Networking.GameNetworkManager.Instance.CastVoteServerRpc(localId, "SKIP");
            Debug.Log("[VOTE] Skipped vote.");
        }

        private void CloseMeetingWithExile(string exiledName, string exiledRole, bool wasSkipped)
        {
            meetingModal.SetActive(false);
            exilePanel.SetActive(true);

            if (wasSkipped)
            {
                exileHeadlineText.text = "NO ONE WAS EXILED";
                exileSubtextText.text = "The village skipped or tied the vote.";
            }
            else
            {
                exileHeadlineText.text = $"{exiledName} WAS EXILED";
                string roleDesc = (exiledRole == "Werewolf") ? "THE SHAPESHIFTER / WEREWOLF!" : "an innocent Villager.";
                exileSubtextText.text = $"{exiledName} was {roleDesc}";
            }

            StartCoroutine(HideExileAfterDelay());
        }

        private IEnumerator HideExileAfterDelay()
        {
            yield return new WaitForSeconds(5.0f);
            exilePanel.SetActive(false);
        }
    }
}
