/**
 * controls.js — Gestion des contrôles
 * - Pédales verticales (sliders drag, toggle)
 * - Volant tactile (rotation circulaire)
 * - Raccourcis clavier
 */

window.Controls = (() => {

  // État interne des touches maintenues
  const held = {
    steerLeft:  false,
    steerRight: false,
    gasHeld:    false,
    brakeHeld:  false,
  };

  // ── Pédales ────────────────────────────────────
  // Chaque pédale est un slider vertical.
  // Plus le pouce est HAUT → plus la pédale est enfoncée (valeur 0→1).
  // L'embrayage "se fige" quand on clique : toggle.

  const pedals = {
    clutch: { value: 0, locked: false },
    brake:  { value: 0, locked: false },
    gas:    { value: 0, locked: false },
  };

  function initPedals() {
    ['clutch', 'brake', 'gas'].forEach(name => {
      const track = document.getElementById(`${name}-track`);
      const thumb = document.getElementById(`${name}-thumb`);
      if (!track || !thumb) return;

      let dragging  = false;
      let startY    = 0;
      let startVal  = 0;

      function getValueFromY(clientY) {
        const rect = track.getBoundingClientRect();
        // 0 = bas (relâché), 1 = haut (enfoncé)
        const raw = 1 - (clientY - rect.top) / rect.height;
        return Math.min(1, Math.max(0, raw));
      }

      function onStart(e) {
        e.preventDefault();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // Embrayage : toggle si on clique sans drag
        if (name === 'clutch') {
          dragging = true;
          startY   = clientY;
          startVal = pedals.clutch.value;
          return;
        }

        dragging = true;
        startY   = clientY;
        startVal = pedals[name].value;
      }

      function onMove(e) {
        if (!dragging) return;
        e.preventDefault();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const v = getValueFromY(clientY);
        _setPedalValue(name, v, false);
      }

      function onEnd(e) {
        if (!dragging) return;
        const clientY = e.changedTouches
          ? e.changedTouches[0].clientY
          : e.clientY;
        const delta = Math.abs(clientY - startY);

        // Si très peu de déplacement = clic → toggle lock (embrayage seulement)
        if (name === 'clutch' && delta < 6) {
          _toggleClutchLock();
        } else if (name !== 'clutch') {
          // Relâcher brake/gas si pas locked
          if (!pedals[name].locked) {
            _setPedalValue(name, 0, false);
          }
        }
        dragging = false;
      }

      track.addEventListener('mousedown',  onStart);
      track.addEventListener('touchstart', onStart, { passive: false });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove,  { passive: false });
      window.addEventListener('mouseup',   onEnd);
      window.addEventListener('touchend',  onEnd);
    });
  }

  /** Toggle le verrou de l'embrayage */
  function _toggleClutchLock() {
    const p     = pedals.clutch;
    const track = document.getElementById('clutch-track');

    if (!p.locked && p.value < 0.5) {
      // Premier clic : enfoncer à fond + verrouiller
      _setPedalValue('clutch', 1, true);
    } else if (p.locked) {
      // Deuxième clic : déverrouiller et relâcher
      p.locked = false;
      _setPedalValue('clutch', 0, false);
      if (track) track.classList.remove('locked');
    } else {
      // Était partiellement enfoncé, verrouiller la position
      p.locked = true;
      if (track) track.classList.add('locked');
    }
  }

  function _setPedalValue(name, v, lock) {
    const p     = pedals[name];
    const fill  = document.getElementById(`${name}-fill`);
    const thumb = document.getElementById(`${name}-thumb`);
    const pct   = document.getElementById(`${name}-pct`);
    const track = document.getElementById(`${name}-track`);

    p.value = v;
    if (lock !== undefined) p.locked = lock;

    // Visuel
    const pct100 = Math.round(v * 100);
    if (fill)  fill.style.height  = pct100 + '%';
    if (thumb) thumb.style.bottom = `calc(${pct100}% - 9px)`;
    if (pct)   pct.textContent    = pct100 + '%';

    if (track) {
      if (name === 'clutch' && p.locked) {
        track.classList.add('locked');
      } else {
        track.classList.remove('locked');
      }
    }

    // Envoyer au moteur
    switch (name) {
      case 'clutch': Engine.setClutch(v);  break;
      case 'brake':  Engine.setBrake(v);   break;
      case 'gas':    Engine.setGas(v);     break;
    }
  }

  // ── Volant tactile ────────────────────────────
  // L'utilisateur peut faire glisser circulairement le volant

  function initSteering() {
    const wrapper = document.getElementById('steering-wrapper');
    const wheel   = document.getElementById('steering-wheel');
    if (!wrapper || !wheel) return;

    let isDragging = false;
    let lastAngle  = 0;
    let currentRot = 0;
    const MAX_ROT  = Math.PI * 1.5; // ~270° max de chaque côté

    function getAngle(e, rect) {
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;
      const cl = e.touches ? e.touches[0].clientX : e.clientX;
      const ct = e.touches ? e.touches[0].clientY : e.clientY;
      return Math.atan2(ct - cy, cl - cx);
    }

    function onStart(e) {
      e.preventDefault();
      isDragging = true;
      lastAngle = getAngle(e, wrapper.getBoundingClientRect());
    }

    function onMove(e) {
      if (!isDragging) return;
      e.preventDefault();
      const rect  = wrapper.getBoundingClientRect();
      const angle = getAngle(e, rect);
      let delta = angle - lastAngle;

      // Normaliser delta [-π, π]
      if (delta > Math.PI)  delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;

      currentRot = Math.min(MAX_ROT, Math.max(-MAX_ROT, currentRot + delta));
      lastAngle  = angle;

      wheel.style.transform = `rotate(${currentRot}rad)`;

      // Angle des roues = proportionnel à la rotation du volant
      const wheelMaxAngle = Math.PI / 5;
      Engine.setWheelAngle(currentRot / MAX_ROT * wheelMaxAngle);
    }

    function onEnd() {
      if (!isDragging) return;
      isDragging = false;
      // Rappel élastique du volant
      _returnSteering(wheel, currentRot, (v) => {
        currentRot = v;
        Engine.setWheelAngle(v / MAX_ROT * (Math.PI / 5));
      });
    }

    wrapper.addEventListener('mousedown',  onStart);
    wrapper.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('touchmove',  onMove,  { passive: false });
    window.addEventListener('mouseup',    onEnd);
    window.addEventListener('touchend',   onEnd);

    // Exposer pour le rappel clavier
    Controls._steeringState = { get: () => currentRot, set: v => {
      currentRot = v;
      wheel.style.transform = `rotate(${v}rad)`;
      Engine.setWheelAngle(v / MAX_ROT * (Math.PI / 5));
    }, MAX_ROT };
  }

  function _returnSteering(wheel, startRot, setter) {
    const duration = 400;
    const start    = performance.now();

    function step(now) {
      const t  = Math.min(1, (now - start) / duration);
      const et = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const v  = startRot * (1 - et);
      wheel.style.transform = `rotate(${v}rad)`;
      setter(v);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ── Raccourcis clavier ────────────────────────

  const PEDAL_STEP = 0.08; // pas d'incrément par tick
  const STEER_STEP = 0.04;
  const keysDown   = new Set();

  function initKeyboard() {
    document.addEventListener('keydown', e => {
      if (keysDown.has(e.code)) return;
      keysDown.add(e.code);

      switch (e.code) {
        // Démarrage / extinction
        case 'KeyE':
          if (Engine.isStalled() || !Engine.isOn()) {
            Engine.restart();
          } else {
            Engine.stopEngine();
          }
          break;

        // Frein à main
        case 'KeyH':
          Engine.setHandbrake(!Engine.getState().handbrake);
          _updateHandbrakeUI();
          break;

        // Vitesses
        case 'ArrowUp':
        case 'KeyZ':
          Engine.shiftUp();
          _updateGearUI();
          break;
        case 'ArrowDown':
        case 'KeyX':
          Engine.shiftDown();
          _updateGearUI();
          break;

        // Embrayage toggle
        case 'KeyC':
          _toggleClutchLock();
          break;

        // Frein (maintenu)
        case 'KeyB':
          held.brakeHeld = true;
          break;

        // Gaz (maintenu)
        case 'KeyG':
          held.gasHeld = true;
          break;

        // Volant
        case 'ArrowLeft':
          held.steerLeft = true;
          break;
        case 'ArrowRight':
          held.steerRight = true;
          break;
      }
    });

    document.addEventListener('keyup', e => {
      keysDown.delete(e.code);

      switch (e.code) {
        case 'KeyB':
          held.brakeHeld = false;
          if (!pedals.brake.locked) _setPedalValue('brake', 0);
          break;
        case 'KeyG':
          held.gasHeld = false;
          if (!pedals.gas.locked) _setPedalValue('gas', 0);
          break;
        case 'ArrowLeft':
          held.steerLeft = false;
          break;
        case 'ArrowRight':
          held.steerRight = false;
          break;
      }
    });
  }

  /** Appelé à chaque frame pour les touches maintenues */
  function processHeld(dt) {
    // Frein
    if (held.brakeHeld) {
      _setPedalValue('brake', Math.min(1, pedals.brake.value + PEDAL_STEP));
    }
    // Gaz
    if (held.gasHeld) {
      _setPedalValue('gas', Math.min(1, pedals.gas.value + PEDAL_STEP));
    }

    // Volant clavier
    if (Controls._steeringState) {
      const st = Controls._steeringState;
      let rot = st.get();
      if (held.steerLeft)  rot = Math.max(-st.MAX_ROT, rot - STEER_STEP * 60 * dt);
      if (held.steerRight) rot = Math.min( st.MAX_ROT, rot + STEER_STEP * 60 * dt);

      // Rappel centrage si aucune touche volant
      if (!held.steerLeft && !held.steerRight && rot !== 0) {
        const dir = -Math.sign(rot);
        rot += dir * STEER_STEP * 30 * dt;
        if (Math.abs(rot) < 0.02) rot = 0;
      }

      if (held.steerLeft || held.steerRight || rot !== st.get()) {
        st.set(rot);
      }
    }
  }

  // ── Gear shifter UI ───────────────────────────

  function initGearButtons() {
    document.querySelectorAll('.gear-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const g = btn.dataset.gear;
        if (Engine.setGear(g) !== false) _updateGearUI();
      });
    });
  }

  function _updateGearUI() {
    const g = Engine.getGear();
    document.querySelectorAll('.gear-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.gear === g);
    });
    const gv = document.getElementById('gear-val');
    if (gv) gv.textContent = g;
  }

  function _updateHandbrakeUI() {
    const hv = document.getElementById('handbrake-val');
    const on = Engine.getState().handbrake;
    if (hv) {
      hv.textContent = on ? 'ON' : 'OFF';
      hv.style.color = on ? 'var(--red)' : 'var(--green)';
    }
  }

  // ── Init ──────────────────────────────────────

  function init() {
    initPedals();
    initSteering();
    initKeyboard();
    initGearButtons();
    _updateGearUI();
    _updateHandbrakeUI();
  }

  return {
    init,
    processHeld,
    _updateGearUI,
    _updateHandbrakeUI,
    _setPedalValue,
    pedals,
  };

})();
