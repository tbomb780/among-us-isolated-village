extends Node2D

## VillageStage.gd
## Manages Player Spawning, Stages, Dead Bodies, and Stage HUD in Godot 4.x

@export var player_scene: PackedScene = preload("res://scenes/Player.tscn")

@onready var players_container: Node2D = $Players
@onready var dead_bodies_container: Node2D = $DeadBodies
@onready var btn_touch_use: Button = $HUD/MobileButtons/BtnUse
@onready var btn_touch_kill: Button = $HUD/MobileButtons/BtnKill
@onready var btn_touch_report: Button = $HUD/MobileButtons/BtnReport

func _ready() -> void:
	# Connect to NetworkManager signals
	NetworkManager.player_disconnected.connect(_on_player_disconnected)
	
	# Spawn all registered players
	spawn_all_players()
	
	# Connect mobile button actions
	btn_touch_use.pressed.connect(_on_touch_use_pressed)
	btn_touch_kill.pressed.connect(_on_touch_kill_pressed)
	btn_touch_report.pressed.connect(_on_touch_report_pressed)

func spawn_all_players() -> void:
	var index = 0
	var total = NetworkManager.players.size()
	
	for pid in NetworkManager.players:
		var p_info = NetworkManager.players[pid]
		var player_inst = player_scene.instantiate()
		player_inst.name = "Player_%d" % pid
		player_inst.player_id = pid
		player_inst.player_name = p_info["name"]
		player_inst.player_color = p_info["color"]
		player_inst.role = p_info.get("role", "VILLAGER")
		
		# Spawn in a circle around central campfire (640, 360)
		var angle = (index * (PI * 2)) / max(1, total)
		var spawn_pos = Vector2(640, 360) + Vector2(cos(angle), sin(angle)) * 120.0
		player_inst.global_position = spawn_pos
		player_inst.sync_position = spawn_pos
		
		players_container.add_child(player_inst)
		index += 1

func _on_player_disconnected(peer_id: int) -> void:
	var p_node = players_container.get_node_or_null("Player_%d" % peer_id)
	if p_node:
		p_node.queue_free()

func _on_touch_use_pressed() -> void:
	var local_player = get_local_player()
	if local_player:
		local_player.handle_interact_action()

func _on_touch_kill_pressed() -> void:
	var local_player = get_local_player()
	if local_player:
		local_player.handle_kill_action()

func _on_touch_report_pressed() -> void:
	var local_player = get_local_player()
	if local_player:
		local_player.handle_report_action()

func get_local_player() -> CharacterBody2D:
	var local_id = multiplayer.get_unique_id()
	return players_container.get_node_or_null("Player_%d" % local_id)
