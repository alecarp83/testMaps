"use strict";

(() => {
  const $ = selector => document.querySelector(selector);
  const canvas = $("#world");
  const ctx = canvas.getContext("2d", { alpha: false });
  const audio = window.EclipseAudio;

  const ui = {
    overlay: $("#overlay"),
    title: $("#overlayTitle"),
    text: $("#overlayText"),
    start: $("#startButton"),
    sector: $("#sector"),
    objective: $("#objective"),
    health: $("#health"),
    healthText: $("#healthText"),
    battery: $("#battery"),
    batteryText: $("#batteryText"),
    stamina: $("#stamina"),
    stance: $("#stance"),
    hint: $("#hint"),
    message: $("#message"),
    damage: $("#damage"),
    vignette: $("#vignette")
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const normalizeAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

  let settings = { volume: .55, sensitivity: .0025 };
  try {
    const stored = JSON.parse(localStorage.getItem("eclipse.settings"));
    if (stored && typeof stored === "object") {
      settings = { ...settings, ...stored };
    }
  } catch {}

  settings.volume = clamp(Number(settings.volume) || 0, 0, 1);
  settings.sensitivity = clamp(
    Number(settings.sensitivity) || .0025, .001, .006
  );

  // Datos del capítulo. 0 = suelo, 1 = pared, 2 = obstáculo.
  const chapter = {
    width: 29,
    height: 13,
    sectors: ["Pasillo A", "Comedor", "Enfermería", "Bahía de escape"],
    start: { x: 2.5, y: 6.5, angle: 0 },
    doors: [
      { x: 7, y: 6, open: false, locked: false },
      { x: 14, y: 6, open: false, locked: false },
      { x: 21, y: 6, open: false, locked: true }
    ],
    items: [
      { x: 4.5, y: 4.5, type: "battery", taken: false },
      { x: 10.5, y: 3.5, type: "log", taken: false },
      { x: 12.5, y: 9.5, type: "battery", taken: false },
      { x: 17.5, y: 9.5, type: "medkit", taken: false },
      { x: 19.5, y: 3.5, type: "fuse", taken: false },
      { x: 23.5, y: 9.5, type: "battery", taken: false },
      { x: 26.5, y: 6.5, type: "exit", taken: false }
    ],
    enemySpawns: [
      { x: 11.5, y: 8.5 },
      { x: 18.5, y: 7.5 },
      { x: 24.5, y: 3.5 }
    ]
  };

  const grid = Array.from({ length: chapter.height }, (_, y) =>
    Array.from({ length: chapter.width }, (_, x) =>
      y < 2 || y > 10 || x % 7 === 0 ? 1 : 0
    )
  );

  for (const door of chapter.doors) grid[door.y][door.x] = 0;

  // Mesas, bancos y camillas: también participan en las colisiones.
  for (const [x, y] of [
    [3, 3], [3, 9],
    [10, 5], [11, 5], [10, 7], [11, 7],
    [16, 4], [16, 5], [18, 9],
    [24, 8], [25, 8]
  ]) {
    grid[y][x] = 2;
  }

  const player = {
    ...chapter.start,
    health: 100,
    battery: 100,
    stamina: 100,
    flashlight: true,
    crouch: false,
    running: false,
    exhausted: false,
    moving: false,
    fuse: false,
    noise: 0
  };

  const enemies = chapter.enemySpawns.map((spawn, index) => ({
    ...spawn,
    home: { ...spawn },
    target: { ...spawn },
    angle: index * 2,
    memory: 0,
    attackCooldown: 0,
    wanderTimer: index + 1,
    phase: index * 1.7
  }));

  const keys = new Set();
  const FOV = Math.PI / 3;
  const MAX_DISTANCE = 17;
  const FLASH_RANGE = 10;

  let width = 640;
  let height = 360;
  let projection = 550;
  let depthBuffer = new Float32Array(width);
  let mode = "intro";
  let time = 0;
  let lastFrame = 0;
  let messageUntil = 0;
  let hitFlash = 0;
  let endingTime = 0;
  let sectorIndex = -1;
  let walkingPhase = 0;
  let horizon = height / 2;

  function resize() {
    // Resolución interna limitada: reduce el coste del raycasting.
    width = Math.min(800, Math.max(320, Math.floor(innerWidth * .6)));
    height = Math.max(180, Math.round(width * innerHeight / innerWidth));
    canvas.width = width;
    canvas.height = height;
    projection = width / (2 * Math.tan(FOV / 2));
    depthBuffer = new Float32Array(width);
  }

  addEventListener("resize", resize);
  resize();

  function doorAt(x, y) {
    return chapter.doors.find(door => door.x === x && door.y === y);
  }

  function tileAt(x, y) {
    if (x < 0 || y < 0 || x >= chapter.width || y >= chapter.height) {
      return 1;
    }
    const door = doorAt(x, y);
    if (door && !door.open) return 3;
    return grid[y][x];
  }

  function canOccupy(x, y, radius = .2) {
    const minX = Math.floor(x - radius);
    const maxX = Math.floor(x + radius);
    const minY = Math.floor(y - radius);
    const maxY = Math.floor(y + radius);

    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (!tileAt(cx, cy)) continue;
        const nearX = clamp(x, cx, cx + 1);
        const nearY = clamp(y, cy, cy + 1);
        if (Math.hypot(x - nearX, y - nearY) < radius) return false;
      }
    }
    return true;
  }

  function moveEntity(entity, dx, dy, radius = .2) {
    // Separar ejes permite deslizarse junto a las paredes.
    if (canOccupy(entity.x + dx, entity.y, radius)) entity.x += dx;
    if (canOccupy(entity.x, entity.y + dy, radius)) entity.y += dy;
  }

  // Raycasting DDA: avanza de celda en celda.
  function castRay(angle, limit = MAX_DISTANCE) {
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);

    const deltaX = Math.abs(1 / (dirX || 1e-9));
    const deltaY = Math.abs(1 / (dirY || 1e-9));
    const stepX = dirX < 0 ? -1 : 1;
    const stepY = dirY < 0 ? -1 : 1;

    let sideX = (dirX < 0
      ? player.x - mapX
      : mapX + 1 - player.x) * deltaX;

    let sideY = (dirY < 0
      ? player.y - mapY
      : mapY + 1 - player.y) * deltaY;

    let side = 0;
    let length = 0;
    let tile = 0;

    for (let i = 0; i < 100; i++) {
      if (sideX < sideY) {
        length = sideX;
        sideX += deltaX;
        mapX += stepX;
        side = 0;
      } else {
        length = sideY;
        sideY += deltaY;
        mapY += stepY;
        side = 1;
      }

      tile = tileAt(mapX, mapY);
      if (tile || length >= limit) break;
    }

    const hitPosition = side === 0
      ? player.y + dirY * length
      : player.x + dirX * length;

    return {
      distance: Math.min(length, limit),
      tile,
      side,
      texture: hitPosition - Math.floor(hitPosition),
      mapX,
      mapY
    };
  }

  function clearSight(a, b) {
    const d = distance(a, b);
    const steps = Math.max(1, Math.ceil(d / .08));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (tileAt(Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }

  // Búsqueda de ruta sencilla para que los enemigos rodeen muebles.
  function nextWaypoint(enemy, target) {
    const sx = Math.floor(enemy.x);
    const sy = Math.floor(enemy.y);
    const tx = Math.floor(target.x);
    const ty = Math.floor(target.y);

    if (sx === tx && sy === ty) return target;

    const start = sy * chapter.width + sx;
    const goal = ty * chapter.width + tx;
    const parents = new Int32Array(chapter.width * chapter.height);
    parents.fill(-1);
    parents[start] = start;

    const queue = [start];
    let head = 0;

    while (head < queue.length) {
      const cell = queue[head++];
      if (cell === goal) break;

      const x = cell % chapter.width;
      const y = Math.floor(cell / chapter.width);

      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (tileAt(nx, ny)) continue;

        const next = ny * chapter.width + nx;
        if (parents[next] !== -1) continue;
        parents[next] = cell;
        queue.push(next);
      }
    }

    if (parents[goal] === -1) return null;

    let cell = goal;
    while (parents[cell] !== start) {
      cell = parents[cell];
    }

    return {
      x: cell % chapter.width + .5,
      y: Math.floor(cell / chapter.width) + .5
    };
  }

  function say(text, duration = 4) {
    ui.message.textContent = text;
    messageUntil = time + duration;
  }

  function tryPointerLock() {
    try {
      const result = canvas.requestPointerLock?.();
      if (result && result.catch) result.catch(() => {});
    } catch {}
  }

  function resume() {
    mode = "playing";
    keys.clear();
    ui.overlay.hidden = true;
    audio.init(settings.volume);
    audio.resume();
    tryPointerLock();
  }

  function pause() {
    if (mode !== "playing") return;
    mode = "paused";
    keys.clear();
    audio.pause();
    ui.title.textContent = "Señal suspendida";
    ui.text.textContent =
      "La partida está pausada. El peligro esperará hasta que continúes.";
    ui.start.textContent = "Continuar";
    ui.overlay.hidden = false;
    document.exitPointerLock?.();
  }

  function finish(dead) {
    mode = dead ? "dead" : "complete";
    keys.clear();
    audio.pause();
    document.exitPointerLock?.();

    ui.title.textContent = dead ? "Señal perdida" : "Fin del Capítulo 1";
    ui.text.textContent = dead
      ? "Tu traje ha dejado de transmitir. Evita correr cerca de los " +
        "infectados y apaga la linterna para romper la persecución."
      : "La compuerta cede. Al otro lado, las cápsulas siguen intactas.\n\n" +
        "Entonces escuchas tu nombre desde un corredor vacío.\n\n" +
        "Algo ha aprendido a hablar.\n\nContinuará...";
    ui.start.textContent = dead ? "Reintentar" : "Jugar de nuevo";
    ui.overlay.hidden = false;
  }

  ui.start.addEventListener("click", () => {
    if (mode === "dead" || mode === "complete") {
      location.reload();
    } else {
      resume();
    }
  });

  canvas.addEventListener("click", () => {
    if (mode === "playing") tryPointerLock();
  });

  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement && mode === "playing") pause();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });

  addEventListener("blur", pause);

  addEventListener("mousemove", event => {
    if (mode === "playing" && document.pointerLockElement === canvas) {
      player.angle = normalizeAngle(
        player.angle + event.movementX * settings.sensitivity
      );
    }
  });

  const gameKeys = new Set([
    "KeyW", "KeyA", "KeyS", "KeyD",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
    "KeyQ", "KeyR", "KeyC", "KeyF", "KeyE",
    "ShiftLeft", "ShiftRight", "Escape"
  ]);

  addEventListener("keydown", event => {
    if (gameKeys.has(event.code)) event.preventDefault();

    if (event.code === "Escape") {
      pause();
      return;
    }
    if (mode !== "playing") return;

    keys.add(event.code);
    if (event.repeat) return;

    if (event.code === "KeyC") player.crouch = !player.crouch;

    if (event.code === "KeyF") {
      if (player.battery > 0) {
        player.flashlight = !player.flashlight;
        audio.effect("switch");
      } else {
        say("La batería está agotada. Busca una celda de energía.");
      }
    }

    if (event.code === "KeyE") interact();
  });

  addEventListener("keyup", event => keys.delete(event.code));

  const itemLabels = {
    battery: "Recoger batería",
    medkit: "Usar botiquín",
    fuse: "Recoger fusible de emergencia",
    log: "Leer registro de mantenimiento",
    exit: "Abrir compuerta de escape"
  };

  function interactionTarget() {
    const candidates = [];

    for (const door of chapter.doors) {
      candidates.push({
        x: door.x + .5,
        y: door.y + .5,
        kind: "door",
        data: door
      });
    }

    for (const item of chapter.items) {
      if (!item.taken) {
        candidates.push({ ...item, kind: "item", data: item });
      }
    }

    return candidates
      .filter(target => {
        const d = distance(player, target);
        if (d > 1.65) return false;

        const angle = normalizeAngle(
          Math.atan2(target.y - player.y, target.x - player.x)
          - player.angle
        );
        if (Math.abs(angle) > .8) return false;

        // La celda de una puerta cerrada no debe bloquear su interacción.
        const visiblePoint = target.kind === "door"
          ? {
              x: target.x + (player.x - target.x) * .6 / Math.max(d, .01),
              y: target.y + (player.y - target.y) * .6 / Math.max(d, .01)
            }
          : target;

        return clearSight(player, visiblePoint);
      })
      .sort((a, b) => distance(player, a) - distance(player, b))[0];
  }

  function makeNoise(radius) {
    for (const enemy of enemies) {
      if (distance(player, enemy) < radius) {
        enemy.target = { x: player.x, y: player.y };
        enemy.memory = 5;
      }
    }
  }

  function interact() {
    const target = interactionTarget();
    if (!target) return;

    if (target.kind === "door") {
      const door = target.data;

      if (door.locked && !player.fuse) {
        say("Sin alimentación. Busca el fusible en la enfermería.");
        return;
      }

      if (door.open) {
        const center = { x: door.x + .5, y: door.y + .5 };
        if ([player, ...enemies].some(entity => distance(entity, center) < .9)) {
          say("El sensor detecta una obstrucción.");
          return;
        }
      }

      if (door.locked) {
        door.locked = false;
        say("Fusible instalado. Acceso a la bahía restaurado.");
      }

      door.open = !door.open;
      audio.effect("door");
      makeNoise(6);
      return;
    }

    const item = target.data;

    if (item.type === "battery") {
      if (player.battery >= 99) {
        say("Batería llena. Puedes dejar esta celda para después.");
        return;
      }
      player.battery = Math.min(100, player.battery + 60);
      say("Celda conectada: +60% de energía.");
    } else if (item.type === "medkit") {
      if (player.health >= 100) {
        say("No necesitas tratamiento.");
        return;
      }
      player.health = Math.min(100, player.health + 50);
      say("Sellado de heridas completado.");
    } else if (item.type === "fuse") {
      player.fuse = true;
      say("Fusible recuperado. Regresa a la compuerta de la bahía.", 5);
    } else if (item.type === "log") {
      say(
        "REGISTRO: El contenedor B-17 se abrió desde dentro. " +
        "Reaccionan al sonido y a la luz. No corras. No los ilumines.",
        9
      );
    } else if (item.type === "exit") {
      if (!player.fuse) {
        say("Falta restaurar el circuito de emergencia.");
        return;
      }

      mode = "ending";
      endingTime = 0;
      keys.clear();
      ui.hint.textContent = "";
      say("Descompresión completada. Abriendo compuerta...", 4);
      audio.effect("door");
      document.exitPointerLock?.();
      return;
    }

    item.taken = true;
    audio.effect("pickup");
  }

  function updatePlayer(dt) {
    const forward =
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown"));
    const strafe =
      Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft"));

    const turn = Number(keys.has("KeyR")) - Number(keys.has("KeyQ"));
    player.angle = normalizeAngle(player.angle + turn * dt * 1.8);

    const inputLength = Math.hypot(forward, strafe);
    const wantsRun = keys.has("ShiftLeft") || keys.has("ShiftRight");

    if (player.stamina <= 0) player.exhausted = true;
    if (player.stamina >= 30) player.exhausted = false;

    player.running = Boolean(
      wantsRun && inputLength && !player.crouch && !player.exhausted
    );

    const speed = player.crouch ? .92 : player.running ? 3.1 : 1.85;
    const oldX = player.x;
    const oldY = player.y;

    if (inputLength > 0) {
      const f = forward / inputLength;
      const s = strafe / inputLength;
      const dx = Math.cos(player.angle) * f - Math.sin(player.angle) * s;
      const dy = Math.sin(player.angle) * f + Math.cos(player.angle) * s;
      moveEntity(player, dx * speed * dt, dy * speed * dt, .21);
    }

    player.moving = Math.hypot(player.x - oldX, player.y - oldY) > .001;

    if (player.running && player.moving) {
      player.stamina = Math.max(0, player.stamina - dt * 24);
    } else {
      player.stamina = Math.min(100, player.stamina + dt * 15);
    }

    player.noise = !player.moving ? 0
      : player.crouch ? 1.1
      : player.running ? 8 : 4.2;

    if (player.flashlight) {
      player.battery = Math.max(0, player.battery - dt * .48);
      if (player.battery === 0) {
        player.flashlight = false;
        say("Batería agotada.");
      }
    }

    if (player.moving) {
      walkingPhase += dt * (player.running ? 13 : player.crouch ? 5 : 8);
    }

    const sector = clamp(Math.floor(player.x / 7), 0, 3);
    if (sector !== sectorIndex) {
      sectorIndex = sector;
      ui.sector.textContent = chapter.sectors[sector];

      const messages = [
        "La alarma continúa. Nadie responde por radio.",
        "Las bandejas siguen servidas. No mires debajo de las mesas.",
        "El fusible debe estar en el extremo norte de la enfermería.",
        "Bahía de escape. Encuentra el panel de la compuerta."
      ];
      say(messages[sector], 5);
    }
  }

  function updateEnemies(dt) {
    let nearest = 99;

    for (const enemy of enemies) {
      const d = distance(enemy, player);
      nearest = Math.min(nearest, d);
      enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);

      const sight = d < 11 && clearSight(enemy, player);
      const angleToEnemy = normalizeAngle(
        Math.atan2(enemy.y - player.y, enemy.x - player.x) - player.angle
      );

      const lit = player.flashlight &&
        d < FLASH_RANGE &&
        Math.abs(angleToEnemy) < .38 &&
        sight;

      // El ruido atraviesa particiones próximas, pero necesita una ruta.
      const heard = d < player.noise && (sight || d < player.noise * .55);
      const noticed = sight && d < (player.crouch ? 1.2 : 2.1);

      if (lit || heard || noticed) {
        enemy.memory = 5.5;
        enemy.target = { x: player.x, y: player.y };
      } else {
        enemy.memory = Math.max(0, enemy.memory - dt);
      }

      enemy.wanderTimer -= dt;
      if (enemy.memory === 0 && enemy.wanderTimer <= 0) {
        const x = enemy.home.x + (Math.random() - .5) * 4;
        const y = enemy.home.y + (Math.random() - .5) * 4;
        if (canOccupy(x, y, .23)) enemy.target = { x, y };
        enemy.wanderTimer = 2 + Math.random() * 3;
      }

      const targetDistance = distance(enemy, enemy.target);
      if (targetDistance > .18 && d > .58) {
        let waypoint = enemy.target;
        if (!clearSight(enemy, enemy.target)) {
          waypoint = nextWaypoint(enemy, enemy.target);
        }

        if (waypoint) {
          const angle = Math.atan2(
            waypoint.y - enemy.y, waypoint.x - enemy.x
          );
          const speed = enemy.memory > 0 ? 1.13 : .35;
          const erratic = Math.sin(time * 8 + enemy.phase) * .12;
          enemy.angle = angle;
          moveEntity(
            enemy,
            Math.cos(angle + erratic) * speed * dt,
            Math.sin(angle + erratic) * speed * dt,
            .22
          );
        }
      }

      if (d < .85 && sight && enemy.attackCooldown === 0) {
        player.health = Math.max(0, player.health - 26);
        enemy.attackCooldown = 1.15;
        hitFlash = 1;
        audio.effect("attack");
        say("¡Contacto! Aléjate del infectado.", 2);

        if (player.health <= 0) {
          finish(true);
          break;
        }
      }
    }

    return nearest;
  }

  function updateHUD(dt) {
    hitFlash = Math.max(0, hitFlash - dt * 1.8);

    ui.health.value = player.health;
    ui.healthText.textContent = Math.ceil(player.health);
    ui.battery.value = player.battery;
    ui.batteryText.textContent =
      `${Math.ceil(player.battery)}% ${player.flashlight ? "ON" : "OFF"}`;
    ui.stamina.value = player.stamina;
    ui.stance.textContent = player.crouch
      ? "AGACHADO" : player.running ? "CORRIENDO" : "DE PIE";

    ui.objective.textContent = player.fuse
      ? "Restaura la puerta de la bahía y activa la salida."
      : "Busca un fusible en la enfermería.";

    ui.damage.style.opacity = hitFlash;
    const stress = 1 - player.stamina / 100;
    ui.vignette.style.opacity =
      .68 + stress * (.2 + Math.sin(time * 5) * .1);

    document.body.classList.toggle("critical", player.health < 35);
    document.body.classList.toggle("crouching", player.crouch);

    if (time > messageUntil) ui.message.textContent = "";

    const target = interactionTarget();
    if (!target) {
      ui.hint.textContent = "";
    } else if (target.kind === "door") {
      ui.hint.textContent = target.data.locked
        ? "[E] Panel de energía - fusible requerido"
        : `[E] ${target.data.open ? "Cerrar" : "Abrir"} compuerta`;
    } else {
      ui.hint.textContent = `[E] ${itemLabels[target.data.type]}`;
    }
  }

  // Texturas procedurales: paneles, tuberías y manchas.
  function makeWallTexture(type) {
    const texture = document.createElement("canvas");
    texture.width = texture.height = 64;
    const c = texture.getContext("2d");

    c.fillStyle = type === 3 ? "#59636a"
      : type === 2 ? "#55534a" : "#606970";
    c.fillRect(0, 0, 64, 64);

    for (let i = 0; i < 700; i++) {
      c.fillStyle = `rgba(0,0,0,${Math.random() * .15})`;
      c.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }

    c.strokeStyle = "#222a30";
    c.lineWidth = 2;
    c.strokeRect(1, 1, 62, 62);
    c.strokeRect(5, 7, 54, 49);

    if (type === 3) {
      c.fillStyle = "#20272c";
      c.fillRect(30, 0, 4, 64);
      c.fillStyle = "#ac8b46";
      for (let x = 0; x < 64; x += 12) {
        c.fillRect(x, 7, 6, 5);
        c.fillRect(x, 52, 6, 5);
      }
      c.fillStyle = "#5d2725";
      c.fillRect(43, 25, 9, 15);
    } else if (type === 2) {
      c.fillStyle = "#939087";
      c.fillRect(4, 5, 56, 9);
      c.fillStyle = "#362327";
      c.fillRect(8, 20, 25, 13);
    } else {
      c.fillStyle = "#313d44";
      c.fillRect(8, 0, 7, 64);
      c.fillStyle = "#89949a";
      c.fillRect(9, 0, 2, 64);
      c.fillStyle = "#6e181a";
      c.beginPath();
      c.ellipse(43, 45, 12, 5, -.5, 0, Math.PI * 2);
      c.fill();
      c.fillRect(44, 45, 2, 16);
    }

    for (const x of [4, 59]) {
      for (const y of [4, 59]) {
        c.fillStyle = "#a0a5a6";
        c.fillRect(x, y, 2, 2);
      }
    }
    return texture;
  }

  const wallTextures = {
    1: makeWallTexture(1),
    2: makeWallTexture(2),
    3: makeWallTexture(3)
  };

  function makeSprite(type) {
    const sprite = document.createElement("canvas");
    sprite.width = 64;
    sprite.height = 96;
    const c = sprite.getContext("2d");

    if (type === "enemy") {
      c.fillStyle = "#333e45";
      c.beginPath();
      c.moveTo(21, 34);
      c.lineTo(44, 32);
      c.lineTo(48, 65);
      c.lineTo(20, 65);
      c.closePath();
      c.fill();

      c.strokeStyle = "#9eaaa2";
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(24, 38);
      c.lineTo(12, 61);
      c.lineTo(8, 77);
      c.moveTo(41, 37);
      c.lineTo(53, 56);
      c.lineTo(58, 71);
      c.stroke();

      c.strokeStyle = "#465059";
      c.lineWidth = 9;
      c.beginPath();
      c.moveTo(27, 62);
      c.lineTo(24, 91);
      c.moveTo(41, 61);
      c.lineTo(46, 91);
      c.stroke();

      c.fillStyle = "#b2bab0";
      c.beginPath();
      c.ellipse(34, 22, 10, 14, .2, 0, Math.PI * 2);
      c.fill();

      c.fillStyle = "#202325";
      c.fillRect(27, 19, 5, 4);
      c.fillRect(36, 19, 5, 4);
      c.fillStyle = "#5a1b1b";
      c.fillRect(32, 27, 7, 9);
      c.fillRect(31, 42, 10, 20);
    } else {
      const colors = {
        battery: "#bda569",
        medkit: "#90a99a",
        fuse: "#d1b578",
        log: "#759da6",
        exit: "#76a599"
      };

      c.fillStyle = "#172329";
      c.fillRect(12, 26, 40, 53);
      c.strokeStyle = colors[type];
      c.lineWidth = 3;
      c.strokeRect(12, 26, 40, 53);
      c.fillStyle = colors[type];

      if (type === "medkit") {
        c.fillRect(28, 39, 9, 27);
        c.fillRect(19, 48, 27, 9);
      } else if (type === "battery" || type === "fuse") {
        c.fillRect(23, 37, 18, 31);
        c.fillRect(28, 32, 8, 5);
      } else {
        c.fillRect(18, 35, 28, 20);
        c.fillStyle = "#b2c7bf";
        c.fillRect(20, 61, 22, 3);
      }
    }

    return sprite;
  }

  const sprites = {};
  for (const type of ["enemy", "battery", "medkit", "fuse", "log", "exit"]) {
    sprites[type] = makeSprite(type);
  }

  function flashlightPower(angle, d) {
    if (!player.flashlight || d >= FLASH_RANGE) return 0;
    const cone = Math.pow(Math.max(0, 1 - Math.abs(angle) / .42), 1.3);
    const flicker = player.battery < 15
      ? .7 + .3 * Math.sin(time * 31) ** 2 : 1;
    return cone * Math.max(0, 1 - d / FLASH_RANGE) * flicker;
  }

  function drawWalls() {
    const cameraHeight = player.crouch ? .31 : .5;
    const pulse = Math.pow(Math.max(0, Math.sin(time * 2)), 8);

    ctx.fillStyle = "#030507";
    ctx.fillRect(0, 0, width, height);

    const floorGradient = ctx.createLinearGradient(0, horizon, 0, height);
    floorGradient.addColorStop(0, "#030405");
    floorGradient.addColorStop(1, player.flashlight ? "#27221a" : "#090b0d");
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, horizon, width, height - horizon);

    // Juntas del suelo con perspectiva.
    ctx.strokeStyle = player.flashlight ? "#66563a25" : "#31404918";
    for (let d = 1; d < 14; d += .65) {
      const y = horizon + projection * cameraHeight / d;
      if (y >= height) continue;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    for (let x = 0; x < width; x++) {
      const offset = Math.atan((x - width / 2) / projection);
      const hit = castRay(player.angle + offset);
      const corrected = Math.max(.05, hit.distance * Math.cos(offset));
      depthBuffer[x] = corrected;

      const wallHeight = projection / corrected;
      const bottom = horizon + wallHeight * cameraHeight;
      const top = bottom - wallHeight;
      const light = flashlightPower(offset, hit.distance);

      const texture = wallTextures[hit.tile] || wallTextures[1];
      ctx.drawImage(
        texture,
        Math.floor(hit.texture * 63), 0, 1, 64,
        x, top, 1, wallHeight
      );

      const brightness = clamp(
        .025 + light * .88 + pulse * .025 - hit.side * .015,
        .015, .93
      );
      ctx.fillStyle = `rgba(0,0,0,${1 - brightness})`;
      ctx.fillRect(x, top, 1, wallHeight);

      // Tinte ámbar del haz y niebla atmosférica simulada.
      ctx.fillStyle = `rgba(130,82,25,${light * .13})`;
      ctx.fillRect(x, top, 1, wallHeight);
      ctx.fillStyle = `rgba(13,18,22,${Math.min(.32, corrected * .018)})`;
      ctx.fillRect(x, top, 1, wallHeight);

      // Testigos de emergencia: no iluminan por completo la habitación.
      if (hit.texture > .42 && hit.texture < .58 && hit.tile === 1) {
        ctx.fillStyle = `rgba(177,24,20,${.12 + pulse * .65})`;
        ctx.fillRect(x, top + wallHeight * .15, 1, wallHeight * .035);
      }
    }
  }

  function drawSprites() {
    const objects = [
      ...enemies.map(enemy => ({ ...enemy, type: "enemy" })),
      ...chapter.items.filter(item => !item.taken)
    ].sort((a, b) => distance(player, b) - distance(player, a));

    for (const object of objects) {
      const dx = object.x - player.x;
      const dy = object.y - player.y;
      const d = Math.hypot(dx, dy);
      const angle = normalizeAngle(Math.atan2(dy, dx) - player.angle);

      if (Math.abs(angle) > FOV || d < .12 || d > MAX_DISTANCE) continue;

      const forward = d * Math.cos(angle);
      const screenX = width / 2 + Math.tan(angle) * projection;
      const enemy = object.type === "enemy";
      const scale = enemy ? .9 : object.type === "exit" ? .85 : .5;
      const spriteHeight = projection * scale / forward;
      const spriteWidth = spriteHeight * 2 / 3;
      const cameraHeight = player.crouch ? .31 : .5;
      const bottom = horizon + projection * cameraHeight / forward;

      const sway = enemy
        ? Math.sin(time * 7 + object.phase) * spriteWidth * .045 : 0;

      const left = screenX - spriteWidth / 2 + sway;
      const top = bottom - spriteHeight;
      const light = flashlightPower(angle, d);

      ctx.globalAlpha = clamp(
        (enemy ? .07 : .3) + light * .95, 0, 1
      );

      const texture = sprites[object.type];
      const from = Math.max(0, Math.floor(left));
      const to = Math.min(width, Math.ceil(left + spriteWidth));

      for (let x = from; x < to; x++) {
        if (forward >= depthBuffer[x]) continue;
        const textureX = clamp(
          Math.floor((x - left) / spriteWidth * texture.width),
          0, texture.width - 1
        );

        ctx.drawImage(
          texture, textureX, 0, 1, texture.height,
          x, top, 1, spriteHeight
        );
      }
    }

    ctx.globalAlpha = 1;
  }

  function drawAtmosphere() {
    // Partículas dentro del cono de la linterna.
    if (player.flashlight) {
      ctx.fillStyle = "#e7c487";
      for (let i = 0; i < 30; i++) {
        const x = width / 2 + Math.sin(i * 7.3 + time * .12) * width * .27;
        const y = (i * 39 + time * (3 + i % 4)) % height;
        ctx.globalAlpha = .035 + (i % 3) * .02;
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.globalAlpha = 1;
    }

    // Marco inferior del casco.
    ctx.fillStyle = "#050709";
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, height * .92);
    ctx.quadraticCurveTo(width / 2, height * 1.05, width, height * .92);
    ctx.lineTo(width, height);
    ctx.fill();
  }

  function drawEnding() {
    const progress = clamp(endingTime / 3, 0, 1);
    ctx.fillStyle = "#050809";
    ctx.fillRect(0, 0, width, height);

    const opening = width * .6 * progress;
    ctx.fillStyle = "#516462";
    ctx.fillRect(width / 2 - opening / 2, 0, opening, height);

    const fog = ctx.createRadialGradient(
      width / 2, height / 2, 5,
      width / 2, height / 2, width * .6
    );
    fog.addColorStop(0, "#a0b1a133");
    fog.addColorStop(1, "#000000ee");
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, width, height);

    if (endingTime > 3) {
      // Presencia inmóvil entre las sombras.
      ctx.fillStyle = "#020303";
      ctx.beginPath();
      ctx.ellipse(width * .72, height * .47,
        width * .045, height * .2, -.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c5c6a9";
      ctx.fillRect(width * .708, height * .37, 3, 2);
      ctx.fillRect(width * .73, height * .37, 3, 2);
    }

    if (endingTime > 5) {
      ctx.fillStyle = `rgba(0,0,0,${clamp((endingTime - 5) / 1.5, 0, 1)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  function render() {
    if (mode === "ending") {
      drawEnding();
      return;
    }

    horizon = height / 2 +
      (player.moving && mode === "playing"
        ? Math.sin(walkingPhase) * (player.running ? 4 : 2)
        : Math.sin(time * 1.5));

    drawWalls();
    drawSprites();
    drawAtmosphere();
  }

  function frame(timestamp) {
    const dt = Math.min(.04, (timestamp - lastFrame) / 1000 || .016);
    lastFrame = timestamp;

    if (mode === "playing") {
      time += dt;
      updatePlayer(dt);
      const nearest = updateEnemies(dt);
      updateHUD(dt);

      if (mode === "playing") {
        audio.update(dt, {
          nearest,
          health: player.health,
          stamina: player.stamina,
          moving: player.moving,
          crouch: player.crouch,
          running: player.running
        });
      }
    } else if (mode === "ending") {
      const previous = endingTime;
      endingTime += dt;
      time += dt;

      if (previous < 3 && endingTime >= 3) {
        audio.effect("ending");
        say("...¿Quién ha dicho mi nombre?", 3);
      }

      if (endingTime >= 6.8) finish(false);
    }

    render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
