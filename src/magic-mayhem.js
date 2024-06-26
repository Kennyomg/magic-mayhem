import { EventManager } from "./EventManager";
import { Elements } from "./Elements";

const LEVEL_WIDTH = 40;
const LEVEL_HEIGHT = 20;
let WINDOW_AVAILABLE_HEIGHT;
let BUTTON_AREA_WIDTH;
let GAME_SCREEN_HEIGHT;
let GAME_SCREEN_WIDTH;



// Detect whether device supports orientationchange event, otherwise fall back to
// the resize event.
let supportsOrientationChange = "onorientationchange" in window && "screen" in window;
let orientationEvent = supportsOrientationChange ? ["orientationchange", "resize"] : "resize";

let screenOrientationType = screen?.orientation?.type || "landscape-primary";
let screenOrientationAngle = screen?.orientation?.angle || 0;

function setGameDimensions() {
  Elements.applyOn('game', (gameEl) => {
    WINDOW_AVAILABLE_HEIGHT = (supportsOrientationChange ? screen.height : window.innerHeight) - gameEl.offsetTop;
    GAME_SCREEN_HEIGHT = WINDOW_AVAILABLE_HEIGHT - 50;
    GAME_SCREEN_WIDTH = 25 / 18 * GAME_SCREEN_HEIGHT;

    BUTTON_AREA_WIDTH = Math.max(75, Math.min(100, (supportsOrientationChange ? screen.width : window.innerWidth) - GAME_SCREEN_WIDTH - 20));

    if (GAME_SCREEN_WIDTH > window.innerWidth) {
      GAME_SCREEN_WIDTH = window.innerWidth - 20;
      GAME_SCREEN_HEIGHT = 18 / 25 * GAME_SCREEN_WIDTH;
    }

    gameEl.style.width = px(GAME_SCREEN_WIDTH);
    gameEl.style.height = px(GAME_SCREEN_HEIGHT);
    Elements.applyOn(['pause', 'game-over'], (el) => {
      el.style.top = px(GAME_SCREEN_HEIGHT / 2 + gameEl.offsetTop);
    });

    if (gameEl.children.length) {
      for (const cell of gameEl.getElementsByClassName('cell')) {
        cell.style.width = px(GAME_SCREEN_WIDTH / LEVEL_WIDTH);
        cell.style.height = px(GAME_SCREEN_HEIGHT / LEVEL_HEIGHT);
        cell.style.fontSize = px(GAME_SCREEN_HEIGHT / LEVEL_HEIGHT);
      }
    }
  });
}

setGameDimensions();
EventManager.on(orientationEvent, () => {
  if (supportsOrientationChange && screenOrientationType !== screen.orientation.type) {
    screenOrientationType = screen.orientation.type;
    screenOrientationAngle = screen.orientation.angle;
  }
  setGameDimensions();
}, window);

// TODO put this in a game context object and game State Machine
let GAME_SPEED = 3
let peer_id = '';
let peer;
let online_game;
let isHost = false;
let isSpectator = false;

class Sprite {
  static INLINE_SPRITES = {
    './light.txt': `;=,^<`,
    './medium.txt': `()
||/
/${'\\'}`,
    './heavy.txt': `      /_
<()> /\_
/  \\/
 ||
/  \\`,
    './wizard.txt': `  x
 / \\ * *
 | | /*
 / \\/
 | |`
  };
  constructor(text, ignoreFrontWidth = 0) {
    this.text = text;
    this.ignoreFrontWidth = ignoreFrontWidth;
  }
  static async fromFile(filePath, ignoreFrontWidth = 0) {
    try {
      return new this(Sprite.INLINE_SPRITES[filePath] || await fetch(filePath).then(res => res.text()), ignoreFrontWidth);
    } catch (err) {
      console.error(err);
      throw new Error('Cannot load sprite from file');
    }
  }
  get lines() { return this.text.split('\n').filter(Boolean); }
  get width() { return Math.max(...this.lines.map(line => line.length)); }
  get collisionWidth() { return this.width - this.ignoreFrontWidth; }
  get height() { return this.lines.length; }
  getCharAt(x, y, flipped) {
    if (x < 0 || x > this.width || y < 0 || y > this.height) {
      console.error(`Cannot get sprite char at x: ${x} and y: ${y}`);
      return false;
    }
    if (flipped) {
      return this.lines[y][this.width - 1 - x];
    }
    return this.lines[y][x];
  }
}

/** @type {Sprite} */
let SUMMONER_SPRITE;

const PLATEAU_WIDTH = 10;
const PLATEAU_Y = 8;
const SUMMONER_MAX_MANA = 10;
const PLAYER_COLOR = 'blue';
const PLAYER_X = 4;
const PLAYER_Y = PLATEAU_Y - 1;
const OPPONENT_COLOR = 'red';
let OPPONENT_X;
const OPPONENT_Y = PLATEAU_Y - 1;

const GROUND_Y = LEVEL_HEIGHT - 1;
const PLAYER_PORTAL_X = PLAYER_X;
const PLAYER_PORTAL_Y = GROUND_Y - 1;
let OPPONENT_PORTAL_X;
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
    _x: 1,
    get x() { return this._x; },
    y: GROUND_Y - 1,
    sprite: undefined,
    speed: 2,
    health: 2,
    attack: 1,
    team: '',
    mana_cost: 1,
  },
  MEDIUM: {
    type: 'MEDIUM',
    x: 1,
    y: GROUND_Y - 1,
    sprite: undefined,
    speed: 1,
    health: 3,
    attack: 2,
    team: '',
    mana_cost: 2,
  },
  HEAVY: {
    type: 'HEAVY',
    x: 1,
    y: GROUND_Y - 1,
    sprite: undefined,
    speed: 1,
    health: 5,
    attack: 1,
    team: '',
    mana_cost: 3,
  }
};

class Summon {
  constructor({type, x, y, direction, sprite, color, speed, health, attack, team, mana_cost}) {
    this.type = type;
    this._x = x;
    this.y = y;
    this.direction = direction;
    this.sprite = sprite;
    this.speed = speed;
    this.health = health;
    this.attack = attack;
    this.team = team;
    this.color = color;
    this.mana_cost = mana_cost;
  }

  get x() { 
    return this.direction > 0 ? this._x : this._x + this.sprite.ignoreFrontWidth;
  }

  get width() {
    return this.sprite.collisionWidth;
  }

  set x(value) {
    this._x = value;
  }

}

Elements.applyOn('summons', (el) => {
  el.innerHTML = 'type, manacost, health, attack, speed<br/>';
  el.innerHTML += Object.values(SUMMONS_MAP).map(summon => {
    return `${summon.type}, ${summon.mana_cost}, ${summon.health}, ${summon.attack}, ${summon.speed}`;
  }).join('<br/>');
});

// TODO move socketry into a separate module
let socket;
if (window.location.hostname.includes('localhost') || window.location.protocol === 'http:') {
  socket = new WebSocket(`ws://${window.location.host}/ws`);
} else {
  socket = new WebSocket(`wss://${window.location.host}/ws`);
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


(async () => {
  console.log('magic-mayhem.js loaded');

  Elements.applyOn('game-speed', (el) => {
    el.textContent = GAME_SPEED.toString();
  });

  // TODO Wrangle globals
  let level = createLevel(Elements.findId('game'));
  let gamePaused = false;
  let manualPause = false;
  let gameOver = false;
  let drawCounter = 0;
  let didAnythingMove = false;

  let summons = [];
  let playerSpawningSummon = '';
  let opponentSpawningSummon = '';
  let playerMana = SUMMONER_MAX_MANA;
  let opponentMana = SUMMONER_MAX_MANA;

  try {
    SUMMONER_SPRITE = await Sprite.fromFile('./wizard.txt');
    OPPONENT_X = LEVEL_WIDTH - PLAYER_X - SUMMONER_SPRITE.width;
    OPPONENT_PORTAL_X = OPPONENT_X + SUMMONER_SPRITE.width - 1;

    SUMMONS_MAP.LIGHT.sprite = await Sprite.fromFile('./light.txt');
    SUMMONS_MAP.MEDIUM.sprite = await Sprite.fromFile('./medium.txt');
    SUMMONS_MAP.HEAVY.sprite = await Sprite.fromFile('./heavy.txt', 4);

    console.log(SUMMONS_MAP);
  } catch (err) {
    console.error(err)
  }

  function restartGame({event}) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
    const gameEl = Elements.findId('game');

    gameEl.innerHTML = '';
    Elements.applyOn('game-over', (el) => {
      el.classList.add('hidden');
    });
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
  }
  EventManager.on('restartGame', restartGame);

  function togglePause({ forcePause = -1 }) {
    gamePaused = forcePause < 0 ? !gamePaused : forcePause;
    if (manualPause) gamePaused = true;
    Elements.applyOn('pause', (el) => {
      el.classList.toggle('hidden', !gamePaused);
    })
  }
  EventManager.on('togglePause', togglePause);


  function configureButton(who, button) {
    function handleSummon({event}) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (gamePaused || gameOver || isSpectator || (online_game && !isHost)) return;
      if (!playerSpawningSummon && who === 'player') {
        playerSpawningSummon = button.dataset.summon;
      }
      if (!opponentSpawningSummon && who === 'opponent') {
        if (online_game && isHost) return;
        opponentSpawningSummon = button.dataset.summon;
      }
    }
    console.log({ who, button });
    EventManager.on(['click', 'touchend'], handleSummon, button);
  }

  let touchMoved = false;
  function handleGameTap({ event }) {
    if (touchMoved) return touchMoved = false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (gameOver) {
      EventManager.emit('restartGame');
      return;
    }
    EventManager.emit('togglePause');
  }

  const els = Elements.findId(['game', 'pause', 'game-over']);
  EventManager.on(['click', 'touchend'], handleGameTap, els);
  EventManager.on('touchstart', () => touchMoved = false, els);
  EventManager.on('touchmove', () => touchMoved = true, els);

  Elements.applyOn(['player-buttons', 'opponent-buttons'], (el, id) => {
    const target = id === 'player-buttons' ? 'player' : 'opponent';
    el.width = BUTTON_AREA_WIDTH;
    for (const button of el.getElementsByClassName('summon-button')) {
      console.log({ target, button, el, id })
      configureButton(target, button);
    }
    EventManager.on('scroll', ({ isGameInView }) => {
      el.classList.toggle('hidden', !isGameInView());
    }, window);
  });

  EventManager.on('scroll', ({ isGameInView }) =>
    EventManager.emit('togglePause', { forcePause: !isGameInView() })
    , window);

  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const gamesEl = Elements.findId('games');
    switch (msg.type) {
      case 'broadcast': {
        console.log('Broadcast', msg);
        if (online_game || !gamesEl) return;
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
                  host: window.location.hostname,
                  port: window.location.port,
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
        break;
      }
      case 'game_updated': {
        console.log('Game updated');
        online_game.data = msg.data;
        drawLevel(level, online_game.data.summons, online_game.data.playerMana, online_game.data.opponentMana);
        break;
      }
      case 'game_deleted': {
        online_game = null;
        break;
      }
      case 'spawn': {
        opponentSpawningSummon = msg.data.summon;
        break;
      }
      default: {
        console.log('Unknown message', msg);
        break;
      }
    }
  };

  EventManager.on('keydown', async ({event: e}) => {
    switch (e.key) {
      case 'j':
        if (!peer_id) peer_id = await getPeerId();
        // if (!peer) peer = createPeer();
        socket.send(JSON.stringify({ type: 'create_game', data: peer_id }));
        break;
      case ' ':
        e.preventDefault();
        if (gameOver) break;
        manualPause = !gamePaused;
        EventManager.emit('togglePause', { forcePause: manualPause });
        break;
      case 'r':
      case 'R':
        EventManager.emit('restartGame');
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
          Elements.applyOn('game-speed', (el) => {
            el.textContent = GAME_SPEED.toString();
          });
          EventManager.emit('resetInterval');
        }
        break;
      case '-':
        if (GAME_SPEED > 1) {
          GAME_SPEED -= 1;
          Elements.applyOn('game-speed', (el) => {
            el.textContent = GAME_SPEED.toString();
          });
          EventManager.emit('resetInterval');
        }
        break;
    }
  }, window);


  let interval = null;
  function resetInterval() {
    clearInterval(interval);
    interval = setInterval(() => {
      if (online_game && !isHost) return;
      if (online_game) {
        if (online_game.hostPeerId === peer_id) {
          socket.send(JSON.stringify({ type: 'update_game', data: { ...online_game, data: { summons, playerMana, opponentMana } } }));
        }
        if (online_game.opponentPeerId === peer_id) {
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
        if (
          playerSpawningSummon &&
          !summons.some(summon => summon.team === 'player' && isRectangleInRectangle(PLAYER_PORTAL_X, PLAYER_PORTAL_Y, SUMMONS_MAP[playerSpawningSummon]?.sprite.collisionWidth, 1, summon.x, summon.y, summon.width, summon.sprite.height))
        ) {
          if (playerMana >= SUMMONS_MAP[playerSpawningSummon].mana_cost && playerMana >= playerMana - SUMMONS_MAP[playerSpawningSummon].mana_cost) {
            playerMana -= SUMMONS_MAP[playerSpawningSummon].mana_cost;
            summons.push(createSummon('player', playerSpawningSummon));
          }
          playerSpawningSummon = '';
        }
        if (
          opponentSpawningSummon &&
          !summons.some(summon => summon.team === 'opponent' && isRectangleInRectangle(OPPONENT_PORTAL_X - SUMMONS_MAP[opponentSpawningSummon]?.sprite?.collisionWidth, OPPONENT_PORTAL_Y, OPPONENT_PORTAL_X, 1, summon.x, summon.y, summon.width, summon.sprite.height))
        ) {
          if (opponentMana >= SUMMONS_MAP[opponentSpawningSummon].mana_cost && opponentMana >= opponentMana - SUMMONS_MAP[opponentSpawningSummon].mana_cost) {
            opponentMana -= SUMMONS_MAP[opponentSpawningSummon].mana_cost;
            summons.push(createSummon('opponent', opponentSpawningSummon));
          }
          opponentSpawningSummon = '';
        }
      }

      drawLevel(level, summons, playerMana, opponentMana);

      for (const summon of summons) {
        const nextX = summon._x + (summon.speed * summon.direction);

        const otherSummon = summons.find(otherSummon => willSummonsCollide(nextX, summon, otherSummon));
        if (!otherSummon) {
            if (nextX > (summon.direction > 0 ? 0 : 0 - summon.sprite.ignoreFrontWidth) && nextX < LEVEL_WIDTH - summon.width) {
              summon.x = nextX;
            } else {
              summon.x = nextX <= 0 ? 1 : (LEVEL_WIDTH - summon.width - 1 - summon.sprite.ignoreFrontWidth);
              summon.direction *= -1;
            }
            didAnythingMove = true;
        } else {
          if (
            ((summon && otherSummon) && summon?.type && otherSummon?.type && summon?.type === 'LIGHT' &&
              otherSummon?.type === 'HEAVY' &&
              (summon?.team === otherSummon.team ||
                summon?.direction !== otherSummon?.direction))
            || (summon?.type === 'HEAVY' &&
              otherSummon?.type === 'LIGHT' &&
              (summon?.team === otherSummon?.team ||
                summon?.direction !== otherSummon?.direction))
          ) {
            summon.x = nextX;
            didAnythingMove = true;
            continue;
          }

          if (
            (summon && otherSummon) &&
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
        Elements.applyOn('game-over', (el) => {
          el.innerHTML = 'Draw!!\r\nPress R or Tap here.';
          el.classList.remove('hidden');
        });
        drawLevel(level, summons, playerMana, opponentMana);
      }

      didAnythingMove = false;

      if (!summons.some(summon => summon.team === 'player') && !playerMana) {
        gamePaused = true;
        gameOver = true;
        Elements.applyOn('game-over', (el) => {
          el.innerHTML = `<span style="color:${OPPONENT_COLOR};">${OPPONENT_COLOR.toUpperCase()}</span> Won!!\r\nPress R or Tap here.`;
          el.classList.remove('hidden');
        });
        drawLevel(level, summons, playerMana, opponentMana);
      }

      if (!summons.some(summon => summon.team === 'opponent') && !opponentMana) {
        gamePaused = true;
        gameOver = true;
        Elements.applyOn('game-over', (el) => {
          el.innerHTML = `<span style="color:${PLAYER_COLOR};">${PLAYER_COLOR.toUpperCase()}</span> Won!!\r\nPress R or Tap here.`;
          el.classList.remove('hidden');
        });
        drawLevel(level, summons, playerMana, opponentMana);
      }
    }, 1000 / GAME_SPEED);
  }
  EventManager.on('resetInterval', resetInterval);
  EventManager.emit('resetInterval');

})();

function willSummonsCollide(nextX, summon1, summon2) {
  return (summon1 !== summon2 && 
    isRectangleInRectangle(summon1.direction > 0 ? nextX : nextX + summon1.sprite.ignoreFrontWidth, summon1.y, summon1.width, summon1.sprite.height, 
                      summon2.direction > 0 ? summon2._x : summon2._x + summon2.sprite.ignoreFrontWidth, summon2.y, summon2.width, summon2.sprite.height));
}


function px(value) {
  return `${value}px`;
}

async function getPeerId() {
  return await fetch(`${window.location.protocol}//${window.location.host}/peerjs/myapp/peerjs/id`).then(res => res.body.getReader().read()).then(({ value, done }) => {
    return new TextDecoder().decode(value);
  });
}

function createPeer() {
  if (peer) return peer;
  const newPeer = new Peer(peer_id, {
    host: window.location.hostname,
    port: window.location.port,
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

  return new Summon({
    ...SUMMONS_MAP[summon],
    x: team === 'player' ? PLAYER_PORTAL_X : OPPONENT_PORTAL_X - SUMMONS_MAP[summon].sprite.width + 1,
    direction: team === 'player' ? 1 : -1,
    color: team === 'player' ? PLAYER_COLOR : OPPONENT_COLOR,
    team
  });
}

function createLevel(gameEl) {
  return new Array(LEVEL_HEIGHT).fill(null).map((_, i) => {
    if (i > 0) gameEl.appendChild(document.createElement('br'));
    return new Array(LEVEL_WIDTH).fill(null).map(() => {
      const cell = document.createElement('span');
      cell.classList.add('cell');
      cell.style.width = px(GAME_SCREEN_WIDTH / LEVEL_WIDTH);
      cell.style.height = px(GAME_SCREEN_HEIGHT / LEVEL_HEIGHT);
      cell.style.fontSize = px(GAME_SCREEN_HEIGHT / LEVEL_HEIGHT);
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
  summons.sort((a, b) => {
    return a.type === b.type ? 0 :
      a.type === 'HEAVY' && b.type !== 'HEAVY' ? -1 :
        a.type === 'MEDIUM' && b.type === 'LIGHT' ? -1 :
          a.type === 'LIGHT' && b.type !== 'LIGHT' ? 1 : 1
  });

  for (let y = 0; y < LEVEL_HEIGHT; y++) {
    for (let x = 0; x < LEVEL_WIDTH; x++) {
      const cell = level[y][x];
      const isBorder = x === 0 || x === LEVEL_WIDTH - 1 || y === 0 || y === LEVEL_HEIGHT - 1;
      const isPlateau = (x > 0 && (x < PLATEAU_WIDTH || x > LEVEL_WIDTH - 1 - PLATEAU_WIDTH) && x < LEVEL_WIDTH - 1) && y === PLATEAU_Y;
      const isPlayer = isPointInRectangle(x, y, PLAYER_X, PLAYER_Y, SUMMONER_SPRITE.width, SUMMONER_SPRITE.height);
      const isOpponent = isPointInRectangle(x, y, OPPONENT_X, OPPONENT_Y, SUMMONER_SPRITE.width, SUMMONER_SPRITE.height);
      const isPlayerPortal = x === PLAYER_PORTAL_X && y === PLAYER_PORTAL_Y;
      const isOpponentPortal = x === OPPONENT_PORTAL_X && y === OPPONENT_PORTAL_Y;
      const isPlayerManaBar = playerMana && (x === 1 || x <= playerMana) && y === 1;
      const isOpponentManaBar = opponentMana && (x === LEVEL_WIDTH - 2 || x >= LEVEL_WIDTH - 1 - opponentMana) && y === 1;
      const isSummon = summons.some(summon => isPointInRectangle(x, y, summon._x, summon.y, summon.sprite.width, summon.sprite.height));


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
        case (isPlayer || isOpponent): {
          let char;
          if (char = SUMMONER_SPRITE.getCharAt(
            x - (isPlayer ? PLAYER_X : OPPONENT_X),
            y - (isPlayer ? PLAYER_Y : OPPONENT_Y) + SUMMONER_SPRITE.height - 1, isOpponent)
          ) {
            if (cell.textContent !== char) {
              cell.textContent = char;
              cell.style.color = isPlayer ? PLAYER_COLOR : OPPONENT_COLOR;
              if (isOpponent) {
                cell.classList.add('reversed');
              }
            }
          }
          break;
        }
        case (isSummon): {
          const foundSummons = summons.filter(summon => isPointInRectangle(x, y, summon._x, summon.y, summon.sprite.width, summon.sprite.height));
          // let drewOnEmpty = false;
          foundSummons.forEach(summon => {
            const isFacingLeft = summon.direction === -1;
            const char = summon.sprite.getCharAt(x - summon._x, y - summon.y + summon.sprite.height - 1, isFacingLeft);
            // if (!cell.textContent && char) {
            cell.classList.toggle('reversed', isFacingLeft);
            cell.textContent = char;
            cell.style.color = summon.color;
            // }
          });
          break;
        }
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