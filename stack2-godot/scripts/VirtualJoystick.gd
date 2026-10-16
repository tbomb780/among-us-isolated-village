extends Control

## VirtualJoystick.gd
## Cross-platform Mobile Touchscreen Analog Thumbstick for Godot 4.x

@export var max_radius: float = 60.0
@export var deadzone: float = 0.1

var output_vector: Vector2 = Vector2.ZERO
var is_pressed: bool = false
var touch_index: int = -1

@onready var base: Control = $Base
@onready var tip: Control = $Base/Tip

func _ready() -> void:
	add_to_group("virtual_joystick")
	# Automatically hide on desktop unless touch emulation is active
	if not DisplayServer.is_touchscreen_available() and not ProjectSettings.get_setting("input_devices/pointing/emulate_touch_from_mouse", false):
		visible = false

func _input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		if event.pressed:
			if not is_pressed and base.get_global_rect().has_point(event.position):
				is_pressed = true
				touch_index = event.index
				update_joystick(event.position)
		elif event.index == touch_index:
			reset_joystick()

	elif event is InputEventScreenDrag and event.index == touch_index:
		update_joystick(event.position)

func update_joystick(touch_pos: Vector2) -> void:
	var base_center = base.global_position + (base.size / 2.0)
	var offset = touch_pos - base_center
	var distance = offset.length()
	
	if distance > max_radius:
		offset = offset.normalized() * max_radius
	
	tip.position = (base.size / 2.0) + offset - (tip.size / 2.0)
	
	# Compute normalized vector with deadzone
	var normalized = offset / max_radius
	if normalized.length() < deadzone:
		output_vector = Vector2.ZERO
	else:
		output_vector = normalized

func reset_joystick() -> void:
	is_pressed = false
	touch_index = -1
	output_vector = Vector2.ZERO
	tip.position = (base.size / 2.0) - (tip.size / 2.0)
