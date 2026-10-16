/**
 * THE ISOLATED VILLAGE - HTML5 2D CLIENT ENGINE
 * Full-stack Multiplayer Social Deduction Game
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. CONFIGURATION & STATE
  // =========================================================================
  const MAP_WIDTH = 1600;
  const MAP_HEIGHT = 1200;
  const PLAYER_RADIUS = 18;
  const PLAYER_SPEED = 210; // Pixels per second

  // Vision Radii in Night Phase
  const VILLAGER_LIGHT_RADIUS = 150;
  const WEREWOLF_LIGHT_RADIUS = 225; // 1.5x Villager radius
  const CAMPFIRE_LIGHT_RADIUS = 170;

  // Socket & Local Player Info
  const socket = io();
  let myPlayerId = null;
  let myRoomCode = null;
  let isHost = false;
  let myRole = 'VILLAGER'; // 'VILLAGER' | 'WEREWOLF'
  let isAlive = true;
  let killCooldown = 0;
  let hasVotedInMeeting = false;

  // Game World State (Authoritative from Server)
  let gameState = 'MENU'; // 'MENU' | 'LOBBY' | 'PLAYING' | 'MEETING' | 'EXILE' | 'GAME_OVER'
  let currentPhase = 'DAY'; // 'DAY' | 'DUSK' | 'NIGHT'
  let phaseTimer = 45;
  let remotePlayers = {};
  let deadBodies = [];
  let tasksCompleted = 0;
  let tasksTotal = 8;
  let localCompletedTasks = [];

  // Local Player Movement State
  let localPos = { x: 800, y: 600 };
  let localVelocity = { x: 0, y: 0 };
  let facing = 'right';
  let isMoving = false;
  let walkBobTimer = 0;

  // Input State
  const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false,
    e: false, q: false, r: false, Space: false
  };

  // Virtual Mobile Joystick State
  const joystick = {
    active: false,
    touchId: null,
    baseX: 0,
    baseY: 0,
    currX: 0,
    currY: 0,
    vectorX: 0,
    vectorY: 0,
    maxRadius: 45
  };

  // Nearby Interaction Cache
  let nearbyInteractable = null; // { type: 'TASK'|'BELL'|'BODY', id, name, x, y }
  let nearbyKillTarget = null;   // player object

  // Canvas & Offscreen Darkness Mask
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const maskCanvas = document.createElement('canvas');
  const maskCtx = maskCanvas.getContext('2d');

  // DOM Elements
  const elMainMenu = document.getElementById('main-menu');
  const elLobbyMenu = document.getElementById('lobby-menu');
  const elGameHud = document.getElementById('game-hud');
  const elMeetingModal = document.getElementById('meeting-modal');
  const elExileModal = document.getElementById('exile-modal');
  const elTaskModal = document.getElementById('task-modal');
  const elGameOverModal = document.getElementById('game-over-modal');

  const inputPlayerName = document.getElementById('player-name-input');
  const inputRoomCode = document.getElementById('room-code-input');
  const btnHost = document.getElementById('btn-host-game');
  const btnJoin = document.getElementById('btn-join-game');
  const btnStartMatch = document.getElementById('btn-start-match');
  const btnForceStart = document.getElementById('btn-force-start');
  const btnCopyCode = document.getElementById('btn-copy-code');
  const displayRoomCode = document.getElementById('display-room-code');
  const lobbyPlayerCount = document.getElementById('lobby-player-count');
  const lobbyPlayerList = document.getElementById('lobby-player-list');
  const hostControls = document.getElementById('host-controls');

  const phaseIcon = document.getElementById('phase-icon');
  const phaseLabel = document.getElementById('phase-label');
  const phaseTimerEl = document.getElementById('phase-timer');
  const taskCountText = document.getElementById('task-count-text');
  const taskBarFill = document.getElementById('task-bar-fill');
  const roleBadge = document.getElementById('role-badge');
  const interactionPrompt = document.getElementById('interaction-prompt');
  const promptText = document.getElementById('prompt-text');

  // Mobile Buttons
  const btnTouchKill = document.getElementById('btn-touch-kill');
  const btnTouchReport = document.getElementById('btn-touch-report');
  const btnTouchInteract = document.getElementById('btn-touch-interact');
  const killCooldownOverlay = document.getElementById('kill-cooldown-overlay');

  // =========================================================================
  // 2. MAP GEOMETRY & COLLIDERS
  // =========================================================================
  // 4 Village Houses
  const BUILDINGS = [
    {
      id: 'elder_hall',
      name: "Elder's Great Hall",
      x: 670, y: 120, w: 260, h: 200,
      wallColor: '#451a03', roofColor: '#78350f', floorColor: '#292524',
      door: { x: 770, y: 310, w: 60, h: 20 },
      taskId: 'task_runes', taskName: 'Translate Ancient Runes', taskX: 800, taskY: 180
    },
    {
      id: 'blacksmith',
      name: "Blacksmith Forge",
      x: 1240, y: 480, w: 240, h: 240,
      wallColor: '#374151', roofColor: '#4b5563', floorColor: '#1f2937',
      door: { x: 1230, y: 570, w: 20, h: 60 },
      taskId: 'task_forge', taskName: 'Stoke Forge Bellows', taskX: 1360, taskY: 600
    },
    {
      id: 'barn_mill',
      name: "Grain Barn & Mill",
      x: 660, y: 880, w: 280, h: 220,
      wallColor: '#7c2d12', roofColor: '#9a3412', floorColor: '#3b2413',
      door: { x: 770, y: 870, w: 60, h: 20 },
      taskId: 'task_gears', taskName: 'Clear Mill Gears', taskX: 800, taskY: 990
    },
    {
      id: 'apothecary',
      name: "Apothecary & Clinic",
      x: 120, y: 480, w: 240, h: 240,
      wallColor: '#14532d', roofColor: '#166534', floorColor: '#0f291e',
      door: { x: 350, y: 570, w: 20, h: 60 },
      taskId: 'task_elixir', taskName: 'Brew Wolfsbane Elixir', taskX: 240, taskY: 600
    }
  ];

  // Campfire Town Square Plaza
  const CAMPFIRE = { x: 800, y: 600, radius: 24 };
  const EMERGENCY_BELL = { x: 800, y: 550, radius: 18 };

  // Solid Collision Rectangles
  const COLLIDERS = [
    // Outer Boundaries
    { x: 0, y: 0, w: MAP_WIDTH, h: 60 },
    { x: 0, y: MAP_HEIGHT - 60, w: MAP_WIDTH, h: 60 },
    { x: 0, y: 0, w: 60, h: MAP_HEIGHT },
    { x: MAP_WIDTH - 60, y: 0, w: 60, h: MAP_HEIGHT },

    // Elder's Hall Walls (excluding door at bottom center)
    { x: 670, y: 120, w: 260, h: 20 }, // Top
    { x: 670, y: 120, w: 20, h: 200 }, // Left
    { x: 910, y: 120, w: 20, h: 200 }, // Right
    { x: 670, y: 300, w: 100, h: 20 }, // Bottom Left
    { x: 830, y: 300, w: 100, h: 20 }, // Bottom Right

    // Blacksmith Walls (excluding door on west wall)
    { x: 1240, y: 480, w: 240, h: 20 }, // Top
    { x: 1460, y: 480, w: 20, h: 240 }, // Right
    { x: 1240, y: 700, w: 240, h: 20 }, // Bottom
    { x: 1240, y: 480, w: 20, h: 90 },  // Left Top
    { x: 1240, y: 630, w: 20, h: 90 },  // Left Bottom

    // Barn Walls (excluding door on north wall)
    { x: 660, y: 880, w: 110, h: 20 }, // Top Left
    { x: 830, y: 880, w: 110, h: 20 }, // Top Right
    { x: 660, y: 880, w: 20, h: 220 }, // Left
    { x: 920, y: 880, w: 20, h: 220 }, // Right
    { x: 660, y: 1080, w: 280, h: 20 },// Bottom

    // Apothecary Walls (excluding door on east wall)
    { x: 120, y: 480, w: 240, h: 20 }, // Top
    { x: 120, y: 480, w: 20, h: 240 },  // Left
    { x: 120, y: 700, w: 240, h: 20 }, // Bottom
    { x: 340, y: 480, w: 20, h: 90 },  // Right Top
    { x: 340, y: 630, w: 20, h: 90 },  // Right Bottom

    // Central Campfire Solid Core
    { x: 785, y: 585, w: 30, h: 30 }
  ];

  // =========================================================================
  // 3. CANVAS SIZING & CAMERA RESIZING
  // =========================================================================
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    maskCanvas.width = window.innerWidth;
    maskCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // =========================================================================
  // 4. NETWORKING: SOCKET EVENT LISTENERS
  // =========================================================================
  socket.on('connect', () => {
    myPlayerId = socket.id;
    console.log('[NET] Connected to server, Socket ID:', myPlayerId);
  });

  socket.on('error_message', (msg) => {
    showToast(`⚠️ ${msg}`);
  });

  socket.on('game_hosted', ({ roomCode, player, players }) => {
    myRoomCode = roomCode;
    isHost = true;
    gameState = 'LOBBY';
    remotePlayers = players;
    localPos.x = player.x;
    localPos.y = player.y;

    displayRoomCode.textContent = roomCode;
    elMainMenu.classList.remove('active');
    elLobbyMenu.classList.add('active');
    hostControls.style.display = 'block';

    updateLobbyUI();
    showToast(`Village room ${roomCode} created! Share code with friends.`);
  });

  socket.on('game_joined', ({ roomCode, player, players }) => {
    myRoomCode = roomCode;
    isHost = false;
    gameState = 'LOBBY';
    remotePlayers = players;
    localPos.x = player.x;
    localPos.y = player.y;

    displayRoomCode.textContent = roomCode;
    elMainMenu.classList.remove('active');
    elLobbyMenu.classList.add('active');
    hostControls.style.display = 'none';

    updateLobbyUI();
    showToast(`Joined village room ${roomCode}!`);
  });

  socket.on('player_joined', ({ player, players }) => {
    remotePlayers = players;
    updateLobbyUI();
    showToast(`"${player.name}" arrived in the village.`);
  });

  socket.on('player_left', ({ playerId, playerName, newHostId, players }) => {
    delete remotePlayers[playerId];
    remotePlayers = players;
    if (newHostId === myPlayerId) {
      isHost = true;
      hostControls.style.display = 'block';
      showToast('You are now the Village Host!');
    }
    updateLobbyUI();
    showToast(`"${playerName}" left the village.`);
  });

  socket.on('match_started', ({ role, x, y, phase, phaseTimer: pt, tasksTotal: tt, tasksCompleted: tc, players }) => {
    gameState = 'PLAYING';
    myRole = role;
    isAlive = true;
    currentPhase = phase;
    phaseTimer = pt;
    tasksTotal = tt;
    tasksCompleted = tc;
    remotePlayers = players;
    localPos.x = x;
    localPos.y = y;
    localCompletedTasks = [];

    elLobbyMenu.classList.remove('active');
    elGameHud.style.display = 'block';

    // Configure Role Badge
    roleBadge.className = `role-badge ${role.toLowerCase()}`;
    if (role === 'WEREWOLF') {
      roleBadge.querySelector('.role-title').textContent = 'ROLE: WEREWOLF / THING';
      roleBadge.querySelector('.role-desc').textContent = 'Hunt villagers in pitch darkness';
      btnTouchKill.style.display = 'flex';
    } else {
      roleBadge.querySelector('.role-title').textContent = 'ROLE: VILLAGER';
      roleBadge.querySelector('.role-desc').textContent = 'Complete tasks & survive';
      btnTouchKill.style.display = 'none';
    }

    updateTaskHUD();
    updatePhaseClockHUD();
    showToast(`Match Started! You are a ${role}.`);
  });

  socket.on('players_sync', (data) => {
    // Synchronize remote player positions
    for (const pid in data.players) {
      if (pid !== myPlayerId) {
        if (!remotePlayers[pid]) {
          remotePlayers[pid] = data.players[pid];
        } else {
          // Smooth interpolation target
          const target = data.players[pid];
          remotePlayers[pid].x += (target.x - remotePlayers[pid].x) * 0.4;
          remotePlayers[pid].y += (target.y - remotePlayers[pid].y) * 0.4;
          remotePlayers[pid].facing = target.facing;
          remotePlayers[pid].isMoving = target.isMoving;
          remotePlayers[pid].isAlive = target.isAlive;
          remotePlayers[pid].role = target.role;
        }
      }
    }
    tasksCompleted = data.tasksCompleted;
    tasksTotal = data.tasksTotal;
    currentPhase = data.phase;
    phaseTimer = data.phaseTimer;

    updateTaskHUD();
    updatePhaseClockHUD();
  });

  socket.on('phase_change', (data) => {
    currentPhase = data.phase;
    phaseTimer = data.phaseTimer;
    deadBodies = data.deadBodies || [];
    updatePhaseClockHUD();

    if (currentPhase === 'DUSK') {
      showToast('⚠️ DUSK IS FALLING! Pitch darkness approaches in 5s...');
    } else if (currentPhase === 'NIGHT') {
      showToast('🌑 NIGHTFALL! Stay together or beware the creature in the dark!');
    } else if (currentPhase === 'DAY') {
      showToast('☀️ DAWN BREAKS! Daylight returns to the village.');
    }
  });

  socket.on('player_killed', ({ victimId, killerId, deadBody, deadBodies: bodies }) => {
    deadBodies = bodies;
    if (remotePlayers[victimId]) {
      remotePlayers[victimId].isAlive = false;
    }
    if (victimId === myPlayerId) {
      isAlive = false;
      showToast('💀 You were slain by the Shapeshifter!');
    } else if (killerId === myPlayerId) {
      showToast('🩸 You silenced a villager.');
    }
  });

  socket.on('meeting_started', ({ callerName, reason, meetingTimer, players }) => {
    gameState = 'MEETING';
    remotePlayers = players;
    hasVotedInMeeting = false;

    // Open Meeting Modal
    document.getElementById('meeting-title').textContent = '🔔 TOWN HALL EMERGENCY MEETING';
    document.getElementById('meeting-subtitle').textContent = reason;
    elMeetingModal.classList.add('active');

    renderVotingGrid();
  });

  socket.on('vote_recorded', ({ voterId, totalVotes, aliveCount }) => {
    document.getElementById('vote-status-text').textContent = `${totalVotes} / ${aliveCount} votes recorded`;
    const checkEl = document.getElementById(`vote-check-${voterId}`);
    if (checkEl) checkEl.textContent = '✓ Voted';
  });

  socket.on('meeting_result', (result) => {
    elMeetingModal.classList.remove('active');
    elExileModal.classList.add('active');

    const headline = document.getElementById('exile-headline');
    const subtext = document.getElementById('exile-subtext');
    const remaining = document.getElementById('exile-remaining');
    const avatar = document.getElementById('exile-avatar');

    if (result.skipped) {
      avatar.textContent = '🤝';
      headline.textContent = 'NO ONE WAS EXILED';
      subtext.textContent = result.tie ? 'The village tied in votes.' : 'The village decided to skip the vote.';
    } else {
      avatar.textContent = '⚰️';
      headline.textContent = `${result.exiledName} WAS EXILED`;
      subtext.textContent = `${result.exiledName} was ${result.exiledRole === 'WEREWOLF' ? 'THE SHAPESHIFTER / WEREWOLF!' : 'an innocent Villager.'}`;
      if (result.exiledName === (remotePlayers[myPlayerId] && remotePlayers[myPlayerId].name)) {
        isAlive = false;
      }
    }
    remaining.textContent = `${result.werewolvesRemaining} Werewolf remains among the village.`;

    setTimeout(() => {
      elExileModal.classList.remove('active');
      if (gameState === 'EXILE_REVEAL') {
        gameState = 'PLAYING';
      }
    }, 5500);
  });

  socket.on('game_over', ({ winner, reason, players }) => {
    gameState = 'GAME_OVER';
    remotePlayers = players;
    elMeetingModal.classList.remove('active');
    elExileModal.classList.remove('active');
    elTaskModal.classList.remove('active');
    elGameOverModal.classList.add('active');

    const titleEl = document.getElementById('game-over-title');
    titleEl.textContent = winner === 'VILLAGERS' ? '🎉 VILLAGERS WIN!' : '🐺 THE WEREWOLF WINS!';
    titleEl.style.color = winner === 'VILLAGERS' ? '#10b981' : '#ef4444';
    document.getElementById('game-over-reason').textContent = reason;

    const werewolf = Object.values(players).find(p => p.role === 'WEREWOLF');
    document.getElementById('werewolf-reveal-box').textContent = werewolf
      ? `The Shapeshifter / Werewolf was: ${werewolf.name}`
      : 'The creature vanished.';
  });

  socket.on('returned_to_lobby', ({ players }) => {
    gameState = 'LOBBY';
    remotePlayers = players;
    isAlive = true;
    deadBodies = [];
    localCompletedTasks = [];

    elGameOverModal.classList.remove('active');
    elGameHud.style.display = 'none';
    elLobbyMenu.classList.add('active');

    updateLobbyUI();
  });

  // =========================================================================
  // 5. INPUT HANDLING (KEYBOARD & TOUCH JOYSTICK)
  // =========================================================================
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (keys.hasOwnProperty(e.key) || keys.hasOwnProperty(e.code)) {
      keys[e.key] = true;
      if (e.code === 'Space') keys.Space = true;
    }

    // Action Key Binds
    if (gameState === 'PLAYING') {
      if ((e.key === 'e' || e.key === 'E' || e.code === 'Space')) {
        handleInteractAction();
      }
      if ((e.key === 'q' || e.key === 'Q')) {
        handleKillAction();
      }
      if ((e.key === 'r' || e.key === 'R')) {
        handleReportAction();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
    if (e.code === 'Space') keys.Space = false;
  });

  // Mobile Touchscreen Analog Joystick
  const joystickZone = document.getElementById('joystick-zone');
  const joystickBase = document.getElementById('joystick-base');
  const joystickThumb = document.getElementById('joystick-thumb');

  joystickZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.changedTouches[0];
    joystick.active = true;
    joystick.touchId = touch.identifier;

    const rect = joystickBase.getBoundingClientRect();
    joystick.baseX = rect.left + rect.width / 2;
    joystick.baseY = rect.top + rect.height / 2;
    updateJoystick(touch.clientX, touch.clientY);
  }, { passive: false });

  joystickZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joystick.touchId) {
        updateJoystick(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
        break;
      }
    }
  }, { passive: false });

  function resetJoystick() {
    joystick.active = false;
    joystick.touchId = null;
    joystick.vectorX = 0;
    joystick.vectorY = 0;
    joystickThumb.style.transform = `translate(0px, 0px)`;
  }

  joystickZone.addEventListener('touchend', resetJoystick);
  joystickZone.addEventListener('touchcancel', resetJoystick);

  function updateJoystick(clientX, clientY) {
    let dx = clientX - joystick.baseX;
    let dy = clientY - joystick.baseY;
    const distance = Math.hypot(dx, dy);

    if (distance > joystick.maxRadius) {
      dx = (dx / distance) * joystick.maxRadius;
      dy = (dy / distance) * joystick.maxRadius;
    }

    joystickThumb.style.transform = `translate(${dx}px, ${dy}px)`;
    joystick.vectorX = dx / joystick.maxRadius;
    joystick.vectorY = dy / joystick.maxRadius;
  }

  // Mobile Touch Action Buttons
  btnTouchInteract.addEventListener('click', handleInteractAction);
  btnTouchKill.addEventListener('click', handleKillAction);
  btnTouchReport.addEventListener('click', handleReportAction);

  // =========================================================================
  // 6. UI ACTIONS & INTERACTION LOGIC
  // =========================================================================
  function handleInteractAction() {
    if (!nearbyInteractable) return;

    if (nearbyInteractable.type === 'TASK') {
      openTaskMiniGame(nearbyInteractable.id, nearbyInteractable.name);
    } else if (nearbyInteractable.type === 'BELL') {
      socket.emit('player_report', { source: 'EMERGENCY_BELL' });
    }
  }

  function handleKillAction() {
    if (myRole !== 'WEREWOLF' || currentPhase !== 'NIGHT' || killCooldown > 0) return;
    if (!nearbyKillTarget) {
      showToast('No villager within strike range!');
      return;
    }
    socket.emit('player_kill', { targetId: nearbyKillTarget.id });
  }

  function handleReportAction() {
    if (nearbyInteractable && nearbyInteractable.type === 'BODY') {
      socket.emit('player_report', { source: 'DEAD_BODY', bodyId: nearbyInteractable.id });
    } else {
      socket.emit('player_report', { source: 'EMERGENCY_BELL' });
    }
  }

  // Main Menu Event Listeners
  btnHost.addEventListener('click', () => {
    const name = inputPlayerName.value.trim() || 'Host';
    socket.emit('host_game', { playerName: name });
  });

  btnJoin.addEventListener('click', () => {
    const name = inputPlayerName.value.trim() || 'Player';
    const code = inputRoomCode.value.trim();
    if (code.length !== 4) {
      showToast('Please enter a 4-digit room code.');
      return;
    }
    socket.emit('join_game', { playerName: name, roomCode: code });
  });

  btnCopyCode.addEventListener('click', () => {
    if (myRoomCode) {
      navigator.clipboard.writeText(myRoomCode);
      showToast(`Room code ${myRoomCode} copied to clipboard!`);
    }
  });

  btnStartMatch.addEventListener('click', () => {
    socket.emit('start_match', { forceStart: false });
  });

  btnForceStart.addEventListener('click', () => {
    socket.emit('start_match', { forceStart: true });
  });

  document.getElementById('btn-skip-vote').addEventListener('click', () => {
    if (hasVotedInMeeting) return;
    hasVotedInMeeting = true;
    socket.emit('cast_vote', { targetId: 'SKIP' });
    showToast('You skipped your vote.');
  });

  document.getElementById('btn-return-lobby').addEventListener('click', () => {
    socket.emit('return_to_lobby');
  });

  document.getElementById('btn-close-task').addEventListener('click', () => {
    elTaskModal.classList.remove('active');
  });

  // =========================================================================
  // 7. TASK MINI-GAMES
  // =========================================================================
  function openTaskMiniGame(taskId, taskName) {
    if (localCompletedTasks.includes(taskId)) {
      showToast('You have already completed this maintenance task!');
      return;
    }

    elTaskModal.classList.add('active');
    document.getElementById('task-modal-title').textContent = `🔧 ${taskName}`;
    const body = document.getElementById('task-modal-body');

    let currentTaps = 0;
    const requiredTaps = 5;

    body.innerHTML = `
      <p style="color: #cbd5e1; font-size: 0.95rem;">Tap or click the button ${requiredTaps} times to complete the village maintenance.</p>
      <button id="task-tap-btn" class="task-action-btn">STOKE (0/${requiredTaps})</button>
      <div class="task-progress-bar">
        <div id="task-mini-progress" class="task-progress-inner"></div>
      </div>
    `;

    const tapBtn = document.getElementById('task-tap-btn');
    const miniProg = document.getElementById('task-mini-progress');

    tapBtn.addEventListener('click', () => {
      currentTaps++;
      tapBtn.textContent = `PUMP (${currentTaps}/${requiredTaps})`;
      miniProg.style.width = `${(currentTaps / requiredTaps) * 100}%`;

      if (currentTaps >= requiredTaps) {
        tapBtn.disabled = true;
        tapBtn.textContent = 'DONE! ✓';
        tapBtn.style.background = '#10b981';
        localCompletedTasks.push(taskId);

        setTimeout(() => {
          elTaskModal.classList.remove('active');
          socket.emit('task_completed', { taskId });
          showToast(`✓ Completed task: ${taskName}!`);
        }, 500);
      }
    });
  }

  // =========================================================================
  // 8. COLLISION DETECTION & PHYSICS
  // =========================================================================
  function checkCollision(x, y, radius) {
    for (const col of COLLIDERS) {
      // Circle vs AABB Collision Check
      const closestX = Math.max(col.x, Math.min(x, col.x + col.w));
      const closestY = Math.max(col.y, Math.min(y, col.y + col.h));
      const distance = Math.hypot(x - closestX, y - closestY);
      if (distance < radius) {
        return true;
      }
    }
    return false;
  }

  function moveLocalPlayer(dt) {
    if (gameState !== 'PLAYING' && gameState !== 'LOBBY') return;
    if (!isAlive && gameState === 'PLAYING') return;

    let moveX = 0;
    let moveY = 0;

    // 1. Keyboard Input
    if (keys.w || keys.ArrowUp) moveY -= 1;
    if (keys.s || keys.ArrowDown) moveY += 1;
    if (keys.a || keys.ArrowLeft) moveX -= 1;
    if (keys.d || keys.ArrowRight) moveX += 1;

    // 2. Mobile Joystick Input
    if (joystick.active) {
      moveX += joystick.vectorX;
      moveY += joystick.vectorY;
    }

    const length = Math.hypot(moveX, moveY);
    if (length > 0) {
      isMoving = true;
      const normX = moveX / length;
      const normY = moveY / length;

      if (normX < -0.1) facing = 'left';
      else if (normX > 0.1) facing = 'right';

      walkBobTimer += dt * 12;

      // Axis-separated movement collision for smooth wall sliding
      const deltaX = normX * PLAYER_SPEED * dt;
      const deltaY = normY * PLAYER_SPEED * dt;

      if (!checkCollision(localPos.x + deltaX, localPos.y, PLAYER_RADIUS)) {
        localPos.x += deltaX;
      }
      if (!checkCollision(localPos.x, localPos.y + deltaY, PLAYER_RADIUS)) {
        localPos.y += deltaY;
      }

      localVelocity.x = deltaX;
      localVelocity.y = deltaY;
    } else {
      isMoving = false;
      localVelocity.x = 0;
      localVelocity.y = 0;
    }
  }

  // =========================================================================
  // 9. PROXIMITY & ACTION EVALUATOR
  // =========================================================================
  function updateProximityAndActions(dt) {
    if (gameState !== 'PLAYING') {
      interactionPrompt.style.display = 'none';
      return;
    }

    // Decrement kill cooldown
    if (killCooldown > 0) {
      killCooldown = Math.max(0, killCooldown - dt);
      const pct = (killCooldown / 15) * 100;
      killCooldownOverlay.style.height = `${pct}%`;
    } else {
      killCooldownOverlay.style.height = '0%';
    }

    // 1. Check for nearby tasks
    nearbyInteractable = null;
    nearbyKillTarget = null;

    if (isAlive) {
      // Buildings Tasks
      for (const b of BUILDINGS) {
        const dist = Math.hypot(localPos.x - b.taskX, localPos.y - b.taskY);
        if (dist <= 65) {
          nearbyInteractable = {
            type: 'TASK',
            id: b.taskId,
            name: b.taskName,
            x: b.taskX,
            y: b.taskY
          };
          break;
        }
      }

      // Campfire Emergency Bell
      if (!nearbyInteractable) {
        const bellDist = Math.hypot(localPos.x - EMERGENCY_BELL.x, localPos.y - EMERGENCY_BELL.y);
        if (bellDist <= 75) {
          nearbyInteractable = {
            type: 'BELL',
            id: 'emergency_bell',
            name: 'Town Square Bell',
            x: EMERGENCY_BELL.x,
            y: EMERGENCY_BELL.y
          };
        }
      }

      // Dead Body Report
      let closestBody = null;
      let minBodyDist = 80;
      for (const b of deadBodies) {
        const dist = Math.hypot(localPos.x - b.x, localPos.y - b.y);
        if (dist < minBodyDist) {
          minBodyDist = dist;
          closestBody = b;
        }
      }

      if (closestBody) {
        btnTouchReport.style.display = 'flex';
        nearbyInteractable = {
          type: 'BODY',
          id: closestBody.id,
          name: `Report ${closestBody.victimName}`,
          x: closestBody.x,
          y: closestBody.y
        };
      } else {
        btnTouchReport.style.display = (nearbyInteractable && nearbyInteractable.type === 'BELL') ? 'flex' : 'none';
      }

      // Werewolf Kill Proximity (at Night only)
      if (myRole === 'WEREWOLF' && currentPhase === 'NIGHT') {
        let closestVillager = null;
        let minDist = 75;

        for (const pid in remotePlayers) {
          if (pid === myPlayerId) continue;
          const p = remotePlayers[pid];
          if (p.isAlive && p.role !== 'WEREWOLF') {
            const dist = Math.hypot(localPos.x - p.x, localPos.y - p.y);
            if (dist < minDist) {
              minDist = dist;
              closestVillager = p;
            }
          }
        }

        nearbyKillTarget = closestVillager;
        btnTouchKill.style.opacity = (closestVillager && killCooldown <= 0) ? '1' : '0.4';
      }
    }

    // Update Desktop Interaction HUD Hint
    if (nearbyInteractable) {
      interactionPrompt.style.display = 'flex';
      promptText.textContent = `[E] ${nearbyInteractable.name}`;
    } else {
      interactionPrompt.style.display = 'none';
    }
  }

  // =========================================================================
  // 10. RENDERING ENGINE (2D CANVAS & DESTINATION-IN LIGHTING MASK)
  // =========================================================================
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Camera offset: Center viewport on local player
    const cameraX = canvas.width / 2 - localPos.x;
    const cameraY = canvas.height / 2 - localPos.y;

    ctx.save();
    ctx.translate(cameraX, cameraY);

    // 1. Draw Ground Terrain & Cobblestones
    drawEnvironment();

    // 2. Draw Dead Bodies
    drawDeadBodies();

    // 3. Draw Players (Local + Remote)
    drawPlayers();

    // 4. Draw Roofs & Overhead details
    drawRoofs();

    ctx.restore();

    // 5. Apply Day/Night Dynamic Radial Lighting Mask
    if (gameState === 'PLAYING') {
      applyDayNightLighting(cameraX, cameraY);
    }
  }

  function drawEnvironment() {
    // Village Grass Base
    ctx.fillStyle = '#1e3a1e';
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Cobblestone Pathways connecting square to houses
    ctx.fillStyle = '#475569';
    // Center to North
    ctx.fillRect(760, 310, 80, 290);
    // Center to South
    ctx.fillRect(760, 600, 80, 280);
    // Center to West
    ctx.fillRect(340, 560, 460, 80);
    // Center to East
    ctx.fillRect(800, 560, 450, 80);

    // Central Town Square Cobblestone Circle
    ctx.beginPath();
    ctx.arc(800, 600, 130, 0, Math.PI * 2);
    ctx.fillStyle = '#334155';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#64748b';
    ctx.stroke();

    // Central Campfire
    ctx.beginPath();
    ctx.arc(CAMPFIRE.x, CAMPFIRE.y, CAMPFIRE.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#78350f';
    ctx.fill();

    // Campfire animated flames
    const flameSize = 14 + Math.sin(Date.now() * 0.01) * 3;
    const flameGrad = ctx.createRadialGradient(800, 600, 2, 800, 600, flameSize);
    flameGrad.addColorStop(0, '#fef08a');
    flameGrad.addColorStop(0.5, '#f97316');
    flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.beginPath();
    ctx.arc(800, 600, flameSize, 0, Math.PI * 2);
    ctx.fillStyle = flameGrad;
    ctx.fill();

    // Emergency Bell Pillar
    ctx.fillStyle = '#b45309';
    ctx.fillRect(792, 545, 16, 16);
    ctx.beginPath();
    ctx.arc(800, 545, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();

    // 4 Houses: Interior Floor & Solid Walls
    for (const b of BUILDINGS) {
      // Floor
      ctx.fillStyle = b.floorColor;
      ctx.fillRect(b.x, b.y, b.w, b.h);

      // Walls
      ctx.lineWidth = 8;
      ctx.strokeStyle = b.wallColor;
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      // Open Doorway
      ctx.fillStyle = '#475569';
      ctx.fillRect(b.door.x, b.door.y, b.door.w, b.door.h);

      // Maintenance Task Station Marker
      ctx.beginPath();
      ctx.arc(b.taskX, b.taskY, 14, 0, Math.PI * 2);
      ctx.fillStyle = localCompletedTasks.includes(b.taskId) ? '#10b981' : '#3b82f6';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tool Icon on Task Station
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚙️', b.taskX, b.taskY + 4);
    }

    // Outer Perimeter Wooden Fence & Forest Trees
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 10;
    ctx.strokeRect(60, 60, MAP_WIDTH - 120, MAP_HEIGHT - 120);

    // Decorative Boundary Trees
    for (let x = 30; x < MAP_WIDTH; x += 60) {
      drawTree(x, 30);
      drawTree(x, MAP_HEIGHT - 30);
    }
    for (let y = 30; y < MAP_HEIGHT; y += 60) {
      drawTree(30, y);
      drawTree(MAP_WIDTH - 30, y);
    }
  }

  function drawTree(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#064e3b';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - 4, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#047857';
    ctx.fill();
  }

  function drawRoofs() {
    // Subtle roof shadow borders over house tops
    for (const b of BUILDINGS) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(b.x - 6, b.y - 6, b.w + 12, 16);
    }
  }

  function drawDeadBodies() {
    for (const body of deadBodies) {
      ctx.save();
      ctx.translate(body.x, body.y);

      // Blood pool
      ctx.beginPath();
      ctx.ellipse(0, 4, 22, 14, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(185, 28, 28, 0.8)';
      ctx.fill();

      // Fallen suit body (lying down)
      ctx.fillStyle = body.color || '#ef4444';
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 10, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();

      // Bone / Backpack
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-4, -6, 8, 4);

      // Victim Nameplate
      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`☠️ ${body.victimName}`, 0, -16);

      ctx.restore();
    }
  }

  function drawPlayers() {
    // Render Remote Players
    for (const pid in remotePlayers) {
      if (pid === myPlayerId) continue;
      const p = remotePlayers[pid];
      if (p.isAlive) {
        drawCharacter(p.x, p.y, p.color, p.name, p.facing, p.isMoving, false);
      }
    }

    // Render Local Player
    const myData = remotePlayers[myPlayerId] || { name: 'You', color: '#ef4444' };
    if (isAlive) {
      drawCharacter(localPos.x, localPos.y, myData.color, myData.name, facing, isMoving, true);
    } else {
      // Ghost Mode for eliminated player
      ctx.globalAlpha = 0.5;
      drawCharacter(localPos.x, localPos.y, myData.color, `${myData.name} (GHOST)`, facing, isMoving, true);
      ctx.globalAlpha = 1.0;
    }
  }

  function drawCharacter(x, y, color, name, faceDir, moving, isLocal) {
    ctx.save();
    ctx.translate(x, y);

    const bob = moving ? Math.sin(walkBobTimer) * 2.5 : 0;

    // Drop shadow
    ctx.beginPath();
    ctx.ellipse(0, 14, 14, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    // Body Capsule
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, bob - 2, PLAYER_RADIUS - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();

    // Backpack
    ctx.fillStyle = '#0f172a';
    const backpackOffset = faceDir === 'right' ? -12 : 6;
    ctx.fillRect(backpackOffset, bob - 6, 6, 12);

    // Visor / Face
    ctx.fillStyle = '#67e8f9';
    const visorOffset = faceDir === 'right' ? 3 : -11;
    ctx.beginPath();
    ctx.ellipse(visorOffset, bob - 4, 7, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0891b2';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Overhead Nameplate in World Space
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';

    const textWidth = ctx.measureText(name).width;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(-textWidth / 2 - 6, -34, textWidth + 12, 16);

    ctx.fillStyle = isLocal ? '#fef08a' : '#ffffff';
    ctx.fillText(name, 0, -22);

    ctx.restore();
  }

  // =========================================================================
  // 11. DAY/NIGHT LIGHTING SYSTEM (GLOBALCOMPOSITOPERATION DESTINATION-IN)
  // =========================================================================
  function applyDayNightLighting(cameraX, cameraY) {
    if (currentPhase === 'DAY') {
      return; // Clear ambient daylight, no fog of war
    }

    // Determine ambient darkness alpha
    let ambientDarkness = 0.98;
    if (currentPhase === 'DUSK') {
      // Lerp from 0 to 0.98 over 5 seconds
      const progress = 1 - (phaseTimer / 5);
      ambientDarkness = Math.min(0.98, Math.max(0, progress * 0.98));
    }

    // Clear offscreen mask canvas
    maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

    // 1. Fill mask with solid darkness
    maskCtx.fillStyle = `rgba(5, 7, 15, ${ambientDarkness})`;
    maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

    // 2. Punch light holes using 'destination-out'
    maskCtx.globalCompositeOperation = 'destination-out';

    // A. Player Torchlight
    const playerScreenX = localPos.x + cameraX;
    const playerScreenY = localPos.y + cameraY;
    const radius = (myRole === 'WEREWOLF') ? WEREWOLF_LIGHT_RADIUS : VILLAGER_LIGHT_RADIUS;

    const playerTorchGrad = maskCtx.createRadialGradient(
      playerScreenX, playerScreenY, 20,
      playerScreenX, playerScreenY, radius
    );
    playerTorchGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    playerTorchGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.8)');
    playerTorchGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    maskCtx.beginPath();
    maskCtx.arc(playerScreenX, playerScreenY, radius, 0, Math.PI * 2);
    maskCtx.fillStyle = playerTorchGrad;
    maskCtx.fill();

    // B. Central Campfire Glow in Town Square
    const fireScreenX = CAMPFIRE.x + cameraX;
    const fireScreenY = CAMPFIRE.y + cameraY;
    const fireGrad = maskCtx.createRadialGradient(
      fireScreenX, fireScreenY, 15,
      fireScreenX, fireScreenY, CAMPFIRE_LIGHT_RADIUS
    );
    fireGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    fireGrad.addColorStop(0.8, 'rgba(0, 0, 0, 0.6)');
    fireGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    maskCtx.beginPath();
    maskCtx.arc(fireScreenX, fireScreenY, CAMPFIRE_LIGHT_RADIUS, 0, Math.PI * 2);
    maskCtx.fillStyle = fireGrad;
    maskCtx.fill();

    // Reset composite operation on mask
    maskCtx.globalCompositeOperation = 'source-over';

    // 3. Composite the darkness mask directly onto the main game canvas
    ctx.drawImage(maskCanvas, 0, 0);

    // If Werewolf, render a sinister subtle red rim around their vision
    if (myRole === 'WEREWOLF' && currentPhase === 'NIGHT') {
      ctx.save();
      const wolfRim = ctx.createRadialGradient(
        playerScreenX, playerScreenY, radius * 0.85,
        playerScreenX, playerScreenY, radius
      );
      wolfRim.addColorStop(0, 'rgba(239, 68, 68, 0)');
      wolfRim.addColorStop(1, 'rgba(239, 68, 68, 0.25)');
      ctx.fillStyle = wolfRim;
      ctx.beginPath();
      ctx.arc(playerScreenX, playerScreenY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // =========================================================================
  // 12. UI HELPERS & VOTING GRID POPULATION
  // =========================================================================
  function updateLobbyUI() {
    lobbyPlayerList.innerHTML = '';
    const players = Object.values(remotePlayers);
    lobbyPlayerCount.textContent = `Players: ${players.length}/10`;

    players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'lobby-player-card';
      card.innerHTML = `
        <div class="player-color-dot" style="background-color: ${p.color};"></div>
        <span>${p.name}</span>
        ${p.isHost ? '<span class="crown-icon">👑</span>' : ''}
      `;
      lobbyPlayerList.appendChild(card);
    });

    if (isHost) {
      btnStartMatch.disabled = players.length < 3;
      btnStartMatch.innerHTML = players.length >= 3
        ? '<span class="icon">⚔️</span> START MATCH'
        : `<span class="icon">⚔️</span> START MATCH (${players.length}/3 Players)`;
    }
  }

  function updateTaskHUD() {
    taskCountText.textContent = `${tasksCompleted} / ${tasksTotal} Completed`;
    const pct = tasksTotal > 0 ? (tasksCompleted / tasksTotal) * 100 : 0;
    taskBarFill.style.width = `${pct}%`;
  }

  function updatePhaseClockHUD() {
    const min = Math.floor(phaseTimer / 60);
    const sec = Math.floor(phaseTimer % 60);
    const timeStr = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    phaseTimerEl.textContent = timeStr;

    if (currentPhase === 'DAY') {
      phaseIcon.textContent = '☀️';
      phaseLabel.textContent = 'DAY PHASE';
    } else if (currentPhase === 'DUSK') {
      phaseIcon.textContent = '🌆';
      phaseLabel.textContent = 'DUSK (WARNING)';
    } else if (currentPhase === 'NIGHT') {
      phaseIcon.textContent = '🌙';
      phaseLabel.textContent = 'NIGHT PHASE';
    }
  }

  function renderVotingGrid() {
    const grid = document.getElementById('voting-grid');
    grid.innerHTML = '';

    for (const pid in remotePlayers) {
      const p = remotePlayers[pid];
      const card = document.createElement('div');
      card.className = `vote-card ${!p.isAlive ? 'dead' : ''}`;

      card.innerHTML = `
        <div class="vote-card-info">
          <div class="player-color-dot" style="background-color: ${p.color};"></div>
          <div>
            <div class="vote-name">${p.name} ${pid === myPlayerId ? '(You)' : ''}</div>
            <div class="voted-badge" id="vote-check-${pid}"></div>
          </div>
        </div>
        ${(p.isAlive && isAlive && pid !== myPlayerId)
          ? `<button class="btn-vote" data-id="${pid}">VOTE</button>`
          : ''}
      `;

      grid.appendChild(card);
    }

    // Attach vote click handlers
    grid.querySelectorAll('.btn-vote').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (hasVotedInMeeting) return;
        hasVotedInMeeting = true;
        const targetId = e.target.getAttribute('data-id');
        socket.emit('cast_vote', { targetId });
        showToast('Vote cast!');
      });
    });
  }

  // =========================================================================
  // 13. MAIN GAME LOOP (TICK & RENDER)
  // =========================================================================
  let lastTime = performance.now();
  let networkSyncTimer = 0;

  function gameLoop(now) {
    const dt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;

    // 1. Move Player
    moveLocalPlayer(dt);

    // 2. Evaluate Proximity Actions
    updateProximityAndActions(dt);

    // 3. Send Network Position Updates to Server at 20Hz (every 50ms)
    networkSyncTimer += dt;
    if (networkSyncTimer >= 0.05 && (gameState === 'PLAYING' || gameState === 'LOBBY')) {
      networkSyncTimer = 0;
      socket.emit('player_move', {
        x: localPos.x,
        y: localPos.y,
        vx: localVelocity.x,
        vy: localVelocity.y,
        facing,
        isMoving
      });
    }

    // 4. Render Canvas Scene
    render();

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);

})();
