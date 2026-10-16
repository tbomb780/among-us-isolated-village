extends Node

## NetworkManager.gd
## Autoload Singleton managing High-Level Multiplayer in Godot 4.x
## Supports ENetMultiplayerPeer (LAN / Desktop / Android) & WebSocketMultiplayerPeer (Web/Cloud)

signal player_connected(peer_id: int, player_info: Dictionary)
signal player_disconnected(peer_id: int)
signal server_disconnected()
signal match_started(role: String, phase: String, tasks_total: int)
signal phase_changed(phase: String, time_left: int)
signal task_progress_updated(completed: int, total: int)
signal emergency_meeting_started(caller_name: String, reason: String)
signal meeting_ended(exiled_name: String, exiled_role: String, was_skipped: bool, werewolves_left: int)
signal game_over_triggered(winner: String, reason: String)

const DEFAULT_PORT: int = 8910
const MAX_PLAYERS: int = 10

# Distinct Player Colors for 2D Spacemen / Villagers
const PLAYER_COLORS: Array[Color] = [
	Color(0.94, 0.27, 0.27), # Red
	Color(0.23, 0.51, 0.96), # Blue
	Color(0.06, 0.73, 0.51), # Green
	Color(0.96, 0.62, 0.04), # Amber/Yellow
	Color(0.55, 0.36, 0.96), # Purple
	Color(0.93, 0.28, 0.60), # Pink
	Color(0.02, 0.71, 0.83), # Cyan
	Color(0.98, 0.45, 0.09), # Orange
	Color(0.52, 0.80, 0.09), # Lime
	Color(0.39, 0.40, 0.95)  # Indigo
]

# Networking State
var is_server: bool = false
var local_player_name: String = "Villager"
var room_code: String = "0000"
var current_network_mode: String = "ENET" # "ENET" or "WEBSOCKET"

# Game World State (Server Authoritative)
var players: Dictionary = {} # peer_id -> Dictionary
var game_state: String = "LOBBY" # "LOBBY", "PLAYING", "MEETING", "GAME_OVER"
var current_phase: String = "DAY" # "DAY", "DUSK", "NIGHT"
var phase_timer: float = 45.0
var tasks_total: int = 8
var tasks_completed: int = 0
var votes: Dictionary = {} # peer_id -> target_peer_id or "SKIP"
var dead_bodies: Array[Dictionary] = [] # [{ "id": 1, "victim_id": 2, "name": "Bob", "color": Color, "pos": Vector2 }]

func _ready() -> void:
	multiplayer.peer_connected.connect(_on_peer_connected)
	multiplayer.peer_disconnected.connect(_on_peer_disconnected)
	multiplayer.connected_to_server.connect(_on_connected_to_server)
	multiplayer.connection_failed.connect(_on_connection_failed)
	multiplayer.server_disconnected.connect(_on_server_disconnected)

func _process(delta: float) -> void:
	if not is_server or game_state != "PLAYING":
		return
	
	# Authoritative Day/Night Cycle Loop on Server
	phase_timer -= delta
	if phase_timer <= 0:
		if current_phase == "DAY":
			current_phase = "DUSK"
			phase_timer = 5.0 # 5s transition warning
		elif current_phase == "DUSK":
			current_phase = "NIGHT"
			phase_timer = 45.0 # 45s pitch-black night
		elif current_phase == "NIGHT":
			current_phase = "DAY"
			phase_timer = 45.0 # 45s day
		
		rpc("sync_phase_change", current_phase, int(phase_timer))

# ==============================================================================
# HOSTING & JOINING (ENet for LAN / WebSocket for Web)
# ==============================================================================

func host_game(player_name: String, mode: String = "ENET", port: int = DEFAULT_PORT) -> Error:
	local_player_name = player_name.strip_edges()
	current_network_mode = mode
	is_server = true
	players.clear()
	
	# Generate unique 4-digit numeric room code
	room_code = "%04d" % (randi() % 10000)
	
	var peer: MultiplayerPeer
	if mode == "ENET":
		var enet_peer = ENetMultiplayerPeer.new()
		var err = enet_peer.create_server(port, MAX_PLAYERS)
		if err != OK:
			push_error("Failed to host ENet server on port %d: %s" % [port, error_string(err)])
			return err
		peer = enet_peer
	else:
		var ws_peer = WebSocketMultiplayerPeer.new()
		var err = ws_peer.create_server(port)
		if err != OK:
			push_error("Failed to host WebSocket server on port %d: %s" % [port, error_string(err)])
			return err
		peer = ws_peer
	
	multiplayer.multiplayer_peer = peer
	
	# Register Host Player (peer_id = 1)
	players[1] = {
		"id": 1,
		"name": local_player_name,
		"color": PLAYER_COLORS[0],
		"role": "VILLAGER",
		"is_alive": true,
		"is_host": true
	}
	
	print("[HOST] Village Room %s started on port %d (Mode: %s)" % [room_code, port, mode])
	player_connected.emit(1, players[1])
	return OK

func join_game(player_name: String, address: String = "127.0.0.1", port: int = DEFAULT_PORT, mode: String = "ENET") -> Error:
	local_player_name = player_name.strip_edges()
	current_network_mode = mode
	is_server = false
	players.clear()
	
	var peer: MultiplayerPeer
	if mode == "ENET":
		var enet_peer = ENetMultiplayerPeer.new()
		var err = enet_peer.create_client(address, port)
		if err != OK:
			push_error("Failed to connect via ENet to %s:%d: %s" % [address, port, error_string(err)])
			return err
		peer = enet_peer
	else:
		var ws_peer = WebSocketMultiplayerPeer.new()
		var ws_url = address if address.begins_with("ws://") or address.begins_with("wss://") else "ws://%s:%d" % [address, port]
		var err = ws_peer.create_client(ws_url)
		if err != OK:
			push_error("Failed to connect via WebSocket to %s: %s" % [ws_url, error_string(err)])
			return err
		peer = ws_peer
	
	multiplayer.multiplayer_peer = peer
	print("[CLIENT] Connecting to %s:%d..." % [address, port])
	return OK

func start_match(force_start: bool = false) -> void:
	if not is_server:
		return
	
	var player_ids = players.keys()
	if player_ids.size() < 3 and not force_start:
		push_warning("Need at least 3 players to start (or set force_start=true for dev).")
		return
	
	# Assign Secret Roles: Exactly 1 Werewolf / Shapeshifter, rest Villagers
	var werewolf_idx = randi() % player_ids.size()
	var werewolf_id = player_ids[werewolf_idx]
	
	for i in range(player_ids.size()):
		var pid = player_ids[i]
		players[pid]["role"] = "WEREWOLF" if pid == werewolf_id else "VILLAGER"
		players[pid]["is_alive"] = true
	
	game_state = "PLAYING"
	current_phase = "DAY"
	phase_timer = 45.0
	tasks_completed = 0
	tasks_total = player_ids.size() * 2
	dead_bodies.clear()
	votes.clear()
	
	# Send private role reveal & start match
	for pid in player_ids:
		rpc_id(pid, "sync_match_started", players[pid]["role"], current_phase, tasks_total, players)

# ==============================================================================
# AUTHORITATIVE RPCs & ACTIONS
# ==============================================================================

@rpc("any_peer", "call_local", "reliable")
func register_player(player_name: String) -> void:
	var sender_id = multiplayer.get_remote_sender_id()
	if not is_server:
		return
	
	var color_idx = players.size() % PLAYER_COLORS.size()
	players[sender_id] = {
		"id": sender_id,
		"name": player_name,
		"color": PLAYER_COLORS[color_idx],
		"role": "VILLAGER",
		"is_alive": true,
		"is_host": false
	}
	
	# Broadcast updated roster to all clients
	rpc("sync_player_roster", players, room_code)
	print("[SERVER] Registered player '%s' (Peer %d)" % [player_name, sender_id])

@rpc("authority", "call_local", "reliable")
func sync_player_roster(updated_players: Dictionary, code: String) -> void:
	players = updated_players
	room_code = code
	for pid in players:
		player_connected.emit(pid, players[pid])

@rpc("authority", "call_local", "reliable")
func sync_match_started(assigned_role: String, initial_phase: String, total_tasks: int, current_players: Dictionary) -> void:
	players = current_players
	game_state = "PLAYING"
	current_phase = initial_phase
	tasks_total = total_tasks
	tasks_completed = 0
	match_started.emit(assigned_role, initial_phase, total_tasks)

@rpc("authority", "call_local", "reliable")
func sync_phase_change(new_phase: String, time_left: int) -> void:
	current_phase = new_phase
	phase_timer = float(time_left)
	phase_changed.emit(new_phase, time_left)

@rpc("any_peer", "call_local", "reliable")
func request_kill(victim_id: int) -> void:
	var sender_id = multiplayer.get_remote_sender_id()
	if not is_server:
		return
	
	var killer = players.get(sender_id)
	var victim = players.get(victim_id)
	
	if not killer or not victim:
		return
	if killer["role"] != "WEREWOLF" or not killer["is_alive"]:
		return
	if current_phase != "NIGHT":
		return
	if not victim["is_alive"] or victim["role"] == "WEREWOLF":
		return
	
	victim["is_alive"] = false
	
	# Spawn dead body
	var body_data = {
		"id": dead_bodies.size() + 1,
		"victim_id": victim_id,
		"name": victim["name"],
		"color": victim["color"]
	}
	dead_bodies.append(body_data)
	
	rpc("sync_player_killed", victim_id, body_data)
	check_win_conditions()

@rpc("authority", "call_local", "reliable")
func sync_player_killed(victim_id: int, body_data: Dictionary) -> void:
	if players.has(victim_id):
		players[victim_id]["is_alive"] = false
	dead_bodies.append(body_data)

@rpc("any_peer", "call_local", "reliable")
func request_emergency_meeting(source: String, body_name: String = "") -> void:
	var sender_id = multiplayer.get_remote_sender_id()
	if not is_server or game_state != "PLAYING":
		return
	
	var caller = players.get(sender_id)
	if not caller or not caller["is_alive"]:
		return
	
	game_state = "MEETING"
	votes.clear()
	var reason = "%s rang the Town Square Bell!" % caller["name"] if source == "BELL" else "%s reported %s's remains!" % [caller["name"], body_name]
	rpc("sync_meeting_started", caller["name"], reason)

@rpc("authority", "call_local", "reliable")
func sync_meeting_started(caller_name: String, reason: String) -> void:
	game_state = "MEETING"
	emergency_meeting_started.emit(caller_name, reason)

@rpc("any_peer", "call_local", "reliable")
func submit_vote(target_id_str: String) -> void:
	var sender_id = multiplayer.get_remote_sender_id()
	if not is_server or game_state != "MEETING":
		return
	
	votes[sender_id] = target_id_str
	var alive_count = 0
	for p in players.values():
		if p["is_alive"]:
			alive_count += 1
	
	if votes.size() >= alive_count:
		tally_votes()

func tally_votes() -> void:
	var tally: Dictionary = {}
	var max_votes = 0
	var exiled_id: int = -1
	var is_tie = false
	
	for v in votes.values():
		tally[v] = tally.get(v, 0) + 1
	
	for target in tally.keys():
		if target == "SKIP":
			continue
		var count = tally[target]
		if count > max_votes:
			max_votes = count
			exiled_id = int(target)
			is_tie = false
		elif count == max_votes:
			is_tie = true
	
	var skip_votes = tally.get("SKIP", 0)
	var was_skipped = (skip_votes >= max_votes) or is_tie or (exiled_id == -1)
	var exiled_name = ""
	var exiled_role = ""
	
	if not was_skipped and players.has(exiled_id):
		var victim = players[exiled_id]
		victim["is_alive"] = false
		exiled_name = victim["name"]
		exiled_role = victim["role"]
	
	var wolves_left = 0
	for p in players.values():
		if p["is_alive"] and p["role"] == "WEREWOLF":
			wolves_left += 1
	
	rpc("sync_meeting_result", exiled_name, exiled_role, was_skipped, wolves_left)
	
	# Resume Day after 5 seconds
	await get_tree().create_timer(5.0).timeout
	if check_win_conditions():
		return
	
	game_state = "PLAYING"
	current_phase = "DAY"
	phase_timer = 45.0
	dead_bodies.clear()
	rpc("sync_phase_change", "DAY", 45)

@rpc("authority", "call_local", "reliable")
func sync_meeting_result(exiled_name: String, exiled_role: String, was_skipped: bool, wolves_left: int) -> void:
	meeting_ended.emit(exiled_name, exiled_role, was_skipped, wolves_left)

@rpc("any_peer", "call_local", "reliable")
func complete_task() -> void:
	if not is_server or game_state != "PLAYING":
		return
	
	tasks_completed += 1
	rpc("sync_task_progress", tasks_completed, tasks_total)
	check_win_conditions()

@rpc("authority", "call_local", "reliable")
func sync_task_progress(completed: int, total: int) -> void:
	tasks_completed = completed
	tasks_total = total
	task_progress_updated.emit(completed, total)

func check_win_conditions() -> bool:
	var alive_wolves = 0
	var alive_villagers = 0
	for p in players.values():
		if p["is_alive"]:
			if p["role"] == "WEREWOLF":
				alive_wolves += 1
			else:
				alive_villagers += 1
	
	if alive_wolves == 0:
		rpc("sync_game_over", "VILLAGERS", "The Village has exiled the Shapeshifter! Peace returns.")
		return true
	elif alive_wolves >= alive_villagers:
		rpc("sync_game_over", "WEREWOLF", "The Werewolf has overwhelmed the village!")
		return true
	elif tasks_completed >= tasks_total and tasks_total > 0:
		rpc("sync_game_over", "VILLAGERS", "All village maintenance tasks completed! The village survives.")
		return true
	
	return false

@rpc("authority", "call_local", "reliable")
func sync_game_over(winner: String, reason: String) -> void:
	game_state = "GAME_OVER"
	game_over_triggered.emit(winner, reason)

# ==============================================================================
# NETWORK SIGNALS
# ==============================================================================

func _on_peer_connected(id: int) -> void:
	print("[NET] Peer connected: %d" % id)

func _on_peer_disconnected(id: int) -> void:
	print("[NET] Peer disconnected: %d" % id)
	players.erase(id)
	player_disconnected.emit(id)
	if is_server:
		rpc("sync_player_roster", players, room_code)
		check_win_conditions()

func _on_connected_to_server() -> void:
	print("[NET] Successfully connected to server as Peer %d" % multiplayer.get_unique_id())
	rpc_id(1, "register_player", local_player_name)

func _on_connection_failed() -> void:
	push_error("[NET] Connection to server failed.")

func _on_server_disconnected() -> void:
	print("[NET] Server disconnected.")
	server_disconnected.emit()
