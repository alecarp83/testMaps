import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import JSZip from 'https://esm.sh/jszip@3.10.1';

/* ================= CÓDIGO COMPARTIDO (se copia tal cual al export) ================= */

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
  }
  g.position.set(o.x, o.y || 0, o.z); g.rotation.y = o.r || 0;
  return g;
}

/* ================= EDITOR ================= */

const DEFAULTS = {
  tree:   { color: '#2e8b3d', w: 1.5, h: 3,   d: 1.5, y: 0, col: true },
  box:    { color: '#b5853f', w: 1,   h: 1,   d: 1,   y: 0, col: true },
  wall:   { color: '#c9c2b8', w: 4,   h: 2.5, d: 0.2, y: 0, col: true },
  ball:   { color: '#e63946', w: 0.6, h: 0.6, d: 0.6, y: 0, col: true },
  window: { color: '#8ecae6', w: 1.2, h: 1,   d: 0.1, y: 1, col: true },
  door:   { color: '#7a4a24', w: 1,   h: 2.1, d: 0.1, y: 0, col: true },
};
const NAMES = { tree: '🌳 Árbol', box: '📦 Caja', wall: '🧱 Pared', ball: '⚽ Pelota', window: '🪟 Ventana', door: '🚪 Puerta' };

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const r3 = v => Math.round(v * 1000) / 1000;

const view = $('#view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc7e8');
const camera = new THREE.PerspectiveCamera(55, 1, .1, 1000);
camera.position.set(14, 14, 14);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI / 2.05;
orbit.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

scene.add(new THREE.HemisphereLight('#ffffff', '#556655', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 2);
sun.position.set(20, 30, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

/* ---- Estado ---- */
function load() { try { return JSON.parse(localStorage.getItem('mapEditor3d')); } catch { return null; } }
function save() { localStorage.setItem('mapEditor3d', JSON.stringify(state)); }
const state = load() || { name: 'map1', floor: 'grass', size: 40, objects: [] };
let nextId = state.objects.reduce((m, o) => Math.max(m, o.id), 0) + 1;
let snapOn = true;
const snapV = v => snapOn ? Math.round(v * 2) / 2 : r3(v);

/* ---- Suelo ---- */
let floor, grid;
function setFloor() {
  if (floor) {
    scene.remove(floor, grid);
    floor.material.map.dispose(); floor.material.dispose(); floor.geometry.dispose();
    grid.geometry.dispose();
  }
  const t = floorTexture(THREE, state.floor);
  t.repeat.set(state.size / 4, state.size / 4);
  floor = new THREE.Mesh(new THREE.PlaneGeometry(state.size, state.size), new THREE.MeshStandardMaterial({ map: t }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  grid = new THREE.GridHelper(state.size, state.size * 2, 0x000000, 0x000000);
  grid.material.transparent = true; grid.material.opacity = .12; grid.position.y = .005;
  scene.add(floor, grid);
  const s = state.size / 2;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, far: state.size * 3 + 60 });
  sun.shadow.camera.updateProjectionMatrix();
}

/* ---- Objetos ---- */
const cache = { g: {}, m: {} };
const groups = new Map();

function spawn(o) {
  const g = buildObject(THREE, o, cache);
  g.userData.id = o.id; scene.add(g); groups.set(o.id, g); return g;
}
function rebuild(o) {
  const old = groups.get(o.id), wasAttached = tc.object === old;
  if (wasAttached) tc.detach();
  scene.remove(old);
  const g = spawn(o);
  if (wasAttached) tc.attach(g);
}
function addObject(type, base) {
  const h = state.size / 2, t = orbit.target;
  const o = Object.assign({ id: nextId++, type, r: 0 }, DEFAULTS[type], base || {},
    { x: clamp(snapV(base ? base.x + 1 : t.x), -h, h), z: clamp(snapV(base ? base.z + 1 : t.z), -h, h) });
  if (base) o.id = nextId - 1;
  state.objects.push(o); spawn(o); select(o); save();
}
function removeSelected() {
  if (!sel) return;
  tc.detach(); scene.remove(groups.get(sel.id)); groups.delete(sel.id);
  state.objects = state.objects.filter(o => o !== sel);
  select(null); save();
}

/* ---- Gizmo ---- */
const tc = new TransformControls(camera, renderer.domElement);
scene.add(tc.getHelper());
tc.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (!e.value) save(); });
tc.addEventListener('objectChange', () => {
  if (!sel) return;
  const g = tc.object, h = state.size / 2;
  sel.x = clamp(r3(g.position.x), -h, h); sel.z = clamp(r3(g.position.z), -h, h);
  sel.r = r3(g.rotation.y);
  g.position.set(sel.x, sel.y || 0, sel.z);
  fillProps();
});
function setMode(m) {
  tc.setMode(m);
  tc.showX = tc.showZ = m === 'translate';
  tc.showY = m === 'rotate';
  $('#modeT').classList.toggle('on', m === 'translate');
  $('#modeR').classList.toggle('on', m === 'rotate');
}
function applySnap() {
  tc.setTranslationSnap(snapOn ? .5 : null);
  tc.setRotationSnap(snapOn ? THREE.MathUtils.degToRad(15) : null);
  $('#snap').checked = snapOn;
}

/* ---- Selección y propiedades ---- */
let sel = null;
const inputs = [...document.querySelectorAll('#props [data-k]')];
function select(o) {
  sel = o;
  if (o) { tc.attach(groups.get(o.id)); fillProps(); } else tc.detach();
  $('#props').hidden = !o;
}
function fillProps() {
  if (!sel) return;
  $('#pType').textContent = NAMES[sel.type];
  for (const i of inputs) {
    if (i === document.activeElement) continue;
    const k = i.dataset.k;
    if (i.type === 'checkbox') i.checked = !!sel[k];
    else if (k === 'r') i.value = Math.round(THREE.MathUtils.radToDeg(sel.r));
    else i.value = sel[k];
  }
}
inputs.forEach(i => i.addEventListener('input', () => {
  if (!sel) return;
  const k = i.dataset.k, h = state.size / 2;
  let v = i.type === 'checkbox' ? i.checked : i.type === 'color' ? i.value : parseFloat(i.value);
  if (typeof v === 'number') {
    if (isNaN(v)) return;
    if (k === 'r') v = THREE.MathUtils.degToRad(v);
    if (k === 'w' || k === 'h' || k === 'd') v = Math.max(.05, v);
    if (k === 'x' || k === 'z') v = clamp(v, -h, h);
  }
  sel[k] = v; rebuild(sel); save();
}));

/* ---- Arrastrar sobre el suelo ---- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
let drag = null, downPos = null;

function setRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  downPos = { x: e.clientX, y: e.clientY };
  if (tc.dragging || tc.axis !== null) return;
  setRay(e);
  const hits = ray.intersectObjects([...groups.values()], true);
  if (!hits.length) return;
  let g = hits[0].object;
  while (g.parent && g.userData.id === undefined) g = g.parent;
  const o = state.objects.find(x => x.id === g.userData.id);
  select(o);
  if (ray.ray.intersectPlane(plane, hitP)) {
    drag = { o, g, dx: g.position.x - hitP.x, dz: g.position.z - hitP.z };
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(e.pointerId);
  }
});
renderer.domElement.addEventListener('pointermove', e => {
  if (!drag) return;
  setRay(e);
  if (!ray.ray.intersectPlane(plane, hitP)) return;
  const h = state.size / 2;
  drag.o.x = clamp(snapV(hitP.x + drag.dx), -h, h);
  drag.o.z = clamp(snapV(hitP.z + drag.dz), -h, h);
  drag.g.position.set(drag.o.x, drag.o.y || 0, drag.o.z);
  fillProps();
});
renderer.domElement.addEventListener('pointerup', e => {
  if (drag) { drag = null; orbit.enabled = true; save(); return; }
  if (downPos && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 4 && !tc.dragging && tc.axis === null) {
    setRay(e);
    if (!ray.intersectObjects([...groups.values()], true).length) select(null);
  }
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

/* ---- UI ---- */
for (const t in NAMES) {
  const b = document.createElement('button');
  b.textContent = NAMES[t]; b.onclick = () => addObject(t);
  $('#palette').append(b);
}
$('#modeT').onclick = () => setMode('translate');
$('#modeR').onclick = () => setMode('rotate');
$('#snap').onchange = e => { snapOn = e.target.checked; applySnap(); };
$('#dup').onclick = () => sel && addObject(sel.type, { ...sel });
$('#del').onclick = removeSelected;
$('#clear').onclick = () => {
  if (!confirm('¿Borrar todo el mapa?')) return;
  select(null); groups.forEach(g => scene.remove(g)); groups.clear(); state.objects = []; save();
};
$('#mapName').value = state.name;
$('#floorStyle').value = state.floor;
$('#mapSize').value = state.size;
$('#mapName').oninput = e => { state.name = e.target.value; save(); };
$('#floorStyle').onchange = e => { state.floor = e.target.value; setFloor(); save(); };
$('#mapSize').onchange = e => { state.size = clamp(parseInt(e.target.value) || 40, 10, 200); e.target.value = state.size; setFloor(); save(); };
$('#export').onclick = exportMap;

addEventListener('keydown', e => {
  if (e.target.matches('input, select')) return;
  const k = e.key.toLowerCase();
  if (k === 'w') setMode('translate');
  else if (k === 'e') setMode('rotate');
  else if (k === 'g') { snapOn = !snapOn; applySnap(); }
  else if ((k === 'delete' || k === 'backspace') && sel) removeSelected();
  else if (k === 'd' && (e.ctrlKey || e.metaKey) && sel) { e.preventDefault(); addObject(sel.type, { ...sel }); }
  else if (k === 'escape') select(null);
});

/* ---- Exportación ---- */
async function exportMap() {
  const n = (state.name || 'map1').trim().replace(/[^\w-]/g, '_') || 'map1';
  const data = {
    f: state.floor, s: state.size,
    o: state.objects.map(o => ({
      type: o.type, color: o.color, w: r3(o.w), h: r3(o.h), d: r3(o.d),
      y: r3(o.y || 0), x: r3(o.x), z: r3(o.z), r: r3(o.r || 0), col: o.col ? 1 : 0
    }))
  };

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${n}</title><link rel="stylesheet" href="${n}.css"><script type="importmap">{"imports":{"three":"[cdn.jsdelivr.net](https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js)"}}<\/script></head><body><div id="hint">Clic para jugar · WASD mover · Ratón mirar · Shift correr · Esc salir</div><script type="module" src="${n}.js"><\/script></body></html>`;

  const css = `html,body{margin:0;height:100%;overflow:hidden;background:#000}canvas{display:block}#hint{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);padding:14px 20px;background:rgba(0,0,0,.65);color:#fff;font:15px system-ui,sans-serif;border-radius:8px;pointer-events:none}#hint[hidden]{display:none}`;

  const js = `import * as THREE from 'three';
const M=${JSON.stringify(data)};
${floorTexture.toString()}
${buildObject.toString()}
const R=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
R.setPixelRatio(Math.min(devicePixelRatio,1.5));R.shadowMap.enabled=true;R.shadowMap.autoUpdate=false;R.shadowMap.needsUpdate=true;
document.body.appendChild(R.domElement);
const S=new THREE.Scene();S.background=new THREE.Color('#9fc7e8');S.fog=new THREE.Fog('#9fc7e8',M.s*.6,M.s*1.6);
const cam=new THREE.PerspectiveCamera(70,1,.1,M.s*3);
S.add(new THREE.HemisphereLight('#ffffff','#556655',1.2));
const sun=new THREE.DirectionalLight('#ffffff',2);sun.position.set(20,30,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
const h=M.s/2;Object.assign(sun.shadow.camera,{left:-h,right:h,top:h,bottom:-h,far:M.s*3+60});S.add(sun);
const t=floorTexture(THREE,M.f);t.repeat.set(M.s/4,M.s/4);
const fl=new THREE.Mesh(new THREE.PlaneGeometry(M.s,M.s),new THREE.MeshStandardMaterial({map:t}));
fl.rotation.x=-Math.PI/2;fl.receiveShadow=true;S.add(fl);
const C={g:{},m:{}},boxes=[];
for(const o of M.o){const g=buildObject(THREE,o,C);S.add(g);g.updateMatrixWorld(true);g.traverse(m=>m.matrixAutoUpdate=false);if(o.col)boxes.push(new THREE.Box3().setFromObject(g));}
fl.updateMatrix();fl.matrixAutoUpdate=false;
const PR=.3;
function hit(x,z){if(Math.abs(x)>h-PR||Math.abs(z)>h-PR)return true;for(const b of boxes)if(x>b.min.x-PR&&x<b.max.x+PR&&z>b.min.z-PR&&z<b.max.z+PR&&b.min.y<1.7&&b.max.y>.3)return true;return false;}
const p=new THREE.Vector3(0,1.6,h-1);
for(let z=h-1;z>-h&&hit(p.x,p.z);z-=.5)p.z=z;
let yaw=0,pitch=0;const keys={};
addEventListener('keydown',e=>keys[e.code]=true);addEventListener('keyup',e=>keys[e.code]=false);
R.domElement.addEventListener('click',()=>R.domElement.requestPointerLock());
const hint=document.getElementById('hint');
document.addEventListener('pointerlockchange',()=>hint.hidden=document.pointerLockElement===R.domElement);
addEventListener('mousemove',e=>{if(document.pointerLockElement!==R.domElement)return;yaw-=e.movementX*.002;pitch=Math.max(-1.5,Math.min(1.5,pitch-e.movementY*.002));});
function resize(){R.setSize(innerWidth,innerHeight);cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
const clock=new THREE.Clock();
function loop(){requestAnimationFrame(loop);
const dt=Math.min(clock.getDelta(),.05),sp=(keys.ShiftLeft?8:4)*dt;
const f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0),s=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0);
const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*s)*sp,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*s)*sp;
if(!hit(p.x+dx,p.z))p.x+=dx;if(!hit(p.x,p.z+dz))p.z+=dz;
cam.position.copy(p);cam.rotation.set(pitch,yaw,0,'YXZ');R.render(S,cam);}
loop();
`;

  const zip = new JSZip();
  const dir = zip.folder('maps').folder(n);
  dir.file(`${n}.html`, html);
  dir.file(`${n}.css`, css);
  dir.file(`${n}.js`, js);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${n}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---- Inicio ---- */
setFloor();
state.objects.forEach(spawn);
setMode('translate');
applySnap();

new ResizeObserver(() => {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
}).observe(view);

renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene, camera); });
