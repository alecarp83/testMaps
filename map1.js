import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------
const EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;
const WALK_SPEED = 4;
const RUN_SPEED = 8;
const MOUSE_SENS = 0.002;

// ---------------------------------------------------------------------------
// Utilidades (sin cambios)
// ---------------------------------------------------------------------------
function floorTexture(THREE, style) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const P = {
    grass: ['#4a7c3a', '#5d9447'], sand: ['#d8c48f', '#c2ab70'], stone: ['#8a8a8a', '#666666'],
    wood: ['#9c6b3c', '#6e4826'], snow: ['#f2f5f8', '#d6dee6'], checker: ['#dddddd', '#555555']
  }[style] || ['#777', '#666'];
  x.fillStyle = P[0]; x.fillRect(0, 0, 256, 256); x.fillStyle = P[1]; x.strokeStyle = P[1];
  if (style === 'checker') {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2) x.fillRect(i * 64, j * 64, 64, 64);
  } else if (style === 'wood') {
    for (let i = 0; i < 8; i++) { x.fillRect(0, i * 32, 256, 3); x.fillRect(((i * 97) % 256), i * 32, 3, 32); }
  } else if (style === 'stone') {
    x.lineWidth = 4;
    for (let j = 0; j < 4; j++) for (let i = -1; i < 4; i++) x.strokeRect(i * 64 + (j % 2) * 32, j * 64, 64, 64);
  } else {
    for (let i = 0; i < 1800; i++) x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function buildObject(THREE, o, C) {
  const mat = (c, extra) => {
    const k = c + (extra ? JSON.stringify(extra) : '');
    return C.m[k] || (C.m[k] = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .8 }, extra)));
  };
  const geo = (k, f) => C.g[k] || (C.g[k] = f());
  const box = geo('box', () => new THREE.BoxGeometry(1, 1, 1));
  const g = new THREE.Group();
  const w = o.w, h = o.h, d = o.d;
  const add = (gm, m, sx, sy, sz, px, py, pz) => {
    const me = new THREE.Mesh(gm, m);
    me.scale.set(sx, sy, sz); me.position.set(px, py, pz);
    me.castShadow = me.receiveShadow = true; g.add(me); return me;
  };
  switch (o.type) {
    case 'tree':
      add(geo('cyl', () => new THREE.CylinderGeometry(.5, .5, 1, 8)), mat('#6b4423'), w * .15, h * .4, d * .15, 0, h * .2, 0);
      add(geo('cone', () => new THREE.ConeGeometry(.5, 1, 10)), mat(o.color), w, h * .7, d, 0, h * .65, 0);
      break;
    case 'box': case 'wall':
      add(box, mat(o.color), w, h, d, 0, h / 2, 0);
      break;
    case 'ball':
      add(geo('sph', () => new THREE.SphereGeometry(.5, 24, 16)), mat(o.color), w, h, d, 0, h / 2, 0);
      break;
    case 'window': {
      const f = .08, fm = mat('#eeeeee');
      add(box, mat(o.color, { transparent: true, opacity: .45, roughness: .1 }), w - f * 2, h - f * 2, d * .4, 0, h / 2, 0).castShadow = false;
      add(box, fm, w, f, d, 0, f / 2, 0); add(box, fm, w, f, d, 0, h - f / 2, 0);
      add(box, fm, f, h, d, -w / 2 + f / 2, h / 2, 0); add(box, fm, f, h, d, w / 2 - f / 2, h / 2, 0);
      break;
    }
    case 'door': {
      add(box, mat(o.color), w, h, d, 0, h / 2, 0);
      const kg = geo('knob', () => new THREE.SphereGeometry(.5, 12, 8)), km = mat('#d4af37', { metalness: .8, roughness: .3 });
      add(kg, km, .08, .08, .08, w * .38, h * .48, d / 2 + .03);
      add(kg, km, .08, .08, .08, w * .38, h * .48, -d / 2 - .03);
      break;
    }
    default:
      console.warn('Tipo de objeto desconocido:', o.type);
  }
  g.position.set(o.x, o.y || 0, o.z); g.rotation.y = o.r || 0;
  g.userData.isMapObject = true;
  g.userData.mapId = o.id;
  return g;
}

// ---------------------------------------------------------------------------
// Carga del mapa
// ---------------------------------------------------------------------------
async function loadMap(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Error ${res.status} al cargar ${url}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------
(async () => {
  const hint = document.getElementById('hint');
  let M;
  try {
    M = await loadMap('./map1.json');
  } catch (err) {
    hint.textContent = 'No se pudo cargar el mapa: ' + err.message;
    console.error(err);
    return;
  }

  const R = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  R.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  R.shadowMap.enabled = true;
  R.shadowMap.autoUpdate = false;
  R.shadowMap.needsUpdate = true;
  document.body.appendChild(R.domElement);

  const S = new THREE.Scene();
  S.background = new THREE.Color('#9fc7e8');
  S.fog = new THREE.Fog('#9fc7e8', M.s * .6, M.s * 1.6);

  // Cámara de jugador (primera persona)
  const cam = new THREE.PerspectiveCamera(70, 1, .1, M.s * 3);

  // Cámara de edición (orbit)
  const editCam = new THREE.PerspectiveCamera(60, 1, .1, M.s * 5);
  editCam.position.set(M.s * 0.6, M.s * 0.6, M.s * 0.6);
  editCam.lookAt(0, 0, 0);

  S.add(new THREE.HemisphereLight('#ffffff', '#556655', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2);
  sun.position.set(20, 30, 10); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const h = M.s / 2;
  Object.assign(sun.shadow.camera, { left: -h, right: h, top: h, bottom: -h, far: M.s * 3 + 60 });
  S.add(sun);

  const t = floorTexture(THREE, M.f); t.repeat.set(M.s / 4, M.s / 4);
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(M.s, M.s), new THREE.MeshStandardMaterial({ map: t }));
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true;
  S.add(fl); fl.updateMatrix(); fl.matrixAutoUpdate = false;

  // Construir objetos
  const C = { g: {}, m: {} };
  const boxes = [];
  const mapObjects = []; // lista plana para raycasting

  for (const o of M.o) {
    const g = buildObject(THREE, o, C);
    S.add(g);
    g.updateMatrixWorld(true);
    g.traverse(m => { m.matrixAutoUpdate = false; });
    if (o.col) boxes.push(new THREE.Box3().setFromObject(g));
    mapObjects.push(g);
  }

  // -------------------------------------------------------------------------
  // Colisiones (jugador)
  // -------------------------------------------------------------------------
  function hit(x, z) {
    if (Math.abs(x) > h - PLAYER_RADIUS || Math.abs(z) > h - PLAYER_RADIUS) return true;
    for (const b of boxes) {
      if (x > b.min.x - PLAYER_RADIUS && x < b.max.x + PLAYER_RADIUS &&
          z > b.min.z - PLAYER_RADIUS && z < b.max.z + PLAYER_RADIUS &&
          b.min.y < 1.7 && b.max.y > .3) return true;
    }
    return false;
  }

  const p = new THREE.Vector3(0, EYE_HEIGHT, h - 1);
  for (let z = h - 1; z > -h && hit(p.x, p.z); z -= .5) p.z = z;

  // -------------------------------------------------------------------------
  // Estado jugador
  // -------------------------------------------------------------------------
  let yaw = 0, pitch = 0;
  const keys = {};

  // -------------------------------------------------------------------------
  // Controles de edición
  // -------------------------------------------------------------------------
  const orbit = new OrbitControls(editCam, R.domElement);
  orbit.enableDamping = true;
  orbit.dampingFactor = 0.05;
  orbit.target.set(0, 0, 0);
  orbit.enabled = false;

  const transform = new TransformControls(cam, R.domElement);
  transform.setMode('translate');
  transform.setTranslationSnap(0.5);
  transform.setRotationSnap(Math.PI / 12);
  transform.enabled = false;
  const transformHelper = transform.getHelper();
  S.add(transformHelper);

  // La cámara que usa TransformControls debe ser la del modo activo.
  // En edición la sincronizamos con editCam.
  function syncTransformCamera() {
    transform.camera = editCam;
  }

  // Al arrastrar un gizmo, deshabilitamos la órbita para no pelear
  transform.addEventListener('dragging-changed', (e) => {
    orbit.enabled = !e.value && mode === 'edit';
  });

  // -------------------------------------------------------------------------
  // Modo: 'play' | 'edit'
  // -------------------------------------------------------------------------
  let mode = 'play';
  let selected = null;

  function setMode(newMode) {
    if (newMode === mode) return;
    mode = newMode;

    if (mode === 'edit') {
      if (document.pointerLockElement === R.domElement) document.exitPointerLock();
      for (const k in keys) keys[k] = false;
      orbit.enabled = true;
      transform.enabled = true;
      syncTransformCamera();
      hint.textContent = 'EDITAR · Clic selecciona · G mover · R rotar · S escalar · Tab jugar';
    } else {
      orbit.enabled = false;
      transform.enabled = false;
      transform.detach();
      selected = null;
      hint.textContent = 'Clic para jugar · WASD mover · Ratón mirar · Shift correr · Tab editar';
    }
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') { e.preventDefault(); setMode(mode === 'play' ? 'edit' : 'play'); return; }
    keys[e.code] = true;

    if (mode === 'edit') {
      if (e.key === 'g' || e.key === 'G') transform.setMode('translate');
      if (e.key === 'r' || e.key === 'R') transform.setMode('rotate');
      if (e.key === 's' || e.key === 'S') transform.setMode('scale');
      if (e.key === 'Escape') { transform.detach(); selected = null; }
    }
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  R.domElement.addEventListener('click', () => {
    if (mode === 'play' && document.pointerLockElement !== R.domElement) {
      R.domElement.requestPointerLock();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === R.domElement;
    hint.hidden = locked;
    if (!locked) for (const k in keys) keys[k] = false;
  });

  addEventListener('mousemove', (e) => {
    if (mode !== 'play' || document.pointerLockElement !== R.domElement) return;
    yaw -= e.movementX * MOUSE_SENS;
    pitch = Math.max(-1.5, Math.min(1.5, pitch - e.movementY * MOUSE_SENS));
  });

  // -------------------------------------------------------------------------
  // Selección (raycasting) en modo edición
  // -------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pointerDownPos = null;

  R.domElement.addEventListener('pointerdown', (e) => {
    if (mode !== 'edit' || e.button !== 0) return;
    pointerDownPos = { x: e.clientX, y: e.clientY };
  });

  R.domElement.addEventListener('pointerup', (e) => {
    if (mode !== 'edit' || e.button !== 0 || !pointerDownPos) return;
    const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    pointerDownPos = null;
    if (moved > 4) return; // fue un arrastre (órbita), no un clic

    ndc.x = (e.clientX / innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / innerHeight) * 2 + 1;
    raycaster.setFromCamera(ndc, editCam);

    const hits = raycaster.intersectObjects(mapObjects, true);
    if (hits.length) {
      // subir hasta el Group raíz del objeto del mapa
      let obj = hits[0].object;
      while (obj.parent && !obj.userData.isMapObject) obj = obj.parent;
      if (obj.userData.isMapObject) {
        selected = obj;
        transform.attach(selected);
        hint.textContent = `Seleccionado: ${obj.userData.mapId || '(sin id)'} · G/R/S · Esc deseleccionar`;
      }
    } else {
      transform.detach();
      selected = null;
      hint.textContent = 'EDITAR · Clic selecciona · G mover · R rotar · S escalar · Tab jugar';
    }
  });

  // -------------------------------------------------------------------------
  // Resize
  // -------------------------------------------------------------------------
  function resize() {
    const a = innerWidth / innerHeight;
    cam.aspect = a; cam.updateProjectionMatrix();
    editCam.aspect = a; editCam.updateProjectionMatrix();
    R.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize); resize();

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------
  const clock = new THREE.Clock();
  const locked = () => document.pointerLockElement === R.domElement;

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), .05);

    if (mode === 'play') {
      const sp = (keys.ShiftLeft ? RUN_SPEED : WALK_SPEED) * dt;
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
      const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
      if (locked() || f || s) {
        const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * s) * sp;
        const dz = (-Math.cos(yaw) * f - Math.sin(yaw) * s) * sp;
        if (!hit(p.x + dx, p.z)) p.x += dx;
        if (!hit(p.x, p.z + dz)) p.z += dz;
      }
      cam.position.copy(p);
      cam.rotation.set(pitch, yaw, 0, 'YXZ');
      R.render(S, cam);
    } else {
      orbit.update();
      // TransformControls usa editCam
      syncTransformCamera();
      R.render(S, editCam);
    }
  }

  // Estado inicial
  setMode('play');
  hint.textContent = 'Clic para jugar · WASD mover · Ratón mirar · Shift correr · Tab editar';
  loop();
})();