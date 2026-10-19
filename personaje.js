"use strict";

/*
  ECLIPSE · CAPÍTULO 1 — Lógica del protagonista, cámara en 3ª persona,
  enemigos infectados, linterna, colisiones, HUD y bucle principal.
  Estética tipo Roblox (bloques low-poly) con iluminación y niebla realistas.

  Optimizaciones aplicadas:
    1) Cache de geometrías (boxGeo)
    2) Cache de materiales (mat) + materiales compartidos en humanoides
    3) solidMeshes[] paralelo a solids para raycasts
    4) Poda de castShadow en decoración pequeña + sombra linterna 512/cada 3 frames
    5) Apagado de PointLights fuera de un radio alrededor del jugador
    7) Pixel ratio adaptativo (desktop 1.5 / táctil 1.0)
    9) Corte temprano por distancia en visibleBetween()
*/

(() => {
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------
  // 1. Comprobaciones de motor
  // ---------------------------------------------------------------
  if (!window.THREE) {
    $("overlayTitle").textContent = "No se pudo cargar el motor";
    $("overlayText").textContent =
      "Revisa tu conexión a Internet y recarga la página.";
    $("resume").hidden = true;
    return;
  }

  const T = THREE;

  // ---------------------------------------------------------------
  // 2. Ajustes persistentes (compartidos con index.html)
  // ---------------------------------------------------------------
  let settings = { volume: .45, sensitivity: 1 };
  try {
    settings = {
      ...settings,
      ...JSON.parse(localStorage.getItem("eclipse-settings") || "{}")
    };
  } catch {}

  const audio = new EclipseAudio(settings.volume);

  // ---------------------------------------------------------------
  // 3. Escena, renderer y cámara
  // ---------------------------------------------------------------
  const scene = new T.Scene();
  scene.background = new T.Color(0x05090d);
  scene.fog = new T.FogExp2(0x080e14, .045);

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true });
  } catch {
    $("overlayTitle").textContent = "WebGL no disponible";
    $("overlayText").textContent =
      "Activa la aceleración gráfica del navegador para jugar.";
    $("resume").hidden = true;
    return;
  }

  // --- Ajuste 7: pixel ratio adaptativo ---
  const isCoarsePointer = matchMedia("(pointer: coarse)").matches;
  const maxPixelRatio = isCoarsePointer ? 1 : 1.5;
  const applyPixelRatio = () =>
    renderer.setPixelRatio(Math.min(devicePixelRatio, maxPixelRatio));
  applyPixelRatio();

  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  $("viewport").appendChild(renderer.domElement);

  const camera = new T.PerspectiveCamera(65, innerWidth / innerHeight, .08, 100);
  const raycaster = new T.Raycaster();
  const solids = [];
  const solidMeshes = [];   // --- Ajuste 3 ---
  const interactables = [];
  const enemies = [];
  const emergencyLights = [];
  const ambientLights = []; // --- Ajuste 5: luces azules con z asociado ---
  const doors = [];
  const keys = new Set();
  const clock = new T.Clock();

  // Reutilizables para evitar allocations por frame
  const _tmpA = new T.Vector3();
  const _tmpB = new T.Vector3();

  // ---------------------------------------------------------------
  // 4. Estado global y jugador
  // ---------------------------------------------------------------
  const state = {
    paused: true, dead: false, ending: false, finished: false,
    time: 0, endTime: 0, stage: 0, toastTime: 0, damage: 0,
    shadowFrame: 0
  };

  const player = {
    pos: new T.Vector3(0, 0, 3),
    hp: 100, stamina: 100, battery: 100, cells: 1,
    card: false, fuse: false, power: false,
    flashlight: true, crouched: false, moving: false,
    running: false, exhausted: false
  };

  let yaw = 0;
  let pitch = .06;
  let zoom = 3.5;
  let selected = null;

  // ---------------------------------------------------------------
  // Ajuste 1 + 2: caches de geometría y material
  // ---------------------------------------------------------------
  const geoCache = new Map();
  const boxGeo = (w, h, d) => {
    const key = `${w}|${h}|${d}`;
    let g = geoCache.get(key);
    if (!g) {
      g = new T.BoxGeometry(w, h, d);
      geoCache.set(key, g);
    }
    return g;
  };

  const matCache = new Map();
  const mat = (color, extra = {}) => {
    const key = color + "|" + JSON.stringify(extra);
    let m = matCache.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({ color, roughness: .85, ...extra });
      matCache.set(key, m);
    }
    return m;
  };

  const materials = {
    wall: mat(0x26333e),
    trim: mat(0x3c4a55, { metalness: .5 }),
    floor: mat(0x151f28, { metalness: .3 }),
    crate: mat(0x47504a),
    pipe: mat(0x46535a, { metalness: .65 }),
    blood: mat(0x491e21),
    screen: mat(0x26444a, {
      emissive: 0x3ea0ae, emissiveIntensity: .9
    }),
    amber: mat(0xb49b60, {
      emissive: 0xc78a39, emissiveIntensity: .7
    }),
    dark: mat(0x101820)
  };

  const humanoidMats = {
    clothAlive: mat(0x9a7450),
    clothInfected: mat(0x514c50),
    skinAlive: mat(0xc4aa8b),
    skinInfected: mat(0xa5b6a8),
    legsAlive: mat(0x303f4a),
    legsInfected: mat(0x303b3e),
    bed: mat(0x75878a),
    bedTop: mat(0x59646b)
  };

  // ---------------------------------------------------------------
  // 5. Utilidades de construcción
  //    Ajuste 4: opts.cast / opts.receive para podar sombras finas.
  // ---------------------------------------------------------------
  function box(x, y, z, w, h, d, material, solid = false, opts = {}) {
    const mesh = new T.Mesh(boxGeo(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.cast !== false;
    mesh.receiveShadow = opts.receive !== false;
    scene.add(mesh);
    if (solid) {
      solids.push({
        mesh,
        minX: x - w / 2, maxX: x + w / 2,
        minZ: z - d / 2, maxZ: z + d / 2
      });
      solidMeshes.push(mesh);
    }
    return mesh;
  }

  function label(text, x, y, z, color = "#a5c6ce") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#101c24";
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = color;
    ctx.strokeRect(5, 5, 502, 118);
    ctx.fillStyle = color;
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 77);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture }));
    sprite.position.set(x, y, z);
    sprite.scale.set(3.5, .875, 1);
    scene.add(sprite);
  }

  scene.add(new T.HemisphereLight(0x627e9e, 0x111317, .34));

  // ---------------------------------------------------------------
  // 6. Sectores de la nave
  // ---------------------------------------------------------------
  const sectors = [
    { start: 0,  end: 20, name: "Pasillo A" },
    { start: 20, end: 40, name: "Comedor" },
    { start: 40, end: 60, name: "Enfermería" },
    { start: 60, end: 80, name: "Bahía de escape" }
  ];

  for (const sector of sectors) {
    const middle = (sector.start + sector.end) / 2;

    // Estructura principal: cast + receive (sí importa para la linterna)
    box(0, -.25, middle, 14, .5, 20, materials.floor);
    box(0, 5.3, middle, 14, .6, 20, materials.dark);
    box(-7.25, 2.5, middle, .5, 5, 20, materials.wall, true);
    box(7.25, 2.5, middle, .5, 5, 20, materials.wall, true);

    // Decoración fina: sin cast (no aporta y encarece el shadow map)
    for (let z = sector.start + 2; z < sector.end; z += 4) {
      box(-6.88, 2.5, z, .22, 5, .3, materials.trim, false, { cast: false });
      box(6.88, 2.5, z, .22, 5, .3, materials.trim, false, { cast: false });
      box(0, .008, z, 13.9, .016, .045, materials.trim, false, { cast: false });
      box(-6.7, 4.1, z, .25, .25, 4, materials.pipe, false, { cast: false });
      box(6.7, 3.8, z, .18, .18, 4, materials.pipe, false, { cast: false });
    }

    label(sector.name.toUpperCase(), 0, 4.1, sector.start + 3);

    // --- Ajuste 5: registrar luz roja con su z ---
    const red = new T.PointLight(0xff3427, 15, 15, 2);
    red.position.set(-4, 4.2, middle);
    scene.add(red);
    emergencyLights.push({ light: red, z: middle });
    box(-4, 4.55, middle, .8, .14, .4,
        mat(0x9a241d, { emissive: 0xff261b, emissiveIntensity: 2 }),
        false, { cast: false });

    // --- Ajuste 5: registrar luz azul con su z ---
    const blue = new T.PointLight(0x5799b5, 9, 11, 2);
    blue.position.set(5, 2.5, middle + 4);
    scene.add(blue);
    ambientLights.push({ light: blue, z: middle + 4, base: 9 });
    box(6.8, 2.5, middle + 4, .12, 1.1, 1.8, materials.screen,
        false, { cast: false });
  }

  box(0, 2.5, -.25, 14, 5, .5, materials.wall, true);
  box(0, 2.5, 80.25, 14, 5, .5, materials.wall, true);

  // ---------------------------------------------------------------
  // 7. Interactuables y puertas
  // ---------------------------------------------------------------
  function addInteraction(mesh, title, action, radius = 2.1) {
    const item = { mesh, title, action, radius, active: true };
    interactables.push(item);
    return item;
  }

  function toast(message) {
    $("toast").textContent = message;
    state.toastTime = 4;
  }

  const objectives = [
    "Encuentra la tarjeta de acceso en el Pasillo A.",
    "Abre el Comedor y recupera el fusible de emergencia.",
    "Lleva el fusible al panel de la Enfermería.",
    "Alcanza la Bahía de escape y activa la salida."
  ];

  function advance(stage) {
    state.stage = Math.max(state.stage, stage);
    $("objective").textContent = objectives[state.stage];
  }

  function createDoor(z, requirement, denied) {
    box(-4.7, 2.5, z, 4.6, 5, .6, materials.wall, true);
    box(4.7, 2.5, z, 4.6, 5, .6, materials.wall, true);
    box(0, 4.65, z, 4.8, .7, .7, materials.trim, false, { cast: false });

    const mesh = box(0, 2.05, z, 4.8, 4.1, .45, materials.trim, true);
    const collider = solids[solids.length - 1];
    const door = { mesh, collider, open: false };
    doors.push(door);

    const item = addInteraction(mesh, "E / Abrir compuerta", () => {
      if (!requirement()) return toast(denied);
      door.open = true;
      item.active = false;
      const idx = solids.indexOf(collider);
      if (idx >= 0) solids.splice(idx, 1);
      const mIdx = solidMeshes.indexOf(collider.mesh);
      if (mIdx >= 0) solidMeshes.splice(mIdx, 1);
      mesh.userData.slideFrom = mesh.position.x;
      mesh.userData.slideTo = -6.5;
      mesh.userData.slideT = 0;
      audio.effect("door");
    }, 3);

    box(2.65, 1.6, z - .4, .3, .5, .18, materials.screen,
        false, { cast: false });
  }

  createDoor(20, () => player.card, "La compuerta requiere una tarjeta de acceso.");
  createDoor(40, () => player.fuse, "Recupera el fusible del Comedor antes de continuar.");
  createDoor(60, () => player.power, "Sin energía. Activa el panel de la Enfermería.");

  // ---------------------------------------------------------------
  // 8. Decoración (mayoría con cast:false — piezas finas)
  // ---------------------------------------------------------------
  for (const z of [6, 13, 25, 34, 46, 56, 65, 73]) {
    const side = z % 2 ? -1 : 1;
    box(side * 5.4, .65, z, 1.7, 1.3, 1.5, materials.crate, true);
    box(side * 5.4, 1.33, z, 1.8, .08, 1.6, materials.trim,
        false, { cast: false });
  }

  for (const z of [7, 11, 15]) {
    box(-5.6, .75, z, 2, .3, 2.6, materials.trim, true);
    box(-5.6, 1, z, 1.8, .22, 2.3, humanoidMats.bedTop, false, { cast: false });
  }

  for (const x of [-3.7, 3.7]) {
    for (const z of [27, 33]) {
      box(x, .65, z, 2.2, 1.3, 2.4, materials.dark, true);
      box(x, 1.35, z, 2.7, .15, 2.8, materials.trim, false, { cast: false });
      box(x, .42, z + 2, 2.3, .84, .5, materials.crate, true);
    }
  }

  for (const z of [45, 51, 56]) {
    box(-4.6, .65, z, 2.2, 1.3, 2.7, materials.trim, true);
    box(-4.6, 1.4, z, 2, .25, 2.5, humanoidMats.bed, false, { cast: false });
  }

  // Manchas y cristales: no proyectan sombra (piezas de 2 cm)
  for (let i = 0; i < 28; i++) {
    const z = 8 + i * 2.4;
    const x = Math.sin(i * 8.3) * 5;
    const stain = box(x, .015, z, .6 + (i % 3) * .25, .02, .45,
        materials.blood, false, { cast: false, receive: false });
    stain.rotation.y = i * 2.1;
    if (i % 3 === 0) {
      const shard = box(x + .6, .04, z, .24, .07, .4, materials.trim,
          false, { cast: false, receive: false });
      shard.rotation.y = i;
    }
  }

  // ---------------------------------------------------------------
  // 9. Modelo humanoide modular (materiales compartidos)
  // ---------------------------------------------------------------
  function humanoid(infected = false) {
    const root = new T.Group();
    const body = new T.Group();
    root.add(body);

    const cloth = infected ? humanoidMats.clothInfected : humanoidMats.clothAlive;
    const skin  = infected ? humanoidMats.skinInfected  : humanoidMats.skinAlive;
    const legsMaterial = infected ? humanoidMats.legsInfected : humanoidMats.legsAlive;

    // opts.cast por defecto true en piezas principales; false en detalles
    function part(w, h, d, material, x, y, z, parent = body, opts = {}) {
      const mesh = new T.Mesh(boxGeo(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = opts.cast !== false;
      mesh.receiveShadow = opts.receive !== false;
      parent.add(mesh);
      return mesh;
    }

    part(.72, .8, .4, cloth, 0, 1.13, 0);
    part(.48, .48, .45, skin, 0, 1.82, 0);
    part(.36, .13, .04, materials.dark, 0, 1.87, .245,
        body, { cast: false, receive: false });   // visor
    if (!infected) {
      part(.48, .57, .24, legsMaterial, 0, 1.2, -.3); // mochila
      part(.16, .09, .035, materials.screen, .2, 1.3, .225,
          body, { cast: false, receive: false });     // insignia
    }

    const limbs = [];
    for (const side of [-1, 1]) {
      const arm = new T.Group();
      arm.position.set(side * .53, 1.47, 0);
      body.add(arm);
      part(.27, .72, .3, cloth, 0, -.32, 0, arm);
      limbs.push(arm);
    }
    for (const side of [-1, 1]) {
      const leg = new T.Group();
      leg.position.set(side * .21, .75, 0);
      body.add(leg);
      part(.3, .75, .35, legsMaterial, 0, -.375, 0, leg);
      limbs.push(leg);
    }

    scene.add(root);
    return { root, body, limbs };
  }

  const avatar = humanoid();
  avatar.root.position.copy(player.pos);

  for (const [x, z] of [[3, 12], [-5.5, 36], [4.7, 53]]) {
    const corpse = humanoid(true);
    corpse.root.position.set(x, .25, z);
    corpse.root.rotation.z = Math.PI / 2;
    corpse.root.rotation.y = z;
  }

  // ---------------------------------------------------------------
  // 10. Objetos recogibles
  // ---------------------------------------------------------------
  function collectible(x, z, color, title, callback) {
    const mesh = box(x, .9, z, .4, .25, .35, mat(color, {
      emissive: color, emissiveIntensity: .7
    }));
    const glow = new T.PointLight(color, 1.5, 3);
    glow.position.set(x, 1.1, z);
    scene.add(glow);
    const item = addInteraction(mesh, `E / ${title}`, () => {
      if (callback() === false) return;
      item.active = false;
      mesh.visible = false;
      glow.visible = false;
      audio.effect("pickup");
    });
  }

  collectible(3.2, 10, 0x62c3d3, "Recoger tarjeta de acceso", () => {
    player.card = true;
    advance(1);
    toast("Tarjeta del oficial de carga recuperada. El Comedor está al norte.");
  });

  collectible(-5.6, 30, 0xe5b466, "Recoger fusible", () => {
    player.fuse = true;
    advance(2);
    toast("Fusible recuperado. Busca el panel azul en la Enfermería.");
  });

  for (const [x, z] of [[4, 17], [5.5, 37], [4.5, 55], [-4, 71]]) {
    collectible(x, z, 0xd7ad59, "Recoger celda de batería", () => {
      player.cells++;
      toast("Celda de batería añadida. Pulsa R para recargar.");
    });
  }

  for (const [x, z] of [[-3, 18], [4.7, 46], [-4, 67]]) {
    collectible(x, z, 0x77c798, "Usar botiquín", () => {
      if (player.hp >= 100) {
        toast("Tu integridad ya está al máximo.");
        return false;
      }
      player.hp = Math.min(100, player.hp + 45);
      toast("Integridad restaurada.");
    });
  }

  // ---------------------------------------------------------------
  // 11. Panel de energía y panel de evacuación
  // ---------------------------------------------------------------
  const panel = box(5.8, 1.4, 52, .65, 1.4, 1.1, materials.screen, true);
  const powerInteraction = addInteraction(
    panel,
    "E / Instalar fusible y restablecer energía",
    () => {
      if (!player.fuse) return toast("Necesitas un fusible de emergencia.");
      player.power = true;
      powerInteraction.active = false;
      advance(3);
      audio.effect("door");
      toast("Energía auxiliar activa. Acceso a la Bahía habilitado.");
    },
    2.5
  );

  box(0, 2, 79.7, 4.5, 4, .25, materials.trim, false, { cast: false });
  const exitPanel = box(3, 1.4, 77, .6, 1.2, .6, materials.screen, true);
  addInteraction(
    exitPanel,
    "E / Iniciar evacuación",
    () => {
      if (!player.power) return toast("La bahía no tiene energía.");
      startEnding();
    },
    2.6
  );
  label("EVACUACIÓN / 01", 0, 4.3, 78, "#8cc5b7");

  // ---------------------------------------------------------------
  // 12. Colisiones y visibilidad
  // ---------------------------------------------------------------
  function blocked(x, z, radius) {
    return solids.some(s =>
      x + radius > s.minX && x - radius < s.maxX &&
      z + radius > s.minZ && z - radius < s.maxZ
    );
  }

  function move(pos, dx, dz, radius = .37) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .15));
    for (let i = 0; i < steps; i++) {
      if (!blocked(pos.x + dx / steps, pos.z, radius)) pos.x += dx / steps;
      if (!blocked(pos.x, pos.z + dz / steps, radius)) pos.z += dz / steps;
    }
  }

  // --- Ajuste 9: corte por distancia antes de tocar el raycaster ---
  const VIS_RANGE = 18;
  const VIS_RANGE_SQ = VIS_RANGE * VIS_RANGE;
  function visibleBetween(from, to) {
    if (from.distanceToSquared(to) > VIS_RANGE_SQ) return false;
    _tmpA.copy(to).sub(from);
    const distance = _tmpA.length();
    if (distance < .01) return true;
    _tmpA.multiplyScalar(1 / distance);
    raycaster.set(from, _tmpA);
    raycaster.near = 0;
    raycaster.far = distance;
    return raycaster.intersectObjects(solidMeshes, false).length === 0;
  }

  // ---------------------------------------------------------------
  // 13. Linterna (sombra 512, refresco cada 3 frames)
  // ---------------------------------------------------------------
  const flashlight = new T.SpotLight(0xffdfac, 65, 23, .37, .65, 1.2);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(512, 512);
  flashlight.shadow.bias = -.0005;
  flashlight.shadow.autoUpdate = false;
  flashlight.shadow.needsUpdate = true;
  scene.add(flashlight, flashlight.target);

  const beamGeometry = new T.ConeGeometry(1.8, 7, 24, 1, true);
  beamGeometry.translate(0, -3.5, 0);
  beamGeometry.rotateX(-Math.PI / 2);
  const beam = new T.Mesh(beamGeometry, new T.MeshBasicMaterial({
    color: 0xffdb9a, transparent: true, opacity: .025,
    side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending
  }));
  scene.add(beam);

  // ---------------------------------------------------------------
  // 14. Enemigos infectados
  // ---------------------------------------------------------------
  function spawnEnemy(x, z, minZ, maxZ) {
    const model = humanoid(true);
    model.root.position.set(x, 0, z);
    enemies.push({
      ...model, pos: model.root.position,
      minZ, maxZ, direction: 1, memory: 0,
      target: new T.Vector3(x, 0, z),
      cooldown: 0, phase: Math.random() * 6
    });
  }

  spawnEnemy(1.5, 29, 23, 37);
  spawnEnemy(-1.5, 49, 43, 57);
  spawnEnemy(1.7, 70, 63, 76);

  // ---------------------------------------------------------------
  // 15. Animación del modelo modular
  // ---------------------------------------------------------------
  function animateModel(model, moving, running, crouched, phase) {
    model.body.position.y = crouched ? -.45 :
      Math.sin(phase * (moving ? 2 : .6)) * (moving ? .035 : .018);
    model.body.rotation.x = crouched ? .23 : running ? .1 : 0;

    const swing = moving
      ? Math.sin(phase) * (running ? .8 : .45)
      : .035 * Math.sin(phase);

    model.limbs[0].rotation.x = swing;
    model.limbs[1].rotation.x = -swing;
    model.limbs[2].rotation.x = -swing;
    model.limbs[3].rotation.x = swing;
  }

  // ---------------------------------------------------------------
  // 16. Actualización del jugador
  // ---------------------------------------------------------------
  function updatePlayer(dt) {
    player.crouched = keys.has("ControlLeft") || keys.has("ControlRight");

    let forward = Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown"));
    let side = Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft"));

    const length = Math.hypot(forward, side);
    player.moving = length > 0;
    if (length) { forward /= length; side /= length; }

    if (player.stamina <= 1) player.exhausted = true;
    if (player.stamina > 30) player.exhausted = false;
    player.running = player.moving && !player.crouched &&
      !player.exhausted && (keys.has("ShiftLeft") || keys.has("ShiftRight"));

    const speed = player.crouched ? 1.5 : player.running ? 5 : 2.9;
    player.stamina = T.MathUtils.clamp(
      player.stamina + (player.running ? -26 : 16) * dt, 0, 100
    );

    const dx = (Math.sin(yaw) * forward - Math.cos(yaw) * side) * speed * dt;
    const dz = (Math.cos(yaw) * forward + Math.sin(yaw) * side) * speed * dt;
    move(player.pos, dx, dz);

    avatar.root.position.copy(player.pos);
    const angularDifference = Math.atan2(
      Math.sin(yaw - avatar.root.rotation.y),
      Math.cos(yaw - avatar.root.rotation.y)
    );
    avatar.root.rotation.y += angularDifference * (1 - Math.exp(-12 * dt));

    animateModel(
      avatar, player.moving, player.running, player.crouched,
      state.time * (player.running ? 13 : player.crouched ? 5 : 8)
    );

    if (player.flashlight) {
      player.battery = Math.max(0, player.battery - .52 * dt);
      if (player.battery === 0) {
        player.flashlight = false;
        toast("Batería agotada. Pulsa R si tienes una celda.");
      }
    }
  }

  // ---------------------------------------------------------------
  // 17. Actualización de la linterna (refresco de sombra cada 3 frames)
  // ---------------------------------------------------------------
  function updateLight() {
    const forward = _tmpB.set(
      Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );
    const rightX = -Math.cos(yaw);
    const rightZ = Math.sin(yaw);

    flashlight.position.copy(player.pos);
    flashlight.position.y += player.crouched ? 1 : 1.5;
    flashlight.position.x += rightX * .4;
    flashlight.position.z += rightZ * .4;

    flashlight.target.position.copy(flashlight.position).addScaledVector(forward, 12);

    flashlight.visible = player.flashlight;
    flashlight.intensity = player.battery < 15
      ? 40 + Math.sin(state.time * 29) * 16
      : 65;

    // --- Ajuste 4: sombra de la linterna a ~20 Hz ---
    if (player.flashlight) {
      state.shadowFrame = (state.shadowFrame + 1) % 3;
      if (state.shadowFrame === 0) flashlight.shadow.needsUpdate = true;
    }

    beam.visible = player.flashlight;
    beam.position.copy(flashlight.position);
    beam.lookAt(flashlight.target.position);
  }

  // ---------------------------------------------------------------
  // 18. Cámara en tercera persona
  // ---------------------------------------------------------------
  function updateCamera(dt) {
    const forward = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new T.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));

    const pivot = player.pos.clone().add(
      new T.Vector3(0, player.crouched ? 1 : 1.6, 0)
    );

    const desired = pivot.clone()
      .addScaledVector(forward, -zoom * Math.cos(pitch))
      .addScaledVector(right, .65)
      .add(new T.Vector3(0, .45 + Math.sin(pitch) * zoom, 0));

    camera.position.lerp(desired, 1 - Math.exp(-10 * dt));

    const direction = camera.position.clone().sub(pivot);
    const distance = direction.length();
    raycaster.set(pivot, direction.normalize());
    raycaster.near = 0;
    raycaster.far = distance + .18;
    const hits = raycaster.intersectObjects(solidMeshes, false);
    if (hits.length) {
      camera.position.copy(pivot).addScaledVector(
        direction, Math.max(.12, hits[0].distance - .2)
      );
    }

    camera.position.y = T.MathUtils.clamp(camera.position.y, .25, 4.8);
    camera.lookAt(
      pivot.clone()
        .addScaledVector(forward, 7)
        .add(new T.Vector3(0, -Math.sin(pitch) * 7, 0))
    );

    avatar.root.visible = camera.position.distanceTo(pivot) > .65;
  }

  // ---------------------------------------------------------------
  // 19. IA de los infectados
  // ---------------------------------------------------------------
  function updateEnemies(dt) {
    let nearest = 100;

    for (const enemy of enemies) {
      const distance = enemy.pos.distanceTo(player.pos);
      nearest = Math.min(nearest, distance);
      enemy.cooldown -= dt;

      const eye = enemy.pos.clone().add(new T.Vector3(0, 1.5, 0));
      const targetEye = player.pos.clone().add(new T.Vector3(0, 1.2, 0));
      // --- Ajuste 9: visibleBetween ya corta a 18 m internamente ---
      const clear = visibleBetween(eye, targetEye);

      const noiseRange = player.running ? 11
        : player.moving ? (player.crouched ? 1.4 : 4.5) : 0;
      const sightRange = player.flashlight ? 14
        : player.crouched ? 2.2 : 4.2;

      if (clear && (distance < sightRange || distance < noiseRange)) {
        enemy.memory = 5;
        enemy.target.copy(player.pos);
      } else {
        enemy.memory = Math.max(0, enemy.memory - dt);
      }

      if (enemy.memory <= 0) {
        enemy.target.set(
          1.2 * Math.sin(enemy.phase),
          0,
          enemy.direction > 0 ? enemy.maxZ : enemy.minZ
        );
        if (enemy.pos.distanceTo(enemy.target) < .7) enemy.direction *= -1;
      }

      const direction = enemy.target.clone().sub(enemy.pos);
      const moving = direction.length() > .35;
      if (moving) {
        direction.normalize();
        const speed = enemy.memory > 0 ? 2.05 : .85;
        const old = enemy.pos.clone();
        move(enemy.pos, direction.x * speed * dt, direction.z * speed * dt, .4);

        if (old.distanceTo(enemy.pos) < speed * dt * .2) {
          move(enemy.pos,
            -direction.z * speed * dt,
            direction.x * speed * dt, .4);
        }
        enemy.root.rotation.y = Math.atan2(direction.x, direction.z);
      }

      animateModel(enemy, moving, false, false, state.time * 7 + enemy.phase);
      enemy.body.rotation.z = Math.sin(state.time * 4 + enemy.phase) * .075;

      if (distance < 1.2 && clear && enemy.cooldown <= 0) {
        enemy.cooldown = 1.2;
        player.hp = Math.max(0, player.hp - 24);
        state.damage = 1;
        audio.effect("hit");
        if (player.hp === 0) {
          die();
          return 1;
        }
      }
    }

    return Math.max(0, 1 - nearest / 15);
  }

  // ---------------------------------------------------------------
  // 20. Detección de interactuable bajo la mirada
  // ---------------------------------------------------------------
  function updateInteraction() {
    selected = null;
    let nearest = Infinity;
    const eye = player.pos.clone().add(new T.Vector3(0, 1.25, 0));

    for (const item of interactables) {
      if (!item.active) continue;
      const p = item.mesh.position;
      const distance = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
      if (distance > item.radius || distance >= nearest) continue;

      const target = p.clone();
      const direction = target.clone().sub(eye);
      raycaster.set(eye, direction.clone().normalize());
      raycaster.near = 0;
      raycaster.far = direction.length();
      const hits = raycaster.intersectObjects(solidMeshes, false);
      if (hits.length && hits[0].object !== item.mesh) continue;

      selected = item;
      nearest = distance;
    }

    $("interaction").style.display = selected ? "block" : "none";
    $("interaction").textContent = selected ? selected.title : "";
  }

  // ---------------------------------------------------------------
  // 21. HUD
  // ---------------------------------------------------------------
  function updateHUD(dt, proximity) {
    const sector = sectors.find(s =>
      player.pos.z >= s.start && player.pos.z < s.end
    );
    $("sector").textContent = sector ? sector.name : "Bahía de escape";

    $("hp").value = player.hp;
    $("hpText").textContent = Math.ceil(player.hp);
    $("stamina").value = player.stamina;
    $("battery").value = player.battery;
    $("batteryText").textContent =
      `${Math.ceil(player.battery)}% / ${player.flashlight ? "ON" : "OFF"}`;
    $("inventory").textContent =
      `Celdas: ${player.cells}` +
      (player.card ? " · Tarjeta" : "") +
      (player.fuse ? " · Fusible" : "");

    $("threat").style.opacity = proximity > .35 ? 1 : 0;

    state.toastTime = Math.max(0, state.toastTime - dt);
    $("toast").style.opacity = state.toastTime > 0 ? 1 : 0;

    state.damage = Math.max(0, state.damage - dt * 1.6);
    $("damage").style.opacity = state.damage * .8;

    document.body.classList.toggle("exhausted", player.stamina < 25);
  }

  // ---------------------------------------------------------------
  // 22. Pausa, muerte, final y reinicio
  // ---------------------------------------------------------------
  function isPlayable() {
    return !state.paused && !state.ending && !state.dead && !state.finished;
  }

  function pause() {
    if (state.paused || state.dead || state.finished || state.ending) return;
    state.paused = true;
    keys.clear();
    selected = null;
    $("interaction").style.display = "none";
    $("overlayTitle").textContent = "Pausa";
    $("overlayText").textContent =
      "La nave espera. Reanuda cuando estés listo.";
    $("resume").hidden = false;
    $("resume").textContent = "Continuar";
    $("restart").hidden = true;
    $("overlay").hidden = false;
    audio.suspend();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function resumeGame() {
    if (state.dead || state.finished || state.ending) return;
    state.paused = false;
    $("overlay").hidden = true;
    clock.getDelta();
    audio.start();
    flashlight.shadow.needsUpdate = true;
    if (renderer.domElement.requestPointerLock) {
      const p = renderer.domElement.requestPointerLock();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  }

  function die() {
    if (state.dead) return;
    state.dead = true;
    keys.clear();
    selected = null;
    $("interaction").style.display = "none";
    $("overlayTitle").textContent = "Has caído";
    $("overlayText").textContent =
      "El virus reclama otro cuerpo en la Kepler-9. Vuelve a intentarlo.";
    $("resume").hidden = true;
    $("restart").hidden = false;
    $("overlay").hidden = false;
    audio.suspend();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function startEnding() {
    if (state.ending || state.finished) return;
    state.ending = true;
    state.endTime = 0;
    keys.clear();
    selected = null;
    $("interaction").style.display = "none";
    $("threat").style.opacity = 0;
    audio.effect("door");
  }

  // ---------------------------------------------------------------
  // 23. Entradas
  // ---------------------------------------------------------------
  addEventListener("keydown", e => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]
        .includes(e.code)) e.preventDefault();

    if (e.code === "Escape") {
      if (isPlayable()) pause();
      return;
    }

    if (!isPlayable()) return;
    keys.add(e.code);

    if (e.code === "KeyE" && selected) selected.action();
    if (e.code === "KeyF") toggleFlashlight();
    if (e.code === "KeyR") reloadBattery();
  });

  addEventListener("keyup", e => keys.delete(e.code));

  addEventListener("mousemove", e => {
    if (!isPlayable()) return;
    if (document.pointerLockElement !== renderer.domElement) return;
    const s = settings.sensitivity * .0022;
    yaw -= e.movementX * s;
    pitch = T.MathUtils.clamp(pitch + e.movementY * s, -.85, .85);
  });

  addEventListener("wheel", e => {
    if (!isPlayable()) return;
    zoom = T.MathUtils.clamp(zoom + e.deltaY * .002, 2, 6);
  }, { passive: true });

  addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    applyPixelRatio();
    renderer.setSize(innerWidth, innerHeight);
  });

  renderer.domElement.addEventListener("click", () => {
    if (isPlayable() && document.pointerLockElement !== renderer.domElement) {
      const p = renderer.domElement.requestPointerLock?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  });

  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement !== renderer.domElement) {
      if (isPlayable()) pause();
    }
  });

  // ---------------------------------------------------------------
  // 24. Acciones rápidas
  // ---------------------------------------------------------------
  function toggleFlashlight() {
    if (!player.flashlight && player.battery <= 0) {
      toast("Batería agotada. Recarga con R.");
      return;
    }
    player.flashlight = !player.flashlight;
    audio.effect("switch");
  }

  function reloadBattery() {
    if (player.battery > 80) {
      toast("La batería ya está cargada.");
      return;
    }
    if (player.cells <= 0) {
      toast("No tienes celdas de repuesto.");
      return;
    }
    player.cells--;
    player.battery = 100;
    audio.effect("switch");
    toast("Batería recargada.");
  }

  // ---------------------------------------------------------------
  // 25. Botones del menú interno
  // ---------------------------------------------------------------
  $("resume").addEventListener("click", resumeGame);
  $("restart").addEventListener("click", () => location.reload());

  // ---------------------------------------------------------------
  // 26. Bucle principal
  // ---------------------------------------------------------------
  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(.05, clock.getDelta());

    if (state.paused) {
      renderer.render(scene, camera);
      return;
    }

    state.time += dt;

    if (state.ending) {
      state.endTime += dt;
      const alpha = Math.min(1, state.endTime * .55);
      $("damage").style.background =
        `radial-gradient(ellipse, rgba(250,235,205,${alpha * .9}), rgba(0,0,0,${alpha}))`;
      $("damage").style.opacity = 1;

      zoom = Math.min(6, zoom + dt * .4);
      updateLight();
      updateCamera(dt);

      if (state.endTime > 3 && !state.finished) {
        state.finished = true;
        $("overlayTitle").textContent = "Capítulo 1 completado";
        $("overlayText").textContent =
          "Lograste abrir la compuerta de evacuación... pero algo " +
          "te observa desde las sombras. El Capítulo 2 te espera.";
        $("resume").hidden = true;
        $("restart").hidden = false;
        $("overlay").hidden = false;
        if (document.pointerLockElement) document.exitPointerLock();
      }

      renderer.render(scene, camera);
      return;
    }

    updatePlayer(dt);
    updateLight();
    updateCamera(dt);

    const proximity = updateEnemies(dt);

    if (state.dead) {
      renderer.render(scene, camera);
      return;
    }

    updateInteraction();
    updateHUD(dt, proximity);

    // --- Ajuste 5: activar/desactivar luces según distancia al jugador ---
    const pz = player.pos.z;
    for (const entry of emergencyLights) {
      const near = Math.abs(pz - entry.z) < 25;
      entry.light.visible = near;
      if (near) entry.light.intensity =
        15 + Math.sin(state.time * 7 + entry.z) * 6;
    }
    for (const entry of ambientLights) {
      const near = Math.abs(pz - entry.z) < 25;
      entry.light.visible = near;
      if (near) entry.light.intensity = entry.base;
    }

    for (const door of doors) {
      if (!door.open || door.mesh.userData.slideT === undefined) continue;
      door.mesh.userData.slideT = Math.min(
        1, door.mesh.userData.slideT + dt * 1.8
      );
      const t = door.mesh.userData.slideT;
      const ease = 1 - Math.pow(1 - t, 3);
      door.mesh.position.x = door.mesh.userData.slideFrom +
        (door.mesh.userData.slideTo - door.mesh.userData.slideFrom) * ease;
    }

    audio.update(dt, player, proximity);

    renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------
  // 27. Arranque
  // ---------------------------------------------------------------
  $("overlayTitle").textContent = "Protocolo Eclipse";
  $("overlayText").textContent =
    "Despiertas en el Pasillo A. Recupera una tarjeta, restablece " +
    "la energía y llega a la bahía. La luz y el ruido atraen a los infectados.";
  $("resume").hidden = false;
  $("resume").textContent = "Entrar en la nave";
  $("restart").hidden = true;

  animate();
})();
