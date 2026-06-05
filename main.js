/**
 * main.js — Boucle principale, HUD, jauges
 */

(function () {

  // ── RPM Gauge ──────────────────────────────────
  const rpmCanvas = document.getElementById('rpm-gauge');
  const rpmCtx    = rpmCanvas ? rpmCanvas.getContext('2d') : null;

  function drawRPMGauge(rpm) {
    if (!rpmCtx) return;
    const W = rpmCanvas.width, H = rpmCanvas.height;
    const cx = W / 2, cy = H / 2, R = W * 0.44;

    rpmCtx.clearRect(0, 0, W, H);

    // Fond
    rpmCtx.beginPath();
    rpmCtx.arc(cx, cy, R + 2, 0, Math.PI * 2);
    rpmCtx.fillStyle = 'rgba(0,0,0,0.7)';
    rpmCtx.fill();

    // Arc plein fond
    rpmCtx.beginPath();
    rpmCtx.arc(cx, cy, R, Math.PI * 0.75, Math.PI * 2.25, false);
    rpmCtx.lineWidth   = 10;
    rpmCtx.strokeStyle = 'rgba(255,255,255,0.07)';
    rpmCtx.stroke();

    // Arc RPM coloré
    const MAX  = Engine.MAX_RPM;
    const RED  = Engine.REDLINE_RPM;
    const frac = Math.min(rpm / MAX, 1);
    const startAngle = Math.PI * 0.75;
    const sweepAngle = Math.PI * 1.5;
    const endAngle   = startAngle + frac * sweepAngle;

    // Zone verte → jaune → rouge
    const redFrac  = RED / MAX;
    const grad = rpmCtx.createLinearGradient(
      cx - R, cy, cx + R, cy
    );
    grad.addColorStop(0,          '#2ecc71');
    grad.addColorStop(redFrac * 0.8, '#f0c030');
    grad.addColorStop(redFrac,    '#e74c3c');
    grad.addColorStop(1,          '#ff0000');

    rpmCtx.beginPath();
    rpmCtx.arc(cx, cy, R, startAngle, endAngle, false);
    rpmCtx.lineWidth   = 10;
    rpmCtx.strokeStyle = grad;
    rpmCtx.stroke();

    // Graduations
    rpmCtx.lineWidth = 1.5;
    for (let i = 0; i <= 8; i++) {
      const angle = startAngle + (i / 8) * sweepAngle;
      const x1 = cx + (R - 14) * Math.cos(angle);
      const y1 = cy + (R - 14) * Math.sin(angle);
      const x2 = cx + (R + 0)  * Math.cos(angle);
      const y2 = cy + (R + 0)  * Math.sin(angle);
      rpmCtx.strokeStyle = i >= 7 ? '#e74c3c' : 'rgba(255,255,255,0.4)';
      rpmCtx.beginPath();
      rpmCtx.moveTo(x1, y1);
      rpmCtx.lineTo(x2, y2);
      rpmCtx.stroke();
    }

    // Aiguille
    const needleAngle = startAngle + frac * sweepAngle;
    rpmCtx.save();
    rpmCtx.translate(cx, cy);
    rpmCtx.rotate(needleAngle);
    rpmCtx.strokeStyle = '#ffffff';
    rpmCtx.lineWidth   = 2;
    rpmCtx.lineCap     = 'round';
    rpmCtx.beginPath();
    rpmCtx.moveTo(0, 6);
    rpmCtx.lineTo(0, -(R - 18));
    rpmCtx.stroke();
    rpmCtx.restore();

    // Centre
    rpmCtx.beginPath();
    rpmCtx.arc(cx, cy, 6, 0, Math.PI * 2);
    rpmCtx.fillStyle = '#c8a96e';
    rpmCtx.fill();

    // Valeur RPM
    rpmCtx.fillStyle = 'rgba(232,224,208,0.8)';
    rpmCtx.font      = 'bold 14px "Share Tech Mono", monospace';
    rpmCtx.textAlign = 'center';
    rpmCtx.fillText(Math.round(rpm / 100) * 100, cx, cy + R * 0.55);

    // "RPM" label
    rpmCtx.font      = '9px Rajdhani, sans-serif';
    rpmCtx.fillStyle = 'rgba(232,224,208,0.4)';
    rpmCtx.fillText('RPM', cx, cy + R * 0.7);
  }

  // ── HUD update ─────────────────────────────────

  const elSpeed    = document.getElementById('speed-val');
  const elGear     = document.getElementById('gear-val');
  const elEngStat  = document.getElementById('engine-status');
  const elStall    = document.getElementById('stall-indicator');

  function updateHUD() {
    const s = Engine.getState();

    // Vitesse
    if (elSpeed) elSpeed.textContent = Math.abs(Math.round(s.speed));

    // Rapport
    if (elGear) elGear.textContent = s.gear;

    // Status moteur
    if (elEngStat) {
      if (s.stalled) {
        elEngStat.textContent = 'CALÉ !';
        elEngStat.className   = '';
        elEngStat.style.color = '#e74c3c';
        elEngStat.style.animation = 'stall-flash 0.5s ease-in-out infinite';
      } else if (s.engineOn) {
        elEngStat.textContent = 'MOTEUR ON';
        elEngStat.className   = 'on';
        elEngStat.style.animation = '';
        elEngStat.style.color = '';
      } else {
        elEngStat.textContent = 'MOTEUR ÉTEINT';
        elEngStat.className   = '';
        elEngStat.style.animation = '';
        elEngStat.style.color = '';
      }
    }

    // Indicateur calage
    if (elStall) {
      if (s.stalling) {
        elStall.textContent = '⚠';
        elStall.style.color = '#f0c030';
      } else if (s.stalled) {
        elStall.textContent = '●';
        elStall.style.color = '#e74c3c';
      } else {
        elStall.textContent = '●';
        elStall.style.color = s.engineOn ? '#2ecc71' : '#e74c3c';
      }
    }

    // Frein à main
    Controls._updateHandbrakeUI();

    // Gear buttons
    Controls._updateGearUI();
  }

  // ── Boucle principale ──────────────────────────

  let lastTime = null;

  function loop(now) {
    if (!lastTime) lastTime = now;
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    // Contrôles maintenus (clavier)
    Controls.processHeld(dt);

    // Physique moteur
    Engine.update(dt);

    // Rendu monde
    World.render();

    // Jauge RPM
    drawRPMGauge(Engine.getRPM());

    // HUD
    updateHUD();

    requestAnimationFrame(loop);
  }

  // ── Démarrage ──────────────────────────────────

  window.addEventListener('DOMContentLoaded', () => {
    World.init();
    Controls.init();

    // Message initial
    Engine.notify('Appuyez sur <kbd>E</kbd> pour démarrer • Frein à main (<kbd>H</kbd>) + Embrayage (<kbd>C</kbd>) d\'abord !');

    requestAnimationFrame(loop);
  });

})();
