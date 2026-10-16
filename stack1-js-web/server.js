const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Distinct color palette for players
const PLAYER_COLORS = [
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#10b981', // Green
  '#f59e0b', // Amber/Yellow
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#84cc16', // Lime
  '#6366f1'  // Indigo
];

// Room storage
// rooms[code] = { code, hostId, state, phase, phaseTimer, players: {}, deadBodies: [], tasksTotal: 4, tasksCompleted: 0, votes: {}, meetingTimer: 0, lastCaller: null, exiledPlayer: null }
const rooms = {};

// Helper: Generate unique 4-digit numeric code
function generateRoomCode() {
  let code;
  let attempts = 0;
  do {
    code = ('0000' + Math.floor(Math.random() * 10000)).slice(-4);
    attempts++;
    if (attempts > 9999) break;
  } while (rooms[code]);
  return code;
}

// Helper: Get local network IPs for LAN play
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Spawn positions in Lobby (around town square)
function getLobbySpawnPosition(index) {
  const angle = (index * (Math.PI * 2)) / 8;
  const radius = 90;
  return {
    x: 800 + Math.cos(angle) * radius,
    y: 600 + Math.sin(angle) * radius
  };
}

// Check Win Conditions
function checkWinConditions(room) {
  if (room.state !== 'PLAYING') return false;

  const players = Object.values(room.players);
  const alivePlayers = players.filter(p => p.isAlive);
  const aliveWerewolves = alivePlayers.filter(p => p.role === 'WEREWOLF');
  const aliveVillagers = alivePlayers.filter(p => p.role === 'VILLAGER');

  // Condition 1: All werewolves eliminated
  if (aliveWerewolves.length === 0) {
    endGame(room, 'VILLAGERS', 'The Village has eliminated the Werewolf! Peace is restored.');
    return true;
  }

  // Condition 2: Werewolves equal or outnumber Villagers
  if (aliveWerewolves.length >= aliveVillagers.length) {
    endGame(room, 'WEREWOLF', 'The Shapeshifter has overrun the isolated village! The Werewolf wins.');
    return true;
  }

  // Condition 3: All village maintenance tasks completed
  if (room.tasksCompleted >= room.tasksTotal && room.tasksTotal > 0) {
    endGame(room, 'VILLAGERS', 'All Village maintenance tasks completed! The village survives.');
    return true;
  }

  return false;
}

function endGame(room, winner, reason) {
  room.state = 'GAME_OVER';
  io.to(room.code).emit('game_over', {
    winner,
    reason,
    players: room.players
  });
}

// Conclude meeting and tally votes
function tallyVotes(room) {
  const tally = {};
  let maxVotes = 0;
  let exiledTargetId = null;
  let isTie = false;

  for (const voterId in room.votes) {
    const target = room.votes[voterId];
    tally[target] = (tally[target] || 0) + 1;
  }

  for (const target in tally) {
    if (target === 'SKIP') continue;
    if (tally[target] > maxVotes) {
      maxVotes = tally[target];
      exiledTargetId = target;
      isTie = false;
    } else if (tally[target] === maxVotes && maxVotes > 0) {
      isTie = true;
    }
  }

  const skipVotes = tally['SKIP'] || 0;
  let exileResult = {
    exiledName: null,
    exiledRole: null,
    tie: false,
    skipped: false,
    werewolvesRemaining: 0
  };

  if (skipVotes >= maxVotes || isTie || !exiledTargetId || maxVotes === 0) {
    exileResult.skipped = true;
    exileResult.tie = isTie;
  } else {
    const victim = room.players[exiledTargetId];
    if (victim && victim.isAlive) {
      victim.isAlive = false;
      exileResult.exiledName = victim.name;
      exileResult.exiledRole = victim.role;
    }
  }

  // Count remaining werewolves
  const aliveWerewolves = Object.values(room.players).filter(p => p.isAlive && p.role === 'WEREWOLF').length;
  exileResult.werewolvesRemaining = aliveWerewolves;

  room.state = 'EXILE_REVEAL';
  room.exileTimer = 6; // 6 seconds dramatic reveal
  io.to(room.code).emit('meeting_result', exileResult);

  // Check if someone won right after exile
  setTimeout(() => {
    if (checkWinConditions(room)) return;

    // Resume to Day
    room.state = 'PLAYING';
    room.phase = 'DAY';
    room.phaseTimer = 45;
    room.deadBodies = []; // Clean up reported bodies after meeting
    io.to(room.code).emit('phase_change', {
      phase: room.phase,
      phaseTimer: room.phaseTimer,
      deadBodies: room.deadBodies
    });
  }, 6000);
}

// Authoritative Room Tick (1 Hz for clock and 20 Hz for position sync)
setInterval(() => {
  for (const code in rooms) {
    const room = rooms[code];

    // Decrement kill cooldowns for players
    for (const pid in room.players) {
      const p = room.players[pid];
      if (p.killCooldown > 0) {
        p.killCooldown = Math.max(0, p.killCooldown - 0.05);
      }
    }

    // Handle Active Gameplay Day/Night Cycle
    if (room.state === 'PLAYING') {
      room.phaseTimer -= 0.05;
      if (room.phaseTimer <= 0) {
        if (room.phase === 'DAY') {
          room.phase = 'DUSK';
          room.phaseTimer = 5; // 5s transition
        } else if (room.phase === 'DUSK') {
          room.phase = 'NIGHT';
          room.phaseTimer = 45; // 45s night
        } else if (room.phase === 'NIGHT') {
          room.phase = 'DAY';
          room.phaseTimer = 45; // 45s day
        }
        io.to(room.code).emit('phase_change', {
          phase: room.phase,
          phaseTimer: Math.ceil(room.phaseTimer),
          deadBodies: room.deadBodies
        });
      }
    }

    // Handle Meeting Timer
    if (room.state === 'MEETING') {
      room.meetingTimer -= 0.05;
      if (room.meetingTimer <= 0) {
        tallyVotes(room);
      }
    }
  }
}, 50);

// Broadcast player states at 20Hz
setInterval(() => {
  for (const code in rooms) {
    const room = rooms[code];
    if (room.state === 'PLAYING' || room.state === 'LOBBY') {
      io.to(room.code).emit('players_sync', {
        players: room.players,
        tasksCompleted: room.tasksCompleted,
        tasksTotal: room.tasksTotal,
        phase: room.phase,
        phaseTimer: Math.ceil(room.phaseTimer)
      });
    }
  }
}, 50);

// Socket.io connection handling
io.on('connection', (socket) => {
  let currentRoom = null;

  // 1. Host Game
  socket.on('host_game', ({ playerName }) => {
    const cleanName = (playerName || 'Player').trim().substring(0, 14);
    const roomCode = generateRoomCode();

    const room = {
      code: roomCode,
      hostId: socket.id,
      state: 'LOBBY',
      phase: 'DAY',
      phaseTimer: 45,
      tasksTotal: 8, // 2 tasks per house (4 houses)
      tasksCompleted: 0,
      players: {},
      deadBodies: [],
      votes: {},
      meetingTimer: 0,
      lastCaller: null
    };

    const player = {
      id: socket.id,
      name: cleanName,
      color: PLAYER_COLORS[0],
      colorIndex: 0,
      isHost: true,
      isAlive: true,
      role: 'VILLAGER',
      x: 800,
      y: 600,
      vx: 0,
      vy: 0,
      facing: 'right',
      isMoving: false,
      completedTasks: [],
      killCooldown: 0
    };

    room.players[socket.id] = player;
    rooms[roomCode] = room;
    currentRoom = roomCode;

    socket.join(roomCode);
    socket.emit('game_hosted', {
      roomCode,
      player,
      players: room.players
    });

    console.log(`[HOST] Room ${roomCode} created by "${cleanName}" (${socket.id})`);
  });

  // 2. Join Game
  socket.on('join_game', ({ playerName, roomCode }) => {
    const cleanName = (playerName || 'Player').trim().substring(0, 14);
    const code = (roomCode || '').trim();
    const room = rooms[code];

    if (!room) {
      socket.emit('error_message', 'Room not found. Check the 4-digit code.');
      return;
    }

    if (room.state !== 'LOBBY') {
      socket.emit('error_message', 'Game is already in progress in this room.');
      return;
    }

    const playerCount = Object.keys(room.players).length;
    if (playerCount >= PLAYER_COLORS.length) {
      socket.emit('error_message', 'Room is currently full (max 10 players).');
      return;
    }

    const colorIndex = playerCount % PLAYER_COLORS.length;
    const spawn = getLobbySpawnPosition(playerCount);

    const player = {
      id: socket.id,
      name: cleanName,
      color: PLAYER_COLORS[colorIndex],
      colorIndex,
      isHost: false,
      isAlive: true,
      role: 'VILLAGER',
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: 'right',
      isMoving: false,
      completedTasks: [],
      killCooldown: 0
    };

    room.players[socket.id] = player;
    currentRoom = code;

    socket.join(code);
    socket.emit('game_joined', {
      roomCode: code,
      player,
      players: room.players
    });

    // Notify other players in the room
    socket.to(code).emit('player_joined', { player, players: room.players });
    console.log(`[JOIN] "${cleanName}" (${socket.id}) joined Room ${code}`);
  });

  // 3. Start Match (Host only)
  socket.on('start_match', ({ forceStart } = {}) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];

    if (room.hostId !== socket.id) {
      socket.emit('error_message', 'Only the Host can start the match.');
      return;
    }

    const playerList = Object.values(room.players);
    // Allow start if >= 3 players OR if host clicked Dev Force Start for solo testing
    if (playerList.length < 3 && !forceStart) {
      socket.emit('error_message', 'At least 3 players are required to start (or use Force Start for Dev testing).');
      return;
    }

    // Assign Roles: Exactly 1 Werewolf / Shapeshifter, rest Villagers
    const werewolfIndex = Math.floor(Math.random() * playerList.length);
    playerList.forEach((p, idx) => {
      p.role = (idx === werewolfIndex) ? 'WEREWOLF' : 'VILLAGER';
      p.isAlive = true;
      p.completedTasks = [];
      p.killCooldown = 10; // 10s initial grace period
      // Spawn players around the central campfire in a circle
      const angle = (idx * (Math.PI * 2)) / playerList.length;
      p.x = 800 + Math.cos(angle) * 120;
      p.y = 600 + Math.sin(angle) * 120;
    });

    room.state = 'PLAYING';
    room.phase = 'DAY';
    room.phaseTimer = 45;
    room.tasksCompleted = 0;
    room.tasksTotal = playerList.length * 2; // 2 tasks per player
    room.deadBodies = [];
    room.votes = {};

    // Send personalized role reveal to each player
    playerList.forEach((p) => {
      io.to(p.id).emit('match_started', {
        role: p.role,
        x: p.x,
        y: p.y,
        phase: room.phase,
        phaseTimer: room.phaseTimer,
        tasksTotal: room.tasksTotal,
        tasksCompleted: room.tasksCompleted,
        players: room.players
      });
    });

    console.log(`[MATCH START] Room ${room.code} started! Werewolf is: ${playerList[werewolfIndex].name}`);
  });

  // 4. Movement Updates from Clients
  socket.on('player_move', ({ x, y, vx, vy, facing, isMoving }) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.players[socket.id];
    if (!player || !player.isAlive) return;

    // Bounds clamp (map is 1600 x 1200)
    player.x = Math.max(50, Math.min(1550, x));
    player.y = Math.max(50, Math.min(1150, y));
    player.vx = vx;
    player.vy = vy;
    player.facing = facing || player.facing;
    player.isMoving = isMoving;
  });

  // 5. Action: Werewolf Kill (Night Phase Only)
  socket.on('player_kill', ({ targetId }) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const killer = room.players[socket.id];
    const victim = room.players[targetId];

    if (!killer || !killer.isAlive || killer.role !== 'WEREWOLF') {
      return socket.emit('action_failed', 'You are not the Werewolf.');
    }

    if (room.phase !== 'NIGHT') {
      return socket.emit('action_failed', 'The Shapeshifter can only strike in the pitch-black Night!');
    }

    if (killer.killCooldown > 0) {
      return socket.emit('action_failed', `Kill cooldown active: ${Math.ceil(killer.killCooldown)}s`);
    }

    if (!victim || !victim.isAlive || victim.role === 'WEREWOLF') {
      return socket.emit('action_failed', 'Invalid target.');
    }

    // Distance check (<= 75 units)
    const dist = Math.hypot(killer.x - victim.x, killer.y - victim.y);
    if (dist > 75) {
      return socket.emit('action_failed', 'Target is too far away to strike.');
    }

    // Execute kill!
    victim.isAlive = false;
    killer.killCooldown = 15; // 15s cooldown

    // Drop dead body at victim location
    const body = {
      id: `body_${Date.now()}_${victim.id}`,
      victimId: victim.id,
      victimName: victim.name,
      color: victim.color,
      x: victim.x,
      y: victim.y
    };
    room.deadBodies.push(body);

    io.to(room.code).emit('player_killed', {
      victimId: victim.id,
      killerId: killer.id,
      deadBody: body,
      deadBodies: room.deadBodies
    });

    console.log(`[KILL] ${killer.name} eliminated ${victim.name} in Room ${room.code}`);

    // Check if werewolf won immediately
    checkWinConditions(room);
  });

  // 6. Action: Report Dead Body or Emergency Bell at Campfire
  socket.on('player_report', ({ source, bodyId }) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const reporter = room.players[socket.id];

    if (!reporter || !reporter.isAlive || room.state !== 'PLAYING') return;

    if (source === 'EMERGENCY_BELL') {
      // Must be near central campfire (800, 600)
      const dist = Math.hypot(reporter.x - 800, reporter.y - 600);
      if (dist > 90) {
        return socket.emit('action_failed', 'Too far from Town Square Emergency Bell.');
      }
      room.lastCaller = `${reporter.name} rang the Town Square Emergency Bell!`;
    } else if (source === 'DEAD_BODY') {
      // Find dead body near reporter
      const nearbyBody = room.deadBodies.find(b => Math.hypot(reporter.x - b.x, reporter.y - b.y) <= 85);
      if (!nearbyBody) {
        return socket.emit('action_failed', 'No body nearby to report.');
      }
      room.lastCaller = `${reporter.name} discovered the remains of ${nearbyBody.victimName}!`;
    }

    // Trigger Town Hall Meeting
    room.state = 'MEETING';
    room.meetingTimer = 30; // 30 seconds for debate & voting
    room.votes = {};

    io.to(room.code).emit('meeting_started', {
      callerName: reporter.name,
      reason: room.lastCaller,
      meetingTimer: room.meetingTimer,
      players: room.players
    });

    console.log(`[MEETING] ${room.lastCaller} in Room ${room.code}`);
  });

  // 7. Action: Cast Vote in Meeting
  socket.on('cast_vote', ({ targetId }) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const voter = room.players[socket.id];

    if (!voter || !voter.isAlive || room.state !== 'MEETING') return;

    room.votes[socket.id] = targetId; // targetId can be socket ID or 'SKIP'

    io.to(room.code).emit('vote_recorded', {
      voterId: socket.id,
      totalVotes: Object.keys(room.votes).length,
      aliveCount: Object.values(room.players).filter(p => p.isAlive).length
    });

    // Check if all alive players have voted
    const alivePlayers = Object.values(room.players).filter(p => p.isAlive);
    if (Object.keys(room.votes).length >= alivePlayers.length) {
      tallyVotes(room);
    }
  });

  // 8. Action: Complete Village Maintenance Task
  socket.on('task_completed', ({ taskId }) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.players[socket.id];

    if (!player || !player.isAlive || room.state !== 'PLAYING') return;

    if (!player.completedTasks.includes(taskId)) {
      player.completedTasks.push(taskId);
      room.tasksCompleted++;

      io.to(room.code).emit('task_progress', {
        tasksCompleted: room.tasksCompleted,
        tasksTotal: room.tasksTotal,
        playerId: player.id
      });

      console.log(`[TASK] ${player.name} finished ${taskId}. Progress: ${room.tasksCompleted}/${room.tasksTotal}`);

      // Check win condition
      checkWinConditions(room);
    }
  });

  // 9. Return to Lobby after match
  socket.on('return_to_lobby', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    if (room.hostId !== socket.id) return;

    room.state = 'LOBBY';
    room.deadBodies = [];
    room.votes = {};
    const playerList = Object.values(room.players);
    playerList.forEach((p, idx) => {
      p.isAlive = true;
      p.role = 'VILLAGER';
      p.completedTasks = [];
      p.killCooldown = 0;
      const spawn = getLobbySpawnPosition(idx);
      p.x = spawn.x;
      p.y = spawn.y;
    });

    io.to(room.code).emit('returned_to_lobby', { players: room.players });
  });

  // 10. Disconnection
  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      const room = rooms[currentRoom];
      const departingPlayer = room.players[socket.id];
      delete room.players[socket.id];
      delete room.votes[socket.id];

      const remainingPlayers = Object.values(room.players);
      console.log(`[LEAVE] Socket ${socket.id} left Room ${currentRoom}`);

      if (remainingPlayers.length === 0) {
        delete rooms[currentRoom];
        console.log(`[CLEANUP] Room ${currentRoom} removed (empty)`);
      } else {
        // If host disconnected, reassign host to next player
        if (room.hostId === socket.id) {
          room.hostId = remainingPlayers[0].id;
          remainingPlayers[0].isHost = true;
        }

        io.to(currentRoom).emit('player_left', {
          playerId: socket.id,
          playerName: departingPlayer ? departingPlayer.name : 'Unknown',
          newHostId: room.hostId,
          players: room.players
        });

        // Check if remaining players trigger win/loss
        checkWinConditions(room);
      }
    }
  });
});

// Start Server on 0.0.0.0 for Local LAN & Cloud Compatibility
server.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalIpAddresses();
  console.log('====================================================');
  console.log(`  AMONG US: ISOLATED VILLAGE - WEB NODE.JS SERVER   `);
  console.log('====================================================');
  console.log(`> Server running locally at:  http://localhost:${PORT}`);
  if (localIPs.length > 0) {
    console.log(`> LAN Play URLs for friends & mobile devices:`);
    localIPs.forEach(ip => {
      console.log(`   * http://${ip}:${PORT}`);
    });
  }
  console.log(`> Cloud Ready: PORT=${PORT} on 0.0.0.0`);
  console.log('====================================================');
});
