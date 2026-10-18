export class Sonidos {
  constructor(volumen = .55) {
    this.volumen = volumen;
    this.ctx = null;
    this.timer = 0;
    this.heartTimer = 0;
    this.growlTimer = 0;
    this.alarmTimer = 0;
  }

  async iniciar() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;

    try {
      if (!this.ctx) {
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volumen;
        this.master.connect(this.ctx.destination);

        this.droneGain = this.ctx.createGain();
        this.droneGain.gain.value = .025;
        this.droneGain.connect(this.master);

        for (const frecuencia of [43, 64.5]) {
          const oscillator = this.ctx.createOscillator();
          oscillator.type = "sine";
          oscillator.frequency.value = frecuencia;
          oscillator.connect(this.droneGain);
          oscillator.start();
        }

        this.buffer = this.ctx.createBuffer(
          1, this.ctx.sampleRate, this.ctx.sampleRate
        );
        const data = this.buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
    } catch {
      // El juego continúa si el navegador bloquea el audio.
    }
  }

  volumenA(valor) {
    this.volumen = valor;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(valor, this.ctx.currentTime, .05);
    }
  }

  pausar() {
    if (this.ctx?.state === "running") {
      this.ctx.suspend().catch(() => {});
    }
  }

  tono(frecuencia, duracion, volumen, tipo = "sine", final = frecuencia) {
    if (this.ctx?.state !== "running") return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(10, final), t + duracion);
    gain.gain.setValueAtTime(.001, t);
    gain.gain.linearRampToValueAtTime(volumen, t + .012);
    gain.gain.exponentialRampToValueAtTime(.001, t + duracion);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + duracion);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  ruido(duracion, volumen, frecuencia = 900) {
    if (this.ctx?.state !== "running") return;
    const t = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    source.buffer = this.buffer;
    filter.type = "lowpass";
    filter.frequency.value = frecuencia;
    gain.gain.setValueAtTime(volumen, t);
    gain.gain.exponentialRampToValueAtTime(.001, t + duracion);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start(t);
    source.stop(t + duracion);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  }

  efecto(nombre) {
    if (nombre === "paso") this.ruido(.075, .045, 450);
    if (nombre === "ataque") this.ruido(.17, .13, 1900);
    if (nombre === "impacto") {
      this.ruido(.15, .2, 700);
      this.tono(110, .17, .13, "triangle", 35);
    }
    if (nombre === "puerta") {
      this.ruido(.65, .12, 700);
      this.tono(170, .5, .07, "sawtooth", 48);
    }
    if (nombre === "usar") this.tono(700, .17, .08, "sine", 1100);
    if (nombre === "rodar") this.ruido(.25, .08, 450);
  }

  actualizar(dt, proximidad, vida, esfuerzo) {
    if (this.ctx?.state !== "running") return;

    this.droneGain.gain.setTargetAtTime(
      .02 + proximidad * .055, this.ctx.currentTime, .3
    );

    this.timer -= dt;
    this.heartTimer -= dt;
    this.growlTimer -= dt;
    this.alarmTimer -= dt;

    if (esfuerzo > .45 && this.timer <= 0) {
      this.ruido(.5, .025 + esfuerzo * .04, 500);
      this.timer = 1.7 - esfuerzo * .6;
    }
    if (vida < 35 && this.heartTimer <= 0) {
      this.tono(64, .2, .11);
      this.heartTimer = .85;
    }
    if (proximidad > .1 && this.growlTimer <= 0) {
      this.tono(70, .6, .04 + proximidad * .07, "sawtooth", 32);
      this.growlTimer = 3.5 + Math.random() * 3;
    }
    if (this.alarmTimer <= 0) {
      this.tono(360, .8, .025, "sine", 440);
      this.alarmTimer = 7;
    }
  }
}
