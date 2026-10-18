"use strict";

// Módulo de audio sin archivos externos.
window.EclipseAudio = (() => {
  let ctx;
  let master;
  let droneGain;
  let droneFilter;
  let noiseBuffer;
  let enabled = true;

  let stepTimer = 0;
  let heartTimer = 0;
  let breathTimer = 0;
  let growlTimer = 3;
  let alarmTimer = 5;

  function init(volume = .55) {
    if (ctx) {
      resume();
      return;
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) {
      enabled = false;
      return;
    }

    try {
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = Math.max(0, Math.min(1, volume)) * .55;
      master.connect(ctx.destination);

      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      droneGain = ctx.createGain();
      droneGain.gain.value = .045;

      droneFilter = ctx.createBiquadFilter();
      droneFilter.type = "lowpass";
      droneFilter.frequency.value = 140;

      droneGain.connect(droneFilter);
      droneFilter.connect(master);

      for (const frequency of [39, 58.4, 78.2]) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = frequency;
        osc.connect(droneGain);
        osc.start();
      }

      resume();
    } catch {
      enabled = false;
    }
  }

  function ready() {
    return enabled && ctx && ctx.state === "running";
  }

  function tone(frequency, duration, gain, type = "sine", endFrequency) {
    if (!ready()) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const envelope = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);

    if (endFrequency) {
      osc.frequency.exponentialRampToValueAtTime(
        endFrequency, now + duration
      );
    }

    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + .015);
    envelope.gain.exponentialRampToValueAtTime(
      .0001, now + duration
    );

    osc.connect(envelope);
    envelope.connect(master);
    osc.start(now);
    osc.stop(now + duration + .03);

    osc.onended = () => {
      osc.disconnect();
      envelope.disconnect();
    };
  }

  function noise(duration, gain, frequency, type = "bandpass") {
    if (!ready()) return;

    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const envelope = ctx.createGain();

    source.buffer = noiseBuffer;
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 1.5;

    envelope.gain.setValueAtTime(.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + .025);
    envelope.gain.exponentialRampToValueAtTime(
      .0001, now + duration
    );

    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start(now);
    source.stop(now + duration + .03);

    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }

  function effect(name) {
    if (name === "door") {
      noise(.8, .18, 470);
      tone(110, .65, .13, "sawtooth", 38);
    } else if (name === "attack") {
      noise(.3, .3, 850);
      tone(92, .25, .2, "sawtooth", 30);
    } else if (name === "pickup") {
      tone(550, .17, .08, "sine", 850);
    } else if (name === "switch") {
      noise(.065, .1, 1800);
    } else if (name === "ending") {
      tone(45, 2, .3, "sawtooth", 22);
      noise(1.8, .18, 180);
    }
  }

  function update(dt, state) {
    if (!ready()) return;

    const threat = Math.max(0, 1 - state.nearest / 9);
    const stress = Math.max(
      threat,
      1 - state.health / 100,
      1 - state.stamina / 100
    );

    droneGain.gain.setTargetAtTime(
      .035 + threat * .055, ctx.currentTime, .35
    );
    droneFilter.frequency.setTargetAtTime(
      130 + threat * 300, ctx.currentTime, .5
    );

    stepTimer -= dt;
    heartTimer -= dt;
    breathTimer -= dt;
    growlTimer -= dt;
    alarmTimer -= dt;

    if (state.moving && stepTimer <= 0) {
      noise(.1, state.crouch ? .025 : .1, 950);
      tone(100, .1, state.crouch ? .025 : .08, "triangle", 50);
      stepTimer = state.crouch ? .65 : state.running ? .28 : .46;
    }

    if (heartTimer <= 0 && stress > .25) {
      tone(55, .13, .07 + stress * .12, "sine", 34);
      heartTimer = 1.05 - stress * .55;
    }

    if (breathTimer <= 0) {
      noise(.65, .025 + stress * .09, 650, "lowpass");
      breathTimer = 2.4 - stress * 1.25;
    }

    if (growlTimer <= 0) {
      tone(65, .8, .025 + threat * .15, "sawtooth", 32);
      noise(.6, .02 + threat * .08, 250);
      growlTimer = 3 + Math.random() * 4;
    }

    if (alarmTimer <= 0) {
      tone(420, .7, .025, "sine", 310);
      alarmTimer = 7;
    }
  }

  function pause() {
    if (ctx && ctx.state === "running") {
      ctx.suspend().catch(() => {});
    }
  }

  function resume() {
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  return { init, update, effect, pause, resume };
})();
