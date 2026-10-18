# 📱 Prompt: Videojuego de Terror Móvil — "Eclipse: Capítulo 1"
> Estilo **Minecraft Dungeons** · **Exclusivo táctil** · **Web responsive** · Personajes del catálogo existente

---

## 1. Concepto General
Crea un videojuego de terror RPG **exclusivamente para dispositivos móviles (táctil)**, como web responsive que se adapta a cualquier pantalla (móvil, tablet, **landscape o portrait**, con recomendación de landscape). La estética es tipo **Minecraft Dungeons**: vista **isométrica / top-down** con ligera inclinación, modelos de bloques **chunky** con bordes biselados, colores saturados con iluminación atmosférica, sombras suaves, luz de contorno (*rim light*) y partículas en los impactos. Accesible, pulido, oscuro y tenso.

El jugador controla a un superviviente en una nave espacial oscura tras la liberación de un virus. Debe escapar a través de sectores infectados hasta la bahía de emergencia.

---

## 2. 🔑 Fuente Oficial de Personajes (IMPORTANTE)
El juego **toma los personajes directamente** de los archivos ya existentes que se proporcionan:

- `catalogo.html`
- `catalogo_personajes.js`

Ese catálogo contiene **12 sujetos** organizados en 4 categorías:

| Categoría | Personajes |
|---|---|
| **Humanos (sanos)** | H-01 Vega/Ingeniera, H-02 Rook/Seguridad, H-03 Iris/Médica |
| **Zombies infectados** | Z-01 Operario Hueco, Z-02 Paciente Cero, Z-03 Capitán Perdido |
| **Mutantes** | M-01 Segador, M-02 Bastión, M-03 Oráculo Esporal |
| **Animales contagiados** | A-01 Sabueso de Bodega, A-02 Arácnido de Reactor, A-03 Rata de Conducto |

Cada personaje ya trae: `id`, `nombre`, `categoria`, `tipo` (humano/zombie/mutante/animal), `variante`, paleta (`color`, `secundario`, `piel`, `luz`) y descripciones.

**Instrucciones:**
- El jugador podrá **elegir su personaje jugable** desde el catálogo (los 3 humanos sanos son los seleccionables por defecto; los infectados y mutantes se usan como **enemigos**).
- Los enemigos del Capítulo 1 se generan a partir de las categorías **"Zombies infectados"**, **"Mutantes"** y **"Animales contagiados"** del mismo catálogo.
- Reutiliza las animaciones base ya definidas (`Caminar`, `Correr`, `Atacar`, `Saltar`) y adáptalas a la vista isométrica.
- **NO dupliques datos:** importa o lee los personajes desde `catalogo_personajes.js` para que el juego sea escalable cuando se añadan nuevos sujetos al catálogo.

---

## 3. Historia — Capítulo 1: "Protocolo Eclipse"
La nave de carga **ISV Kepler-9** viaja rumbo a la colonia Meridian con 340 pasajeros en criosueño. Durante una rutina de mantenimiento, un contenedor biológico clasificado se **rompe y libera un virus extraño**. Los primeros infectados mutan rápidamente: piel pálida, movimientos erráticos y agresividad letal. La alarma general despierta al **protagonista**, quien descubre los pasillos cubiertos de sangre y cuerpos retorcidos.

**Objetivo del capítulo:** recorrer los sectores oscuros de la nave, esquivar o enfrentar infectados y **alcanzar la salida de emergencia** en la bahía de escape. Al final, se abre la compuerta… pero algo lo observa desde las sombras (gancho para el Capítulo 2).

---

## 4. Cámara y Controles Táctiles (Móvil)
- Cámara **ISOMÉTRICA** (ángulo fijo ~55°, ligeramente inclinada) que sigue al personaje con suavizado. Sin rotación libre; el ángulo se ajusta solo.
- **Zoom con pellizco** de dos dedos (*pinch-to-zoom*).

### Controles en pantalla (todos con área táctil ≥ 48×48 px)
- 🕹️ **Joystick virtual** (izquierda) para mover al personaje.
- ⚔️ Botón grande de **ATAQUE** (derecha, abajo).
- 🌀 Botón de **ESQUIVA / RODAR**.
- 🚪 Botón de **INTERACTUAR** (puertas, paneles, objetos).
- 🔦 Botón de **LINTERNA** (toggle on/off, consume batería).
- 🥷 Botones opcionales: **sigilo** (agacharse) y **sprint**.

**Extras:**
- Los controles aparecen solo durante el juego y se ocultan en menús y cinemáticas.
- Soporte **multi-touch** (mover y atacar a la vez).
- **Vibración háptica** (`Vibration API`) en golpes, daño y ataques enemigos.
- En tablets, los controles se reposicionan con márgenes proporcionales.

---

## 5. Estructura de Archivos (escalable y responsive)

| Archivo | Función |
|---|---|
| `index.html` | Menú principal móvil |
| `mapa1.html` | Mapa del Capítulo 1 (isométrico) |
| `mapa1.css` | Estilos del mapa, HUD y controles |
| `personaje.js` | Lógica del personaje, cámara iso, controles táctiles y consumo del catálogo |
| `personaje.css` | Estilos del HUD táctil y viñetas |
| `sonidos.js` | Audio ambiental y efectos |
| `catalogo.html` | Catálogo existente (se reutiliza) |
| `catalogo_personajes.js` | Catálogo existente (fuente de personajes jugables y enemigos) |

### 🖥️ `index.html` — Menú principal móvil
- Pantalla completa, portrait y landscape.
- Título **"ECLIPSE"** con subtítulo *"Capítulo 1"*.
- Fondo animado: pasillo isométrico de la nave con luces rojas, niebla y algún infectado cruzando al fondo.
- Botones grandes táctiles: **Iniciar**, **Seleccionar personaje**, **Opciones**, **Salir**.
- Enlaza a `mapa1.html` al iniciar.
- "Seleccionar personaje" abre un mini-catálogo leyendo `catalogo_personajes.js` (solo los 3 humanos sanos).

### 🗺️ `mapa1.html` + `mapa1.css` — Mapa del Capítulo 1
- Vista isométrica con escenario construido en **bloques chunky con biseles** (estilo Minecraft Dungeons).
- Sectores: **Pasillo A → Comedor → Enfermería → Bahía de escape**, conectados por puertas.
- Niveles con **altura** (plataformas, escaleras cortas, pasarelas) para dar profundidad visual y táctica.
- Iluminación: oscuridad general, luces rojas de emergencia, pantallas encendidas, niebla suave y luz de contorno sobre los personajes.
- Props: tuberías, cajas, literas, consolas, sangre, cristales rotos, carteles de advertencia.
- Colisiones, puertas bloqueadas y objetos interactuables.
- HUD táctil: barra de vida, batería, stamina, minimapa tenue, mensajes de objetivo grandes y legibles.
- Se sugiere landscape al usuario si está en portrait.

### 🧍 `personaje.js` + `personaje.css` — Protagonista y controles
- El personaje jugable se carga desde `catalogo_personajes.js` según lo elegido en el menú.
- Modelo **chunky estilo Minecraft Dungeons**: bloques con biseles redondeados, contorno sutil, paleta ya definida por el catálogo.
- Cámara isométrica con seguimiento suavizado y colisiones.
- Movimiento en 8 direcciones con joystick virtual.
- Ataque con arma o cortador (según personaje): animación de golpe + partículas + sacudida de cámara.
- Esquiva / rodar: desplazamiento rápido con invulnerabilidad breve.
- **Linterna:** cono visible isométrico proyectado sobre suelo y paredes; consume batería.
- Estados: idle, caminar, correr, agachado, atacar, recibir daño, morir.
- HUD táctil: barras grandes, viñeta roja al recibir daño, respiración agitada visible, cooldowns circulares.
- Vibración al recibir/efectuar ataques.
- **Responsive:** controles reescalados, safe areas del dispositivo respetadas (notch, bordes redondeados).

### 🔊 `sonidos.js` — Audio móvil
- Sonidos: pasos, respiración, latidos, gruñidos lejanos, alarma, puertas, ataques, ambiente drone de tensión.
- Volumen dinámico según proximidad de enemigos.
- El audio se inicializa **tras el primer toque** (requisito de navegadores móviles).

---

## 6. Mecánicas Clave (adaptadas a móvil y a Dungeons)
- **Vista y combate tipo ARPG** (como Minecraft Dungeons): enemigos que rodean, ataque con arma, esquiva táctica, oleadas, habilidades con cooldown.
- **Infectados:** se guían por sonido y luz. Los zombies son lentos pero numerosos; los mutantes son duros; los animales son rápidos.
- **Linterna:** atrae enemigos si se usa demasiado.
- **Sigilo:** agacharse reduce ruido y detección.
- **Huir:** se premia la evasión cuando hay demasiados enemigos.
- **Salida:** al llegar a la bahía se activa cinemática corta y fin del capítulo.

---

## 7. Diseño Visual y Ambientación (Minecraft Dungeons)
- Estética **chunky y colorida pero oscura**: bloques con biseles, contornos limpios, colores planos con degradados suaves.
- Paleta: negros, grises metálicos, rojo sangre, ámbar de linterna, azul tenue de pantallas, acentos neón de la paleta de cada personaje (`color` / `luz` del catálogo).
- Iluminación atmosférica con niebla, sombras suaves y **luz de contorno** que resalta a los personajes sobre el fondo.
- Cámara isométrica con cierta altura para ver el escenario.
- Animaciones simples pero con **peso**: cada ataque mueve al personaje, hay sacudida de cámara y partículas.
- Efectos: chispas, polvo, sangre estilizada (no gore gráfico), destellos en interacciones.

---

## 8. Requisitos Técnicos Móviles
- HTML, CSS y JS puros (o **Three.js** si se necesita motor 3D para la vista isométrica).
- **Responsive:** funciona en móvil y tablet, portrait y landscape (recomendado landscape).
- Safe areas respetadas: `env(safe-area-inset-*)`.
- Prevención de zoom accidental, scroll rebote y menú contextual al mantener pulsado.
- Objetivos táctiles **≥ 48 px**.
- Rendimiento: batching de geometría, animaciones limitadas a **30–45 FPS**, DPR limitado a 2.
- Pausa automática al cambiar de pestaña o bloquear el dispositivo.
- Soporte para **Vibration API** (con fallback silencioso).

---

## 9. Requisitos del Prompt
- Entregar código limpio, comentado y modular.
- Permitir **copiar o descargar** cada archivo individualmente.
- **Reutilizar el catálogo existente** sin duplicar personajes.
- Diseño modular para añadir capítulos futuros (`mapa2`, `personaje2`, etc.).
- La experiencia es **exclusivamente táctil**; no depender de teclado ni mouse, aunque puede haber soporte opcional.

---

> ✅ **Listo para usar como prompt en cualquier IA generadora de código.**