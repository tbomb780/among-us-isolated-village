extends Control

## MeetingUI.gd
## Town Hall Emergency Meeting & Voting Interface for Godot 4.x

@onready var title_label: Label = $Panel/VBoxContainer/Header/TitleLabel
@onready var reason_label: Label = $Panel/VBoxContainer/Header/ReasonLabel
@onready var player_grid: GridContainer = $Panel/VBoxContainer/ScrollContainer/PlayerGrid
@onready var btn_skip: Button = $Panel/VBoxContainer/Footer/BtnSkip
@onready var exile_panel: Panel = $ExilePanel
@onready var exile_headline: Label = $ExilePanel/Headline
@onready var exile_subtext: Label = $ExilePanel/Subtext

var has_voted: bool = false

func _ready() -> void:
	visible = false
	exile_panel.visible = false
	btn_skip.pressed.connect(_on_skip_pressed)
	
	NetworkManager.emergency_meeting_started.connect(_on_emergency_meeting_started)
	NetworkManager.meeting_ended.connect(_on_meeting_ended)

func _on_emergency_meeting_started(caller_name: String, reason: String) -> void:
	has_voted = false
	visible = true
	exile_panel.visible = false
	
	title_label.text = "🔔 TOWN HALL EMERGENCY MEETING"
	reason_label.text = reason
	
	populate_player_grid()

func populate_player_grid() -> void:
	for child in player_grid.get_children():
		child.queue_free()
	
	var local_id = multiplayer.get_unique_id()
	
	for pid in NetworkManager.players:
		var p = NetworkManager.players[pid]
		var card = PanelContainer.new()
		var hbox = HBoxContainer.new()
		
		# Color dot
		var color_rect = ColorRect.new()
		color_rect.custom_minimum_size = Vector2(24, 24)
		color_rect.color = p["color"]
		hbox.add_child(color_rect)
		
		# Name Label
		var lbl = Label.new()
		lbl.text = "%s %s" % [p["name"], "(You)" if pid == local_id else ""]
		lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hbox.add_child(lbl)
		
		# Vote Button (only for other alive players if local player is alive)
		if p["is_alive"] and pid != local_id and not has_voted:
			var vote_btn = Button.new()
			vote_btn.text = "VOTE"
			vote_btn.pressed.connect(func(): _cast_vote(str(pid)))
			hbox.add_child(vote_btn)
		elif not p["is_alive"]:
			var dead_lbl = Label.new()
			dead_lbl.text = "💀 DEAD"
			dead_lbl.modulate = Color(0.7, 0.7, 0.7, 0.6)
			hbox.add_child(dead_lbl)
		
		card.add_child(hbox)
		player_grid.add_child(card)

func _cast_vote(target_id_str: String) -> void:
	if has_voted:
		return
	has_voted = true
	NetworkManager.rpc_id(1, "submit_vote", target_id_str)
	print("[VOTE] Cast vote for: %s" % target_id_str)

func _on_skip_pressed() -> void:
	if has_voted:
		return
	has_voted = true
	NetworkManager.rpc_id(1, "submit_vote", "SKIP")
	print("[VOTE] Skipped vote.")

func _on_meeting_ended(exiled_name: String, exiled_role: String, was_skipped: bool, wolves_left: int) -> void:
	exile_panel.visible = true
	if was_skipped:
		exile_headline.text = "NO ONE WAS EXILED"
		exile_subtext.text = "The village skipped the vote (or tied).\n%d Werewolf remains." % wolves_left
	else:
		exile_headline.text = "%s WAS EXILED" % exiled_name
		var role_desc = "THE WEREWOLF / SHAPESHIFTER!" if exiled_role == "WEREWOLF" else "an innocent Villager."
		exile_subtext.text = "%s was %s\n%d Werewolf remains." % [exiled_name, role_desc, wolves_left]
	
	await get_tree().create_timer(4.5).timeout
	visible = false
	exile_panel.visible = false
