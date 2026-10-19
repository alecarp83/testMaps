import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import LZString from "lz-string";

/* =========================================================
   Utilidades
   ========================================================= */

const $ = (selector) => document.querySelector(selector);
const clone = (value) => structuredClone(value);
const clamp = THREE.MathUtils.clamp;
const rad = THREE.MathUtils.degToRad;
const STORAGE_KEY = "pce.character.v1";
const MAX_FILE_BYTES = 2_000_000;

const GROUPS = {
  body: "Cuerpo",
  face: "Rostro",
  hair: "Pelo y vello",
  eyes: "Ojos",
  clothing: "Ropa",
  accessories: "Accesorios",
  materials: "Materiales",
  pose: "Pose",
  scene: "Escena"
};

/**
 * Articulaciones editables. Los ángulos se expresan en grados y son OFFSETS
 * sobre la postura base (stance). Convención común para todo el cuerpo:
 *   X = adelante/atrás (flexión), Y = giro sobre el eje del hueso, Z = lateral.
 * `sx` corrige el signo de X para que "positivo" sea flexionar hacia delante
 * (codo, muñeca, hombro) o hacia atrás (rodilla). Y y Z se espejan según el
 * lado: los mismos valores en izquierda y derecha dan una pose simétrica.
 */
const JOINT_CONFIG = {
  waist:    { sx:  1, order: "XZY" },
  neck:     { sx:  1, order: "XZY" },
  shoulder: { sx: -1, order: "XZY" },
  elbow:    { sx: -1, order: "XZY" },
  wrist:    { sx: -1, order: "XZY" },
  knee:     { sx:  1, order: "XZY" }
};

/** Postura base en las mismas unidades que los sliders (grados). */
const STANCES = {
  idle:    { shoulder: { z: 8 },            elbow: { x: 12 }, knee: { x: 2 } },
  relaxed: { shoulder: { z: 12 },           elbow: { x: 10 }, knee: { x: 2.5 } },
  action:  { shoulder: { x: 35, z: 20 },    elbow: { x: 80 }, knee: { x: 10 }, waist: { x: 6 } },
  tpose:   { shoulder: { z: 90 } }
};

/** Parámetros de pose que corresponden a articulaciones (para reset/espejo). */
const JOINT_KEY = /^(waist|neck|shoulder|elbow|wrist|knee)([LR])?([XYZ])$/;

const _euler = new THREE.Euler();
const _qBase = new THREE.Quaternion();
const _qOffset = new THREE.Quaternion();

/** side: +1 izquierda (x > 0), -1 derecha (x < 0), 0 central. */
function jointQuaternion(out, joint, side, x, y, z) {
  const cfg = JOINT_CONFIG[joint];
  const mirror = side || 1;
  _euler.set(rad(x) * cfg.sx, rad(y) * mirror, rad(z) * mirror, cfg.order);
  return out.setFromEuler(_euler);
}

let noticeTimer;

/** Muestra información sin interpretar HTML recibido del usuario. */
function notify(message, duration = 4500) {
  const element = $("#notice");
  clearTimeout(noticeTimer);
  element.textContent = message;
  element.hidden = false;
  noticeTimer = setTimeout(() => { element.hidden = true; }, duration);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeFilename(name) {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 80) || "character";
}

function readStorage(key) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** PRNG Mulberry32. Las decisiones visuales nunca usan Math.random(). */
class PRNG {
  constructor(seed) { this.seed = seed >>> 0; }

  next() {
    let t = this.seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min, max) { return min + (max - min) * this.next(); }
  pick(values) { return values[Math.floor(this.next() * values.length)]; }
}

/* =========================================================
   Contrato y validación
   ========================================================= */

class SchemaLoader {
  /** Carga el contrato. Requiere HTTP(S), no file://. */
  static async load() {
    const response = await fetch("./editor.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`No se pudo cargar editor.json (${response.status}).`);
    const schema = await response.json();

    for (const group of Object.keys(GROUPS)) {
      if (!schema[group] || typeof schema[group] !== "object") {
        throw new Error(`Contrato inválido: falta ${group}.`);
      }
      for (const [key, definition] of Object.entries(schema[group])) {
        if (definition.id !== `${group}.${key}` ||
            definition.group !== group ||
            !["float", "enum", "color", "bool"].includes(definition.type)) {
          throw new Error(`Definición inválida: ${group}.${key}.`);
        }
        SchemaLoader.value(definition, definition.default, false);
      }
    }
    return schema;
  }

  /** Devuelve un documento de personaje con valores simples. */
  static defaults(schema) {
    const now = new Date().toISOString();
    const state = {
      meta: {
        schemaVersion: schema.meta.schemaVersion,
        characterName: schema.meta.characterName,
        createdAt: now,
        modifiedAt: now,
        seed: schema.meta.seed
      }
    };
    for (const group of Object.keys(GROUPS)) {
      state[group] = {};
      for (const [key, definition] of Object.entries(schema[group])) {
        state[group][key] = clone(definition.default);
      }
    }
    return state;
  }

  /** Valida un valor; el clamp solo se permite durante importación. */
  static value(definition, value, allowClamp) {
    if (definition.type === "float") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${definition.label}: se esperaba un número finito.`);
      }
      if (!allowClamp && (value < definition.min || value > definition.max)) {
        throw new Error(`Rango permitido: ${definition.min} a ${definition.max}.`);
      }
      return clamp(value, definition.min, definition.max);
    }
    if (definition.type === "bool") {
      if (typeof value !== "boolean") throw new Error(`${definition.label}: booleano inválido.`);
      return value;
    }
    if (definition.type === "enum") {
      if (!definition.options.includes(value)) {
        throw new Error(`${definition.label}: opción desconocida.`);
      }
      return value;
    }
    if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) {
      throw new Error(`${definition.label}: usa un color hexadecimal de seis dígitos.`);
    }
    return value.toLowerCase();
  }

  /** Importación estricta; permite migración aditiva de versiones anteriores. */
  static validate(schema, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("El documento debe ser un objeto JSON.");
    }
    const warnings = [];
    const output = SchemaLoader.defaults(schema);
    const meta = input.meta;

    if (!meta || typeof meta !== "object") throw new Error("Falta meta.");
    if (typeof meta.schemaVersion !== "string") throw new Error("Falta schemaVersion.");

    const migration = meta.schemaVersion !== schema.meta.schemaVersion;
    if (migration) {
      if (meta.schemaVersion.split(".")[0] !== schema.meta.schemaVersion.split(".")[0]) {
        throw new Error("Versión mayor incompatible. Se necesita una migración específica.");
      }
      warnings.push(`Migración aditiva ${meta.schemaVersion} → ${schema.meta.schemaVersion}`);
    }

    if (!Number.isInteger(meta.seed) || meta.seed < 0 || meta.seed > 4294967295) {
      throw new Error("Seed inválida.");
    }
    if (typeof meta.characterName !== "string" || !meta.characterName.trim() ||
        meta.characterName.length > 80) {
      throw new Error("El nombre debe tener entre 1 y 80 caracteres.");
    }
    for (const key of ["createdAt", "modifiedAt"]) {
      if (typeof meta[key] !== "string" ||
          !/^\d{4}-\d{2}-\d{2}T/.test(meta[key]) ||
          !Number.isFinite(Date.parse(meta[key]))) {
        throw new Error(`Fecha inválida: ${key}.`);
      }
    }

    output.meta = {
      schemaVersion: schema.meta.schemaVersion,
      characterName: meta.characterName,
      createdAt: meta.createdAt,
      modifiedAt: meta.modifiedAt,
      seed: meta.seed
    };

    const validRoot = new Set(["meta", ...Object.keys(GROUPS)]);
    for (const key of Object.keys(input)) {
      if (!validRoot.has(key)) throw new Error(`Grupo desconocido: ${key}.`);
    }

    for (const group of Object.keys(GROUPS)) {
      const supplied = input[group];
      if (supplied == null && migration) {
        warnings.push(`Se añadieron valores predeterminados de ${group}`);
        continue;
      }
      if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) {
        throw new Error(`Falta el grupo ${group}.`);
      }
      // Parámetros de pose de la v1.0 que fueron reemplazados por articulaciones.
      let source = supplied;
      if (group === "pose" && migration) {
        source = { ...supplied };
        if (Object.hasOwn(source, "headTilt")) {
          const tilt = source.headTilt;
          const v = tilt && typeof tilt === "object" && Object.hasOwn(tilt, "value") ? tilt.value : tilt;
          if (!Object.hasOwn(source, "neckZ") && typeof v === "number") source.neckZ = v;
        }
        for (const legacy of ["headTilt", "armAngleL", "armAngleR"]) {
          if (Object.hasOwn(source, legacy)) {
            delete source[legacy];
            warnings.push(`pose.${legacy} ya no existe (reemplazado por articulaciones)`);
          }
        }
      }
      for (const key of Object.keys(source)) {
        if (!Object.hasOwn(schema[group], key)) {
          throw new Error(`Parámetro desconocido: ${group}.${key}.`);
        }
      }
      let added = 0;
      for (const [key, definition] of Object.entries(schema[group])) {
        if (!Object.hasOwn(source, key)) {
          if (migration) {
            added++;
            continue;
          }
          throw new Error(`Falta ${definition.id}.`);
        }
        // Acepta valores simples y el formato { value: ... } del contrato.
        const raw = source[key];
        const value = raw && typeof raw === "object" && Object.hasOwn(raw, "value")
          ? raw.value
          : raw;
        const valid = SchemaLoader.value(definition, value, true);
        if (definition.type === "float" && valid !== value) {
          warnings.push(`${definition.label}: ajustado a ${valid}`);
        }
        output[group][key] = valid;
      }
      if (added) warnings.push(`Se añadieron ${added} parámetros nuevos de ${group}`);
    }
    return { state: output, warnings };
  }
}

/* =========================================================
   Estado, transacciones de edición y persistencia
   ========================================================= */

class StateManager {
  constructor(schema, state) {
    this.schema = schema;
    this.state = state;
    this.undoStack = [];
    this.redoStack = [];
    this.before = null;
    this.listeners = new Set();
    this.dirty = false;
    this.timer = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(groups, refresh = false) {
    for (const listener of this.listeners) listener(this.state, groups, refresh);
  }

  begin() {
    if (!this.before) this.before = clone(this.state);
  }

  /** Preview inmediato; se confirma en change como un único paso de undo. */
  set(group, key, value) {
    const validated = SchemaLoader.value(this.schema[group][key], value, false);
    if (this.state[group][key] === validated) return;
    this.begin();
    this.state[group][key] = validated;
    this.touch();
    this.emit([group]);
  }

  setMeta(key, value) {
    if (this.state.meta[key] === value) return;
    this.begin();
    this.state.meta[key] = value;
    this.touch();
    this.emit([]);
  }

  touch() {
    this.state.meta.modifiedAt = new Date().toISOString();
    this.dirty = true;
    $("#save-status").textContent = "Cambios sin guardar";
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 2000);
  }

  /** Confirma una interacción completa, no cada píxel del slider. */
  commit() {
    if (!this.before) return;
    this.undoStack.push(this.before);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.before = null;
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  updateHistoryButtons() {
    $("#undo").disabled = !this.undoStack.length && !this.before;
    $("#redo").disabled = !this.redoStack.length;
  }

  replace(state) {
    this.commit();
    this.begin();
    this.state = clone(state);
    this.touch();
    this.commit();
    this.emit(Object.keys(GROUPS), true);
  }

  undo() {
    this.commit();
    if (!this.undoStack.length) return;
    this.redoStack.push(clone(this.state));
    this.state = this.undoStack.pop();
    this.touch();
    this.updateHistoryButtons();
    this.emit(Object.keys(GROUPS), true);
  }

  redo() {
    this.commit();
    if (!this.redoStack.length) return;
    this.undoStack.push(clone(this.state));
    this.state = this.redoStack.pop();
    this.touch();
    this.updateHistoryButtons();
    this.emit(Object.keys(GROUPS), true);
  }

  save() {
    clearTimeout(this.timer);
    const success = writeStorage(STORAGE_KEY, JSON.stringify(this.state));
    this.dirty = !success;
    $("#save-status").textContent = success
      ? "Guardado localmente"
      : "Sin guardar: almacenamiento no disponible";
    return success;
  }
}

/** Genera proporciones correlacionadas. La seed reproduce los valores visuales. */
function randomizeCharacter(schema, seed) {
  const random = new PRNG(seed);
  const result = SchemaLoader.defaults(schema);
  result.meta.seed = seed >>> 0;
  result.meta.characterName = `Character ${seed >>> 0}`;

  for (const group of Object.keys(GROUPS)) {
    if (["scene", "pose", "materials"].includes(group)) continue;
    for (const [key, definition] of Object.entries(schema[group])) {
      if (definition.type === "float") {
        // Distribución triangular: evita concentrar anatomías en los extremos.
        const t = (random.next() + random.next()) / 2;
        const value = definition.min + t * (definition.max - definition.min);
        result[group][key] = Number(clamp(
          Math.round(value / definition.step) * definition.step,
          definition.min,
          definition.max
        ).toFixed(4));
      } else if (definition.type === "enum") {
        result[group][key] = random.pick(definition.options);
      } else if (definition.type === "bool") {
        result[group][key] = random.next() > 0.72;
      }
    }
  }

  result.body.bodyFat = Number(random.range(0.12, 0.65).toFixed(2));
  result.body.muscleMass = Number(
    clamp(random.range(0.25, 0.85) - result.body.bodyFat * 0.22, 0, 1).toFixed(2)
  );
  result.body.weight = Number((
    result.body.bodyFat * 0.6 + result.body.muscleMass * 0.4
  ).toFixed(2));

  result.face.skinTone = random.pick([
    "#f0c6aa", "#ddb090", "#bd8765", "#956247", "#714a37", "#50352b"
  ]);
  result.hair.color = random.pick([
    "#211710", "#4b3020", "#805132", "#b58b4e", "#c4b9a4", "#7a3926"
  ]);
  result.eyes.irisColor = random.pick([
    "#557c8d", "#6a8247", "#725035", "#383026", "#8d9399"
  ]);
  result.face.eyeColor = new THREE.Color(result.eyes.irisColor)
    .multiplyScalar(0.45).getHexString();
  result.face.eyeColor = `#${result.face.eyeColor}`;

  result.clothing.topColor = random.pick([
    "#315f76", "#8c4d45", "#66775c", "#aea38b", "#353844"
  ]);
  result.clothing.bottomColor = random.pick(["#29394f", "#71624c", "#303036"]);
  result.clothing.shoeColor = random.pick(["#dedbd4", "#26282e", "#624332"]);
  result.clothing.topType = random.pick(["tshirt", "shirt", "hoodie", "jacket"]);
  result.clothing.bottomType = random.pick(["jeans", "chinos", "shorts", "skirt"]);
  result.clothing.shoeType = random.pick(["sneakers", "boots", "dress"]);
  return result;
}

/* =========================================================
   Normal map procedural: simplex en Worker
   ========================================================= */

/**
 * Función autocontenida que puede serializarse para ejecutar en un Worker.
 * Devuelve una normal tangencial de poros; no contiene datos personales.
 */
function generateNormalPixels(size, seed) {
  let state = seed >>> 0;
  const random = () => {
    let t = state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const base = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  const permutation = new Uint16Array(512);
  for (let i = 0; i < 512; i++) permutation[i] = base[i & 255];

  const gradients = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]
  ];
  const F2 = (Math.sqrt(3) - 1) / 2;
  const G2 = (3 - Math.sqrt(3)) / 6;

  function noise(x, y) {
    const skew = (x + y) * F2;
    const i = Math.floor(x + skew);
    const j = Math.floor(y + skew);
    const unskew = (i + j) * G2;
    const x0 = x - (i - unskew);
    const y0 = y - (j - unskew);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const corners = [
      [x0, y0, 0, 0],
      [x0 - i1 + G2, y0 - j1 + G2, i1, j1],
      [x0 - 1 + 2 * G2, y0 - 1 + 2 * G2, 1, 1]
    ];
    let sum = 0;
    for (const [dx, dy, ox, oy] of corners) {
      let t = 0.5 - dx * dx - dy * dy;
      if (t <= 0) continue;
      const index = permutation[((i + ox) & 255) +
        permutation[(j + oy) & 255]] & 7;
      const g = gradients[index];
      t *= t;
      sum += t * t * (g[0] * dx + g[1] * dy);
    }
    return 70 * sum;
  }

  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      height[y * size + x] =
        noise(x / 5, y / 5) * 0.65 + noise(x / 2, y / 2) * 0.35;
    }
  }

  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = height[y * size + (x + size - 1) % size];
      const right = height[y * size + (x + 1) % size];
      const up = height[((y + size - 1) % size) * size + x];
      const down = height[((y + 1) % size) * size + x];
      let nx = (left - right) * 0.35;
      let ny = (up - down) * 0.35;
      const length = Math.hypot(nx, ny, 1);
      nx /= length;
      ny /= length;
      const index = (y * size + x) * 4;
      pixels[index] = (nx * 0.5 + 0.5) * 255;
      pixels[index + 1] = (ny * 0.5 + 0.5) * 255;
      pixels[index + 2] = (1 / length * 0.5 + 0.5) * 255;
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

/** Usa Worker desde el inicio para evitar bloquear el hilo de controles. */
async function createSkinNormal() {
  const size = 128;
  let pixels;
  let worker;
  let url;
  try {
    const source = `
      const generate = ${generateNormalPixels.toString()};
      self.onmessage = ({data}) => {
        const pixels = generate(data.size, data.seed);
        self.postMessage(pixels, [pixels.buffer]);
      };
    `;
    url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    worker = new Worker(url);
    pixels = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Worker timeout")), 5000);
      worker.onmessage = (event) => {
        clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Worker no disponible"));
      };
      worker.postMessage({ size, seed: 92815 });
    });
  } catch {
    // Respaldo pequeño para navegadores o políticas CSP que bloqueen blob workers.
    pixels = generateNormalPixels(size, 92815);
  } finally {
    worker?.terminate();
    if (url) URL.revokeObjectURL(url);
  }

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d").putImageData(new ImageData(pixels, size, size), 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  return texture;
}

/* =========================================================
   Materiales y recursos
   ========================================================= */

class MaterialCache {
  constructor(normalMap) {
    this.normalMap = normalMap;
    this.items = new Map();
  }

  /** Los objetos comparten materiales idénticos. */
  get(kind, color, roughness = 0.7, subsurface = 0) {
    const key = JSON.stringify([kind, color, roughness, subsurface]);
    if (!this.items.has(key)) {
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness: kind === "metal" ? 0.75 : 0,
        side: kind === "card" ? THREE.DoubleSide : THREE.FrontSide
      });
      if (kind === "skin") {
        material.normalMap = this.normalMap;
        material.normalScale.set(0.12, 0.12);
        // Aproximación artística: no es dispersión volumétrica física.
        material.emissive.set(color);
        material.emissiveIntensity = subsurface * 0.055;
      }
      this.items.set(key, material);
    }
    return this.items.get(key);
  }

  sweep(root) {
    const used = new Set();
    root.traverse((object) => {
      if (object.material) {
        for (const material of [].concat(object.material)) used.add(material);
      }
    });
    for (const [key, material] of this.items) {
      if (!used.has(material)) {
        material.dispose();
        this.items.delete(key);
      }
    }
  }

  dispose() {
    for (const material of this.items.values()) material.dispose();
    this.items.clear();
    this.normalMap.dispose();
  }
}

/** Libera geometría y materiales exclusivos, nunca los compartidos. */
function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.isSkinnedMesh) object.skeleton.dispose();
    if (object.userData.ownedMaterial && object.material) {
      for (const material of [].concat(object.material)) {
        materials.add(material);
        if (material.map) textures.add(material.map);
        if (material.alphaMap) textures.add(material.alphaMap);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
  root.removeFromParent();
}

/* =========================================================
   Motor de personaje
   ========================================================= */

class CharacterBuilder {
  constructor(scene, normalMap) {
    this.root = new THREE.Group();
    this.root.name = "ProceduralCharacter";
    scene.add(this.root);
    this.materials = new MaterialCache(normalMap);
    this.body = null;
    this.waistPivot = null;
    this.upper = null;
    this.neckPivot = null;
    this.headPivot = null;
    this.arms = [];
    this.legs = [];
    this.jointMarkers = [];
    this.headParts = new Map();
    this.state = null;
    this.dimensions = null;
  }

  mesh(parent, geometry, material, position = [0, 0, 0], scale = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  ellipsoid(parent, material, position, scale, segments = 20) {
    return this.mesh(
      parent, new THREE.SphereGeometry(1, segments, 14), material, position, scale
    );
  }

  tube(parent, points, radius, material, segments = 12) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    return this.mesh(
      parent, new THREE.TubeGeometry(curve, segments, radius, 5, false), material
    );
  }

  lathe(parent, profile, material, depth = 1) {
    const geometry = new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)), 32
    );
    geometry.scale(1, 1, depth);
    return this.mesh(parent, geometry, material);
  }

  skin(state) {
    return this.materials.get(
      "skin", state.face.skinTone,
      state.materials.skinRoughness, state.materials.skinSubsurface
    );
  }

  hairMaterial(state) {
    return this.materials.get("hair", state.hair.color, state.materials.hairRoughness);
  }

  /** Calcula proporciones compartidas por piel, ropa y accesorios. */
  measure(state) {
    const b = state.body;
    const leg = 0.77 * b.limbLength;
    const torso = 0.48 * b.torsoLength;
    const neck = 0.085 * b.neckLength;
    const head = 0.135 * b.headSize;
    const hip = leg + 0.065;
    const shoulder = hip + torso;
    const headY = shoulder + neck + head * 0.78;
    const top = headY + head;
    return {
      leg, torso, neck, head, hip, shoulder, headY,
      scale: b.height / top,
      shoulderWidth: (0.19 + b.muscleMass * 0.025) * b.shoulderWidth,
      hipWidth: (0.135 + b.bodyFat * 0.025) * b.hipWidth,
      girth: 0.86 + b.weight * 0.18 + b.bodyFat * 0.18,
      arm: 0.57 * b.limbLength,
      limbRadius: 0.041 + b.muscleMass * 0.014 + b.bodyFat * 0.012
    };
  }

  /**
   * Dirty flags por dependencia. Ojos, pelo y accesorios no reconstruyen cuerpo.
   * Cuerpo/ropa/materiales reconstruyen el conjunto corporal porque comparten huesos.
   * La pose solo rota pivotes y huesos existentes: no reconstruye nada.
   */
  update(state, groups) {
    this.state = state;
    const dirty = new Set(groups);
    const full = !this.body || ["body", "clothing", "materials"]
      .some((group) => dirty.has(group));
    this.dimensions = this.measure(state);

    if (full) {
      for (const child of [...this.root.children]) disposeTree(child);
      this.headParts.clear();
      this.buildBody(state);
      for (const part of ["face", "eyes", "hair", "accessories"]) {
        this.rebuildHeadPart(part, state);
      }
      this.applyPose(state);
    } else {
      if (dirty.has("pose")) this.applyPose(state);
      if (dirty.has("face")) {
        // El tono de piel también afecta el cuerpo.
        this.body.traverse((object) => {
          if (object.userData.skin) object.material = this.skin(state);
        });
        for (const part of ["face", "eyes", "hair", "accessories"]) {
          this.rebuildHeadPart(part, state);
        }
      } else {
        if (dirty.has("eyes")) this.rebuildHeadPart("eyes", state);
        if (dirty.has("hair")) {
          this.rebuildHeadPart("hair", state);
          this.rebuildHeadPart("face", state);
        }
        if (dirty.has("accessories")) this.rebuildHeadPart("accessories", state);
      }
    }

    this.root.scale.setScalar(this.dimensions.scale);
    this.root.updateMatrixWorld(true);
    this.materials.sweep(this.root);
  }

  /**
   * Aplica la pose a pivotes y huesos ya construidos.
   * Rotación final = postura base × offset del usuario (offset en el eje local
   * del hueso), así X/Y/Z conservan su significado en cualquier postura base.
   */
  applyPose(state = this.state) {
    if (!state || !this.body) return;
    const pose = state.pose;
    const base = STANCES[pose.stance] || STANCES.relaxed;

    const apply = (bone, joint, side) => {
      const suffix = side === 0 ? "" : side > 0 ? "L" : "R";
      const b = base[joint] || {};
      jointQuaternion(_qBase, joint, side, b.x || 0, b.y || 0, b.z || 0);
      jointQuaternion(
        _qOffset, joint, side,
        pose[`${joint}${suffix}X`], pose[`${joint}${suffix}Y`], pose[`${joint}${suffix}Z`]
      );
      bone.quaternion.copy(_qBase).multiply(_qOffset);
    };

    apply(this.waistPivot, "waist", 0);
    apply(this.neckPivot, "neck", 0);
    for (const arm of this.arms) {
      apply(arm.shoulder, "shoulder", arm.side);
      apply(arm.elbow, "elbow", arm.side);
      apply(arm.wrist, "wrist", arm.side);
    }
    for (const leg of this.legs) apply(leg.elbow, "knee", leg.side);

    for (const marker of this.jointMarkers) marker.visible = pose.showJoints;
    this.root.updateMatrixWorld(true);
  }

  /** Esferas visibles en cada articulación (ayuda de edición, no se exportan). */
  addJointMarkers() {
    const geometry = new THREE.SphereGeometry(0.014, 12, 10);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffb020, depthTest: false, transparent: true, opacity: 0.92
    });
    this.jointMarkers = [];
    const pivots = [this.waistPivot, this.neckPivot];
    for (const arm of this.arms) pivots.push(arm.shoulder, arm.elbow, arm.wrist);
    for (const leg of this.legs) pivots.push(leg.elbow);
    for (const pivot of pivots) {
      const marker = new THREE.Mesh(geometry, material);
      marker.name = "jointMarker";
      marker.renderOrder = 999;
      marker.visible = false;
      marker.userData.ownedMaterial = true;
      pivot.add(marker);
      this.jointMarkers.push(marker);
    }
  }

  rebuildHeadPart(part, state) {
    const old = this.headParts.get(part);
    if (old) disposeTree(old);
    const group = new THREE.Group();
    group.name = part;
    this.headPivot.add(group);
    this.headParts.set(part, group);
    ({
      face: () => this.buildFace(group, state),
      eyes: () => this.buildEyes(group, state),
      hair: () => this.buildHair(group, state),
      accessories: () => this.buildAccessories(group, state)
    })[part]();
  }

  /**
   * Tubo de dos segmentos con skinning real.
   * Los pesos se mezclan cerca de codo/rodilla para evitar una bisagra rígida.
   */
  skinnedLimb(parent, length, radius, material, fraction = 1) {
    const actualLength = length * fraction;
    const geometry = new THREE.CylinderGeometry(
      radius * 0.8, radius, actualLength, 12, 14
    );
    geometry.translate(0, -actualLength / 2, 0);
    const positions = geometry.attributes.position;
    const indices = [];
    const weights = [];

    for (let i = 0; i < positions.count; i++) {
      const t = -positions.getY(i) / length;
      const blend = THREE.MathUtils.smoothstep(t, 0.43, 0.57);
      indices.push(0, 1, 0, 0);
      weights.push(1 - blend, blend, 0, 0);
    }
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));

    const mesh = new THREE.SkinnedMesh(geometry, material);
    const shoulder = new THREE.Bone();
    const elbow = new THREE.Bone();
    const wrist = new THREE.Bone();
    shoulder.name = "proximal";
    elbow.name = "joint";
    wrist.name = "distal";
    elbow.position.y = -length / 2;
    wrist.position.y = -length / 2;
    shoulder.add(elbow);
    elbow.add(wrist);
    mesh.add(shoulder);
    parent.add(mesh);
    mesh.bind(new THREE.Skeleton([shoulder, elbow, wrist]));
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return { mesh, shoulder, elbow, wrist };
  }

  buildBody(state) {
    const d = this.dimensions;
    const b = state.body;
    const clothes = state.clothing;
    const skin = this.skin(state);
    const cloth = (color) => this.materials.get(
      "cloth", color, state.materials.clothRoughness
    );
    this.body = new THREE.Group();
    this.root.add(this.body);

    // Cintura: pivote sobre la pelvis. Torso, cuello, cabeza y brazos cuelgan de
    // `upper`, que se desplaza en sentido contrario para seguir usando
    // coordenadas absolutas. Las piernas quedan fijas en `body`.
    const waistY = d.hip + 0.02;
    this.waistPivot = new THREE.Group();
    this.waistPivot.name = "waist";
    this.waistPivot.position.set(0, waistY, 0);
    this.body.add(this.waistPivot);
    this.upper = new THREE.Group();
    this.upper.position.set(0, -waistY, 0);
    this.waistPivot.add(this.upper);

    const torsoProfile = [
      [0, d.hip - 0.07],
      [d.hipWidth, d.hip - 0.04],
      [d.hipWidth * 0.96, d.hip + 0.07],
      [0.115 * d.girth, d.hip + d.torso * 0.42],
      [d.shoulderWidth * 0.88, d.shoulder - 0.06],
      [d.shoulderWidth * 0.78, d.shoulder],
      [0.045, d.shoulder + 0.025],
      [0, d.shoulder + 0.025]
    ];
    const torso = this.lathe(this.upper, torsoProfile, skin, 0.66);
    torso.userData.skin = true;

    // Cuello: pivote en la base; la cabeza cuelga de su extremo superior.
    this.neckPivot = new THREE.Group();
    this.neckPivot.name = "neck";
    this.neckPivot.position.set(0, d.shoulder, 0);
    this.upper.add(this.neckPivot);
    const neck = this.mesh(
      this.neckPivot,
      new THREE.CylinderGeometry(0.045, 0.052, d.neck + 0.05, 20),
      skin,
      [0, d.neck / 2, 0]
    );
    neck.userData.skin = true;

    if (clothes.topType !== "none") {
      const top = this.lathe(
        this.upper,
        torsoProfile.map(([r, y]) => [r ? r + 0.008 : 0, y]),
        cloth(clothes.topColor),
        0.7
      );
      top.name = "top";

      const seam = this.materials.get(
        "cloth",
        `#${new THREE.Color(clothes.topColor).multiplyScalar(0.55).getHexString()}`,
        0.9
      );
            if (clothes.topType === "shirt") {
        // Botonadura frontal de camisa.
        for (let i = 0; i < 5; i++) {
          const y = d.hip + 0.08 + (d.torso * 0.8 * i) / 4;
          this.mesh(
            this.upper,
            new THREE.SphereGeometry(0.006, 8, 6),
            seam,
            [0, y, d.hipWidth * 0.55 + 0.008]
          );
        }
      } else if (clothes.topType === "hoodie") {
        // Capucha volumétrica detrás del cuello.
        const hood = this.ellipsoid(
          this.upper,
          cloth(clothes.topColor),
          [0, d.shoulder + d.neck * 0.35, -0.09],
          [0.13, 0.1, 0.11],
          16
        );
        hood.rotation.x = -0.35;
      } else if (clothes.topType === "jacket") {
        // Solapas y cremallera.
        const lapel = this.materials.get(
          "cloth",
          `#${new THREE.Color(clothes.topColor).multiplyScalar(0.7).getHexString()}`,
          0.8
        );
        for (const side of [-1, 1]) {
          const lapelMesh = this.mesh(
            this.upper,
            new THREE.BoxGeometry(0.018, d.torso * 0.55, 0.006),
            lapel,
            [side * 0.035, d.hip + d.torso * 0.55, d.hipWidth * 0.52]
          );
          lapelMesh.rotation.z = side * 0.12;
        }
        this.mesh(
          this.upper,
          new THREE.BoxGeometry(0.008, d.torso * 0.75, 0.004),
          seam,
          [0, d.hip + d.torso * 0.45, d.hipWidth * 0.56]
        );
      }
    }

    // Piernas: skinned limbs con rodilla funcional.
    this.legs = [];
    for (const side of [-1, 1]) {
      const hipX = side * d.hipWidth * 0.52;
      const leg = this.skinnedLimb(this.body, d.leg, d.limbRadius, skin);
      leg.mesh.position.set(hipX, d.hip, 0);
      leg.shoulder.rotation.z = side * 0.03;
      // La flexión de rodilla la aplica applyPose().
      this.legs.push({ ...leg, side });

      if (clothes.bottomType !== "none") {
        const bottomMat = cloth(clothes.bottomColor);
        const isSkirt = clothes.bottomType === "skirt";
        if (isSkirt) {
          const skirtProfile = [
            [d.hipWidth * 0.55, d.hip + 0.02],
            [d.hipWidth * 0.7, d.hip - 0.15],
            [d.hipWidth * 0.95, d.hip - 0.35],
            [d.hipWidth * 1.05, d.hip - 0.42]
          ];
          const skirtGeo = new THREE.LatheGeometry(
            skirtProfile.map(([r, y]) => new THREE.Vector2(r, y)), 32
          );
          skirtGeo.scale(1, 1, 0.75);
          this.mesh(this.body, skirtGeo, bottomMat);
        } else {
          // Pantalón: cilindro ajustado al muslo y la pantorrilla.
          const legMat = this.materials.get(
            "cloth", clothes.bottomColor,
            clothes.bottomType === "jeans" ? 0.92 : 0.78
          );
          for (const bone of [leg.shoulder, leg.elbow]) {
            const radius = bone === leg.shoulder
              ? d.limbRadius * 1.08
              : d.limbRadius * 0.95;
            const length = d.leg / 2;
            const pants = new THREE.Mesh(
              new THREE.CylinderGeometry(radius * 0.9, radius, length, 12),
              legMat
            );
            pants.position.y = -length / 2;
            pants.castShadow = true;
            bone.add(pants);
          }
        }
      }

      // Calzado.
      if (clothes.shoeType !== "none") {
        const shoeMat = this.materials.get("cloth", clothes.shoeColor, 0.7);
        const shoeLen = clothes.shoeType === "boots" ? 0.18 : 0.13;
        const shoeHeight = clothes.shoeType === "boots" ? 0.12 : 0.06;
        const shoe = this.mesh(
          leg.wrist,
          new THREE.BoxGeometry(shoeLen * 0.65, shoeHeight, shoeLen),
          shoeMat,
          [0, -0.03, shoeLen * 0.18]
        );
        shoe.rotation.y = side * 0.02;
      }
    }

    // Brazos: skinned limbs con codo funcional.
    this.arms = [];
    for (const side of [-1, 1]) {
      const shoulderX = side * d.shoulderWidth * 0.92;
      const arm = this.skinnedLimb(this.upper, d.arm, d.limbRadius * 0.85, skin);
      arm.mesh.position.set(shoulderX, d.shoulder - 0.02, 0);
      // Hombro, codo y muñeca los orienta applyPose().
      // side: +1 = izquierdo del personaje (x > 0), -1 = derecho.
      this.arms.push({ ...arm, side });

      if (clothes.topType !== "none") {
        const sleeveLen = d.arm * (
          clothes.topType === "jacket" || clothes.topType === "hoodie" ? 0.55 : 0.32
        );
        const sleeveMat = cloth(clothes.topColor);
        const sleeve = new THREE.Mesh(
          new THREE.CylinderGeometry(
            d.limbRadius * 1.15, d.limbRadius * 0.95, sleeveLen, 10
          ),
          sleeveMat
        );
        sleeve.position.y = -sleeveLen / 2;
        sleeve.castShadow = true;
        arm.shoulder.add(sleeve);
      }

      // Manos.
      this.ellipsoid(
        arm.wrist,
        skin,
        [0, -0.03, 0],
        [d.limbRadius * 0.75, 0.06, d.limbRadius * 0.55],
        12
      );
    }

    // Cabeza: pivote independiente para inclinación.
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, d.neck, 0);
    this.neckPivot.add(this.headPivot);

    const headScale = [
      d.head * 0.78,
      d.head,
      d.head * 0.82
    ];
    const headShapes = {
      oval: [1, 1, 1],
      round: [1.05, 0.92, 1.02],
      square: [1.02, 0.98, 0.95],
      heart: [1.08, 0.95, 0.98],
      diamond: [0.92, 1.02, 0.92]
    };
    const shapeMul = headShapes[state.face.headShape] || headShapes.oval;
    const headMesh = this.ellipsoid(
      this.headPivot,
      skin,
      [0, d.head * 0.3, 0],
      [
        headScale[0] * shapeMul[0],
        headScale[1] * shapeMul[1],
        headScale[2] * shapeMul[2]
      ],
      24
    );
    headMesh.userData.skin = true;

    this.addJointMarkers();
  }

  /* ---------- Rostro ---------- */

  buildFace(group, state) {
    const f = state.face;
    const d = this.dimensions;
    const skin = this.skin(state);
    const h = d.head;

    // Mandíbula.
    this.ellipsoid(
      group,
      skin,
      [0, h * 0.05, h * 0.02],
      [h * 0.62 * f.jawWidth, h * 0.32 * f.chinLength, h * 0.55],
      16
    ).userData.skin = true;

    // Pómulos.
    for (const side of [-1, 1]) {
      this.ellipsoid(
        group,
        skin,
        [side * h * 0.5, h * 0.32, h * 0.15],
        [h * 0.14, h * 0.11 * f.cheekbones, h * 0.16],
        12
      ).userData.skin = true;
    }

    // Nariz.
    const nose = new THREE.Group();
    nose.position.set(0, h * 0.32, h * 0.75);
    group.add(nose);
    const noseBridge = this.mesh(
      nose,
      new THREE.CylinderGeometry(h * 0.045 * f.noseWidth, h * 0.06 * f.noseWidth,
        h * 0.32 * f.noseLength, 8),
      skin
    );
    noseBridge.position.set(0, h * 0.05, -h * 0.02);
    noseBridge.rotation.x = -0.15;
    noseBridge.userData.skin = true;
    this.ellipsoid(
      nose,
      skin,
      [0, -h * 0.15 * f.noseLength, h * 0.02],
      [h * 0.09 * f.noseWidth * f.noseTip, h * 0.06, h * 0.1 * f.noseTip],
      12
    ).userData.skin = true;

    // Labios.
    const lipColor = new THREE.Color(f.skinTone).multiplyScalar(0.65);
    const lipMat = this.materials.get("skin", `#${lipColor.getHexString()}`, 0.45, 0.5);
    const mouth = new THREE.Group();
    mouth.position.set(0, h * 0.02, h * 0.72);
    group.add(mouth);
    const lipScale = f.lipShape === "full" ? 1.35
      : f.lipShape === "thin" ? 0.65
      : f.lipShape === "bow" ? 1.05 : 1;
    for (const [y, sy, rx] of [
      [h * 0.025 * f.lipThickness * lipScale, 1.4, 1.0],
      [-h * 0.025 * f.lipThickness * lipScale, 1, 0.9]
    ]) {
      const lip = this.ellipsoid(
        mouth,
        lipMat,
        [0, y, 0],
        [h * 0.16 * f.mouthWidth, h * 0.03 * sy * f.lipThickness, h * 0.05],
        12
      );
      lip.scale.x *= rx;
    }

    // Cejas.
    const browColor = state.hair.color;
    const browMat = this.materials.get("hair", browColor, 0.9);
    const browAngle = rad(f.eyebrowAngle);
    for (const side of [-1, 1]) {
      const brow = this.mesh(
        group,
        new THREE.BoxGeometry(h * 0.22, h * 0.025 * f.eyebrowThickness, h * 0.04),
        browMat,
        [side * h * 0.24 * f.eyeSpacing, h * 0.55, h * 0.72]
      );
      brow.rotation.z = -side * (0.15 + browAngle);
    }

    // Orejas.
    for (const side of [-1, 1]) {
      const ear = this.ellipsoid(
        group,
        skin,
        [side * h * 0.72, h * 0.32, h * 0.1],
        [h * 0.05 * f.earSize, h * 0.12 * f.earSize, h * 0.08 * f.earSize],
        12
      );
      ear.rotation.y = side * rad(f.earAngle);
      ear.userData.skin = true;
    }

    // Pecas y marcas: pequeños puntos distribuidos pseudoaleatorios con seed estable.
    if (f.freckles || f.blemishes > 0) {
      const rand = new PRNG(4242 + Math.floor(f.blemishes * 1000));
      const freckleCount = f.freckles ? 40 : 0;
      const blemishCount = Math.floor(f.blemishes * 25);
      const dotMat = this.materials.get(
        "skin",
        `#${new THREE.Color(f.skinTone).multiplyScalar(f.freckles ? 0.7 : 0.82).getHexString()}`,
        0.6
      );
      for (let i = 0; i < freckleCount + blemishCount; i++) {
        const isBlemish = i >= freckleCount;
        const x = rand.range(-h * 0.55, h * 0.55);
        const y = rand.range(h * 0.15, h * 0.5);
        const z = Math.sqrt(Math.max(0, h * h * 0.55 - x * x - (y - h * 0.3) ** 2)) + h * 0.28;
        const radius = isBlemish ? h * 0.018 : h * 0.008;
        this.mesh(
          group,
          new THREE.SphereGeometry(radius, 6, 4),
          dotMat,
          [x, y, z]
        );
      }
    }
  }

  /* ---------- Ojos ---------- */

  buildEyes(group, state) {
    const e = state.eyes;
    const f = state.face;
    const d = this.dimensions;
    const h = d.head;

    // Materiales con textura Canvas: iris + pupila + esclerótica.
    const scleraMat = new THREE.MeshStandardMaterial({
      color: e.scleraTint,
      roughness: 0.15,
      metalness: 0,
      clearcoat: 1
    });
    const irisMat = new THREE.MeshStandardMaterial({
      color: f.eyeColor,
      roughness: 0.25,
      metalness: 0
    });
    const pupilMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      roughness: 0.1
    });
    scleraMat.userData.owned = true;

    const eyeShapeMap = {
      almond: [1, 0.85], round: [1, 1], hooded: [1, 0.8],
      monolid: [1, 0.75], upturned: [1.05, 0.85]
    };
    const [sx, sy] = eyeShapeMap[f.eyeShape] || [1, 0.85];
    const eyeRadius = h * 0.09 * f.eyeSize;
    const spacing = h * 0.27 * f.eyeSpacing;

    for (const side of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * spacing, h * 0.42, h * 0.68);
      group.add(eyeGroup);

      const sclera = this.mesh(
        eyeGroup,
        new THREE.SphereGeometry(eyeRadius, 16, 12),
        scleraMat
      );
      sclera.scale.set(sx, sy, 1);

      const iris = this.mesh(
        eyeGroup,
        new THREE.CircleGeometry(eyeRadius * 0.62, 20),
        irisMat,
        [0, 0, eyeRadius * 0.92]
      );
      iris.scale.set(1, 0.9, 1);

      this.mesh(
        eyeGroup,
        new THREE.CircleGeometry(eyeRadius * 0.35 * e.pupilSize, 16),
        pupilMat,
        [0, 0, eyeRadius * 0.94]
      );

      // Reflejo especular falso para realismo.
      this.mesh(
        eyeGroup,
        new THREE.CircleGeometry(eyeRadius * 0.12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }),
        [-eyeRadius * 0.15, eyeRadius * 0.18, eyeRadius * 0.96]
      );

      // Pestañas: pequeñas líneas en el borde superior.
      if (e.lashesLength > 0) {
        const lashMat = new THREE.MeshStandardMaterial({ color: 0x110a06, roughness: 1 });
        lashMat.userData.owned = true;
        const lashCount = 6;
        for (let i = 0; i < lashCount; i++) {
          const t = (i / (lashCount - 1)) - 0.5;
          const lash = this.mesh(
            eyeGroup,
            new THREE.CylinderGeometry(eyeRadius * 0.01, eyeRadius * 0.02,
              eyeRadius * 0.4 * e.lashesLength, 4),
            lashMat,
            [t * eyeRadius * 1.4 * sx, eyeRadius * sy * 0.9, 0]
          );
          lash.rotation.z = side * t * 0.6;
        }
      }
    }
  }

  /* ---------- Pelo y vello facial ---------- */

  buildHair(group, state) {
    const hair = state.hair;
    const d = this.dimensions;
    const h = d.head;
    const hairMat = this.hairMaterial(state);

    if (hair.style === "bald") {
      // Solo vello facial.
    } else {
      const coverage = {
        short: 0.85, medium: 0.95, long: 1.05, buzz: 0.92,
        ponytail: 0.9, bun: 0.9, curly: 1.1, wavy: 1.0, straight: 0.95
      }[hair.style] || 0.9;
      const capRadius = h * coverage * (0.85 + hair.volume * 0.15);

      // Casquete base.
      const cap = new THREE.SphereGeometry(capRadius, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
      this.mesh(
        group,
        cap,
        hairMat,
        [0, h * 0.42, -h * 0.02]
      );

      // Volumen adicional.
      if (hair.volume > 0.3) {
        this.ellipsoid(
          group, hairMat,
          [0, h * 0.55, -h * 0.05],
          [h * 0.85, h * 0.35 * hair.volume, h * 0.8],
          16
        );
      }

      // Longitud: mechones hacia atrás y laterales.
      if (hair.length > 0.3) {
        const hairLen = h * (0.6 + hair.length * 1.2);
        const strands = 8;
        for (let i = 0; i < strands; i++) {
          const angle = (i / strands) * Math.PI * 2;
          const startX = Math.cos(angle) * h * 0.65;
          const startZ = Math.sin(angle) * h * 0.65 - h * 0.1;
          const endX = startX * 1.15;
          const endZ = startZ - hair.length * h * 0.35;
          const endY = h * 0.3 - hairLen;
          this.tube(
            group,
            [
              [startX, h * 0.55, startZ],
              [startX * 1.1, h * 0.1, startZ - hair.length * h * 0.15],
              [endX, endY, endZ]
            ],
            h * 0.07,
            hairMat,
            8
          );
        }
      }

      // Flequillo.
      if (hair.fringeStyle !== "none") {
        const fringeLen = hair.fringeStyle === "curtain" ? h * 0.4 : h * 0.25;
        for (let i = -2; i <= 2; i++) {
          const x = i * h * 0.12;
          const offset = hair.fringeStyle === "side" ? i * 0.04 : 0;
          this.tube(
            group,
            [
              [x, h * 0.72, h * 0.4],
              [x + offset, h * 0.55, h * 0.55],
              [x + offset * 2, h * 0.55 - fringeLen, h * 0.58]
            ],
            h * 0.05,
            hairMat,
            6
          );
        }
      }

      // Coleta o moño.
      if (hair.style === "ponytail" || hair.style === "bun") {
        const anchorY = h * 0.35;
        const anchorZ = -h * 0.75;
        if (hair.style === "bun") {
          this.ellipsoid(
            group, hairMat,
            [0, anchorY, anchorZ],
            [h * 0.22, h * 0.22, h * 0.22], 16
          );
        } else {
          this.tube(
            group,
            [
              [0, anchorY, anchorZ],
              [0, anchorY - h * 0.4, anchorZ - h * 0.15],
              [0, anchorY - h * 0.85, anchorZ - h * 0.1]
            ],
            h * 0.1,
            hairMat,
            10
          );
        }
      }
    }

    // Vello facial.
    if (hair.facialHair !== "none" && hair.facialHairDensity > 0) {
      const beardMat = this.materials.get("hair", hair.color, 0.95);
      const chinY = h * -0.02;
      const chinZ = h * 0.72;
      const density = Math.min(1, hair.facialHairDensity);
      const type = hair.facialHair;

      const addPatch = (center, radius, count) => {
        const rand = new PRNG(777 + count);
        for (let i = 0; i < count * density; i++) {
          const theta = rand.range(0, Math.PI * 2);
          const phi = rand.range(0, Math.PI);
          const r = radius * Math.sqrt(rand.next());
          const px = center[0] + r * Math.cos(theta) * Math.sin(phi);
          const py = center[1] + r * Math.cos(phi) * 0.5;
          const pz = center[2] + r * Math.sin(theta) * Math.sin(phi);
          this.mesh(
            group,
            new THREE.PlaneGeometry(h * 0.03, h * 0.06),
            beardMat,
            [px, py, pz]
          );
        }
      };

      if (type === "stubble" || type === "beard" || type === "full") {
        addPatch([0, chinY + h * 0.05, chinZ], h * 0.28, 60);
        addPatch([0, chinY + h * 0.15, chinZ - h * 0.02], h * 0.35, 40);
      }
      if (type === "goatee") {
        addPatch([0, chinY, chinZ], h * 0.12, 30);
      }
      if (type === "mustache" || type === "beard" || type === "full") {
        addPatch([0, h * 0.12, h * 0.74], h * 0.12, 30);
      }
    }
  }

  /* ---------- Accesorios ---------- */

  buildAccessories(group, state) {
    const acc = state.accessories;
    const d = this.dimensions;
    const h = d.head;

    // Gafas.
    if (acc.glasses !== "none") {
      const frameMat = this.materials.get("metal", "#1a1a1a", 0.3);
      const lensMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.05,
        metalness: 0,
        transparent: true,
        opacity: 0.18
      });
      lensMat.userData.owned = true;
      const eyeRadius = h * 0.09 * state.face.eyeSize;
      const spacing = h * 0.27 * state.face.eyeSpacing;
      const frameSize = {
        round: [1, 1], square: [1.1, 0.9], aviator: [1.25, 0.85]
      }[acc.glasses] || [1, 1];

      for (const side of [-1, 1]) {
        const rim = this.mesh(
          group,
          new THREE.TorusGeometry(eyeRadius * 1.05, eyeRadius * 0.06, 8, 20),
          frameMat,
          [side * spacing, h * 0.42, h * 0.82]
        );
        rim.scale.set(frameSize[0], frameSize[1], 1);

        this.mesh(
          group,
          new THREE.CircleGeometry(eyeRadius, 16),
          lensMat,
          [side * spacing, h * 0.42, h * 0.82]
        );
      }
      // Puente.
      this.mesh(
        group,
        new THREE.BoxGeometry(h * 0.12, h * 0.02, h * 0.02),
        frameMat,
        [0, h * 0.42, h * 0.82]
      );
      // Patillas.
      for (const side of [-1, 1]) {
        const temple = this.mesh(
          group,
          new THREE.CylinderGeometry(h * 0.015, h * 0.015, h * 0.55, 6),
          frameMat,
          [side * (spacing + eyeRadius * 1.1), h * 0.42, h * 0.55]
        );
        temple.rotation.x = Math.PI / 2;
      }
    }

    // Sombrero.
    if (acc.hat !== "none") {
      const hatMat = this.materials.get("cloth", "#3a2a1a", 0.85);
      if (acc.hat === "cap") {
        this.ellipsoid(
          group, hatMat,
          [0, h * 0.75, 0],
          [h * 0.65, h * 0.35, h * 0.65], 16
        );
        const brim = this.mesh(
          group,
          new THREE.CylinderGeometry(h * 0.55, h * 0.55, h * 0.03, 20),
          hatMat,
          [0, h * 0.65, h * 0.35]
        );
        brim.rotation.x = 0.2;
      } else if (acc.hat === "beanie") {
        this.ellipsoid(
          group, hatMat,
          [0, h * 0.72, 0],
          [h * 0.72, h * 0.45, h * 0.72], 16
        );
      } else if (acc.hat === "fedora") {
        this.ellipsoid(
          group, hatMat,
          [0, h * 0.8, 0],
          [h * 0.6, h * 0.45, h * 0.6], 16
        );
        this.mesh(
          group,
          new THREE.CylinderGeometry(h * 0.95, h * 0.95, h * 0.02, 24),
          hatMat,
          [0, h * 0.58, 0]
        );
        // Cinta del sombrero.
        const bandMat = this.materials.get("cloth", "#1a0f05", 0.9);
        this.mesh(
          group,
          new THREE.CylinderGeometry(h * 0.61, h * 0.61, h * 0.06, 24, 1, true),
          bandMat,
          [0, h * 0.68, 0]
        );
      }
    }

    // Pendientes.
    if (acc.earrings) {
      const earringMat = this.materials.get("metal", "#d4af37", 0.25);
      for (const side of [-1, 1]) {
        this.mesh(
          group,
          new THREE.TorusGeometry(h * 0.025, h * 0.006, 6, 12),
          earringMat,
          [side * h * 0.72, h * 0.28, h * 0.12]
        );
      }
    }
  }

  dispose() {
    for (const child of [...this.root.children]) disposeTree(child);
    this.materials.dispose();
    this.root.removeFromParent();
  }
}

/* =========================================================
   Gestor de escena
   ========================================================= */

class SceneManager {
  constructor(canvas, characterBuilder) {
    this.canvas = canvas;
    this.builder = characterBuilder;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1b2230);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    this.camera.position.set(1.4, 1.6, 3.2);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 0.8;
    this.controls.maxDistance = 8;
    this.controls.update();

    // Entorno PBR suave (sin HDRI externo).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(
      new RoomEnvironment(), 0.04
    ).texture;
    this.environmentTexture = this.scene.environment;
    pmrem.dispose();

    this.lights = {};
    this.setupLights("studio");
    this.setupGround();

    this.autoRotate = false;
    this.clock = new THREE.Clock();
    this.frameCount = 0;
    this.fps = 60;
    this.lastFpsTime = performance.now();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  setupLights(preset) {
    for (const light of Object.values(this.lights)) {
      light.removeFromParent();
      light.dispose?.();
    }
    this.lights = {};

    const key = new THREE.DirectionalLight(0xfff4e6, 2.4);
    key.position.set(2.5, 3.5, 2.2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 10;
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 2.5;
    key.shadow.camera.bottom = -0.5;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    this.lights.key = key;

    const fill = new THREE.DirectionalLight(0x9ab6dd, 0.6);
    fill.position.set(-2, 1.5, 1.5);
    this.scene.add(fill);
    this.lights.fill = fill;

    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.set(-1, 2, -2.5);
    this.scene.add(rim);
    this.lights.rim = rim;

    const ambient = new THREE.HemisphereLight(0xffffff, 0x2a3142, 0.5);
    this.scene.add(ambient);
    this.lights.ambient = ambient;

    if (preset === "dramatic") {
      key.intensity = 3.2;
      fill.intensity = 0.15;
      rim.intensity = 1.6;
      ambient.intensity = 0.2;
      key.color.setHex(0xffe0b0);
    } else if (preset === "outdoor") {
      key.intensity = 2.8;
      key.color.setHex(0xfff8ee);
      fill.intensity = 0.9;
      fill.color.setHex(0xbfd9ff);
      ambient.intensity = 0.7;
    } else if (preset === "soft") {
      key.intensity = 1.6;
      fill.intensity = 1.2;
      rim.intensity = 0.5;
      ambient.intensity = 0.85;
    }
  }

  setupGround() {
    const geometry = new THREE.CircleGeometry(2.5, 48);
    const material = new THREE.MeshStandardMaterial({
      color: 0x2a3446,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity: 0.65
    });
    this.ground = new THREE.Mesh(geometry, material);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.position.y = -0.001;
    this.scene.add(this.ground);
  }

  applySceneSettings(state) {
    const s = state.scene;
    this.setupLights(s.lighting);

    // Fondo.
    const preset = s.background;
    const viewport = $("#viewport");
    if (preset === "transparent") {
      this.scene.background = null;
      viewport.classList.add("transparent");
    } else {
      viewport.classList.remove("transparent");
      if (preset === "gradient") {
        const canvas = document.createElement("canvas");
        canvas.width = 2;
        canvas.height = 256;
        const ctx = canvas.getContext("2d");
        const grad = ctx.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, "#3a4a63");
        grad.addColorStop(1, "#0d1219");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, 256);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        this.scene.background = texture;
      } else if (preset === "environment") {
        this.scene.background = this.environmentTexture;
      } else {
        this.scene.background = new THREE.Color(0x1b2230);
      }
    }

    // Distancia de cámara: respeta la dirección actual.
    const distance = s.cameraDistance;
    const target = this.controls.target;
    const direction = this.camera.position.clone().sub(target).normalize();
    this.camera.position.copy(target).addScaledVector(direction, distance);
    this.controls.update();

    this.ground.visible = preset !== "transparent";
  }

  resetCamera() {
    this.camera.position.set(1.4, 1.6, 3.2);
    this.controls.target.set(0, 1, 0);
    this.controls.update();
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL("image/png");
  }

  loop() {
    requestAnimationFrame(this.loop);
    const delta = this.clock.getDelta();

    if (this.autoRotate) {
      this.controls.autoRotate = true;
      this.controls.autoRotateSpeed = 1.2;
    } else {
      this.controls.autoRotate = false;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    // Métricas.
    this.frameCount++;
    const now = performance.now();
    if (now - this.lastFpsTime >= 500) {
      this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsTime));
      this.frameCount = 0;
      this.lastFpsTime = now;
      if (!$("#debug").hidden) this.updateDebug();
    }
  }

  updateDebug() {
    const info = this.renderer.info;
    const triangles = info.render.triangles.toLocaleString();
    $("#debug").textContent =
      `FPS     ${this.fps}\n` +
      `Triáng. ${triangles}\n` +
      `Draws   ${info.render.calls}\n` +
      `Texturas ${info.memory.textures}\n` +
      `Geomet. ${info.memory.geometries}`;
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.environmentTexture?.dispose();
    this.renderer.dispose();
  }
}

/* =========================================================
   Controlador de UI
   ========================================================= */

class UIController {
  constructor(schema, stateManager) {
    this.schema = schema;
    this.states = stateManager;
    this.activeGroup = "body";
    this.controls = new Map();
    this.renderedGroups = new Set();

    this.buildCategories();
    this.renderGroup("body");
    this.bindGlobalEvents();
  }

  buildCategories() {
    const list = $("#category-list");
    list.replaceChildren();

    for (const [groupKey, groupLabel] of Object.entries(GROUPS)) {
      const details = document.createElement("details");
      details.open = groupKey === "body";

      const summary = document.createElement("summary");
      summary.setAttribute("role", "button");
      summary.setAttribute("aria-current", groupKey === "body" ? "true" : "false");
      summary.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
        </svg>
        <span>${groupLabel}</span>`;
      summary.addEventListener("click", (event) => {
        if (!details.open) return;
        event.preventDefault();
        this.selectGroup(groupKey);
      });
      details.append(summary);

      const params = this.schema[groupKey];
      for (const definition of Object.values(params)) {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "parameter-link";
        link.textContent = definition.label;
        link.addEventListener("click", () => {
          this.selectGroup(groupKey);
          requestAnimationFrame(() => {
            const control = this.controls.get(definition.id);
            if (control) {
              control.scrollIntoView({ behavior: "smooth", block: "center" });
              control.querySelector("input, select, button")?.focus({ preventScroll: true });
            }
          });
        });
        details.append(link);
      }

      list.append(details);
    }
  }

  selectGroup(groupKey) {
    this.activeGroup = groupKey;
    for (const summary of document.querySelectorAll("#category-list summary")) {
      summary.setAttribute("aria-current", "false");
    }
    const index = Object.keys(GROUPS).indexOf(groupKey);
    const summary = document.querySelectorAll("#category-list summary")[index];
    summary?.setAttribute("aria-current", "true");
    this.renderGroup(groupKey);
  }

  renderGroup(groupKey) {
    this.activeGroup = groupKey;
    this.controls.clear();
    this.renderedGroups.clear();

    const form = $("#controls");
    form.replaceChildren();

    const group = this.schema[groupKey];
    const state = this.states.state;

    $("#group-title").textContent = GROUPS[groupKey];
    $("#group-count").textContent = `${Object.keys(group).length} parámetros`;

    if (groupKey === "pose") form.append(this.createPoseTools());

    let section = null;
    for (const definition of Object.values(group)) {
      if (definition.section && definition.section !== section) {
        section = definition.section;
        const heading = document.createElement("h2");
        heading.className = "control-section";
        heading.textContent = section;
        form.append(heading);
      }
      form.append(this.createControl(definition, state));
    }
    this.renderedGroups.add(groupKey);
  }

  /** Acciones rápidas del panel de pose. */
  createPoseTools() {
    const bar = document.createElement("div");
    bar.className = "pose-tools";
    const button = (text, title, action) => {
      const el = document.createElement("button");
      el.type = "button";
      el.textContent = text;
      el.title = title;
      el.addEventListener("click", action);
      return el;
    };
    bar.append(
      button("Restablecer pose", "Pone todas las articulaciones en 0°", () => this.resetPose()),
      button("Copiar I → D", "Copia la pose del lado izquierdo al derecho (simétrica)",
        () => this.copyPoseSide("L", "R")),
      button("Copiar D → I", "Copia la pose del lado derecho al izquierdo (simétrica)",
        () => this.copyPoseSide("R", "L"))
    );
    return bar;
  }

  /** Aplica varios cambios de pose como un único paso de deshacer. */
  setPoseValues(values) {
    this.states.begin();
    for (const [key, value] of Object.entries(values)) {
      this.states.set("pose", key, value);
      this.updateControlValue(this.schema.pose[key]);
    }
    this.states.commit();
  }

  resetPose() {
    const values = {};
    for (const [key, definition] of Object.entries(this.schema.pose)) {
      if (JOINT_KEY.test(key)) values[key] = definition.default;
    }
    this.setPoseValues(values);
  }

  /** Y y Z se espejan internamente, así que copiar valores da una pose simétrica. */
  copyPoseSide(from, to) {
    const values = {};
    for (const key of Object.keys(this.schema.pose)) {
      const match = key.match(JOINT_KEY);
      if (match && match[2] === from) {
        values[`${match[1]}${to}${match[3]}`] = this.states.state.pose[key];
      }
    }
    this.setPoseValues(values);
  }

  createControl(definition, state) {
    const wrapper = document.createElement("div");
    wrapper.className = "control";
    wrapper.dataset.parameter = definition.id;

    const heading = document.createElement("div");
    heading.className = "control-heading";
    const label = document.createElement("label");
    label.htmlFor = `control-${definition.id}`;
    label.textContent = definition.label;
    heading.append(label);

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "reset-parameter";
    resetBtn.textContent = "↺";
    resetBtn.title = `Restablecer ${definition.label}`;
    resetBtn.addEventListener("click", () => {
      this.states.begin();
      this.states.set(definition.group, Object.keys(this.schema[definition.group])
        .find((k) => this.schema[definition.group][k].id === definition.id),
        definition.default);
      this.states.commit();
      this.updateControlValue(definition);
    });
    heading.append(resetBtn);
    wrapper.append(heading);

    const inputs = document.createElement("div");
    inputs.className = "control-inputs";

    const currentValue = state[definition.group][this.getKeyForId(definition.id)];

    if (definition.type === "float") {
      const range = document.createElement("input");
      range.type = "range";
      range.id = `control-${definition.id}`;
      range.min = definition.min;
      range.max = definition.max;
      range.step = definition.step;
      range.value = currentValue;

      const number = document.createElement("input");
      number.type = "number";
      number.min = definition.min;
      number.max = definition.max;
      number.step = definition.step;
      number.value = currentValue;
      number.setAttribute("aria-label", `${definition.label} (valor)`);

      const update = (value, commit) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return;
        try {
          this.states.set(definition.group, this.getKeyForId(definition.id), num);
          range.value = this.states.state[definition.group][this.getKeyForId(definition.id)];
          number.value = range.value;
          number.removeAttribute("aria-invalid");
          if (commit) this.states.commit();
        } catch (error) {
          number.setAttribute("aria-invalid", "true");
          this.showError(wrapper, error.message);
        }
      };

      range.addEventListener("input", (e) => update(e.target.value, false));
      range.addEventListener("change", () => this.states.commit());
      number.addEventListener("change", (e) => update(e.target.value, true));

      inputs.append(range, number);
    } else if (definition.type === "color") {
      const color = document.createElement("input");
      color.type = "color";
      color.id = `control-${definition.id}`;
      color.value = currentValue;

      const text = document.createElement("input");
      text.type = "text";
      text.maxLength = 7;
      text.value = currentValue;
      text.setAttribute("aria-label", `${definition.label} (hex)`);

      const update = (value, commit) => {
        try {
          this.states.set(definition.group, this.getKeyForId(definition.id), value);
          const normalized = this.states.state[definition.group][this.getKeyForId(definition.id)];
          color.value = normalized;
          text.value = normalized;
          text.removeAttribute("aria-invalid");
          if (commit) this.states.commit();
        } catch (error) {
          text.setAttribute("aria-invalid", "true");
          this.showError(wrapper, error.message);
        }
      };

      color.addEventListener("input", (e) => update(e.target.value, false));
      color.addEventListener("change", () => this.states.commit());
      text.addEventListener("change", (e) => update(e.target.value, true));

      inputs.append(color, text);
    } else if (definition.type === "enum") {
      const select = document.createElement("select");
      select.id = `control-${definition.id}`;
      for (const option of definition.options) {
        const opt = document.createElement("option");
        opt.value = option;
        opt.textContent = option;
        if (option === currentValue) opt.selected = true;
        select.append(opt);
      }
      select.addEventListener("change", (e) => {
        this.states.begin();
        this.states.set(definition.group, this.getKeyForId(definition.id), e.target.value);
        this.states.commit();
      });
      inputs.append(select);
    } else if (definition.type === "bool") {
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `control-${definition.id}`;
      checkbox.checked = currentValue;
      checkbox.addEventListener("change", (e) => {
        this.states.begin();
        this.states.set(definition.group, this.getKeyForId(definition.id), e.target.checked);
        this.states.commit();
      });
      inputs.append(checkbox);
    }

    wrapper.append(inputs);

    const error = document.createElement("small");
    error.className = "control-error";
    error.hidden = true;
    wrapper.append(error);

    this.controls.set(definition.id, wrapper);
    return wrapper;
  }

  getKeyForId(id) {
    return id.split(".")[1];
  }

  showError(wrapper, message) {
    const error = wrapper.querySelector(".control-error");
    error.textContent = message;
    error.hidden = false;
    clearTimeout(wrapper._errorTimer);
    wrapper._errorTimer = setTimeout(() => { error.hidden = true; }, 3000);
  }

  /** Sincroniza el control visible con el estado (p. ej. tras undo/redo). */
  updateControlValue(definition) {
    const wrapper = this.controls.get(definition.id);
    if (!wrapper) return;
    const key = this.getKeyForId(definition.id);
    const value = this.states.state[definition.group][key];

    const range = wrapper.querySelector('input[type="range"]');
    const number = wrapper.querySelector('input[type="number"]');
    const color = wrapper.querySelector('input[type="color"]');
    const text = wrapper.querySelector('input[type="text"]');
    const select = wrapper.querySelector("select");
    const checkbox = wrapper.querySelector('input[type="checkbox"]');

    if (range && number) { range.value = value; number.value = value; }
    if (color && text) { color.value = value; text.value = value; }
    if (select) select.value = value;
    if (checkbox) checkbox.checked = value;
  }

  refreshAll() {
    for (const group of this.renderedGroups) {
      if (group === this.activeGroup) this.renderGroup(group);
    }
  }

  bindGlobalEvents() {
    $("#character-name").addEventListener("input", (e) => {
      const value = e.target.value.trim().slice(0, 80) || "Untitled Character";
      this.states.setMeta("characterName", value);
    });

    $("#seed").addEventListener("change", (e) => {
      const value = Math.max(0, Math.min(4294967295, Math.floor(Number(e.target.value) || 0)));
      e.target.value = value;
      this.states.setMeta("seed", value);
    });

    // Tabs móviles.
    for (const tab of document.querySelectorAll(".mobile-tabs button")) {
      tab.addEventListener("click", () => {
        const panel = tab.dataset.panel;
        $(".workspace").dataset.mobile = panel;
        for (const t of document.querySelectorAll(".mobile-tabs button")) {
          t.setAttribute("aria-pressed", t === tab ? "true" : "false");
        }
      });
    }

    // Debug toggle.
    $("#debug-toggle").addEventListener("change", (e) => {
      $("#debug").hidden = !e.target.checked;
    });
  }

  syncFromState() {
    $("#character-name").value = this.states.state.meta.characterName;
    $("#seed").value = this.states.state.meta.seed;
    this.renderGroup(this.activeGroup);
  }
}

/* =========================================================
   Exportación / importación
   ========================================================= */

class Exporter {
  constructor(stateManager, schema) {
    this.states = stateManager;
    this.schema = schema;
  }

  toJSON() {
    return JSON.parse(JSON.stringify(this.states.state));
  }

  download() {
    const json = JSON.stringify(this.toJSON(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const name = safeFilename(this.states.state.meta.characterName);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    downloadBlob(blob, `${name}_${stamp}.json`);
    notify("JSON exportado correctamente.");
  }

  async copy() {
    const json = JSON.stringify(this.toJSON(), null, 2);
    try {
      await navigator.clipboard.writeText(json);
      notify("JSON copiado al portapapeles.");
    } catch {
      // Fallback: textarea temporal.
      const textarea = document.createElement("textarea");
      textarea.value = json;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.append(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      notify(ok ? "JSON copiado al portapapeles." : "No se pudo copiar. Usa Exportar.");
    }
  }

  async importFile(file) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      notify(`Archivo demasiado grande (máx. ${MAX_FILE_BYTES / 1_000_000} MB).`);
      return;
    }
    let data;
    try {
      const text = await file.text();
      data = JSON.parse(text);
    } catch {
      notify("El archivo no contiene JSON válido.");
      return;
    }
    try {
      const { state, warnings } = SchemaLoader.validate(this.schema, data);
      this.states.replace(state);
      if (warnings.length) {
        notify(`Importado con ajustes: ${warnings.slice(0, 3).join("; ")}${warnings.length > 3 ? "…" : ""}`, 6000);
      } else {
        notify("Personaje importado correctamente.");
      }
    } catch (error) {
      notify(`Importación rechazada: ${error.message}`, 7000);
    }
  }

  shareURL() {
    const json = JSON.stringify(this.toJSON());
    const compressed = LZString.compressToEncodedURIComponent(json);
    const url = new URL(location.href);
    url.hash = `c=${compressed}`;
    return url.toString();
  }

  async share() {
    const url = this.shareURL();
    try {
      await navigator.clipboard.writeText(url);
      notify("Enlace copiado. Compártelo para reproducir el personaje.");
    } catch {
      notify(`Copia este enlace: ${url.slice(0, 120)}…`, 8000);
    }
  }

  tryLoadFromHash() {
    if (!location.hash.startsWith("#c=")) return null;
    try {
      const compressed = location.hash.slice(3);
      const json = LZString.decompressFromEncodedURIComponent(compressed);
      if (!json) return null;
      return SchemaLoader.validate(this.schema, JSON.parse(json));
    } catch {
      return null;
    }
  }
}

/* =========================================================
   Bootstrap
   ========================================================= */

async function bootstrap() {
  const loading = $("#loading");
  let schema;
  try {
    schema = await SchemaLoader.load();
  } catch (error) {
    loading.textContent =
      "No se pudo cargar editor.json.\n\n" +
      "Sirve la carpeta por HTTP (por ejemplo: python -m http.server) " +
      "y vuelve a abrir la página.\n\n" +
      `Detalle: ${error.message}`;
    return;
  }

  // Recupera el estado desde la URL o desde localStorage.
  let initialState;
  const exporterProbe = {
    tryLoadFromHash: () => {
      if (!location.hash.startsWith("#c=")) return null;
      try {
        const compressed = location.hash.slice(3);
        const json = LZString.decompressFromEncodedURIComponent(compressed);
        if (!json) return null;
        return SchemaLoader.validate(schema, JSON.parse(json));
      } catch {
        return null;
      }
    }
  };
  const fromHash = exporterProbe.tryLoadFromHash();
  if (fromHash) {
    initialState = fromHash.state;
  } else {
    const stored = readStorage(STORAGE_KEY);
    if (stored) {
      try {
        initialState = SchemaLoader.validate(schema, JSON.parse(stored)).state;
      } catch {
        initialState = SchemaLoader.defaults(schema);
      }
    } else {
      initialState = SchemaLoader.defaults(schema);
    }
  }

  const stateManager = new StateManager(schema, initialState);

  // Normal map procedural (async, con fallback interno).
  let normalMap;
  try {
    normalMap = await createSkinNormal();
  } catch {
    // Fallback: normal map vacío.
    const data = new Uint8Array(4 * 4 * 4).fill(255);
    normalMap = new THREE.DataTexture(data, 4, 4);
    normalMap.needsUpdate = true;
  }

  const builder = new CharacterBuilder(new THREE.Scene(), normalMap);
  // Nota: SceneManager crea su propia escena; movemos el root al de la escena real.
  const sceneManager = new SceneManager($("#canvas"), builder);
  sceneManager.scene.add(builder.root);

  builder.update(initialState, Object.keys(GROUPS));
  sceneManager.applySceneSettings(initialState);

  const ui = new UIController(schema, stateManager);
  const exporter = new Exporter(stateManager, schema);

  // Suscripción: cada cambio actualiza la vista 3D.
  stateManager.subscribe((state, groups, refresh) => {
    builder.update(state, groups);
    if (groups.includes("scene") || refresh) {
      sceneManager.applySceneSettings(state);
    }
    if (refresh) {
      ui.syncFromState();
    }
    if (groups.includes("face") || groups.includes("materials")) {
      // La piel afecta varios sub-grupos.
      builder.update(state, ["face", "hair", "eyes"]);
    }
  });

  // --- Eventos de la barra superior ---

  $("#new").addEventListener("click", () => {
    if (stateManager.dirty && !confirm("¿Descartar los cambios actuales?")) return;
    const fresh = SchemaLoader.defaults(schema);
    stateManager.replace(fresh);
    ui.syncFromState();
    notify("Personaje nuevo creado.");
  });

  $("#import").addEventListener("click", () => $("#file").click());
  $("#file").addEventListener("change", async (e) => {
    const [file] = e.target.files;
    await exporter.importFile(file);
    ui.syncFromState();
    e.target.value = "";
  });

  $("#export").addEventListener("click", () => exporter.download());
  $("#copy").addEventListener("click", () => exporter.copy());
  $("#share").addEventListener("click", () => exporter.share());

  $("#theme").addEventListener("click", (e) => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    e.currentTarget.setAttribute("aria-pressed", next === "light" ? "true" : "false");
    try { localStorage.setItem("pce.theme", next); } catch { /* noop */ }
  });

  // --- Herramientas del viewport ---

  $("#randomize").addEventListener("click", () => {
    const seed = Number($("#seed").value) || 0;
    const fresh = randomizeCharacter(schema, seed);
    stateManager.replace(fresh);
    ui.syncFromState();
    notify(`Personaje generado con seed ${seed}.`);
  });

  $("#next-seed").addEventListener("click", () => {
    const seed = Math.floor(Math.random() * 4294967295);
    $("#seed").value = seed;
    const fresh = randomizeCharacter(schema, seed);
    stateManager.replace(fresh);
    ui.syncFromState();
  });

  $("#reset").addEventListener("click", () => {
    if (!confirm("¿Restablecer todos los valores por defecto?")) return;
    const fresh = SchemaLoader.defaults(schema);
    stateManager.replace(fresh);
    ui.syncFromState();
    sceneManager.resetCamera();
  });

  $("#screenshot").addEventListener("click", () => {
    try {
      const dataURL = sceneManager.screenshot();
      const link = document.createElement("a");
      link.href = dataURL;
      const name = safeFilename(stateManager.state.meta.characterName);
      link.download = `${name}_render.png`;
      link.click();
      notify("Captura descargada.");
    } catch {
      notify("No se pudo generar la captura.");
    }
  });

  $("#rotate").addEventListener("click", (e) => {
    sceneManager.autoRotate = !sceneManager.autoRotate;
    e.currentTarget.setAttribute("aria-pressed", sceneManager.autoRotate ? "true" : "false");
  });

  // --- Historial ---

  $("#undo").addEventListener("click", () => {
    stateManager.undo();
    ui.syncFromState();
  });
  $("#redo").addEventListener("click", () => {
    stateManager.redo();
    ui.syncFromState();
  });

  // --- Drag & drop sobre el viewport ---

  const viewport = $("#viewport");
  viewport.addEventListener("dragover", (e) => {
    e.preventDefault();
    viewport.classList.add("dragover");
  });
  viewport.addEventListener("dragleave", () => viewport.classList.remove("dragover"));
  viewport.addEventListener("drop", async (e) => {
    e.preventDefault();
    viewport.classList.remove("dragover");
    const [file] = e.dataTransfer.files;
    if (file) {
      await exporter.importFile(file);
      ui.syncFromState();
    }
  });

  // --- Atajos de teclado ---

  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    const isField = tag === "input" || tag === "textarea" || tag === "select";

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      exporter.download();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
      e.preventDefault();
      $("#file").click();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) { stateManager.redo(); } else { stateManager.undo(); }
      ui.syncFromState();
      return;
    }
    if (isField) return;

    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      $("#rotate").click();
    } else if (e.key.toLowerCase() === "r") {
      $("#randomize").click();
    } else if (e.key.toLowerCase() === "f") {
      sceneManager.resetCamera();
    }
  });

  // --- Estado inicial UI ---

  try {
    const savedTheme = localStorage.getItem("pce.theme");
    if (savedTheme) {
      document.documentElement.dataset.theme = savedTheme;
      $("#theme").setAttribute("aria-pressed", savedTheme === "light" ? "true" : "false");
    }
  } catch { /* noop */ }

  ui.syncFromState();
  $("#renderer-info").textContent =
    `${sceneManager.renderer.capabilities.isWebGL2 ? "WebGL2" : "WebGL1"} · ${sceneManager.fps} FPS`;

  // Guardado al cerrar.
  window.addEventListener("beforeunload", () => stateManager.save());

  loading.hidden = true;
  notify("Editor listo. Arrastra para orbitar, usa la rueda para hacer zoom.");
}

// Arranque tolerante a errores.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
