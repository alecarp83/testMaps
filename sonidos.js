"use strict";

window.EclipseAudio = class EclipseAudio {
  constructor(volume = .45) {
    this.volume = volume;
    this.ctx = null;
    this.stepTimer = 0;
    this.heartTimer = 0;
    this.growlTimer = 3;
    this.alarmTimer = 8;
    this.breathTimer = 0;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume * .6;
    this.master.connect(this.ctx.destination);

    // Dos osciladores ligeramente desafinados crean el drone ambiental.
    this.droneGain = this.ctx.createGain();
    this.droneGain.gain.value = .08;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 180;
    this.droneGain.connect(filter);
    filter.connect(this.master);

    for (const frequency of [43, 44.5, 65]) {
      const oscillator = this.ctx.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.value = frequency;
      oscillator.connect(this.droneGain);
      oscillator.start();
    }

    this.noiseBuffer = this.ctx.createBuffer(
      1, this.ctx.sampleRate * 2, this.ctx.sampleRate
    );
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  suspend() {
    if (this.ctx) this.ctx.suspend();
  }

  tone(frequency, duration, volume, type = "sine", end = frequency) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const oscillator = this.ctx.createOscillator();
    const envelope = this.ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, end), now + duration);
    envelope.gain.setValueAtTime(.001, now);
    envelope.gain.linearRampToValueAtTime(volume, now + .012);
    envelope.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .03);
  }

  noise(duration, volume, frequency = 800) {
    if (!this.ctx || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + .03);
    gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    source.start();
    source.stop(now + duration);
  }

  effect(name) {
    if (name === "door") {
      this.noise(.8, .2, 280);
      this.tone(110, .6, .09, "sawtooth", 45);
    }
    if (name === "pickup") this.tone(620, .2, .12, "sine", 960);
    if (name === "hit") {
      this.noise(.35, .4, 160);
      this.tone(95, .25, .2, "triangle", 28);
    }
    if (name === "switch") this.noise(.06, .13, 1800);
    if (name === "growl") {
      this.tone(83, .9, .13, "sawtooth", 36);
      this.noise(.8, .12, 210);
    }
  }

  update(dt, player, proximity) {
    if (!this.ctx || this.ctx.state !== "running") return;

    this.droneGain.gain.setTargetAtTime(
      .06 + proximity * .12, this.ctx.currentTime, .5
    );

    this.stepTimer -= dt;
    if (player.moving && this.stepTimer <= 0) {
      this.stepTimer = player.running ? .29 : player.crouched ? .65 : .46;
      this.noise(.09, player.crouched ? .025 : .11, 1200);
      this.tone(150, .09, player.crouched ? .015 : .06, "triangle", 65);
    }

    this.heartTimer -= dt;
    if ((proximity > .3 || player.hp < 40) && this.heartTimer <= 0) {
      this.heartTimer = .95 - proximity * .4;
      this.tone(52, .15, .13, "sine", 30);
    }

    this.breathTimer -= dt;
    if (player.stamina < 40 && this.breathTimer <= 0) {
      this.breathTimer = 1.15;
      this.noise(.7, .075, 650);
    }

    this.growlTimer -= dt;
    if (proximity > .15 && this.growlTimer <= 0) {
      this.growlTimer = 3 + Math.random() * 4;
      this.effect("growl");
    }

    this.alarmTimer -= dt;
    if (this.alarmTimer <= 0) {
      this.alarmTimer = 9;
      this.tone(350, .6, .035, "sine", 240);
    }
  }
};
