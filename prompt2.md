# 🎮 Prompt: Videojuego RPG de Terror en 3ra Persona — "Eclipse: Capítulo 1"
> Estilo visual **Roblox** (bloques / low-poly) · Cámara en **tercera persona** · Terror sci-fi

---

## 1. Concepto General
Crea un videojuego RPG de terror en **TERCERA PERSONA**, con estética tipo **Roblox** (personajes y escenarios en bloques, low-poly, colores planos con iluminación realista), pero con un **diseño cuidado y profesional**: buena composición de escenarios, iluminación atmosférica, sombras y efectos de niebla. Inspirado en **Dead Space** en cuanto a tensión y ambientación, pero con vista de cámara detrás del personaje.

El jugador controla a un técnico de a bordo que despierta en una nave espacial oscura y claustrofóbica tras la liberación de un virus desconocido. La única fuente de luz portátil es una **linterna**. Otros pasajeros infectados lo persiguen por los pasillos.

---

## 2. Historia — Capítulo 1: "Protocolo Eclipse"
La nave de carga **ISV Kepler-9** viaja rumbo a la colonia Meridian con 340 pasajeros en criosueño. Durante una rutina de mantenimiento, un contenedor biológico clasificado —cuyo origen se desconoce— se **rompe y libera un virus extraño**. Los primeros infectados mutan rápidamente: piel pálida, movimientos erráticos y agresividad letal. La alarma general despierta al **protagonista**, un técnico de a bordo, quien descubre los pasillos cubiertos de sangre y cuerpos retorcidos.

**Objetivo del capítulo:** recorrer los sectores oscuros de la nave, esquivar o enfrentar infectados y **alcanzar la salida de emergencia** en la bahía de escape. Al final, el jugador logra abrir la compuerta… pero algo lo observa desde las sombras (gancho para el Capítulo 2).

---

## 3. Cámara y Controles (Tercera Persona)
- Cámara detrás del personaje (**over-the-shoulder**), con suavizado y ligero retardo al girar.
- Zoom con la rueda del mouse o tecla configurable.
- Movimiento: **WASD** o flechas.
- Rotación: mouse (arrastrar o pointer lock).
- Acciones: correr (**Shift**), agacharse (**Ctrl**), interactuar (**E**).
- Linterna integrada al personaje; su cono se ve proyectado desde la mano/hombro hacia el frente.
- Animaciones básicas: caminar, correr, agacharse, idle nervioso, recibir daño.

---

## 4. Estructura de Archivos (escalable)

| Archivo | Función |
|---|---|
| `index.html` | Menú principal |
| `mapa1.html` | Mapa del Capítulo 1 |
| `mapa1.css` | Estilos del mapa y HUD |
| `personaje.js` | Lógica del personaje y cámara 3ra persona |
| `personaje.css` | Estilos del personaje, HUD y viñeta |
| `sonidos.js` | Audio ambiental y efectos |

### 🖥️ `index.html` — Menú principal
- Pantalla oscura con título **"ECLIPSE"** parpadeante y subtítulo *"Capítulo 1"*.
- Fondo: pasillo de la nave visto desde lejos, con luces rojas intermitentes y niebla.
- Botones: **Iniciar juego**, **Opciones**, **Salir**.
- Estilo visual: bloques low-poly, tipografía limpia.
- Enlaza a `mapa1.html` al iniciar.

### 🗺️ `mapa1.html` + `mapa1.css` — Mapa del Capítulo 1
- Sectores: **Pasillo A → Comedor → Enfermería → Bahía de escape**.
- Construido con geometría de bloques (estilo Roblox): paredes, tuberías, cajas, literas, consolas.
- Oscuridad general; luces de emergencia rojas intermitentes y algunas pantallas encendidas.
- Niebla volumétrica ligera y sombras dinámicas para dar profundidad.
- Colisiones con paredes, puertas bloqueadas y objetos interactuables (llaves, paneles, botiquines).
- HUD: barra de vida, indicador de batería de linterna, minimapa tenue (opcional), mensajes de objetivo.
- Diseño limpio y bien compuesto: nada de escenarios vacíos; cada zona cuenta una historia visual.

### 🧍 `personaje.js` + `personaje.css` — El protagonista
- Modelo en bloques estilo Roblox (cabeza, torso, brazos, piernas), texturas planas, colores desaturados.
- Cámara en tercera persona con **colisión** (no atraviesa paredes).
- Movimiento: caminar, correr (agota stamina), agacharse (silencioso).
- **Linterna:** cono de luz visible desde la mano; batería que se agota y puede recargarse.
- Estados: idle nervioso, caminar, correr, agachado, daño.
- HUD: barra de vida, stamina, batería, viñeta roja al recibir daño, respiración agitada visible.

### 🔊 `sonidos.js` — Audio ambiental
- Sonidos: pasos metálicos, respiración, latidos cardíacos, gruñidos lejanos, alarma, apertura de puertas, ataque infectado.
- Música ambiental de fondo (drones graves, tensión creciente).
- Volumen dinámico según proximidad de enemigos.
- Sonido diferenciado cuando el personaje corre, camina o se agacha.

---

## 5. Mecánicas Clave
- **Infectados:** enemigos lentos pero letales; se guían por sonido y luz.
- **Linterna:** puede atraer enemigos si se usa demasiado.
- **Sigilo:** agacharse reduce el ruido y la detección.
- **Huir:** el capítulo premia la evasión sobre el combate.
- **Salida:** al llegar a la bahía, se activa cinemática corta y fin del capítulo.

---

## 6. Ambientación y Diseño Visual
- Paleta: negros, grises metálicos, rojo sangre, ámbar de linterna, azul tenue de pantallas.
- Estética Roblox pero **cuidada**: proporciones coherentes, texturas planas bien elegidas, iluminación realista, sombras suaves y niebla.
- Escenarios detallados con props: tuberías, cajas, cables, cristales rotos, carteles de advertencia, sangre seca, cuerpos caídos.
- Iluminación tenue, sombras largas, viñeta en pantalla para reforzar la sensación de terror.
- Animaciones simples pero expresivas: el personaje respira agitado, se tambalea al correr, se encorva al agacharse.

---

## 7. Requisitos del Prompt
- Entregar código limpio y comentado para cada archivo.
- Permitir **copiar o descargar** cada archivo individualmente.
- Diseño modular para añadir capítulos futuros (`mapa2`, `personaje2`, etc.).
- Sin dependencias externas pesadas; HTML, CSS y JS puros (o **Three.js** si se necesita motor 3D).
- La **cámara en tercera persona** y la **estética Roblox** son **obligatorias**; el resto de mecánicas son las mismas que en la versión en primera persona.

---

> ✅ **Listo para usar como prompt en cualquier IA generadora de código.**