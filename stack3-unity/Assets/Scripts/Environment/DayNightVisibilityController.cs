using UnityEngine;
using UnityEngine.Rendering.Universal;
using TMPro;
using UnityEngine.UI;

namespace IsolatedVillage.Environment
{
    /// <summary>
    /// Controls URP 2D Global Light2D intensity & color for Day/Night cycle,
    /// animated Campfire Light2D flickering, and HUD timers.
    /// </summary>
    public class DayNightVisibilityController : MonoBehaviour
    {
        [Header("URP 2D Lights")]
        [SerializeField] private Light2D globalLight;
        [SerializeField] private Light2D campfireLight;

        [Header("Lighting Tints")]
        [SerializeField] private Color dayColor = Color.white;
        [SerializeField] private Color duskColor = new Color(0.42f, 0.35f, 0.55f);
        [SerializeField] private Color nightColor = new Color(0.02f, 0.02f, 0.05f); // Pitch-black darkness

        [Header("HUD References")]
        [SerializeField] private TextMeshProUGUI phaseLabel;
        [SerializeField] private TextMeshProUGUI timerLabel;
        [SerializeField] private Slider taskProgressBar;
        [SerializeField] private TextMeshProUGUI taskCountLabel;

        private float flickerTimer = 0f;

        private void Start()
        {
            if (globalLight == null)
            {
                // Find Global Light 2D in scene
                var lights = FindObjectsOfType<Light2D>();
                foreach (var l in lights)
                {
                    if (l.lightType == Light2D.LightType.Global)
                    {
                        globalLight = l;
                        break;
                    }
                }
            }
        }

        private void Update()
        {
            var netManager = Networking.GameNetworkManager.Instance;
            if (netManager == null) return;

            // 1. Smoothly Lerp Global Light 2D based on Network Phase
            if (globalLight != null)
            {
                switch (netManager.CurrentPhase.Value)
                {
                    case Networking.GamePhase.Day:
                        globalLight.color = Color.Lerp(globalLight.color, dayColor, 3f * Time.deltaTime);
                        globalLight.intensity = Mathf.Lerp(globalLight.intensity, 1.0f, 3f * Time.deltaTime);
                        break;

                    case Networking.GamePhase.Dusk:
                        globalLight.color = Color.Lerp(globalLight.color, duskColor, 2f * Time.deltaTime);
                        globalLight.intensity = Mathf.Lerp(globalLight.intensity, 0.35f, 2f * Time.deltaTime);
                        break;

                    case Networking.GamePhase.Night:
                        globalLight.color = Color.Lerp(globalLight.color, nightColor, 4f * Time.deltaTime);
                        globalLight.intensity = Mathf.Lerp(globalLight.intensity, 0.02f, 4f * Time.deltaTime);
                        break;
                }
            }

            // 2. Animate Campfire Light2D Flicker
            if (campfireLight != null)
            {
                flickerTimer += Time.deltaTime * 7f;
                campfireLight.intensity = 1.3f + Mathf.Sin(flickerTimer) * 0.15f + Mathf.Cos(flickerTimer * 1.6f) * 0.08f;
            }

            // 3. Update HUD Clock & Timer
            if (timerLabel != null && phaseLabel != null)
            {
                float timeRemaining = netManager.PhaseTimeRemaining.Value;
                int mins = (int)timeRemaining / 60;
                int secs = (int)timeRemaining % 60;
                timerLabel.text = $"{mins:00}:{secs:00}";

                switch (netManager.CurrentPhase.Value)
                {
                    case Networking.GamePhase.Day:
                        phaseLabel.text = "☀️ DAY PHASE";
                        break;
                    case Networking.GamePhase.Dusk:
                        phaseLabel.text = "🌆 DUSK (WARNING)";
                        break;
                    case Networking.GamePhase.Night:
                        phaseLabel.text = "🌙 NIGHT PHASE";
                        break;
                }
            }

            // 4. Update Task Progress Bar
            if (taskProgressBar != null && taskCountLabel != null)
            {
                int completed = netManager.TasksCompleted.Value;
                int total = netManager.TasksTotal.Value;
                taskProgressBar.maxValue = total;
                taskProgressBar.value = completed;
                taskCountLabel.text = $"Tasks: {completed} / {total}";
            }
        }
    }

    /// <summary>
    /// Interactive Village Task Node in 2D houses.
    /// </summary>
    public class VillageMaintenanceNode : MonoBehaviour
    {
        public string TaskId = "Task_1";
        public string TaskName = "Stoke Forge Bellows";
        public bool IsCompleted = false;

        [SerializeField] private Light2D indicatorLight;

        public void Interact(Player.PlayerController2D player)
        {
            if (IsCompleted) return;

            IsCompleted = true;
            if (indicatorLight != null)
            {
                indicatorLight.color = Color.green;
            }

            Networking.GameNetworkManager.Instance.CompleteVillageTaskServerRpc();
            Debug.Log($"[TASK] Completed {TaskName}!");
        }
    }

    /// <summary>
    /// Central Campfire Emergency Bell.
    /// </summary>
    public class EmergencyBell : MonoBehaviour
    {
    }

    /// <summary>
    /// Dead Body Marker left behind upon kill.
    /// </summary>
    public class DeadBodyMarker : MonoBehaviour
    {
        public string VictimName;
    }
}
