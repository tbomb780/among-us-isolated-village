using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace IsolatedVillage.UI
{
    /// <summary>
    /// Android & Mobile Touchscreen Interface: Virtual Analog Thumbstick + Action Buttons.
    /// </summary>
    public class MobileTouchControlsUI : MonoBehaviour, IDragHandler, IPointerDownHandler, IPointerUpHandler
    {
        public static Vector2 JoystickInput { get; private set; }

        [Header("Thumbstick Visuals")]
        [SerializeField] private RectTransform joystickBackground;
        [SerializeField] private RectTransform joystickHandle;
        [SerializeField] private float handleRange = 60f;

        [Header("Touch Buttons")]
        [SerializeField] private Button btnUse;
        [SerializeField] private Button btnKill;
        [SerializeField] private Button btnReport;

        private void Start()
        {
            // Auto-hide if not on mobile/touch device
            if (!Application.isMobilePlatform && !Application.isEditor)
            {
                gameObject.SetActive(false);
                return;
            }

            if (btnUse != null) btnUse.onClick.AddListener(OnUseClicked);
            if (btnKill != null) btnKill.onClick.AddListener(OnKillClicked);
            if (btnReport != null) btnReport.onClick.AddListener(OnReportClicked);
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            OnDrag(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (RectTransformUtility.ScreenPointToLocalPointInRectangle(
                joystickBackground, eventData.position, eventData.pressEventCamera, out Vector2 position))
            {
                Vector2 clampedPos = Vector2.ClampMagnitude(position, handleRange);
                joystickHandle.anchoredPosition = clampedPos;
                JoystickInput = clampedPos / handleRange;
            }
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            joystickHandle.anchoredPosition = Vector2.zero;
            JoystickInput = Vector2.zero;
        }

        private Player.PlayerController2D GetLocalPlayer()
        {
            if (Unity.Netcode.NetworkManager.Singleton != null && Unity.Netcode.NetworkManager.Singleton.LocalClient != null)
            {
                var playerObj = Unity.Netcode.NetworkManager.Singleton.LocalClient.PlayerObject;
                if (playerObj != null) return playerObj.GetComponent<Player.PlayerController2D>();
            }
            return null;
        }

        private void OnUseClicked()
        {
            var p = GetLocalPlayer();
            if (p != null) p.PerformInteractAction();
        }

        private void OnKillClicked()
        {
            var p = GetLocalPlayer();
            if (p != null) p.PerformKillAction();
        }

        private void OnReportClicked()
        {
            var p = GetLocalPlayer();
            if (p != null) p.PerformReportAction();
        }
    }
}
