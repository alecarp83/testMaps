import { Sonidos } from "./sonidos.js";

// Espera también al script clásico del catálogo.
if (document.readyState === "loading") {
  await new Promise(resolve =>
    document.addEventListener("DOMContentLoaded", resolve, { once: true })
  );
}

const $ = id => document.getElementById(id);
const API = window.EclipseCatalogo;

if (!API) {
  document.body.textContent =
    "No se encontró la API del catálogo. Aplica el cambio indicado " +
    "en catalogo_personajes.js y comprueba el nombre del archivo.";
  throw new Error("EclipseCatalogo no disponible");
}

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

const store = {
  get(key, fallback) {
    try { return localStorage.getItem(key) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, String(value)); }
    catch { /* Almacenamiento privado o no disponible. */ }
  }
};

const settings = {
  volume: clamp(Number(store.get("eclipse.volume", ".55")) || 0, 0, 1),
  haptics: store.get("eclipse.haptics", "true") === "true"
};

const humans = API.personajes.filter(p => p.tipo === "humano");
const hostileTypes = new Set(["zombie", "mutante", "animal"]);
const hostiles = API.personajes.filter(p => hostileTypes.has(p.tipo));

if (!humans.length) throw new Error("El catálogo no contiene humanos jugables.");

const chosen = () =>
  humans.find(p => p.id === store.get("eclipse.character", "")) || humans[0];

const sound = new Sonidos(settings.volume);

function vibrate(pattern) {
  if (settings.haptics && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

document.addEventListener("contextmenu", e => e.preventDefault());

// Adapta el dibujante original sin duplicar modelos ni animaciones.
// Los canvas auxiliares no se insertan en el documento.
class ActorSprite extends API.Vista {
  constructor(data) {
    const canvas = document.createElement("canvas");
    canvas.getBoundingClientRect = () => ({ width: 128, height: 144 });
    super(canvas, data);

    this.suelo = () => {};
    this.ctx.fillText = () => {};
    this.age = 1;
    this.animacion = "Idle";
  }

  camara([x, y, z]) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    const xx = x * c + z * s;
    const zz = -x * s + z * c;
    const a = .96; // Aproximadamente 55 grados sobre el plano.
    return [
      xx,
      y * Math.cos(a) - zz * Math.sin(a),
      y * Math.sin(a) + zz * Math.cos(a)
    ];
  }

  actualizar(dt, animation, yaw) {
    this.age += dt;
    this.yaw = yaw;

    if (animation !== this.animacion) {
      this.cambiar(animation);
      this.age = Math.max(this.age, .09);
    }

    // Los modelos se refrescan a 12 FPS; el escenario, a 30 FPS.
    if (this.age >= 1 / 12) {
      super.dibujar(Math.min(this.age, .15));
      this.age = 0;
    }
  }
}

const canvas = $("scene");
const ctx = canvas.getContext("2d", { alpha: false });
let width = innerWidth, height = innerHeight, dpr = 1;

function resize() {
  width = innerWidth;
  height = innerHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
}
addEventListener("resize", resize);
resize();

// El mundo utiliza coordenadas de suelo. Z representa altura.
const camera = { x: 4, y: 5 };
let zoom = 1;
let shake = 0;
let time = 0;

function scale() {
  return clamp(Math.min(width / 15, height / 10), 25, 57) * zoom;
}

function project(x, y, z = 0) {
  const s = scale();
  return {
    x: width * .5 + ((x - camera.x) - (y - camera.y)) * s,
    y: height * .48 + ((x - camera.x) + (y - camera.y)) * s * .57 - z * s
  };
}

function polygon(points, fill, stroke) {
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function tile(x, y, z, color) {
  polygon([
    project(x, y, z), project(x + 1, y, z),
    project(x + 1, y + 1, z), project(x, y + 1, z)
  ], color, "#a6d0d012");
}

function block(x, y, w, d, h, color = "#304550", base = 0) {
  const a = project(x, y, base);
  const b = project(x + w, y, base);
  const c = project(x + w, y + d, base);
  const e = project(x, y + d, base);
  const A = project(x, y, base + h);
  const B = project(x + w, y, base + h);
  const C = project(x + w, y + d, base + h);
  const E = project(x, y + d, base + h);

  polygon([b, c, C, B], "#16232e", "#526b7620");
  polygon([c, e, E, C], "#20333f", "#526b7620");
  polygon([A, B, C, E], color, "#99c7c34a");

  // Borde superior que simula un bisel.
  ctx.strokeStyle = "#b2d2cd35";
  ctx.beginPath();
  ctx.moveTo(A.x, A.y + 2);
  ctx.lineTo(B.x, B.y + 2);
  ctx.lineTo(C.x, C.y + 2);
  ctx.stroke();
}

function glow(x, y, z, color, radius = 60) {
  const p = project(x, y, z);
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
}

function drawActor(actor) {
  const p = project(actor.x, actor.y, actor.z || 0);
  const size = scale() * 1.9;
  ctx.save();
  ctx.fillStyle = "#0007";
  ctx.filter = "blur(3px)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, size * .25, size * .1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";

  if (actor.inv > 0 && Math.floor(time * 15) % 2) ctx.globalAlpha = .5;
  if (actor.crouch) ctx.globalAlpha = .72;

  // El suelo del modelo original se sitúa en el 83% de su canvas.
  ctx.drawImage(actor.sprite.canvas,
    p.x - size / 2, p.y - size * 1.125 * .83, size, size * 1.125);

  if (actor.windup > 0) {
    ctx.strokeStyle = "#ff7458";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, size * .35, size * .16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------- MENÚ ----------------

if (document.body.dataset.page === "menu") {
  initMenu();
} else {
  initGame();
}

function initMenu() {
  const updateSelection = () => {
    $("selected").textContent = `SUPERVIVIENTE: ${chosen().nombre}`;
    for (const button of $("character-list").children) {
      button.setAttribute("aria-pressed", String(button.dataset.id === chosen().id));
    }
  };

  for (const data of humans) {
    const button = document.createElement("button");
    button.className = "character-card";
    button.dataset.id = data.id;
    const sprite = new ActorSprite(data);
    sprite.actualizar(.1, "Idle", -.6);

    const name = document.createElement("strong");
    name.textContent = data.nombre;
    const description = document.createElement("span");
    description.textContent = data.descripcion;

    button.append(sprite.canvas, name, description);
    button.addEventListener("click", () => {
      store.set("eclipse.character", data.id);
      updateSelection();
      $("characters").close();
    });
    $("character-list").append(button);
  }

  updateSelection();
  $("choose").onclick = () => $("characters").showModal();
  $("options").onclick = () => $("settings").showModal();
  $("exit").onclick = () => $("goodbye").showModal();

  document.querySelectorAll("[data-close]").forEach(button => {
    button.onclick = () => button.closest("dialog").close();
  });

  $("volume").value = settings.volume;
  $("haptics").checked = settings.haptics;

  $("volume").oninput = e => {
    settings.volume = Number(e.target.value);
    store.set("eclipse.volume", settings.volume);
    sound.volumenA(settings.volume);
  };
  $("haptics").onchange = e => {
    settings.haptics = e.target.checked;
    store.set("eclipse.haptics", settings.haptics);
    vibrate(20);
  };

  const data = hostiles[0] || humans[0];
  const actor = {
    x: 6, y: 5, z: 0, sprite: new ActorSprite(data)
  };
  camera.x = 6;
  camera.y = 4;

  let previous = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - previous < 1000 / 30) return;
    const dt = Math.min((now - previous) / 1000 || .033, .05);
    previous = now;
    if (!reducedMotion) time += dt;
    actor.x = 5 + Math.sin(time * .2) * 4;
    actor.sprite.actualizar(dt, reducedMotion ? "Idle" : "Caminar", -.8);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#070d15";
    ctx.fillRect(0, 0, width, height);

    for (let x = -3; x < 18; x++) {
      for (let y = 0; y < 10; y++) {
        tile(x, y, 0, (x + y) % 2 ? "#1d303d" : "#243946");
      }
      block(x, 0, 1, .25, 1.8);
      if (x % 3 === 0) glow(x, .5, 1, "#ff27394d", 90);
    }
    drawActor(actor);
  }
  requestAnimationFrame(frame);
}

// ---------------- CAPÍTULO 1 ----------------

function initGame() {
  const sectors = ["Pasillo A", "Comedor", "Enfermería", "Bahía de escape"];
  const playerData = chosen();

  const player = {
    x: 3, y: 5, z: 0,
    data: playerData,
    sprite: new ActorSprite(playerData),
    health: 100, stamina: 100, battery: 100,
    light: false, crouch: false, sprint: false,
    inv: 0, attack: 0, roll: 0, dodgeCD: 0,
    fx: 1, fy: 0, moving: false
  };
  player.sprite.actualizar(.1, "Idle", 0);

  camera.x = player.x;
  camera.y = player.y;
  $("player-name").textContent = playerData.nombre;

  const doors = [12, 24, 36].map(x => ({
    x, open: false, y: 5
  }));

  const props = [];
  for (let room = 0; room < 4; room++) {
    const x = room * 12;
    props.push(
      { x: x + 4, y: 2, w: 1.5, d: 1.2, h: .8, color: "#3c4d54" },
      { x: x + 7, y: 7.5, w: 2, d: 1, h: .8, color: "#35494e" },
      { x: x + 1.5, y: 8, w: 1, d: 1, h: 1, color: "#4e463c" }
    );
    if (room === 1) props.push(
      { x: x + 6, y: 3, w: 2, d: 1, h: .65, color: "#4c5555" }
    );
    if (room === 2) props.push(
      { x: x + 5, y: 2, w: 2.5, d: 1, h: .5, color: "#78918d" }
    );
  }

  const pickups = [
    { x: 8, y: 6.5, kind: "battery", used: false },
    { x: 18, y: 6.2, kind: "med", used: false },
    { x: 28, y: 6.5, kind: "key", used: false },
    { x: 33, y: 3, kind: "battery", used: false },
    { x: 41, y: 6.8, kind: "med", used: false }
  ];

  const enemies = hostiles.map((data, i) => {
    const room = Math.min(3, 1 + Math.floor(i / 3));
    const slot = i % 3;
    return {
      data, sprite: new ActorSprite(data),
      x: room * 12 + 3 + slot * 2.3,
      y: slot === 1 ? 6.3 : 4.8,
      z: 0,
      health: data.tipo === "mutante" ? 115 : data.tipo === "animal" ? 40 : 65,
      speed: data.tipo === "animal" ? 2.45 : data.tipo === "mutante" ? 1.05 : .85,
      damage: data.tipo === "mutante" ? 23 : data.tipo === "animal" ? 9 : 13,
      cooldown: Math.random(),
      windup: 0, alert: 0,
      tx: 0, ty: 0,
      phase: Math.random() * 10,
      moving: false, inv: 0
    };
  });
  for (const e of enemies) e.sprite.actualizar(.1, "Idle", 0);

  const particles = [];
  const axis = { x: 0, y: 0 };
  const touches = new Map();

  let state = "intro";
  let hasKey = false;
  let attackHeld = false;
  let joystickPointer = null;
  let pinchDistance = 0;
  let toastTimer = 0;
  let stepTimer = 0;
  let flash = 0;
  let endingTime = 0;
  let elapsed = 0;
  let kills = 0;

  function setState(next) {
    state = next;
    document.body.dataset.state = next;
    clearInput();
  }

  function clearInput() {
    axis.x = axis.y = 0;
    attackHeld = false;
    joystickPointer = null;
    touches.clear();
    pinchDistance = 0;
    $("stick").style.transform = "";
  }

  function message(text, duration = 3) {
    $("toast").textContent = text;
    toastTimer = duration;
  }

  function modal(title, text, action) {
    $("overlay-title").textContent = title;
    $("overlay-text").textContent = text;
    $("continue").textContent = action;
  }

  function pause() {
    if (state !== "playing" && state !== "ending") return;
    const wasEnding = state === "ending";
    setState(wasEnding ? "paused-ending" : "paused");
    modal("Señal suspendida", "La simulación está en pausa.", "Continuar");
    sound.pausar();
  }

  $("pause-button").onclick = pause;

  $("continue").onclick = async () => {
    if (state === "dead") {
      location.reload();
      return;
    }
    if (state === "finished") {
      location.href = "./index.html";
      return;
    }
    const next = state === "paused-ending" ? "ending" : "playing";
    // El contexto se activa dentro del gesto del usuario.
    sound.iniciar();
    if (next === "ending") {
      modal("La compuerta se abre",
        "El silencio del otro lado no es una buena señal.", "...");
    }
    setState(next);
    if (next === "playing") {
      message("Mueve el joystick. Usa los paneles junto a cada compuerta.", 5);
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  addEventListener("blur", pause);
  addEventListener("pagehide", () => sound.pausar());

  // Altura: plataforma y rampas suaves en la bahía.
  function elevation(x, y) {
    if (y < 3.5 || y > 6.5 || x < 39 || x > 45) return 0;
    if (x < 40) return (x - 39) * .45;
    if (x > 44) return (45 - x) * .45;
    return .45;
  }

  function blocked(x, y, r = .27) {
    if (x < .45 + r || x > 47.5 - r || y < .55 + r || y > 9.45 - r) {
      return true;
    }

    for (const door of doors) {
      if (Math.abs(x - door.x) < .2 + r) {
        if (!door.open || y < 4 + r || y > 6 - r) return true;
      }
    }

    for (const p of props) {
      if (x > p.x - r && x < p.x + p.w + r &&
          y > p.y - r && y < p.y + p.d + r) return true;
    }

    // Bordes laterales de la plataforma: se entra por las rampas.
    if (x > 40 && x < 44 &&
        (Math.abs(y - 3.5) < r || Math.abs(y - 6.5) < r)) return true;

    return false;
  }

  function move(actor, dx, dy) {
    // Subpasos para que la esquiva no atraviese paredes.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / .12));
    for (let i = 0; i < steps; i++) {
      if (!blocked(actor.x + dx / steps, actor.y)) actor.x += dx / steps;
      if (!blocked(actor.x, actor.y + dy / steps)) actor.y += dy / steps;
    }
    actor.z = elevation(actor.x, actor.y);
  }

  function visible(a, b) {
    const n = Math.ceil(distance(a, b) * 6);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, .03)) {
        return false;
      }
    }
    return true;
  }

  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      if (particles.length >= 140) particles.shift();
      particles.push({
        x, y, z: .3,
        vx: (Math.random() - .5) * 4,
        vy: (Math.random() - .5) * 4,
        vz: 1 + Math.random() * 2,
        life: .35 + Math.random() * .3,
        color
      });
    }
  }

  function hurt(amount) {
    if (player.inv > 0 || state !== "playing") return;
    player.health = Math.max(0, player.health - amount);
    player.inv = .65;
    flash = .8;
    shake = 7;
    vibrate([35, 25, 50]);
    sound.efecto("impacto");

    if (player.health <= 0) {
      setState("dead");
      modal("Signos vitales perdidos",
        "La Kepler-9 guarda otro silencio. Tu ruta puede ser distinta.",
        "Reintentar");
      sound.pausar();
    }
  }

  function attack() {
    if (state !== "playing" || player.attack > 0 || player.roll > 0) return;
    if (player.stamina < 9) return;

    player.stamina -= 9;
    player.attack = .48;
    sound.efecto("ataque");

    let target = null;
    let nearest = 1.75;
    for (const e of enemies) {
      const d = distance(player, e);
      if (e.health > 0 && d < nearest && visible(player, e)) {
        nearest = d;
        target = e;
      }
    }

    // Asistencia de orientación para pantalla táctil.
    if (target) {
      const d = Math.max(.001, distance(player, target));
      player.fx = (target.x - player.x) / d;
      player.fy = (target.y - player.y) / d;
    }

    let hit = false;
    for (const e of enemies) {
      if (e.health <= 0) continue;
      const d = distance(player, e);
      const dot = ((e.x - player.x) * player.fx +
        (e.y - player.y) * player.fy) / Math.max(.01, d);

      if (d < 1.75 && dot > .15 && visible(player, e)) {
        e.health -= 35;
        e.alert = 5;
        e.tx = player.x;
        e.ty = player.y;
        e.inv = .12;
        burst(e.x, e.y, e.data.luz);
        move(e, player.fx * .22, player.fy * .22);
        hit = true;
        if (e.health <= 0) kills++;
      }
    }

    burst(player.x + player.fx * .6, player.y + player.fy * .6,
      player.data.luz, 5);
    if (hit) {
      shake = 4;
      sound.efecto("impacto");
      vibrate(18);
    }
  }

  function dodge() {
    if (state !== "playing" || player.dodgeCD > 0 || player.stamina < 26) return;
    player.stamina -= 26;
    player.roll = .28;
    player.inv = .34;
    player.dodgeCD = 1.3;
    sound.efecto("rodar");
    vibrate(12);
  }

  function interact() {
    if (state !== "playing") return;

    for (const item of pickups) {
      if (!item.used && distance(player, item) < 1.6) {
        if (item.kind === "key") {
          hasKey = true;
          message("Credencial médica recuperada. Accede a la bahía.", 4);
        } else if (item.kind === "med") {
          if (player.health >= 100) {
            message("Vida completa. Puedes dejar este botiquín aquí.");
            return;
          }
          player.health = Math.min(100, player.health + 40);
          message("Botiquín: +40 de vida.");
        } else {
          if (player.battery >= 100) {
            message("Batería completa.");
            return;
          }
          player.battery = Math.min(100, player.battery + 50);
          message("Celda: +50 de batería.");
        }
        item.used = true;
        sound.efecto("usar");
        burst(item.x, item.y, "#88ffe0");
        return;
      }
    }

    for (let i = 0; i < doors.length; i++) {
      const door = doors[i];
      const panel = { x: door.x - .8, y: 4.5 };
      if (!door.open && distance(player, panel) < 1.8) {
        if (i === 2 && !hasKey) {
          message("Acceso bloqueado. Busca la credencial en Enfermería.", 4);
          return;
        }
        door.open = true;
        sound.efecto("puerta");
        message(`Acceso a ${sectors[i + 1]} habilitado.`);
        for (const e of enemies) {
          if (e.health > 0 && Math.abs(e.x - door.x) < 7) {
            e.alert = 5;
            e.tx = door.x + 1;
            e.ty = 5;
          }
        }
        return;
      }
    }

    if (player.x > 45 && Math.abs(player.y - 5) < 1.8) {
      setState("ending");
      endingTime = 0;
      modal("La compuerta se abre",
        "El aire de la bahía está helado. Algo se mueve detrás del cristal.",
        "...");
      $("continue").disabled = true;
      sound.efecto("puerta");
      return;
    }

    message("Acércate a un panel, suministro o compuerta de escape.");
  }

  // Joystick: cada control mantiene su propio identificador de puntero.
  function updateJoystick(e) {
    const r = $("joystick").getBoundingClientRect();
    const radius = r.width * .34;
    const dx = e.clientX - r.left - r.width / 2;
    const dy = e.clientY - r.top - r.height / 2;
    const length = Math.hypot(dx, dy);
    const factor = length > radius ? radius / length : 1;
    axis.x = dx * factor / radius;
    axis.y = dy * factor / radius;
    if (length < 8) axis.x = axis.y = 0;
    $("stick").style.transform =
      `translate(${axis.x * radius}px, ${axis.y * radius}px)`;
  }

  $("joystick").addEventListener("pointerdown", e => {
    if (state !== "playing" || joystickPointer !== null) return;
    e.preventDefault();
    joystickPointer = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateJoystick(e);
  });

  $("joystick").addEventListener("pointermove", e => {
    if (e.pointerId === joystickPointer) updateJoystick(e);
  });

  const releaseJoystick = e => {
    if (e.pointerId !== joystickPointer) return;
    joystickPointer = null;
    axis.x = axis.y = 0;
    $("stick").style.transform = "";
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    $("joystick").addEventListener(type, releaseJoystick);
  }

  $("attack").addEventListener("pointerdown", e => {
    if (state !== "playing") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    attackHeld = true;
    attack();
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    $("attack").addEventListener(type, () => { attackHeld = false; });
  }

  $("dodge").onclick = dodge;
  $("interact").onclick = interact;

  $("light").onclick = () => {
    if (player.battery <= 0) {
      message("Batería agotada.");
      return;
    }
    player.light = !player.light;
  };

  $("stealth").onclick = () => {
    player.crouch = !player.crouch;
    if (player.crouch) player.sprint = false;
  };

  $("sprint").onclick = () => {
    player.sprint = !player.sprint;
    if (player.sprint) player.crouch = false;
  };

  // Pellizco solo sobre el escenario; no roba dedos al joystick.
  canvas.addEventListener("pointerdown", e => {
    if (state !== "playing") return;
    canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinchDistance = 0;
  });

  canvas.addEventListener("pointermove", e => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size !== 2) return;
    const [a, b] = [...touches.values()];
    const current = distance(a, b);
    if (pinchDistance > 0) zoom = clamp(zoom * current / pinchDistance, .65, 1.65);
    pinchDistance = current;
  });

  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, e => {
      touches.delete(e.pointerId);
      pinchDistance = 0;
    });
  }

  function updateEnemy(e, dt) {
    if (e.health <= 0) return;
    e.cooldown = Math.max(0, e.cooldown - dt);
    e.inv = Math.max(0, e.inv - dt);
    e.alert = Math.max(0, e.alert - dt);

    const d = distance(player, e);
    const line = d < 10 && visible(e, player);
    const movingNoise = player.moving
      ? player.crouch ? .7 : player.sprint ? 6 : 3.2
      : .65;
    const detection = Math.max(
      movingNoise,
      player.light ? 8 : 0,
      player.attack > 0 ? 7 : 0
    );

    if (line && d < detection) {
      e.alert = 4.5;
      e.tx = player.x;
      e.ty = player.y;
    }

    e.moving = false;

    if (e.windup > 0) {
      e.windup -= dt;
      if (e.windup <= 0) {
        if (d < 1.35 && visible(e, player)) hurt(e.damage);
        e.cooldown = e.data.tipo === "animal" ? .9 : 1.5;
      }
    } else if (e.alert > 0) {
      if (d < 1.12 && line && e.cooldown <= 0) {
        e.windup = e.data.tipo === "mutante" ? .6 : .35;
      } else if (d > .9) {
        const dx = e.tx - e.x, dy = e.ty - e.y;
        const length = Math.hypot(dx, dy);
        if (length > .12) {
          let vx = dx / length, vy = dy / length;
          // Separación local para evitar que todos ocupen el mismo punto.
          for (const other of enemies) {
            if (other === e || other.health <= 0) continue;
            const spacing = distance(e, other);
            if (spacing > .01 && spacing < .65) {
              vx += (e.x - other.x) / spacing * .65;
              vy += (e.y - other.y) / spacing * .65;
            }
          }
          const norm = Math.max(1, Math.hypot(vx, vy));
          const ox = e.x, oy = e.y;
          move(e, vx / norm * e.speed * dt, vy / norm * e.speed * dt);
          // Desvío local cuando una caja corta la ruta directa.
          if (Math.hypot(e.x - ox, e.y - oy) < .003) {
            move(e, -vy / norm * e.speed * dt, vx / norm * e.speed * dt);
          }
          e.moving = true;
        }
      }
    }

    const yaw = Math.atan2(player.x - e.x, player.y - e.y) - .78;
    e.sprite.actualizar(dt,
      e.windup > 0 ? "Atacar" :
      e.moving ? e.data.tipo === "animal" ? "Correr" : "Caminar" : "Idle",
      yaw);
  }

  function update(dt) {
    time += dt;
    toastTimer -= dt;
    if (toastTimer <= 0) $("toast").textContent = "";

    if (state === "ending") {
      endingTime += dt;
      if (endingTime > 2 && endingTime < 4.5) {
        $("overlay-text").textContent =
          "Dos ojos se encienden en la oscuridad. No estabas escapando solo.";
      }
      if (endingTime >= 4.5) {
        setState("finished");
        const survivors = enemies.filter(e => e.health > 0).length;
        modal("Fin del Capítulo 1",
          `Has alcanzado la bahía en ${Math.floor(elapsed)} segundos. ` +
          `${kills} enemigos neutralizados; ${survivors} quedaron atrás. ` +
          "La señal continúa en el Capítulo 2.",
          "Volver al menú");
        $("continue").disabled = false;
        sound.pausar();
      }
      return;
    }

    if (state !== "playing") return;
    elapsed += dt;
    player.inv = Math.max(0, player.inv - dt);
    player.attack = Math.max(0, player.attack - dt);
    player.dodgeCD = Math.max(0, player.dodgeCD - dt);
    flash = Math.max(0, flash - dt * 2);
    shake = Math.max(0, shake - dt * 20);

    // Inversa de la proyección: el joystick sigue direcciones de pantalla.
    let vx = (axis.x + axis.y / .57) / 2;
    let vy = (axis.y / .57 - axis.x) / 2;
    const length = Math.hypot(vx, vy);
    const strength = Math.min(1, Math.hypot(axis.x, axis.y));
    if (length > 0) { vx /= length; vy /= length; }
    player.moving = strength > .08;

    if (player.roll > 0) {
      player.roll = Math.max(0, player.roll - dt);
      move(player, player.fx * 7.5 * dt, player.fy * 7.5 * dt);
    } else {
      if (player.moving) {
        player.fx = vx;
        player.fy = vy;
      }
      const running = player.sprint && player.stamina > 0 && player.moving;
      const speed = player.crouch ? 1.35 : running ? 4.1 : 2.5;
      const attackingSlow = player.attack > .25 ? .5 : 1;
      move(player,
        vx * speed * dt * strength * attackingSlow,
        vy * speed * dt * strength * attackingSlow);

      if (running) {
        player.stamina = Math.max(0, player.stamina - dt * 22);
        if (player.stamina === 0) player.sprint = false;
      } else if (player.attack <= 0) {
        player.stamina = Math.min(100, player.stamina + dt * 17);
      }
    }

    if (player.light) {
      player.battery = Math.max(0, player.battery - dt * 1.4);
      if (!player.battery) {
        player.light = false;
        message("Linterna sin batería.");
      }
    }

    if (attackHeld) attack();

    stepTimer -= dt;
    if (player.moving && stepTimer <= 0 && !player.crouch) {
      sound.efecto("paso");
      stepTimer = player.sprint ? .23 : .38;
    }

    player.sprite.actualizar(dt,
      player.roll > 0 ? "Saltar" :
      player.attack > .12 ? "Atacar" :
      player.moving ? player.sprint ? "Correr" : "Caminar" : "Idle",
      Math.atan2(player.fx, player.fy) - .78);

    for (const e of enemies) {
      updateEnemy(e, dt);
      if (state !== "playing") break;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= 12 * dt;
      if (p.z < 0) {
        p.z = 0;
        p.vz *= -.3;
        p.vx *= .5;
        p.vy *= .5;
      }
    }

    // HUD
    $("health").value = player.health;
    $("battery").value = player.battery;
    $("stamina").value = player.stamina;
    $("light").setAttribute("aria-pressed", String(player.light));
    $("stealth").setAttribute("aria-pressed", String(player.crouch));
    $("sprint").setAttribute("aria-pressed", String(player.sprint));

    // Cámara isométrica: sigue al jugador con suavizado.
    camera.x += (player.x - camera.x) * Math.min(1, dt * 6);
    camera.y += (player.y - camera.y) * Math.min(1, dt * 6);

    // Sonido dinámico según la proximidad del enemigo más cercano.
    let nearest = 100;
    for (const e of enemies) {
      if (e.health > 0) nearest = Math.min(nearest, distance(player, e));
    }
    const proximidad = clamp(1 - nearest / 14, 0, 1);
    const esfuerzo = player.sprint && player.moving ? 1
      : player.moving ? (player.crouch ? .25 : .5) : 0;
    sound.actualizar(dt, proximidad, player.health, esfuerzo);

    // Objetivo actual.
    if (!hasKey) {
      $("objective").textContent =
        "Recupera la credencial médica en la Enfermería";
    } else if (player.x < 45) {
      $("objective").textContent =
        "Alcanza la compuerta de escape al este";
    } else {
      $("objective").textContent = "Activa el panel de evacuación";
    }

    // Viñeta de daño y respiración agitada.
    $("damage").style.opacity = flash;
    const breathing = (player.stamina < 30 || (player.sprint && player.moving))
      ? .25 + .25 * Math.sin(time * 4) : 0;
    $("breathing").style.opacity = Math.max(0, breathing);
  }

  // ------------------- RENDER -------------------

  function drawDoor(door) {
    const base = elevation(door.x + .25, 5);
    if (!door.open) {
      // Hoja cerrada que ocupa el ancho del corredor.
      block(door.x - .25, 0, .5, 10, 1.9, "#3a5058", base);
      block(door.x - .15, 4.2, .3, 1.6, .8, "#4a626b", base + .5);
      block(door.x - .05, 4.55, .15, .3, .15, "#ff5566", base + .65);
    } else {
      // Dos paneles retraídos en los extremos, hueco en el centro.
      block(door.x - .25, 0, .5, 3.6, 1.9, "#3a5058", base);
      block(door.x - .25, 6.4, .5, 3.6, 1.9, "#3a5058", base);
      glow(door.x + .3, 5, 1, "#76ffda55", 90);
    }
  }

  function drawPickup(item) {
    const bob = Math.sin(time * 3 + item.x) * .12;
    const base = elevation(item.x, item.y);
    const color = item.kind === "key" ? "#ffd76e"
      : item.kind === "med" ? "#ff7380" : "#f2d18a";
    // Pedestal
    block(item.x - .2, item.y - .2, .4, .4, .12, "#2a3d48", base);
    // Ítem flotante
    const p = project(item.x, item.y, base + .45 + bob);
    const size = scale() * .3;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    ctx.restore();
    ctx.strokeStyle = "#ffffffcc";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
    glow(item.x, item.y, .05, color + "55", 45);
  }

  function drawFlashlight() {
    // Centro del cono justo delante del personaje.
    const px = player.x + player.fx * .6;
    const py = player.y + player.fy * .6;
    const p = project(px, py, (player.z || 0) + .55);

    // Dirección del cono en pantalla (isométrica).
    const sx = (player.fx - player.fy) * scale() * 5;
    const sy = (player.fx + player.fy) * scale() * 5 * .57;
    const angle = Math.atan2(sy, sx);
    const length = Math.hypot(sx, sy);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, 0, length, 0);
    grad.addColorStop(0, "#fff2c866");
    grad.addColorStop(.4, "#ffe09333");
    grad.addColorStop(1, "#ffdf9a00");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(length, -length * .35);
    ctx.lineTo(length, length * .35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#070d15";
    ctx.fillRect(0, 0, width, height);

    // Sacudida de cámara al golpear o recibir daño.
    const ox = shake > 0 ? (Math.random() - .5) * shake : 0;
    const oy = shake > 0 ? (Math.random() - .5) * shake : 0;
    ctx.save();
    ctx.translate(ox, oy);

    // Piso del corredor
    const x0 = Math.max(-2, Math.floor(camera.x - 18));
    const x1 = Math.min(50, Math.ceil(camera.x + 18));
    for (let x = x0; x < x1; x++) {
      for (let y = 1; y < 10; y++) {
        const even = (x + y) % 2 === 0;
        tile(x, y, elevation(x + .5, y + .5),
          even ? "#1d303d" : "#243946");
      }
    }

    // Paredes laterales del corredor
    for (let x = x0; x < x1; x++) {
      block(x, -.3, 1, .3, 2, "#2b3f4b");
      block(x, 10, 1, .3, 2, "#2b3f4b");
    }

    // Luces rojas de emergencia sobre cada compuerta.
    for (const door of doors) {
      glow(door.x + .5, 5, 2.4, "#ff273955", 110);
    }

    // Orden del pintor: dibujar de atrás hacia adelante.
    const drawables = [];
    for (const p of props) {
      drawables.push({
        depth: p.x + p.y + (p.w + p.d) / 2,
        fn: () => block(
          p.x, p.y, p.w, p.d, p.h, p.color,
          elevation(p.x + p.w / 2, p.y + p.d / 2)
        )
      });
    }
    for (const door of doors) {
      drawables.push({ depth: door.x + 5, fn: () => drawDoor(door) });
    }
    for (const item of pickups) {
      if (!item.used) drawables.push({
        depth: item.x + item.y, fn: () => drawPickup(item)
      });
    }
    for (const e of enemies) {
      if (e.health > 0) drawables.push({
        depth: e.x + e.y, fn: () => drawActor(e)
      });
    }
    drawables.push({
      depth: player.x + player.y, fn: () => drawActor(player)
    });
    drawables.sort((a, b) => a.depth - b.depth);
    for (const d of drawables) d.fn();

    // Partículas encima de todo.
    for (const p of particles) {
      const pt = project(p.x, p.y, p.z);
      const size = Math.max(1.5, scale() * .09 * Math.min(1, p.life * 3));
      ctx.globalAlpha = Math.min(1, p.life * 3);
      ctx.fillStyle = p.color;
      ctx.fillRect(pt.x - size / 2, pt.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    // Cono de linterna si está encendida.
    if (player.light && (state === "playing" || state === "ending")) {
      drawFlashlight();
    }

    ctx.restore();

    // Barras de vida sobre enemigos heridos.
    for (const e of enemies) {
      if (e.health <= 0) continue;
      const maxHp = e.data.tipo === "mutante" ? 115
        : e.data.tipo === "animal" ? 40 : 65;
      if (e.health >= maxHp) continue;
      const p = project(e.x, e.y, (e.z || 0) + 2.3);
      const w = scale() * .55;
      ctx.fillStyle = "#000c";
      ctx.fillRect(p.x - w / 2, p.y - 3, w, 5);
      ctx.fillStyle = "#ff5566";
      ctx.fillRect(p.x - w / 2, p.y - 3, w * (e.health / maxHp), 5);
    }

    // Fundido de fin de capítulo.
    if (state === "ending") {
      const a = Math.min(1, endingTime / 3.5);
      ctx.fillStyle = `rgba(0,0,0,${a * .85})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  // ------------------- BUCLE -------------------

  let previous = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    // 30 FPS objetivo: suficiente para móvil y estable.
    if (document.hidden || now - previous < 1000 / 30) return;
    const dt = Math.min((now - previous) / 1000 || .033, .05);
    previous = now;
    update(dt);
    render();
  }
  requestAnimationFrame(frame);
}