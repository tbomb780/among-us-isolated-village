extends Control

## Lobby.gd
## Pre-Game Lobby UI & Host Controls in Godot 4.x

@onready var room_code_label: Label = $Header/RoomCodeLabel
@onready var player_count_label: Label = $Header/PlayerCountLabel
@onready var player_list_container: VBoxContainer = $PlayerListContainer/ScrollContainer/PlayerList
@onready var host_panel: HBoxContainer = $HostPanel
@onready var btn_start: Button = $HostPanel/BtnStartMatch
@onready var btn_force_start: Button = $HostPanel/BtnForceStart

func _ready() -> void:
	room_code_label.text = "ROOM CODE: %s" % NetworkManager.room_code
	
	NetworkManager.player_connected.connect(_on_player_list_changed)
	NetworkManager.player_disconnected.connect(_on_player_list_changed)
	NetworkManager.match_started.connect(_on_match_started)
	
	btn_start.pressed.connect(func(): NetworkManager.start_match(false))
	btn_force_start.pressed.connect(func(): NetworkManager.start_match(true))
	
	update_lobby_ui()

func _on_player_list_changed(_id: int = 0, _info: Dictionary = {}) -> void:
	update_lobby_ui()

func update_lobby_ui() -> void:
	room_code_label.text = "ROOM CODE: %s" % NetworkManager.room_code
	var count = NetworkManager.players.size()
	player_count_label.text = "Players: %d / %d" % [count, NetworkManager.MAX_PLAYERS]
	
	# Only the host sees start match controls
	host_panel.visible = NetworkManager.is_server
	btn_start.disabled = count < 3
	
	# Populate Player Roster
	for child in player_list_container.get_children():
		child.queue_free()
	
	for pid in NetworkManager.players:
		var p = NetworkManager.players[pid]
		var hbox = HBoxContainer.new()
		
		var dot = ColorRect.new()
		dot.custom_minimum_size = Vector2(20, 20)
		dot.color = p["color"]
		hbox.add_child(dot)
		
		var lbl = Label.new()
		lbl.text = "%s %s" % [p["name"], "👑 (Host)" if p.get("is_host", false) else ""]
		hbox.add_child(lbl)
		
		player_list_container.add_child(hbox)

func _on_match_started(_role: String, _phase: String, _tasks: int) -> void:
	get_tree().change_scene_to_file("res://scenes/VillageStage.tscn")
