extends Control

## Main.gd
## Main Menu for Hosting & Joining in Godot 4.x

@onready var input_name: LineEdit = $MenuCard/VBoxContainer/NameInput
@onready var input_ip: LineEdit = $MenuCard/VBoxContainer/IpInput
@onready var input_code: LineEdit = $MenuCard/VBoxContainer/RoomCodeInput
@onready var btn_host: Button = $MenuCard/VBoxContainer/BtnHost
@onready var btn_join: Button = $MenuCard/VBoxContainer/BtnJoin
@onready var mode_select: OptionButton = $MenuCard/VBoxContainer/ModeSelect
@onready var status_label: Label = $MenuCard/VBoxContainer/StatusLabel

func _ready() -> void:
	mode_select.add_item("LAN / Desktop (ENet)", 0)
	mode_select.add_item("Web / Cloud (WebSocket)", 1)
	
	btn_host.pressed.connect(_on_host_pressed)
	btn_join.pressed.connect(_on_join_pressed)
	
	NetworkManager.player_connected.connect(_on_connected)

func _on_host_pressed() -> void:
	var player_name = input_name.text.strip_edges()
	if player_name.is_empty():
		player_name = "Host"
	
	var mode = "ENET" if mode_select.selected == 0 else "WEBSOCKET"
	status_label.text = "Starting host server..."
	
	var err = NetworkManager.host_game(player_name, mode)
	if err == OK:
		get_tree().change_scene_to_file("res://scenes/Lobby.tscn")
	else:
		status_label.text = "Host Error: %s" % error_string(err)

func _on_join_pressed() -> void:
	var player_name = input_name.text.strip_edges()
	if player_name.is_empty():
		player_name = "Villager"
	
	var target_ip = input_ip.text.strip_edges()
	if target_ip.is_empty():
		target_ip = "127.0.0.1"
	
	var mode = "ENET" if mode_select.selected == 0 else "WEBSOCKET"
	status_label.text = "Connecting to %s..." % target_ip
	
	var err = NetworkManager.join_game(player_name, target_ip, NetworkManager.DEFAULT_PORT, mode)
	if err != OK:
		status_label.text = "Connection Error: %s" % error_string(err)

func _on_connected(peer_id: int, _info: Dictionary) -> void:
	# Once connected to server, transition to lobby
	if peer_id == multiplayer.get_unique_id():
		get_tree().change_scene_to_file("res://scenes/Lobby.tscn")
