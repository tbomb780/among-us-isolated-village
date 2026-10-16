extends CanvasModulate

## DayNightCycle.gd
## Controls ambient lighting via CanvasModulate and syncs Day/Night clock HUD in Godot 4.x

@export var day_color: Color = Color(1.0, 1.0, 1.0, 1.0)
@export var dusk_color: Color = Color(0.42, 0.35, 0.55, 1.0)
@export var night_color: Color = Color(0.02, 0.02, 0.06, 1.0) # Pitch-black darkness

@onready var campfire_light: PointLight2D = $"../Campfire/PointLight2D"
@onready var hud_timer_label: Label = $"../HUD/TopBar/Clock/TimerLabel"
@onready var hud_phase_label: Label = $"../HUD/TopBar/Clock/PhaseLabel"
@onready var hud_task_bar: ProgressBar = $"../HUD/TopBar/TaskContainer/TaskBar"
@onready var hud_task_label: Label = $"../HUD/TopBar/TaskContainer/TaskLabel"

var flicker_time: float = 0.0

func _ready() -> void:
	NetworkManager.phase_changed.connect(_on_phase_changed)
	NetworkManager.task_progress_updated.connect(_on_task_progress_updated)
	color = day_color

func _process(delta: float) -> void:
	# 1. Smoothly Lerp CanvasModulate based on current phase
	match NetworkManager.current_phase:
		"DAY":
			color = color.lerp(day_color, 4.0 * delta)
		"DUSK":
			color = color.lerp(dusk_color, 2.5 * delta)
		"NIGHT":
			color = color.lerp(night_color, 5.0 * delta)
	
	# 2. Ambient Campfire Flame Flicker
	if campfire_light:
		flicker_time += delta * 8.0
		campfire_light.energy = 1.3 + sin(flicker_time) * 0.18 + cos(flicker_time * 1.5) * 0.08
	
	# 3. Update HUD Clock & Timer Display
	if hud_timer_label and hud_phase_label:
		var mins = int(NetworkManager.phase_timer) / 60
		var secs = int(NetworkManager.phase_timer) % 60
		hud_timer_label.text = "%02d:%02d" % [mins, secs]
		
		match NetworkManager.current_phase:
			"DAY":
				hud_phase_label.text = "☀️ DAY PHASE"
			"DUSK":
				hud_phase_label.text = "🌆 DUSK (WARNING)"
			"NIGHT":
				hud_phase_label.text = "🌙 NIGHT PHASE"

func _on_phase_changed(new_phase: String, _time_left: int) -> void:
	print("[LIGHTING] Phase shifted to: %s" % new_phase)

func _on_task_progress_updated(completed: int, total: int) -> void:
	if hud_task_bar and hud_task_label:
		hud_task_bar.max_value = total
		hud_task_bar.value = completed
		hud_task_label.text = "Village Tasks: %d / %d" % [completed, total]
