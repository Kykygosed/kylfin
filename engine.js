/**
 * engine.js — Simulation moteur voiture manuelle
 * Gère : RPM, calage, vitesses, embrayage, physique
 */

window.Engine = (() => {

  // ── Constantes ────────────────────────────────
  const IDLE_RPM      = 850;
  const MAX_RPM       = 7200;
  const STALL_RPM     = 600;
  const REDLINE_RPM   = 6500;

  // RPM max par rapport de boîte (couple moteur → roues)
  const GEAR_RATIOS = {
    R: -3.5,
    N: 0,
    1: 3.8,
    2: 2.2,
    3: 1.5,
    4: 1.1,
    5: 0.85,
  };

  // Vitesse max approximative par rapport (km/h)
  const GEAR_SPEED_MAX = {
    R: 20,
    N: 0,
    1: 30,
    2: 55,
    3: 85,
    4: 130,
    5: 200,
  };

  // ── État ──────────────────────────────────────
  const state = {
    engineOn:    false,
    rpm:         0,
    gear:        'N',
    speed:       0,        // km/h, signée (+ = avant, - = arrière)
    clutch:      0,        // 0–1  (1 = enfoncé à fond)
    brake:       0,        // 0–1
    gas:         0,        // 0–1
    handbrake:   true,
    stalled:     false,
    stalling:    false,    // en train de caler (vibrations)
    stallTimer:  0,

    // Position / orientation (world units)
    x:     0,
    y:     0,
    angle: 0,             // radians, 0 = vers le haut
    wheelAngle: 0,        // angle des roues avant

    lastTime: null,
  };

  // ── Helpers ───────────────────────────────────

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  /** Couple disponible à ce RPM (courbe simplifiée) */
  function torqueCurve(rpm) {
    if (rpm < IDLE_RPM) return 0.2;
    const normalized = (rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM);
    // Cloche : max autour de 60% de la plage
    return Math.sin(Math.PI * clamp(normalized, 0, 1)) * 0.8 + 0.2;
  }

  // ── Mise à jour physique ──────────────────────

  /**
   * dt : delta temps en secondes
   */
  function update(dt) {
    if (dt > 0.1) dt = 0.1; // cap anti-lag

    const clutchEngaged = 1 - state.clutch; // 0=désembrayé, 1=prise
    const gearRatio = GEAR_RATIOS[state.gear] || 0;
    const isNeutral  = state.gear === 'N';
    const isReverse  = state.gear === 'R';

    // ── Gestion RPM ───────────────────────────
    if (!state.engineOn) {
      // Moteur éteint : retombe à 0
      state.rpm = Math.max(0, state.rpm - 800 * dt);
      state.stalled = false;
      return;
    }

    if (state.stalled) {
      state.rpm = Math.max(0, state.rpm - 1200 * dt);
      state.speed *= Math.pow(0.92, dt * 60);
      return;
    }

    // ── Cible RPM en fonction du gaz ──────────
    const gasLift   = state.gas;
    const targetRPM = isNeutral
      ? IDLE_RPM + gasLift * 3500      // en neutre : gaz = blip
      : IDLE_RPM + gasLift * 4000;

    // ── Influence embrayage sur RPM ───────────
    // Si embrayage relâché + gaz insuffisant → risque de calage
    const rpmDrag = clutchEngaged * Math.abs(gearRatio) * 0.4;
    const speedInfluence = isNeutral ? 0
      : clutchEngaged * Math.abs(state.speed) * Math.abs(gearRatio) * 1.2;

    let rpmTarget = targetRPM - speedInfluence * 30;
    rpmTarget = clamp(rpmTarget, 0, MAX_RPM);

    // Inertie RPM
    const rpmSpeed = isNeutral ? 1800 : 1200;
    state.rpm += (rpmTarget - state.rpm) * rpmSpeed * dt / 1000 * 60 * dt;
    state.rpm  = clamp(state.rpm, 0, MAX_RPM);

    // ── Détection calage ──────────────────────
    if (!isNeutral && clutchEngaged > 0.05) {
      if (state.rpm < STALL_RPM && state.gas < 0.15) {
        state.stallTimer += dt;
        state.stalling = true;
        if (state.stallTimer > 0.6) {
          _stall();
          return;
        }
      } else {
        state.stallTimer = Math.max(0, state.stallTimer - dt * 2);
        state.stalling = false;
      }
    } else {
      state.stallTimer = 0;
      state.stalling = false;
    }

    // ── Accélération / décélération ───────────
    if (!isNeutral) {
      // Force motrice transmise aux roues
      const motorForce = torqueCurve(state.rpm) * state.gas * Math.sign(gearRatio)
                         * clutchEngaged * 18;

      // Résistance
      const rollingRes = state.speed * 0.03;
      const brakeForce = state.brake * 35 * Math.sign(state.speed || 1);
      const handbrakeFr = state.handbrake ? 50 * Math.sign(state.speed || 1) : 0;

      let accel = motorForce - rollingRes - brakeForce - handbrakeFr;

      // Limiter la vitesse au max de la vitesse pour ce rapport
      const maxSpd = GEAR_SPEED_MAX[state.gear] || 0;
      if (Math.abs(state.speed) > maxSpd * 1.02) {
        accel -= 5 * Math.sign(state.speed);
      }

      state.speed += accel * dt;

      // Empêcher de reculer en 1ère ou avancer en marche arrière sans gaz
      if (state.gear !== 'R' && state.speed < 0 && !state.handbrake) {
        state.speed = 0;
      }
      if (state.gear === 'R' && state.speed > 0) {
        state.speed = 0;
      }

    } else {
      // Neutre : décélération par résistance + frein
      const brakeForce = (state.brake * 30 + (state.handbrake ? 50 : 2))
                         * Math.sign(state.speed || 0);
      state.speed -= brakeForce * dt;
      if (Math.abs(state.speed) < 0.1) state.speed = 0;
    }

    state.speed = clamp(state.speed, -25, 200);

    // ── Position voiture ──────────────────────
    // Tourner les roues
    const maxWheelAngle = Math.PI / 5; // ~36°
    state.wheelAngle = clamp(state.wheelAngle, -maxWheelAngle, maxWheelAngle);

    if (Math.abs(state.speed) > 0.2) {
      const turnRate = (state.speed / 50) * state.wheelAngle * 2.2;
      state.angle += turnRate * dt;
    }

    const speedMs = state.speed / 3.6; // km/h → m/s
    state.x += Math.sin(state.angle) * speedMs * dt;
    state.y -= Math.cos(state.angle) * speedMs * dt;
  }

  // ── Actions ───────────────────────────────────

  function startEngine() {
    if (state.engineOn || state.stalled) return false;
    // Procédure : embrayage enfoncé ET frein à main OU frein
    if (state.clutch < 0.85) {
      notify('Appuyez à fond sur l\'embrayage d\'abord ! (<kbd>C</kbd>)');
      return false;
    }
    if (!state.handbrake && state.brake < 0.3) {
      notify('Serrez le frein à main (<kbd>H</kbd>) ou le frein (<kbd>B</kbd>) avant de démarrer');
      return false;
    }
    // Démarrage
    state.engineOn = true;
    state.stalled  = false;
    state.rpm      = IDLE_RPM;
    state.gear     = 'N';
    notify('Moteur démarré ! Passez en 1ère avec l\'embrayage enfoncé');
    return true;
  }

  function stopEngine() {
    state.engineOn = false;
    state.rpm      = 0;
    notify('Moteur coupé');
  }

  function _stall() {
    state.stalled    = true;
    state.engineOn   = false;
    state.stallTimer = 0;
    state.stalling   = false;
    state.rpm        = 0;
    notify('⚠️ Vous avez calé ! Appuyez sur <kbd>E</kbd> pour redémarrer');
    // Flash visuel
    const ind = document.getElementById('stall-indicator');
    if (ind) {
      ind.classList.add('stall-flash');
      setTimeout(() => ind.classList.remove('stall-flash'), 1200);
    }
  }

  function restart() {
    if (!state.stalled && state.engineOn) return;
    state.stalled  = false;
    state.engineOn = false;
    startEngine();
  }

  // ── Notification helper ───────────────────────
  function notify(msg) {
    const el = document.getElementById('instruction-text');
    if (!el) return;
    el.innerHTML = msg;
    el.style.opacity = '1';
    clearTimeout(window._notifyTimer);
    window._notifyTimer = setTimeout(() => { el.style.opacity = '0.3'; }, 4000);
  }

  // ── Getters ───────────────────────────────────
  function getState()  { return state; }
  function getRPM()    { return state.rpm; }
  function getSpeed()  { return state.speed; }
  function getGear()   { return state.gear; }
  function isOn()      { return state.engineOn; }
  function isStalled() { return state.stalled; }

  function setGear(g) {
    if (!Object.keys(GEAR_RATIOS).includes(g)) return;
    // Doit avoir l'embrayage enfoncé pour changer de vitesse
    if (state.clutch < 0.75 && state.engineOn) {
      notify('Embrayez d\'abord pour changer de vitesse !');
      return false;
    }
    // Vitesse marche arrière : doit être à l'arrêt
    if (g === 'R' && Math.abs(state.speed) > 3) {
      notify('Arrêtez-vous avant de passer en marche arrière !');
      return false;
    }
    state.gear = g;
    return true;
  }

  function setClutch(v)    { state.clutch    = clamp(v, 0, 1); }
  function setBrake(v)     { state.brake     = clamp(v, 0, 1); }
  function setGas(v)       { state.gas       = clamp(v, 0, 1); }
  function setHandbrake(v) { state.handbrake = !!v; }
  function setWheelAngle(v) {
    state.wheelAngle = clamp(v, -Math.PI / 5, Math.PI / 5);
  }

  // Ordre vitesses pour les raccourcis clavier
  const GEAR_ORDER = ['R', 'N', '1', '2', '3', '4', '5'];
  function shiftUp() {
    const idx = GEAR_ORDER.indexOf(state.gear);
    if (idx < GEAR_ORDER.length - 1) setGear(GEAR_ORDER[idx + 1]);
  }
  function shiftDown() {
    const idx = GEAR_ORDER.indexOf(state.gear);
    if (idx > 0) setGear(GEAR_ORDER[idx - 1]);
  }

  return {
    update, getState, getRPM, getSpeed, getGear, isOn, isStalled,
    startEngine, stopEngine, restart, notify,
    setGear, shiftUp, shiftDown,
    setClutch, setBrake, setGas, setHandbrake, setWheelAngle,
    IDLE_RPM, MAX_RPM, STALL_RPM, REDLINE_RPM,
  };

})();
