# 🎮 Prompt: Videojuego RPG de Terror — "Eclipse: Capítulo 1"
> Estilo **Dead Space** · Primera persona · Terror sci-fi

---

## 1. Concepto General
Crea un videojuego RPG de terror en primera persona, inspirado en **Dead Space**, ambientado en una nave espacial oscura y claustrofóbica. El jugador debe escapar de una infección desconocida mientras sobrevivientes infectados lo persiguen. La única fuente de luz es una **linterna** unida al personaje, con ambientación sonora tensa y atmósfera opresiva.

---

## 2. Historia — Capítulo 1: "Protocolo Eclipse"
La nave de carga **ISV Kepler-9** viaja rumbo a la colonia Meridian con 340 pasajeros en criosueño. Durante una rutina de mantenimiento, un contenedor biológico clasificado —cuyo origen se desconoce— se **rompe y libera un virus extraño**. Los primeros infectados mutan rápidamente: piel pálida, movimientos erráticos y agresividad letal. La alarma general despierta al **protagonista**, un técnico de a bordo, quien descubre los pasillos cubiertos de sangre y cuerpos retorcidos.

**Objetivo del capítulo:** recorrer los sectores oscuros de la nave, esquivar o enfrentar infectados y **alcanzar la salida de emergencia** en la bahía de escape. Al final, el jugador logra abrir la compuerta… pero algo lo observa desde las sombras (gancho para el Capítulo 2).

---

## 3. Estructura de Archivos (escalable)

| Archivo | Función |
|---|---|
| `index.html` | Menú principal |
| `mapa1.html` | Mapa del Capítulo 1 |
| `mapa1.css` | Estilos del mapa |
| `personaje.js` | Lógica del personaje |
| `personaje.css` | Estilos del personaje / HUD |
| `sonidos.js` | Audio ambiental y efectos |

### 🖥️ `index.html` — Menú principal
- Pantalla negra con título parpadeante **"ECLIPSE"** y subtítulo *"Capítulo 1"*.
- Botones: **Iniciar juego**, **Opciones**, **Salir**.
- Fondo animado (estrellas tenues / estática).
- Enlaza a `mapa1.html` al iniciar.

### 🗺️ `mapa1.html` + `mapa1.css` — Mapa del Capítulo 1
- Sectores: **Pasillo A → Comedor → Enfermería → Bahía de escape**.
- Oscuridad total; solo la linterna ilumina un cono frontal.
- Colisiones con paredes, puertas bloqueadas y objetos interactuables.
- Estilo visual: metálico, sangre seca, luces de emergencia rojas intermitentes.
- HUD mínimo: barra de vida, indicador de batería de linterna.

### 🧍 `personaje.js` + `personaje.css` — El protagonista
- Movimiento en primera persona (WASD o flechas + mouse).
- **Linterna** con ángulo y alcance limitados; batería que se agota.
- Estados: caminar, correr (agota stamina), agacharse (silencioso).
- Detección de daño por infectados cercanos.
- HUD: silueta, respiración agitada visible con efecto viñeta.

### 🔊 `sonidos.js` — Audio ambiental
- Sonidos: pasos metálicos, respiración, latidos cardíacos, gruñidos lejanos, alarma, apertura de puertas, ataque infectado.
- Música ambiental de fondo (drones graves, tensión).
- Volumen dinámico según proximidad de enemigos.

---

## 4. Mecánicas Clave
- **Infectados:** enemigos lentos pero letales; se guían por sonido y luz.
- **Linterna:** puede atraer enemigos si se usa demasiado.
- **Sigilo:** agacharse reduce el ruido y la detección.
- **Huir:** el capítulo premia la evasión sobre el combate.
- **Salida:** al llegar a la bahía, se activa cinemática corta y fin del capítulo.

---

## 5. Ambientación
- Paleta: negros, grises metálicos, rojo sangre, ámbar de linterna.
- Iluminación tenue, sombras largas, niebla volumétrica.
- Estética industrial sci-fi: tuberías, cables sueltos, cristales rotos, mensajes de advertencia en pantallas.

---

## 6. Requisitos del Prompt
- Entregar código limpio y comentado para cada archivo.
- Permitir **copiar o descargar** cada archivo individualmente.
- Diseño modular para añadir capítulos futuros (`mapa2`, `personaje2`, etc.).
- Sin dependencias externas pesadas; HTML, CSS y JS puros.

---

> ✅ **Listo para usar como prompt en cualquier IA generadora de código.**