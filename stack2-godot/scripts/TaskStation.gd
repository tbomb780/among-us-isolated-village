extends Area2D

## TaskStation.gd
## Village Maintenance Task Node in Godot 4.x

@export var task_name: String = "Maintenance Task"
@export var station_building: String = "Forge"

var is_completed_by_local: bool = false
@onready var indicator_light: PointLight2D = $IndicatorLight
@onready var icon_label: Label = $IconLabel

func _ready() -> void:
	add_to_group("task_station")

func trigger_task(player: CharacterBody2D) -> void:
	if not player.is_multiplayer_authority():
		return
	if is_completed_by_local:
		print("[TASK] Already completed %s at %s" % [task_name, station_building])
		return
	
	is_completed_by_local = true
	if indicator_light:
		indicator_light.color = Color(0.1, 0.9, 0.3) # Green completed indicator
	
	# RPC Server that task is completed
	NetworkManager.rpc_id(1, "complete_task")
	print("[TASK] Completed: %s" % task_name)
