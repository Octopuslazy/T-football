import * as PIXI from 'pixi.js';
/**
 * Spawn a short-lived impact burst effect at (x,y) inside `parent`.
 * Uses GSAP if available on `window.gsap`, otherwise falls back to a PIXI.Ticker tween.
 */
// Toggle to enable/disable impact effects globally (set false to disable)
export let impactsEnabled = false;
export function spawnImpactEffect(parent, x, y, options) {
    if (!impactsEnabled && !options?.force)
        return;
    const color = options?.color ?? 0xFFEE88;
    const duration = options?.durationMs ?? 300; // ms
    const container = new PIXI.Container();
    container.x = x;
    container.y = y;
    container.zIndex = 9999;
    // Glow rings (concentric circles)
    const ring = new PIXI.Graphics();
    ring.beginFill(color, 0.75);
    ring.drawCircle(0, 0, 28);
    ring.endFill();
    ring.alpha = 0.95;
    const core = new PIXI.Graphics();
    core.beginFill(0xFFFFFF, 1);
    core.drawCircle(0, 0, 10);
    core.endFill();
    // Rays
    const rays = new PIXI.Container();
    const rayCount = 8;
    for (let i = 0; i < rayCount; i++) {
        const g = new PIXI.Graphics();
        g.beginFill(color, 0.9);
        g.drawRect(-3, -36, 6, 24);
        g.endFill();
        g.rotation = (i / rayCount) * Math.PI * 2;
        g.alpha = 0.95 - (Math.random() * 0.2);
        rays.addChild(g);
    }
    container.addChild(ring, rays, core);
    container.scale.set(0.2);
    container.alpha = 1;
    // Add to parent (play layer). If parent is null, try app.stage usage pattern.
    try {
        parent.addChild(container);
    }
    catch (e) {
        return;
    }
    // Animation: prefer GSAP if present
    const gsap = window.gsap;
    if (gsap && typeof gsap.timeline === 'function') {
        const tl = gsap.timeline({
            onComplete: () => { try {
                container.destroy({ children: true });
            }
            catch (e) { } }
        });
        tl.to(container.scale, { x: 2.6, y: 2.6, duration: duration / 1000, ease: 'power2.out' }, 0);
        tl.to(container, { alpha: 0, duration: (duration * 0.6) / 1000, ease: 'power1.in' }, duration * 0.35 / 1000);
        tl.to(container, { rotation: Math.PI * 0.25, duration: duration / 1000, ease: 'linear' }, 0);
        return;
    }
    // Fallback: simple ticker-based tween
    const start = performance.now();
    const startScale = 0.2;
    const endScale = 2;
    const startAlpha = 1;
    const endAlpha = 0;
    const update = () => {
        const now = performance.now();
        const t = Math.min(1, (now - start) / duration);
        // ease out cubic
        const u = t - 1;
        const ease = u * u * u + 1;
        const s = startScale + (endScale - startScale) * ease;
        container.scale.set(s);
        container.alpha = startAlpha + (endAlpha - startAlpha) * Math.min(1, (now - start) / (duration * 0.9));
        container.rotation += 0.02;
        if ((now - start) >= duration) {
            try {
                PIXI.Ticker.shared.remove(update);
            }
            catch (e) { }
            try {
                container.destroy({ children: true });
            }
            catch (e) { }
        }
    };
    PIXI.Ticker.shared.add(update);
}
export default spawnImpactEffect;
