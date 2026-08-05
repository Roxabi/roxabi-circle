/** Demo cursor init script (from product pattern — kit-generic). */
export const CURSOR_INIT_SCRIPT = `
(() => {
  if (window.__pwDemoCursorReady) return;
  window.__pwDemoCursorReady = true;

  const STYLE_ID = 'pw-demo-cursor-style';
  const CURSOR_ID = 'pw-demo-cursor';
  const css = \`
    #pw-demo-cursor {
      position: fixed !important;
      z-index: 2147483647 !important;
      width: 28px !important;
      height: 28px !important;
      margin-left: -6px !important;
      margin-top: -6px !important;
      pointer-events: none !important;
      border: 3px solid #fff !important;
      border-radius: 50% !important;
      background: rgba(168, 85, 247, 0.92) !important;
      box-shadow: 0 0 0 2px rgba(0,0,0,.85), 0 4px 14px rgba(0,0,0,.45) !important;
      left: 320px;
      top: 200px;
      transition: transform 90ms ease, background 90ms ease;
      will-change: left, top;
    }
    #pw-demo-cursor.is-click {
      transform: scale(0.72);
      background: rgba(216, 180, 254, 0.95) !important;
    }
  \`;

  window.__pwCursorPos = window.__pwCursorPos || { x: 320, y: 200 };
  window.__pwCurveSide = window.__pwCurveSide || 1;
  let glideTimer = 0;

  function ensure() {
    try {
      let style = document.getElementById(STYLE_ID);
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        const head = document.head || document.documentElement;
        if (head) head.appendChild(style);
      }
      let cursor = document.getElementById(CURSOR_ID);
      const parent = document.body || document.documentElement;
      if (!parent) return null;
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = CURSOR_ID;
        cursor.style.left = window.__pwCursorPos.x + 'px';
        cursor.style.top = window.__pwCursorPos.y + 'px';
        parent.appendChild(cursor);
      } else if (document.body && cursor.parentElement !== document.body) {
        document.body.appendChild(cursor);
        cursor.style.left = window.__pwCursorPos.x + 'px';
        cursor.style.top = window.__pwCursorPos.y + 'px';
      }
      return cursor;
    } catch (_) {
      return null;
    }
  }

  function setPos(x, y) {
    const c = ensure();
    if (!c) return;
    window.__pwCursorPos = { x, y };
    c.style.left = Math.round(x) + 'px';
    c.style.top = Math.round(y) + 'px';
  }

  /** Profil vitesse humaine (pointing) : 10t³ − 15t⁴ + 6t⁵ */
  function minJerk(t) {
    const t2 = t * t;
    const t3 = t2 * t;
    const t4 = t3 * t;
    const t5 = t4 * t;
    return 10 * t3 - 15 * t4 + 6 * t5;
  }

  function cubicBezier(t, p0, p1, p2, p3) {
    const u = 1 - t;
    const uu = u * u;
    const tt = t * t;
    return uu * u * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + tt * t * p3;
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  /**
   * Trajet "humain" : Bézier cubique bombée + min-jerk + overshoot léger.
   * Alterne le côté de la courbe pour éviter un arc toujours identique.
   */
  function glide(tx, ty, ms) {
    const duration = Math.max(100, ms || 600);
    if (glideTimer) {
      clearInterval(glideTimer);
      glideTimer = 0;
    }

    const sx = window.__pwCursorPos.x;
    const sy = window.__pwCursorPos.y;
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy) || 1;

    // Vecteur perpendiculaire unitaire
    const px = -dy / dist;
    const py = dx / dist;

    // Alterne gauche/droite + amplitude ~12–30 % de la distance
    window.__pwCurveSide = -(window.__pwCurveSide || 1);
    const side = window.__pwCurveSide;
    const bulge = dist * rand(0.14, 0.30) * side;
    // Légère asymétrie des poignées (arc plus organique)
    const b1 = bulge * rand(0.85, 1.15);
    const b2 = bulge * rand(0.45, 0.85);

    const c1x = sx + dx * rand(0.22, 0.38) + px * b1;
    const c1y = sy + dy * rand(0.22, 0.38) + py * b1;
    const c2x = sx + dx * rand(0.62, 0.82) + px * b2;
    const c2y = sy + dy * rand(0.62, 0.82) + py * b2;

    // Overshoot occasionnel le long de la direction (pas systématique)
    const doOvershoot = dist > 80 && Math.random() < 0.55;
    const over = doOvershoot ? Math.min(16, dist * rand(0.025, 0.055)) : 0;
    const p3x = tx + (dx / dist) * over;
    const p3y = ty + (dy / dist) * over;

    // Phase principale (courbe) puis settle vers la cible exacte
    const mainRatio = doOvershoot ? 0.82 : 0.92;
    const mainMs = duration * mainRatio;
    const settleMs = duration - mainMs;

    const t0 = performance.now();
    return new Promise((resolve) => {
      const tick = () => {
        const elapsed = performance.now() - t0;
        if (elapsed <= mainMs) {
          const t = Math.min(1, elapsed / mainMs);
          const u = minJerk(t);
          let x = cubicBezier(u, sx, c1x, c2x, p3x);
          let y = cubicBezier(u, sy, c1y, c2y, p3y);
          // Micro-tremblements en milieu de trajet (amplitude ↓ près des extrémités)
          const wobble = Math.sin(t * Math.PI) * Math.min(2.2, dist * 0.008);
          if (wobble > 0.15) {
            x += px * Math.sin(elapsed * 0.045) * wobble;
            y += py * Math.cos(elapsed * 0.038) * wobble * 0.7;
          }
          setPos(x, y);
        } else if (elapsed < duration) {
          // Settle final vers la cible (correction overshoot)
          const st = Math.min(1, (elapsed - mainMs) / Math.max(1, settleMs));
          const e = minJerk(st);
          const from = window.__pwCursorPos;
          // Ancre le settle depuis la position courante (pas un jump)
          if (!tick._sx) {
            tick._sx = from.x;
            tick._sy = from.y;
          }
          setPos(tick._sx + (tx - tick._sx) * e, tick._sy + (ty - tick._sy) * e);
        } else {
          clearInterval(glideTimer);
          glideTimer = 0;
          setPos(tx, ty);
          resolve();
          return;
        }
      };
      tick();
      glideTimer = setInterval(tick, 16);
    });
  }

  window.__pwDemoCursorEnsure = ensure;
  window.__pwDemoCursorMove = setPos;
  window.__pwDemoCursorGlide = glide;
  window.__pwDemoCursorClick = (down) => {
    const c = ensure();
    if (!c) return;
    c.classList.toggle('is-click', !!down);
  };
  window.__pwDemoCursorGetPos = () => ({ ...window.__pwCursorPos });

  ensure();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensure, { once: true });
  }
  setInterval(ensure, 500);
})();
`
