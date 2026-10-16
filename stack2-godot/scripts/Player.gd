extends CharacterBody2D

## Player.gd
## Character controller with MultiplayerSynchronizer, Nameplate, and Day/Night Flashlight

@export var speed: float = 220.0
@export var player_id: int = 1:
	set(value):
		player_id = value
		$MultiplayerSynchronizer.set_multiplayer_authority(value)

# Network-synchronized variables (replicated via MultiplayerSynchronizer)
@export var sync_position: Vector2 = Vector2.ZERO
@export var sync_facing_right: bool = true
@export var sync_is_moving: bool = false
@export var sync_is_alive: bool = true

# Local gameplay properties
var player_name: String = "Player"
var player_color: Color = Color.WHITE
var role: String = "VILLAGER" # "VILLAGER" or "WEREWOLF"
var kill_cooldown: float = 0.0

# Node References
@onready var sprite: CanvasGroup = $Visuals
@onready var body_rect: ColorRect = $Visuals/Body
@onready var visor_rect: ColorRect = $Visuals/Visor
@onready var name_label: Label = $Nameplate/Label
@onready var point_light: PointLight2D = $PointLight2D
@onready var interaction_area: Area2D = $InteractionArea
@onready var sync: MultiplayerSynchronizer = $MultiplayerSynchronizer

func _ready() -> void:
	name_label.text = player_name
	body_rect.color = player_color
	
	# Connect to NetworkManager signals
	NetworkManager.phase_changed.connect(_on_phase_changed)
	NetworkManager.match_started.connect(_on_match_started)
	
	# Apply initial lighting state
	update_lighting_for_phase(NetworkManager.current_phase)

func _physics_process(delta: float) -> void:
	if kill_cooldown > 0:
		kill_cooldown = max(0.0, kill_cooldown - delta)
	
	if is_multiplayer_authority():
		# 1. Local Player Authority Movement
		if not sync_is_alive:
			velocity = Vector2.ZERO
			move_and_slide()
			return
		
		var move_dir = Vector2.ZERO
		move_dir.x = Input.get_action_strength("move_right") - Input.get_action_strength("move_left")
		move_dir.y = Input.get_action_strength("move_down") - Input.get_action_strength("move_up")
		
		# Virtual joystick support (mobile touch)
		var virtual_stick = get_tree().get_first_node_in_group("virtual_joystick")
		if virtual_stick and virtual_stick.output_vector.length() > 0:
			move_dir = virtual_stick.output_vector
		
		if move_dir.length() > 0:
			move_dir = move_dir.normalized()
			sync_is_moving = true
			if move_dir.x > 0.1:
				sync_facing_right = true
			elif move_dir.x < -0.1:
				sync_facing_right = false
		else:
			sync_is_moving = false
		
		velocity = move_dir * speed
		move_and_slide()
		
		# Update sync position for remote interpolation
		sync_position = global_position
		
		# Local Player Input Actions
		if Input.is_action_just_pressed("interact"):
			handle_interact_action()
		if Input.is_action_just_pressed("kill"):
			handle_kill_action()
		if Input.is_action_just_pressed("report"):
			handle_report_action()
			
	else:
		# 2. Remote Puppet Players: Smooth Interpolation
		global_position = global_position.lerp(sync_position, 15.0 * delta)
	
	# Visual Updates
	update_visuals()

func update_visuals() -> void:
	# Facing direction flip
	sprite.scale.x = 1.0 if sync_facing_right else -1.0
	
	# Ghost visibility for eliminated player
	if not sync_is_alive:
		modulate.a = 0.45
		name_label.text = "%s (GHOST)" % player_name
	else:
		modulate.a = 1.0
		name_label.text = player_name

func _on_match_started(assigned_role: String, _phase: String, _tasks: int) -> void:
	if is_multiplayer_authority():
		role = assigned_role
		kill_cooldown = 10.0 # Initial grace period
		update_lighting_for_phase(NetworkManager.current_phase)

func _on_phase_changed(new_phase: String, _time_left: int) -> void:
	update_lighting_for_phase(new_phase)

func update_lighting_for_phase(phase: String) -> void:
	# Only the local player renders their own PointLight2D flashlight
	if not is_multiplayer_authority():
		point_light.enabled = false
		return
	
	match phase:
		"DAY":
			point_light.enabled = false
			point_light.energy = 0.0
		"DUSK":
			point_light.enabled = true
			point_light.energy = 0.6
			point_light.texture_scale = 1.0
		"NIGHT":
			point_light.enabled = true
			point_light.energy = 1.3
			# WEREWOLF GETS 1.5X LARGER NIGHT VISION RADIUS!
			if role == "WEREWOLF":
				point_light.texture_scale = 1.5
				point_light.color = Color(1.0, 0.85, 0.85) # Sinister tinted night vision
			else:
				point_light.texture_scale = 1.0
				point_light.color = Color(1.0, 0.95, 0.8) # Warm torchlight

# ==============================================================================
# ACTIONS (INTERACT, KILL, REPORT)
# ==============================================================================

func handle_interact_action() -> void:
	var overlapping_areas = interaction_area.get_overlapping_areas()
	for area in overlapping_areas:
		if area.is_in_group("task_station"):
			area.trigger_task(self)
			return
		elif area.is_in_group("emergency_bell"):
			NetworkManager.rpc_id(1, "request_emergency_meeting", "BELL")
			return

func handle_kill_action() -> void:
	if role != "WEREWOLF" or NetworkManager.current_phase != "NIGHT" or kill_cooldown > 0:
		return
	
	# Find nearest alive Villager in kill proximity (<= 75 units)
	var overlapping_bodies = interaction_area.get_overlapping_bodies()
	for body in overlapping_bodies:
		if body is CharacterBody2D and body != self and body.sync_is_alive:
			if body.role != "WEREWOLF":
				kill_cooldown = 15.0 # 15s kill cooldown
				NetworkManager.rpc_id(1, "request_kill", body.player_id)
				print("[KILL] Struck victim: Peer %d" % body.player_id)
				return

func handle_report_action() -> void:
	var overlapping_areas = interaction_area.get_overlapping_areas()
	for area in overlapping_areas:
		if area.is_in_group("dead_body"):
			var body_info = area.get_meta("body_info", {})
			var victim_name = body_info.get("name", "someone")
			NetworkManager.rpc_id(1, "request_emergency_meeting", "BODY", victim_name)
			return
		elif area.is_in_group("emergency_bell"):
			NetworkManager.rpc_id(1, "request_emergency_meeting", "BELL")
			return
