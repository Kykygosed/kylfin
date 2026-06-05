/**
 * world.js — Rendu monde infini vue de dessus
 * Génération procédurale de route, décors, grille, paysage
 */

window.World = (() => {

  let canvas, ctx;
  let W, H;

  // Palette
  const C = {
    sky:        '#1a2235',
    grass:      '#1a2e1a',
    grassLine:  '#1f3520',
    road:       '#2a2a2e',
    roadEdge:   '#3a3a40',
    marking:    '#f0e060',
    markingW:   '#ffffff',
    tree:       '#1d4a1d',
    treeTrunk:  '#4a3020',
    building:   '#1e1e2a',
    buildLine:  '#2a2a3a',
    car:        '#c8a96e',
    carBody:    '#e8c87a',
    carWindow:  '#6090b0',
    carWheel:   '#111111',
    shadow:     'rgba(0,0,0,0.35)',
  };

  // Décors placés de façon pseudo-aléatoire (seed)
  const DECORATIONS = [];
  const CHUNK_SIZE  = 200;   // taille d'un "chunk" en units monde
  const chunks = new Map();  // clé = "cx,cy" → tableau de décors

  function seededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  /** Génère les décors d'un chunk */
  function getChunk(cx, cy) {
    const key = `${cx},${cy}`;
    if (chunks.has(key)) return chunks.get(key);

    const rng  = seededRandom(cx * 73856093 ^ cy * 19349663);
    const items = [];
    const ox = cx * CHUNK_SIZE;
    const oy = cy * CHUNK_SIZE;

    const count = 6 + Math.floor(rng() * 8);
    for (let i = 0; i < count; i++) {
      const x = ox + rng() * CHUNK_SIZE;
      const y = oy + rng() * CHUNK_SIZE;
      const type = rng() < 0.6 ? 'tree' : 'building';
      const size = type === 'tree'
        ? 8 + rng() * 14
        : 20 + rng() * 35;
      items.push({ x, y, type, size, rot: rng() * Math.PI * 2 });
    }
    chunks.set(key, items);
    return items;
  }

  /** Rendu d'un arbre */
  function drawTree(ctx, x, y, size) {
    // Ombre
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(x + 4, y + 4, size * 0.8, size * 0.6, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Tronc
    ctx.fillStyle = C.treeTrunk;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.2, size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Feuillage
    ctx.fillStyle = C.tree;
    ctx.beginPath();
    ctx.arc(x, y - size * 0.15, size * 0.7, 0, Math.PI * 2);
    ctx.fill();
    // Reflet
    ctx.fillStyle = 'rgba(100,200,80,0.12)';
    ctx.beginPath();
    ctx.arc(x - size * 0.2, y - size * 0.35, size * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Rendu d'un bâtiment */
  function drawBuilding(ctx, x, y, size, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // Ombre
    ctx.fillStyle = C.shadow;
    ctx.fillRect(4, 4, size, size * 0.7);
    // Corps
    ctx.fillStyle = C.building;
    ctx.fillRect(0, 0, size, size * 0.7);
    // Lignes fenêtres
    ctx.strokeStyle = C.buildLine;
    ctx.lineWidth = 1;
    const cols = Math.max(2, Math.floor(size / 10));
    for (let i = 1; i < cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * (size / cols), 0);
      ctx.lineTo(i * (size / cols), size * 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Dessine la route (axe Y = vertical) */
  function drawRoad(ctx, camX, camY, scale) {
    const roadW = 80;

    // Bande bitume
    const screenX = W / 2 - camX * scale;
    ctx.fillStyle = C.road;
    ctx.fillRect(screenX - roadW / 2 * scale, 0, roadW * scale, H);

    // Bords de route
    ctx.strokeStyle = C.roadEdge;
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(screenX - roadW / 2 * scale, 0);
    ctx.lineTo(screenX - roadW / 2 * scale, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(screenX + roadW / 2 * scale, 0);
    ctx.lineTo(screenX + roadW / 2 * scale, H);
    ctx.stroke();

    // Marquage central pointillé
    ctx.strokeStyle = C.marking;
    ctx.lineWidth   = 2 * scale;
    ctx.setLineDash([20 * scale, 20 * scale]);
    ctx.lineDashOffset = (-camY * scale) % (40 * scale);
    ctx.beginPath();
    ctx.moveTo(screenX, 0);
    ctx.lineTo(screenX, H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Lignes blanches bords intérieurs
    ctx.strokeStyle = C.markingW;
    ctx.lineWidth   = 1.5 * scale;
    const innerOff  = 24 * scale;
    [screenX - innerOff, screenX + innerOff].forEach(lx => {
      ctx.setLineDash([8 * scale, 32 * scale]);
      ctx.lineDashOffset = (-camY * scale) % (40 * scale);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, H);
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  /** Dessine la voiture au centre */
  function drawCar(ctx, angle, wheelAngle, speed, rpm) {
    const cx = W / 2;
    const cy = H / 2;
    const CW = 22, CL = 42;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Ombre
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(3, 3, CW + 2, CL * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // Carrosserie
    ctx.fillStyle = C.car;
    ctx.beginPath();
    ctx.roundRect(-CW, -CL / 2, CW * 2, CL, [6, 6, 5, 5]);
    ctx.fill();

    // Toit (plus foncé)
    ctx.fillStyle = '#9a7a4e';
    ctx.beginPath();
    ctx.roundRect(-CW * 0.65, -CL * 0.28, CW * 1.3, CL * 0.46, 4);
    ctx.fill();

    // Pare-brise avant
    ctx.fillStyle = C.carWindow;
    ctx.beginPath();
    ctx.roundRect(-CW * 0.58, -CL * 0.42, CW * 1.16, CL * 0.16, 3);
    ctx.fill();

    // Pare-brise arrière
    ctx.fillStyle = C.carWindow;
    ctx.beginPath();
    ctx.roundRect(-CW * 0.52, CL * 0.24, CW * 1.04, CL * 0.14, 3);
    ctx.fill();

    // Phares avant
    ctx.fillStyle = speed > 0 ? '#ffffcc' : '#555533';
    [-CW * 0.7, CW * 0.7 - 8].forEach(lx => {
      ctx.beginPath();
      ctx.roundRect(lx, -CL * 0.52, 8, 6, 2);
      ctx.fill();
    });

    // Feux arrière
    ctx.fillStyle = speed < 0 ? '#ff4444' : '#881111';
    [-CW * 0.7, CW * 0.7 - 8].forEach(lx => {
      ctx.beginPath();
      ctx.roundRect(lx, CL * 0.44, 8, 5, 2);
      ctx.fill();
    });

    // Roues
    _drawWheels(ctx, CW, CL, wheelAngle);

    ctx.restore();

    // Fumée / vibration si stalled
    const eng = Engine.getState();
    if (eng.stalling || eng.stalled) {
      _drawSmoke(ctx, cx, cy, angle, CL);
    }
  }

  function _drawWheels(ctx, CW, CL, wheelAngle) {
    const positions = [
      { x: -CW + 2, y: -CL * 0.33, steer: true  },
      { x:  CW - 2, y: -CL * 0.33, steer: true  },
      { x: -CW + 2, y:  CL * 0.33, steer: false },
      { x:  CW - 2, y:  CL * 0.33, steer: false },
    ];
    positions.forEach(({ x, y, steer }) => {
      ctx.save();
      ctx.translate(x, y);
      if (steer) ctx.rotate(wheelAngle);
      ctx.fillStyle = C.carWheel;
      ctx.beginPath();
      ctx.roundRect(-4, -7, 8, 14, 2);
      ctx.fill();
      ctx.fillStyle = '#333';
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  let smokeParticles = [];

  function _drawSmoke(ctx, cx, cy, angle, CL) {
    // Émet des particules depuis l'arrière de la voiture
    const ex = cx + Math.sin(angle) * (CL * 0.55);
    const ey = cy - Math.cos(angle) * (CL * 0.55);
    if (Math.random() < 0.4) {
      smokeParticles.push({
        x: ex + (Math.random() - 0.5) * 8,
        y: ey + (Math.random() - 0.5) * 8,
        r: 4 + Math.random() * 6,
        a: 0.5,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        life: 1,
      });
    }
    smokeParticles = smokeParticles.filter(p => p.life > 0);
    smokeParticles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180,180,160,${p.a * p.life})`;
      ctx.fill();
      p.x += p.vx;
      p.y += p.vy;
      p.r += 0.3;
      p.life -= 0.04;
    });
  }

  /** Grille de fond */
  function drawGrid(ctx, camX, camY, scale) {
    const gridSize = 50 * scale;
    const ox = ((W / 2 - camX * scale) % gridSize + gridSize) % gridSize;
    const oy = ((H / 2 - camY * scale) % gridSize + gridSize) % gridSize;

    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let x = ox - gridSize; x < W + gridSize; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = oy - gridSize; y < H + gridSize; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  // ── API publique ──────────────────────────────

  function init() {
    canvas = document.getElementById('world');
    ctx    = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function render() {
    const s    = Engine.getState();
    const SCALE = 2.5;

    // Caméra centrée sur la voiture
    const camX = s.x;
    const camY = s.y;

    // ── Fond herbe ────────────────────────────
    ctx.fillStyle = C.grass;
    ctx.fillRect(0, 0, W, H);

    // Grille légère
    drawGrid(ctx, camX, camY, SCALE);

    // ── Décors (arbres, bâtiments) ────────────
    const viewR = Math.max(W, H) / SCALE / 2 + CHUNK_SIZE;
    const cxMin = Math.floor((camX - viewR) / CHUNK_SIZE);
    const cxMax = Math.ceil ((camX + viewR) / CHUNK_SIZE);
    const cyMin = Math.floor((camY - viewR) / CHUNK_SIZE);
    const cyMax = Math.ceil ((camY + viewR) / CHUNK_SIZE);

    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) {
        const items = getChunk(cx, cy);
        items.forEach(item => {
          // Pas sur la route (x proche de 0)
          if (Math.abs(item.x) < 55) return;

          const sx = W / 2 + (item.x - camX) * SCALE;
          const sy = H / 2 + (item.y - camY) * SCALE;

          if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) return;

          if (item.type === 'tree') {
            drawTree(ctx, sx, sy, item.size * SCALE * 0.4);
          } else {
            drawBuilding(ctx, sx, sy, item.size * SCALE * 0.4, item.rot);
          }
        });
      }
    }

    // ── Route ─────────────────────────────────
    drawRoad(ctx, camX, camY, SCALE);

    // ── Voiture ───────────────────────────────
    drawCar(ctx, s.angle, s.wheelAngle, s.speed, s.rpm);
  }

  return { init, render, resize };

})();
