"use strict";

(() => {
  const CATEGORIAS = [
    "Todos",
    "Humanos (sanos)",
    "Zombies infectados",
    "Mutantes",
    "Animales contagiados"
  ];

  const ANIMACIONES = ["Caminar", "Correr", "Atacar", "Saltar"];

  // Cada diseño tiene accesorios, silueta y paleta propios.
  const PERSONAJES = [
    {
      id: "H-01", nombre: "Vega / Ingeniera",
      categoria: "Humanos (sanos)", tipo: "humano",
      variante: "ingeniera",
      color: "#a66c35", secundario: "#394c59",
      piel: "#b98f74", luz: "#68ffe0",
      descripcion:
        "Armadura industrial segmentada, visor de tres bandas y cortador de plasma. Preparada para reparar el casco exterior.",
      detalle:
        "Equipo: mochila de oxígeno, rodilleras y herramienta minera. Ataque: golpe frontal con el cortador."
    },
    {
      id: "H-02", nombre: "Rook / Seguridad",
      categoria: "Humanos (sanos)", tipo: "humano",
      variante: "guardia",
      color: "#425c76", secundario: "#202f40",
      piel: "#8d6650", luz: "#79cfff",
      descripcion:
        "Operador de seguridad con casco blindado, hombreras reforzadas y escudo de intervención.",
      detalle:
        "Equipo: escudo balístico, bastón eléctrico y coraza pesada. Ataque: barrido del bastón."
    },
    {
      id: "H-03", nombre: "Iris / Médica",
      categoria: "Humanos (sanos)", tipo: "humano",
      variante: "medica",
      color: "#c4d3ce", secundario: "#385b5e",
      piel: "#c09379", luz: "#87ffc5",
      descripcion:
        "Especialista de cuarentena con respirador, depósitos de antídoto y brazaletes de identificación médica.",
      detalle:
        "Equipo: inyector, respirador y dos cartuchos luminosos. Ataque: aplicación frontal del inyector."
    },
    {
      id: "Z-01", nombre: "Operario Hueco",
      categoria: "Zombies infectados", tipo: "zombie",
      variante: "obrero",
      color: "#8c6733", secundario: "#3d4643",
      piel: "#7f9071", luz: "#e4ed7c",
      descripcion:
        "Un minero de cuello torcido y uniforme deteriorado. La infección emerge entre las placas de su antiguo traje.",
      detalle:
        "Rasgos: casco industrial, mandíbula desplazada y cristales dorsales. Ataque: manotazo irregular."
    },
    {
      id: "Z-02", nombre: "Paciente Cero",
      categoria: "Zombies infectados", tipo: "zombie",
      variante: "paciente",
      color: "#a6b4aa", secundario: "#566761",
      piel: "#8f9c85", luz: "#aaff65",
      descripcion:
        "Sujeto de aislamiento con costillas oscuras, ojos contaminados y un brazo hipertrofiado por tejido mineral.",
      detalle:
        "Rasgos: bata de laboratorio y brazo asimétrico. Ataque: golpe pesado con la extremidad mutada."
    },
    {
      id: "Z-03", nombre: "Capitán Perdido",
      categoria: "Zombies infectados", tipo: "zombie",
      variante: "capitan",
      color: "#344c66", secundario: "#253341",
      piel: "#78887d", luz: "#ffb66e",
      descripcion:
        "El comandante conserva sus insignias, pero una antena parasitaria sustituye parte de su equipo de comunicaciones.",
      detalle:
        "Rasgos: gorra de mando, condecoraciones y apéndices dorsales. Ataque: zarpazo doble."
    },
    {
      id: "M-01", nombre: "Segador",
      categoria: "Mutantes", tipo: "mutante",
      variante: "segador",
      color: "#735d70", secundario: "#383345",
      piel: "#aaa68b", luz: "#ffbd69",
      descripcion:
        "Depredador alto de brazos alargados y cuchillas óseas. Su silueta estrecha se confunde con las tuberías.",
      detalle:
        "Rasgos: cráneo estrecho, doble hoja y espinas escapulares. Ataque: corte simultáneo de ambas cuchillas."
    },
    {
      id: "M-02", nombre: "Bastión",
      categoria: "Mutantes", tipo: "mutante",
      variante: "bastion",
      color: "#695f50", secundario: "#383e3c",
      piel: "#8a8267", luz: "#ff884b",
      descripcion:
        "Masa blindada de hombros desproporcionados y núcleo anaranjado. Sus puños funcionan como martillos de demolición.",
      detalle:
        "Rasgos: placas superpuestas, brazos enormes y núcleo torácico. Ataque: impacto de ambos puños."
    },
    {
      id: "M-03", nombre: "Oráculo Esporal",
      categoria: "Mutantes", tipo: "mutante",
      variante: "oraculo",
      color: "#675379", secundario: "#30334d",
      piel: "#8b88a0", luz: "#ce8bff",
      descripcion:
        "Organismo de cuatro brazos con una corona de esporas y un único ojo luminoso que rastrea el movimiento.",
      detalle:
        "Rasgos: extremidades adicionales y corona ramificada. Ataque: contracción de los cuatro brazos."
    },
    {
      id: "A-01", nombre: "Sabueso de Bodega",
      categoria: "Animales contagiados", tipo: "animal",
      variante: "sabueso",
      color: "#59665a", secundario: "#303b3c",
      piel: "#8c9375", luz: "#b7ff6d",
      descripcion:
        "Cuadrúpedo de mandíbula reforzada y espinas lumbares. Recorre los corredores siguiendo vibraciones.",
      detalle:
        "Rasgos: hocico largo, orejas angulares y cola infectada. Ataque: embestida y mordisco."
    },
    {
      id: "A-02", nombre: "Arácnido de Reactor",
      categoria: "Animales contagiados", tipo: "animal",
      variante: "arana",
      color: "#655063", secundario: "#343245",
      piel: "#aa9a86", luz: "#ff7959",
      descripcion:
        "Arácnido de ocho patas articuladas, abdomen voluminoso y múltiples ojos encendidos por la radiación.",
      detalle:
        "Rasgos: ocho patas, pinzas delanteras y depósitos dorsales. Ataque: elevación de las patas anteriores."
    },
    {
      id: "A-03", nombre: "Rata de Conducto",
      categoria: "Animales contagiados", tipo: "animal",
      variante: "rata",
      color: "#766b76", secundario: "#423b4c",
      piel: "#a58b8e", luz: "#70ffd2",
      descripcion:
        "Roedor agrandado por la infección, con orejas deformadas, cola segmentada y nódulos bioluminiscentes.",
      detalle:
        "Rasgos: incisivos expuestos, nódulos verdes y cola larga. Ataque: salto corto con mordisco."
    }
  ];

  const $ = (selector) => document.querySelector(selector);
  const grid = $("#catalog");
  const dialog = $("#viewer");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  let categoria = "Todos";
  let busqueda = "";
  let pausado = reducedMotion.matches;
  let vistas = [];
  let vistaModal = null;

  // Matemática y proyección ortográfica 3D.
  const rotX = ([x, y, z], a) => [
    x,
    y * Math.cos(a) - z * Math.sin(a),
    y * Math.sin(a) + z * Math.cos(a)
  ];

  const rotY = ([x, y, z], a) => [
    x * Math.cos(a) + z * Math.sin(a),
    y,
    -x * Math.sin(a) + z * Math.cos(a)
  ];

  const rotZ = ([x, y, z], a) => [
    x * Math.cos(a) - y * Math.sin(a),
    x * Math.sin(a) + y * Math.cos(a),
    z
  ];

  function tono(hex, factor) {
    const n = parseInt(hex.slice(1), 16);
    const rgb = [n >> 16, (n >> 8) & 255, n & 255];
    return `rgb(${rgb.map(v =>
      Math.max(0, Math.min(255, Math.round(v * factor)))
    ).join(",")})`;
  }

  const CARAS = [
    { indices: [0, 3, 2, 1], luz: .67 },
    { indices: [4, 5, 6, 7], luz: 1.08 },
    { indices: [0, 4, 7, 3], luz: .77 },
    { indices: [1, 2, 6, 5], luz: .88 },
    { indices: [3, 7, 6, 2], luz: 1.24 },
    { indices: [0, 1, 5, 4], luz: .55 }
  ];

  class Vista {
    constructor(canvas, personaje) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.personaje = personaje;
      this.animacion = "Caminar";
      this.tiempo = 0;
      this.yaw = -.55;
      this.visible = true;
      this.drag = null;

      canvas.addEventListener("pointerdown", e => {
        this.drag = { x: e.clientX, yaw: this.yaw };
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener("pointermove", e => {
        if (this.drag) {
          this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * .012;
        }
      });
      const soltar = () => { this.drag = null; };
      canvas.addEventListener("pointerup", soltar);
      canvas.addEventListener("pointercancel", soltar);
      canvas.addEventListener("lostpointercapture", soltar);
    }

    cambiar(animacion) {
      this.animacion = animacion;
      this.tiempo = 0;
    }

    dibujar(dt) {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = rect.width;
      const h = rect.height;
      if (this.canvas.width !== Math.round(w * dpr) ||
          this.canvas.height !== Math.round(h * dpr)) {
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
      }

      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!pausado) this.tiempo += dt;

      this.w = w;
      this.h = h;
      this.escala = Math.min(w / 6.8, h / 6.2);
      this.caras = [];

      const t = this.tiempo;
      const correr = this.animacion === "Correr";
      const atacar = this.animacion === "Atacar";
      const saltar = this.animacion === "Saltar";
      const fase = t * (correr ? 11 : 6);
      const paso = Math.sin(fase) * (correr ? .85 : .48);
      const pulso = atacar ? Math.pow((Math.sin(t * 7) + 1) / 2, 3) : 0;
      const salto = saltar ? Math.max(0, Math.sin(t * 3.5)) : 0;

      this.elevacion = saltar
        ? salto * 1.05
        : atacar ? .04 * pulso : Math.abs(Math.cos(fase)) * .055;

      this.desplazamiento = atacar ? pulso * .35 : 0;

      this.suelo(salto);

      if (this.personaje.tipo === "animal") {
        this.animal(paso, pulso, salto);
      } else {
        this.bipedo(paso, pulso, salto);
      }

      // Orden del pintor: las superficies lejanas se dibujan primero.
      this.caras.sort((a, b) => a.profundidad - b.profundidad);
      for (const cara of this.caras) {
        ctx.beginPath();
        cara.puntos.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p[0], p[1]);
          else ctx.lineTo(p[0], p[1]);
        });
        ctx.closePath();
        ctx.fillStyle = cara.color;
        ctx.fill();
        ctx.strokeStyle = cara.brillo ? "#ffffff32" : "#050a102d";
        ctx.lineWidth = .65;
        ctx.stroke();
      }

      ctx.fillStyle = "#a3b8c5";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(
        `${this.animacion.toUpperCase()} / ${pausado ? "PAUSA" : "ACTIVO"}`,
        w / 2, h - 14
      );
    }

    camara(p) {
      return rotX(rotY(p, this.yaw), .27);
    }

    proyectar([x, y, z]) {
      return [
        this.w / 2 + x * this.escala,
        this.h * .83 - y * this.escala
      ];
    }

    suelo(salto) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(this.w / 2, this.h * .83);
      ctx.scale(1, .29);
      ctx.beginPath();
      ctx.ellipse(0, 0, this.escala * 2.6, this.escala * 2.6, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#142731";
      ctx.fill();
      ctx.strokeStyle = "#65d8ca35";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(
        0, 0,
        this.escala * (1.25 - salto * .18),
        this.escala * (.9 - salto * .12),
        0, 0, Math.PI * 2
      );
      ctx.fillStyle = `rgba(0,0,0,${.45 - salto * .15})`;
      ctx.fill();
      ctx.restore();
    }

    caja(x, y, z, sx, sy, sz, color, opciones = {}) {
      const { rx = 0, rz = 0, pivote = null, brillo = false } = opciones;
      const vertices = [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
      ].map(([a, b, c]) => {
        let p = [a * sx / 2, b * sy / 2, c * sz / 2];
        p = rotZ(rotX(p, rx), rz);
        p = [p[0] + x, p[1] + y, p[2] + z];

        if (pivote) {
          let q = [
            p[0] - pivote.x,
            p[1] - pivote.y,
            p[2] - pivote.z
          ];
          q = rotZ(rotX(q, pivote.rx || 0), pivote.rz || 0);
          p = [q[0] + pivote.x, q[1] + pivote.y, q[2] + pivote.z];
        }

        p[1] += this.elevacion;
        p[2] += this.desplazamiento;
        return this.camara(p);
      });

      for (const cara of CARAS) {
        const puntos3D = cara.indices.map(i => vertices[i]);
        this.caras.push({
          puntos: puntos3D.map(p => this.proyectar(p)),
          profundidad: puntos3D.reduce((s, p) => s + p[2], 0) / 4,
          color: tono(color, brillo ? 1.2 : cara.luz),
          brillo
        });
      }
    }

    bipedo(paso, ataque, salto) {
      const p = this.personaje;
      const v = p.variante;
      const zombie = p.tipo === "zombie";
      const grande = v === "bastion";
      const alto = v === "segador";
      const ancho = grande ? 1.65 : alto ? .85 : 1.05;
      const hombro = alto ? 3.05 : 2.75;
      const cabezaY = alto ? 3.8 : 3.45;
      const andar = this.animacion === "Caminar" || this.animacion === "Correr";
      const movimiento = andar ? paso : 0;
      const b = (...args) => this.caja(...args);

      // Piernas, botas y protecciones articuladas.
      for (const lado of [-1, 1]) {
        const x = lado * ancho * .27;
        const pivote = {
          x, y: 1.65, z: 0,
          rx: movimiento * lado - salto * .4
        };
        b(x, 1.02, 0, .43, 1.18, .48, p.secundario, { pivote });
        b(x, .38, .12, .47, .32, .72, p.secundario, { pivote });
        b(x, .98, .27, .34, .35, .12, p.color, { pivote });
        b(x, .48, .42, .3, .08, .035, p.luz, { pivote, brillo: true });
      }

      b(0, 1.72, 0, ancho, .32, .6, p.secundario);
      b(0, 2.3, 0, ancho, 1.02, .62, p.color);
      b(0, 2.4, .34, ancho * .79, .59, .13, p.secundario);
      b(0, 1.79, .35, .24, .15, .1, "#929d9d");

      // Mochila y columna luminosa.
      b(0, 2.35, -.48, ancho * .67, .82, .32, p.secundario);
      for (let i = 0; i < 4; i++) {
        b(0, 2.04 + i * .18, -.66, .14, .1, .06, p.luz, { brillo: true });
      }

      b(0, cabezaY - .46, 0, .32, .26, .32, p.piel);
      b(zombie ? .1 : 0, cabezaY, .02,
        alto ? .57 : .78, alto ? .85 : .7, .7,
        p.tipo === "humano" ? p.color : p.piel,
        { rz: zombie ? -.14 : 0 });

      if (p.tipo === "humano") {
        if (v === "ingeniera") {
          for (let i = 0; i < 3; i++) {
            b(0, cabezaY - .16 + i * .14, .39,
              .59, .065, .05, p.luz, { brillo: true });
          }
          b(0, cabezaY + .4, 0, .25, .12, .7, p.secundario);
        } else if (v === "guardia") {
          b(0, cabezaY + .03, .39, .66, .24, .09, p.luz, { brillo: true });
          b(0, cabezaY + .39, 0, .88, .14, .78, p.secundario);
        } else {
          b(0, cabezaY + .08, .38, .62, .22, .05, "#253d44");
          for (const lado of [-1, 1]) {
            b(lado * .16, cabezaY + .08, .42, .12, .07, .03, p.luz);
            b(lado * .24, cabezaY - .19, .43, .18, .2, .2, p.secundario);
          }
          b(0, cabezaY - .19, .45, .25, .2, .15, "#8aabab");
        }
      } else {
        const ojos = v === "oraculo" ? [0] : [-.19, .19];
        for (const x of ojos) {
          b(x, cabezaY + .08, .4, v === "oraculo" ? .3 : .12,
            .12, .06, p.luz, { brillo: true });
        }
        b(.03, cabezaY - .2, .4, .42, .12, .12, "#273034");
        for (let i = 0; i < 4; i++) {
          b(-.13 + i * .09, cabezaY - .18, .48,
            .045, .12, .04, "#c2bea1");
        }
      }

      // Brazos y accesorios unidos a sus articulaciones.
      for (const lado of [-1, 1]) {
        const x = lado * (ancho / 2 + (grande ? .39 : .26));
        const largo = alto ? 1.65 : grande ? 1.4 : 1.12;
        const grosor = grande ? .75 : v === "paciente" && lado === 1 ? .68 : .42;
        const anguloAtaque = -1.5 * ataque;
        const pivote = {
          x, y: hombro, z: 0,
          rx: -movimiento * lado + anguloAtaque -
            (zombie ? .38 : 0) - salto * 1.25,
          rz: lado * (grande ? .15 : .07)
        };
        const fin = hombro - largo;

        b(x, hombro - largo / 2, 0,
          grosor, largo, .5, p.color, { pivote });
        b(x, hombro, 0, grosor + .14, .3, .65, p.secundario, { pivote });
        b(x, fin, .03, grosor, .3, .48,
          p.tipo === "humano" ? p.secundario : p.piel, { pivote });
        b(x, hombro - .3, .28, .18, .22, .04, p.luz, { pivote, brillo: true });

        if (alto) {
          b(x, fin - .28, .25, .17, .95, .16, "#d5ccb0",
            { pivote, rx: -.25, rz: -lado * .2 });
        }
        if (grande) {
          b(x, fin, .1, .92, .65, .8, p.secundario, { pivote });
          b(x, fin, .53, .55, .16, .06, p.luz, { pivote, brillo: true });
        }
        if (v === "ingeniera" && lado === 1) {
          b(x, fin, .4, .3, .25, .8, "#677b83", { pivote });
          b(x, fin, .85, .65, .19, .12, p.luz, { pivote, brillo: true });
        }
        if (v === "guardia") {
          if (lado === -1) {
            b(x, fin + .28, .48, .92, 1.32, .16, "#344957", { pivote });
            b(x, fin + .28, .59, .12, .92, .035, p.luz, { pivote, brillo: true });
          } else {
            b(x, fin + .35, .27, .12, 1.05, .12, "#62727c", { pivote });
            b(x, fin + .83, .27, .18, .3, .18, p.luz, { pivote, brillo: true });
          }
        }
        if (v === "medica" && lado === 1) {
          b(x, fin, .4, .18, .18, .65, "#d2dedb", { pivote });
          b(x, fin, .77, .05, .05, .18, p.luz, { pivote });
        }
      }

      // Detalles que diferencian cada silueta.
      if (v === "medica") {
        b(0, 2.43, .43, .42, .12, .05, "#d85059");
        b(0, 2.43, .44, .12, .42, .05, "#d85059");
        for (const lado of [-1, 1]) {
          b(lado * .3, 2.3, -.76, .19, .75, .22, p.luz, { brillo: true });
        }
      }

      if (zombie) {
        for (let i = 0; i < 3; i++) {
          b(.05, 2.05 + i * .19, .43, .65 - i * .08,
            .07, .08, "#292f32", { rz: -.15 });
          b((i - 1) * .3, 2.85 + i * .12, -.4,
            .14, .65, .17, p.piel, { rz: (i - 1) * -.3 });
        }
      }

      if (v === "obrero") {
        b(.1, cabezaY + .37, 0, .91, .17, .82, "#b38d38");
        b(.1, cabezaY + .32, .48, .23, .18, .11, p.luz, { brillo: true });
      }

      if (v === "capitan") {
        b(.1, cabezaY + .38, .03, .87, .2, .75, p.secundario);
        b(.1, cabezaY + .29, .44, .87, .08, .3, p.secundario);
        for (let i = 0; i < 3; i++) {
          b(-.25 + i * .15, 2.6, .44, .08, .16, .04, "#bba36c");
        }
        b(.48, cabezaY + .42, -.12, .12, .8, .12, p.piel, { rz: -.35 });
      }

      if (p.tipo === "mutante") {
        b(0, 2.43, .46, grande ? .58 : .26,
          grande ? .48 : .63, .13, p.luz, { brillo: true });
        for (const lado of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            b(lado * (.4 + i * .23), hombro + .17, -.18,
              .16, .65 - i * .1, .19, p.piel, { rz: -lado * .5 });
          }
        }
      }

      if (v === "oraculo") {
        for (let i = -2; i <= 2; i++) {
          b(i * .23, cabezaY + .57 + (.25 - Math.abs(i) * .1),
            -.03, .13, .7, .14, p.color, { rz: -i * .2 });
          b(i * .3, cabezaY + .94, -.03,
            .17, .17, .17, p.luz, { brillo: true });
        }
        for (const lado of [-1, 1]) {
          const pivote = {
            x: lado * .6, y: 2.25, z: -.15,
            rx: -ataque * 1.8 + movimiento * lado,
            rz: lado * .65
          };
          b(lado * .6, 1.8, -.15, .27, .9, .3, p.color, { pivote });
          b(lado * .6, 1.28, -.15, .24, .25, .25, p.piel, { pivote });
        }
      }
    }

    animal(paso, ataque, salto) {
      const p = this.personaje;
      const arana = p.variante === "arana";
      const rata = p.variante === "rata";
      const b = (...args) => this.caja(...args);
      const andar = this.animacion === "Caminar" || this.animacion === "Correr";
      const movimiento = andar ? paso : 0;
      const cuerpoY = arana ? 1.02 : 1.3;

      b(0, cuerpoY, -.15, arana ? 1.25 : .86,
        arana ? .68 : .85, arana ? 1.5 : 1.8, p.color);
      b(0, cuerpoY + .17, -.5, arana ? 1.05 : .65,
        .35, 1.05, p.secundario);

      const cantidad = arana ? 4 : 2;
      for (const lado of [-1, 1]) {
        for (let i = 0; i < cantidad; i++) {
          const z = arana ? -.8 + i * .49 : -.75 + i * 1.35;
          const x = lado * (arana ? .63 : .42);
          const pivote = {
            x, y: cuerpoY, z,
            rx: movimiento * (i % 2 === 0 ? lado : -lado) -
              (i === cantidad - 1 ? ataque * .85 : 0) - salto * .3,
            rz: arana ? lado * .85 : lado * .08
          };
          b(x, cuerpoY - .36, z,
            arana ? .16 : .25, .8, .27, p.secundario, { pivote });
          b(x, cuerpoY - .82, z + .1,
            arana ? .13 : .27, .35, .42, p.color, { pivote });
          b(x, cuerpoY - .98, z + .24,
            .18, .1, .17, p.piel, { pivote });
        }
      }

      const cabeza = {
        x: 0, y: cuerpoY + .1, z: .8,
        rx: -ataque * .45
      };
      b(0, cuerpoY + .08, .93, arana ? .76 : .68,
        .58, .65, p.color, { pivote: cabeza });
      b(0, cuerpoY - .08, 1.35, .48, .3, rata ? .49 : .65,
        p.secundario, { pivote: cabeza });

      for (const lado of [-1, 1]) {
        b(lado * .25, cuerpoY + .22, 1.28, .14, .12, .07,
          p.luz, { pivote: cabeza, brillo: true });
        b(lado * .16, cuerpoY - .25, 1.5, .09,
          .2 + ataque * .12, .14, "#d4c8a8", { pivote: cabeza });

        if (arana) {
          b(lado * .12, cuerpoY + .35, 1.27, .09, .09, .07,
            p.luz, { pivote: cabeza, brillo: true });
          b(lado * .42, cuerpoY - .12, 1.4, .12, .45, .14,
            p.piel, { pivote: cabeza, rz: lado * .4 });
        } else {
          b(lado * .29, cuerpoY + .52, .85,
            rata ? .39 : .19, rata ? .45 : .5, .15,
            rata ? p.piel : p.secundario,
            { pivote: cabeza, rz: -lado * .2 });
        }
      }

      if (!arana) {
        for (let i = 0; i < (rata ? 7 : 4); i++) {
          b(
            Math.sin(this.tiempo * 4 + i * .6) * i * .035,
            cuerpoY - .1 - i * .065,
            -1.12 - i * .25,
            .16 - i * .012, .16 - i * .012, .31,
            rata ? p.piel : p.color
          );
        }
      }

      for (let i = 0; i < 4; i++) {
        b((i % 2 ? 1 : -1) * .2,
          cuerpoY + .53, -.75 + i * .36,
          rata || arana ? .3 : .15,
          rata || arana ? .24 : .48,
          .22, i % 2 ? p.luz : p.piel,
          { brillo: Boolean(i % 2), rz: i % 2 ? .2 : -.2 });
      }
    }
  }

    // API compartida: el catálogo sigue siendo la única fuente de personajes.
  window.EclipseCatalogo = Object.freeze({
    personajes: PERSONAJES,
    categorias: CATEGORIAS,
    animaciones: ANIMACIONES,
    Vista
  });

  // En el menú y en el juego no se inicializa la interfaz del catálogo.
  if (!grid || !dialog) return;


  function botonesAnimacion(contenedor, vista) {
    contenedor.replaceChildren();
    for (const nombre of ANIMACIONES) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = nombre;
      button.setAttribute("aria-pressed", String(nombre === vista.animacion));
      button.addEventListener("click", () => {
        vista.cambiar(nombre);
        for (const sibling of contenedor.children) {
          sibling.setAttribute("aria-pressed", String(sibling === button));
        }
      });
      contenedor.append(button);
    }
  }

  const observador = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const vista = vistas.find(v => v.canvas === entry.target);
      if (vista) vista.visible = entry.isIntersecting;
    }
  }, { rootMargin: "100px" });

  function abrirFicha(personaje) {
    $("#viewer-title").textContent = personaje.nombre;
    $("#viewer-description").textContent = personaje.descripcion;
    $("#viewer-extra").textContent =
      `${personaje.id} / ${personaje.categoria}. ${personaje.detalle}`;

    // Reemplazar el canvas evita acumular eventos al abrir varias fichas.
    const anterior = $("#viewer-canvas");
    const canvas = anterior.cloneNode(false);
    anterior.replaceWith(canvas);

    vistaModal = new Vista(canvas, personaje);
    botonesAnimacion($("#viewer-actions"), vistaModal);
    dialog.showModal();
  }

  function normalizar(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function renderizarCatalogo() {
    observador.disconnect();
    vistas = [];
    grid.replaceChildren();

    const filtrados = PERSONAJES.filter(p => {
      const coincideCategoria = categoria === "Todos" || p.categoria === categoria;
      const texto = normalizar(
        `${p.nombre} ${p.categoria} ${p.descripcion} ${p.detalle}`
      );
      return coincideCategoria && texto.includes(normalizar(busqueda));
    });

    $("#count").textContent =
      `${filtrados.length} de ${PERSONAJES.length} sujetos / 4 animaciones por sujeto`;

    for (const p of filtrados) {
      const article = document.createElement("article");
      article.className = "card";

      // Solo se interpolan datos locales definidos en este archivo.
      article.innerHTML = `
        <div class="viewport">
          <span class="badge">${p.categoria}</span>
          <span class="serial">${p.id}</span>
          <canvas role="img" aria-label="Modelo animado de ${p.nombre}"></canvas>
        </div>
        <div class="content">
          <h2>${p.nombre}</h2>
          <p class="description">${p.descripcion}</p>
          <div class="actions" aria-label="Animaciones de ${p.nombre}"></div>
          <button class="details" type="button">Inspeccionar sujeto</button>
        </div>
      `;

      grid.append(article);
      const vista = new Vista(article.querySelector("canvas"), p);
      vistas.push(vista);
      botonesAnimacion(article.querySelector(".actions"), vista);
      article.querySelector(".details").addEventListener("click", () => abrirFicha(p));
      observador.observe(vista.canvas);
    }

    if (!filtrados.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No hay sujetos que coincidan con tu búsqueda.";
      grid.append(empty);
    }
  }

  for (const nombre of CATEGORIAS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = nombre;
    button.setAttribute("aria-pressed", String(nombre === categoria));
    button.addEventListener("click", () => {
      categoria = nombre;
      for (const sibling of $("#filters").children) {
        sibling.setAttribute("aria-pressed", String(sibling === button));
      }
      renderizarCatalogo();
    });
    $("#filters").append(button);
  }

  $("#search").addEventListener("input", e => {
    busqueda = e.target.value;
    renderizarCatalogo();
  });

  function actualizarPausa() {
    $("#pause").textContent = pausado ? "Reanudar animaciones" : "Pausar animaciones";
    $("#pause").setAttribute("aria-pressed", String(pausado));
  }

  $("#pause").addEventListener("click", () => {
    pausado = !pausado;
    actualizarPausa();
  });

  $("#close-viewer").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { vistaModal = null; });
  dialog.addEventListener("click", e => {
    if (e.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right ||
        e.clientY < r.top || e.clientY > r.bottom) {
      dialog.close();
    }
  });

  let anterior = performance.now();
  let acumulado = 0;

  function frame(ahora) {
    const dt = Math.min((ahora - anterior) / 1000, .05);
    anterior = ahora;
    acumulado += dt;

    // Límite aproximado de 30 FPS para las vistas del catálogo.
    if (!document.hidden && acumulado >= 1 / 30) {
      if (dialog.open && vistaModal) {
        vistaModal.dibujar(acumulado);
      } else {
        for (const vista of vistas) {
          if (vista.visible) vista.dibujar(acumulado);
        }
      }
      acumulado = 0;
    }

    requestAnimationFrame(frame);
  }

  actualizarPausa();
  renderizarCatalogo();
  requestAnimationFrame(frame);
})();
