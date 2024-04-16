const LEVEL_WIDTH = 40;
const LEVEL_HEIGHT = 20;

let GAME_SPEED = 3

let peer_id = '';
let peer;
let online_game;
let isHost = false;
let isSpectator = false;

const PLATEAU_WIDTH = 10;
const PLATEAU_Y = 5;
const SUMMONER_HEIGHT = 3;
const SUMMONER_WIDTH = 2;
const SUMMONER_MAX_MANA = 10;
const PLAYER_COLOR = 'blue';
const PLAYER_X = 4;
const PLAYER_Y = PLATEAU_Y - 1;
const OPPONENT_COLOR = 'red';
const OPPONENT_X = LEVEL_WIDTH - 1 - PLAYER_X - 1;
const OPPONENT_Y = PLATEAU_Y - 1;

const GROUND_Y = LEVEL_HEIGHT - 1;
const PLAYER_PORTAL_X = PLAYER_X;
const PLAYER_PORTAL_Y = GROUND_Y - 1;
const OPPONENT_PORTAL_X = OPPONENT_X + SUMMONER_WIDTH - 1;
const OPPONENT_PORTAL_Y = GROUND_Y - 1;

const CELL_MAP = {
  EMPTY: '\u00A0',
  WALL: '#',
  PLAYER: '@',
  PORTAL: 'O',
  SUMMON: 'S',
};

const SUMMONS_MAP = {
  LIGHT: {
    type: 'LIGHT',
    x: 1,
    y: GROUND_Y - 1,
    height: 1,
    width: 2,
    speed: 2,
    health: 2,
    attack: 1,
    char: 'L',
    team: '',
    mana_cost: 1,
  },
  MEDIUM: {
    type: 'MEDIUM',
    x: 1,
    y: GROUND_Y - 1,
    height: 3,
    width: 1,
    speed: 1,
    health: 3,
    attack: 2,
    char: 'M',
    team: '',
    mana_cost: 2,
  },
  HEAVY: {
    type: 'HEAVY',
    x: 1,
    y: GROUND_Y - 1,
    height: 3,
    width: 2,
    speed: 1,
    health: 5,
    attack: 1,
    char: 'H',
    team: '',
    mana_cost: 3,
  }
};

if (window.location.hostname.includes('localhost')) {
  const socket = new WebSocket(`ws://${window.location.hostname}:3000/ws`);
} else {
  const socket = new WebSocket(`wss://${window.location.hostname}/ws`);
}
socket.onopen = () => {
  console.log('Connected to server');
  if (!peer_id) {
    getPeerId().then(id => {
      peer_id = id;
      socket.send(JSON.stringify({ type: 'join_lobby', data: peer_id }));
    });
  } else {
    socket.send(JSON.stringify({ type: 'join_lobby', data: peer_id }));
  }
};

socket.onclose = () => {
  console.log('Disconnected from server');
};


(() => {
  console.log('magic-mayhem.js loaded');
  
  const gameEl = document.getElementById('game');
  const gameSpeedEl = document.getElementById('game-speed');
  const gameOverEl = document.getElementById('game-over');
  gameSpeedEl.textContent = GAME_SPEED.toString();
  let level = createLevel(gameEl);
  let gamePaused = false;
  let gameOver = false;
  let drawCounter = 0;
  let didAnythingMove = false;
  
  let summons = [];
  let playerSpawningSummon = '';
  let opponentSpawningSummon = '';
  let playerMana = SUMMONER_MAX_MANA;
  let opponentMana = SUMMONER_MAX_MANA;
  
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const gamesEl = document.getElementById('games')
    switch (msg.type) {
      case 'broadcast': {
        console.log('Broadcast', msg);
        if (online_game) return;
        if (Array.isArray(msg.data)) {
          gamesEl.innerHTML = '';
          let gameNumber = 1;
          for (const game of msg.data) {
            console.log('game', game);
            if (game.opponentPeerId === peer_id) {
              online_game = game;
              break;
            }
  
            if (game.hostPeerId === peer_id && game.opponentPeerId) {
              if (isHost && online_game) {
                break;
              }
              isHost = true;
              online_game = game;
              break;
            }
  
            if (game.hostPeerId === peer_id) {
              const button = document.createElement('button');
              button.textContent = `Waiting for opponent ${gameNumber}`;
              gamesEl.appendChild(button);
              gameNumber++;
              continue;
            }
  
            const button = document.createElement('button');
            button.textContent = `Join game ${gameNumber}`;
            button.onclick = async () => {
              console.log('Joining game', gameNumber);
              const id = peer_id ? peer_id : await getPeerId();
              if (!peer) {
                peer = new Peer(id, {
                  host: 'localhost',
                  port: 3000,
                  path: '/peerjs/myapp',
                });
              }
              console.log('peer', id, peer);
              socket.send(JSON.stringify({ type: 'join_game', data: { hostPeerId: game.hostPeerId, opponentPeerId: id } }));
            }
            gamesEl.appendChild(button);
            gameNumber++;
          }
        }
        break; }
      case 'game_updated': {
        console.log('Game updated');
        online_game.data = msg.data;
        drawLevel(level, online_game.data.summons, online_game.data.playerMana, online_game.data.opponentMana);
        break; }
      case 'game_deleted': {
        online_game = null;
        break; }
      case 'spawn': {
        opponentSpawningSummon = msg.data.summon;
        break; }
      default: {
        console.log('Unknown message', msg);
        break; }
    }
  };

  window.addEventListener('keydown', async (e) => {
    switch (e.key) {
      case 'j':
        if (!peer_id) peer_id = await getPeerId();
        // if (!peer) peer = createPeer();
        socket.send(JSON.stringify({ type: 'create_game', data: peer_id }));
        break;
      case ' ':
        e.preventDefault();
        if (gameOver) break;
        gamePaused = !gamePaused;
        document.getElementById('pause').classList.toggle('hidden');
        break;
      case 'r':
      case 'R':
        gameEl.innerHTML = '';
        gameOverEl.classList.add('hidden');
        drawCounter = 0;
        didAnythingMove = false;
        summons = [];
        playerMana = SUMMONER_MAX_MANA;
        opponentMana = SUMMONER_MAX_MANA;
        playerSpawningSummon = '';
        opponentSpawningSummon = '';
        level = createLevel(gameEl);
        drawLevel(level, summons);
        gamePaused = false;
        gameOver = false;
        if (online_game) {
          if (confirm('Do you want to leave the game?')) {  
            if (isHost) {
              socket.send(JSON.stringify({ type: 'delete_game', data: online_game }));
              isHost = false;
            } else {
              socket.send(JSON.stringify({ type: 'leave_game', data: online_game }));
            }
            online_game = null;
          }
        }
        break;
      case 'z':
        if (gamePaused) break;
        if (!playerSpawningSummon) {
          playerSpawningSummon = 'LIGHT';
        }
        break;
      case 'x':
        if (gamePaused) break;
        if (!playerSpawningSummon) {
          playerSpawningSummon = 'MEDIUM';
        }
        break;
      case 'c':
        if (gamePaused) break;
        if (!playerSpawningSummon) {
          playerSpawningSummon = 'HEAVY';
        }
        break;
      case '/':
        if (gamePaused) break;
        if (online_game) {
          if (!isHost) {
            socket.send(JSON.stringify({ type: 'spawn', data: { summon: 'LIGHT', hostPeerId: online_game.hostPeerId } }));
          }
          break;
        }
        if (!opponentSpawningSummon) {
          opponentSpawningSummon = 'LIGHT';
        }
        break;
      case '.':
        if (gamePaused) break;
        if (online_game) {
          if (!isHost) {
            socket.send(JSON.stringify({ type: 'spawn', data: { summon: 'MEDIUM', hostPeerId: online_game.hostPeerId } }));
          }
          break;
        }
        if (!opponentSpawningSummon) {
          opponentSpawningSummon = 'MEDIUM';
        }
        break;
      case ',':
        if (gamePaused) break;
        if (online_game) {
          if (!isHost) {
            socket.send(JSON.stringify({ type: 'spawn', data: { summon: 'HEAVY', hostPeerId: online_game.hostPeerId } }));
          }
          break;
        }
        if (!opponentSpawningSummon) {
          opponentSpawningSummon = 'HEAVY';
        }
        break;
      case '+':
        if (GAME_SPEED < 100) {
          GAME_SPEED += 1;
          gameSpeedEl.textContent = GAME_SPEED.toString();
          resetInterval();
        }
        break;
      case '-':
        if (GAME_SPEED > 1) {
          GAME_SPEED -= 1;
          gameSpeedEl.textContent = GAME_SPEED.toString();
          resetInterval();
        }
        break;
    }
  });

  
  let interval = null;
  function resetInterval() {
    clearInterval(interval);
    interval = setInterval(() => {
      if (online_game && !isHost) return;
      if (online_game) {
        if (online_game.hostPeerId === peer_id) {
          socket.send(JSON.stringify({ type: 'update_game', data: { ...online_game, data: { summons, playerMana, opponentMana } } }));
        } 
        if (online_game.opponentPeerId === peer_id){
          summons = online_game.data?.summons ? online_game.data.summons : [];
          playerMana = online_game.data?.playerMana >= 0 ? online_game.data.playerMana : SUMMONER_MAX_MANA;
          opponentMana = online_game.data?.playerMana >= 0 ? online_game.data.opponentMana : SUMMONER_MAX_MANA;
          if (summons.length) {
            drawLevel(level, summons, playerMana, opponentMana);
            return;
          }
        }
      }

      if (gamePaused) return;

      if (!online_game || isHost) {
        if (playerSpawningSummon) {
          if (playerMana >= SUMMONS_MAP[playerSpawningSummon].mana_cost && playerMana >= playerMana - SUMMONS_MAP[playerSpawningSummon].mana_cost) {
            playerMana -= SUMMONS_MAP[playerSpawningSummon].mana_cost;
            summons.push(createSummon('player', playerSpawningSummon));
          }
          playerSpawningSummon = '';
        }
        if (opponentSpawningSummon) {
          if (opponentMana >= SUMMONS_MAP[opponentSpawningSummon].mana_cost && opponentMana >= opponentMana - SUMMONS_MAP[opponentSpawningSummon].mana_cost) {
            opponentMana -= SUMMONS_MAP[opponentSpawningSummon].mana_cost;
            summons.push(createSummon('opponent', opponentSpawningSummon));
          }
          opponentSpawningSummon = '';
        }
      }

      drawLevel(level, summons, playerMana, opponentMana);

      for (const summon of summons) {
        const nextX = summon.x + summon.speed * summon.direction;

        if (!summons.some(otherSummon => otherSummon !== summon
          && isRectangleInRectangle(nextX, summon.y, summon.width, summon.height, otherSummon.x, otherSummon.y, otherSummon.width, otherSummon.height))) {
          if (nextX > 0 && nextX < LEVEL_WIDTH - summon.width) {
            summon.x = nextX;
          } else {
            summon.x = nextX <= 0 ? 1 : LEVEL_WIDTH - summon.width - 1;
            summon.direction *= -1;
          }
          didAnythingMove = true;
        } else {
          const otherSummon = summons.find(otherSummon => otherSummon !== summon && isRectangleInRectangle(nextX, summon.y, summon.width, summon.height, otherSummon.x, otherSummon.y, otherSummon.width, otherSummon.height));
          if (
            (summon.type === 'LIGHT' &&
              otherSummon.type === 'HEAVY' &&
              (summon.team === otherSummon.team ||
                summon.direction !== otherSummon.direction))
            || (summon.type === 'HEAVY' &&
              otherSummon.type === 'LIGHT' &&
              (summon.team === otherSummon.team ||
                summon.direction !== otherSummon.direction))
          ) {
            summon.x = nextX;
            didAnythingMove = true;
            continue;
          }

          if (
            summon.attack > 0 &&
            summon.team !== otherSummon.team &&
            summon.health > 0 &&
            otherSummon.health > 0
          ) {
            otherSummon.health -= summon.attack;
            if (otherSummon.health <= 0) {
              summons = summons.filter(s => s !== otherSummon);
            }
            didAnythingMove = true;
          }
        }
      }

      if (!didAnythingMove) {
        drawCounter++;
      } else {
        drawCounter = 0;
      }

      if (drawCounter > 10 && !(playerMana || opponentMana)) {
        gamePaused = true;
        gameOver = true;
        gameOverEl.innerHTML = 'Draw!!\r\nPress R to restart the game.';
        gameOverEl.classList.remove('hidden');
        drawLevel(level, summons, playerMana, opponentMana);
      }

      didAnythingMove = false;

      if (!summons.some(summon => summon.team === 'player') && !playerMana) {
        gamePaused = true;
        gameOver = true;
        gameOverEl.innerHTML = `<span style="color:${OPPONENT_COLOR};">${OPPONENT_COLOR.toUpperCase()}</span> Won!!\r\nPress R to restart the game.`;
        gameOverEl.classList.remove('hidden');
        drawLevel(level, summons, playerMana, opponentMana);
      }

      if (!summons.some(summon => summon.team === 'opponent') && !opponentMana) {
        gamePaused = true;
        gameOver = true;
        gameOverEl.innerHTML = `<span style="color:${PLAYER_COLOR};">${PLAYER_COLOR.toUpperCase()}</span> Won!!\r\nPress R to restart the game.`;
        gameOverEl.classList.remove('hidden');
        drawLevel(level, summons, playerMana, opponentMana);
      }
    }, 1000 / GAME_SPEED);
  }
  resetInterval();
})();

async function getPeerId() {
  return await fetch('http://localhost:3000/peerjs/myapp/peerjs/id').then(res => res.body.getReader().read()).then(({ value, done }) => {
    return new TextDecoder().decode(value);
  });
}

function createPeer() {
  if (peer) return peer;
  const newPeer = new Peer(peer_id, {
    host: 'localhost',
    port: 3000,
    path: '/peerjs/myapp',
  });

  newPeer.on('connection', conn => {
    conn.on('data', data => {
      console.log('Received Peer ', data);
    });
  });

  return newPeer;
}

function createSummon(team, summon) {
  if (!(team === 'player' || team === 'opponent')) {
    throw new Error('Invalid team');
  }

  return {
    ...SUMMONS_MAP[summon],
    x: team === 'player' ? PLAYER_PORTAL_X : OPPONENT_PORTAL_X,
    direction: team === 'player' ? 1 : -1,
    color: team === 'player' ? PLAYER_COLOR : OPPONENT_COLOR,
    team
  }
}

function createLevel(gameEl) {
  return new Array(LEVEL_HEIGHT).fill(null).map((_, i) => {
    if (i > 0) gameEl.appendChild(document.createElement('br'));
    return new Array(LEVEL_WIDTH).fill(null).map(() => {
      const cell = document.createElement('span');
      cell.classList.add('cell');
      cell.textContent = CELL_MAP.EMPTY;
      gameEl.appendChild(cell);
      return cell;
    })
  });
}

function isPointInRectangle(x, y, targetX, targetY, targetWidth, targetHeight) {
  return x >= targetX && x < targetX + targetWidth && y <= targetY && y > targetY - targetHeight;
}

function isRectangleInRectangle(x, y, width, height, targetX, targetY, targetWidth, targetHeight) {
  return isPointInRectangle(x, y, targetX, targetY, targetWidth, targetHeight) ||
    isPointInRectangle(x + width - 1, y, targetX, targetY, targetWidth, targetHeight) ||
    isPointInRectangle(x, y - height, targetX, targetY, targetWidth, targetHeight) ||
    isPointInRectangle(x + width - 1, y - height, targetX, targetY, targetWidth, targetHeight);
}

function drawLevel(level, summons, playerMana, opponentMana) {
  for (let y = 0; y < LEVEL_HEIGHT; y++) {
    for (let x = 0; x < LEVEL_WIDTH; x++) {
      const cell = level[y][x];
      const isBorder = x === 0 || x === LEVEL_WIDTH - 1 || y === 0 || y === LEVEL_HEIGHT - 1;
      const isPlateau = (x > 0 && (x < PLATEAU_WIDTH || x > LEVEL_WIDTH - 1 - PLATEAU_WIDTH) && x < LEVEL_WIDTH - 1) && y === PLATEAU_Y;
      const isPlayer = isPointInRectangle(x, y, PLAYER_X, PLAYER_Y, SUMMONER_WIDTH, SUMMONER_HEIGHT);
      const isOpponent = isPointInRectangle(x, y, OPPONENT_X, OPPONENT_Y, SUMMONER_WIDTH, SUMMONER_HEIGHT);
      const isPlayerPortal = x === PLAYER_PORTAL_X && y === PLAYER_PORTAL_Y;
      const isOpponentPortal = x === OPPONENT_PORTAL_X && y === OPPONENT_PORTAL_Y;
      const isPlayerManaBar = playerMana && (x === 1 || x <= playerMana) && y === 1;
      const isOpponentManaBar = opponentMana && (x === LEVEL_WIDTH - 2 || x >= LEVEL_WIDTH - 1 - opponentMana) && y === 1;
      const isSummon = summons.some(summon => isPointInRectangle(x, y, summon.x, summon.y, summon.width, summon.height));

      switch (true) {
        case (isBorder || isPlateau):
          cell.classList.add('wall');
          if (cell.textContent !== CELL_MAP.WALL) {
            cell.textContent = CELL_MAP.WALL;
          }
          break;
        case (isPlayerManaBar):
          cell.textContent = '*';
          cell.style.color = PLAYER_COLOR;
          break;
        case (isOpponentManaBar):
          cell.textContent = '*';
          cell.style.color = OPPONENT_COLOR;
          break;
        case (isPlayer || isOpponent):
          if (cell.textContent !== CELL_MAP.PLAYER) {
            cell.textContent = CELL_MAP.PLAYER;
            cell.style.color = isPlayer ? PLAYER_COLOR : OPPONENT_COLOR;
            if (isOpponent) {
              cell.classList.add('reversed');
            }
          }
          break;
        case (isSummon):
          const summon = summons.find(summon => isPointInRectangle(x, y, summon.x, summon.y, summon.width, summon.height));
          if (summon.direction === -1) {
            cell.classList.add('reversed');
          } else {
            cell.classList.remove('reversed');
          }
          cell.textContent = summon.char;
          cell.style.color = summon.color;
          break;
        case (isPlayerPortal || isOpponentPortal):
          if (cell.textContent !== CELL_MAP.PORTAL) {
            cell.textContent = CELL_MAP.PORTAL;
            cell.style.color = isPlayerPortal ? PLAYER_COLOR : OPPONENT_COLOR;
          }
          break;
        default:
          if (cell.textContent !== CELL_MAP.EMPTY) {
            cell.textContent = CELL_MAP.EMPTY;
          }
          break;
      }
    }
  }
}