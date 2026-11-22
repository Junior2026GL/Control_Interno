import { useEffect, useRef } from 'react';

const GLIFOS = ['❄', '❅', '❆'];

/**
 * Nieve navideña sobre el fondo. No recibe clics (pointer-events: none)
 * y se desactiva si el usuario pidió reducir el movimiento.
 */
export default function SnowEffect() {
  const ref = useRef(null);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;

    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let flakes = [];
    let raf = 0;

    const crear = () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 2.6 + 0.8,        // radio
      v: Math.random() * 0.8 + 0.35,       // velocidad de caída
      fase: Math.random() * Math.PI * 2,   // balanceo
      amp: Math.random() * 0.6 + 0.2,
      op: Math.random() * 0.5 + 0.4,
      glifo: Math.random() < 0.35 ? GLIFOS[Math.floor(Math.random() * GLIFOS.length)] : null,
      giro: Math.random() * Math.PI * 2,
      vgiro: (Math.random() - 0.5) * 0.02,
    });

    const ajustar = () => {
      const dpr = window.devicePixelRatio || 1;
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cantidad = Math.min(140, Math.max(40, Math.round(w / 11)));
      flakes = Array.from({ length: cantidad }, crear);
    };

    const dibujar = () => {
      const oscuro = document.documentElement.getAttribute('data-theme') === 'dark';
      const color = oscuro ? '255,255,255' : '150,185,235';
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        f.fase += 0.012;
        f.y += f.v;
        f.x += Math.sin(f.fase) * f.amp;
        if (f.y > h + 5) { f.y = -5; f.x = Math.random() * w; }
        if (f.x > w + 5) f.x = -5;
        if (f.x < -5) f.x = w + 5;
        ctx.fillStyle = `rgba(${color},${f.op})`;
        if (f.glifo) {
          // Copo con forma de estrella de nieve, girando despacio
          f.giro += f.vgiro;
          ctx.save();
          ctx.translate(f.x, f.y);
          ctx.rotate(f.giro);
          ctx.font = `${Math.round(f.r * 6 + 6)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(f.glifo, 0, 0);
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(dibujar);
    };

    ajustar();
    dibujar();
    window.addEventListener('resize', ajustar);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', ajustar);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 50 }}
    />
  );
}
