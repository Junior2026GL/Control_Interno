import './ChristmasLights.css';

const COLORES = ['#ef4444', '#22c55e', '#fbbf24', '#3b82f6', '#f472b6'];
const TOTAL = 28;      // bombillos
const POR_TRAMO = 7;   // bombillos por cada curva de la guirnalda

// Posición de cada bombillo: x en %, y en px (curva que cuelga)
const puntos = Array.from({ length: TOTAL }, (_, i) => {
  const sag = Math.sin(((i % POR_TRAMO) / (POR_TRAMO - 1)) * Math.PI) * 9;
  return { x: (i / (TOTAL - 1)) * 100, y: 3 + sag, color: COLORES[i % COLORES.length], i };
});

/** Guirnalda de luces de colores que parpadean, para colgar en un contenedor relativo. */
export default function ChristmasLights() {
  const cable = puntos.map((p) => `${p.x},${p.y + 3}`).join(' ');
  return (
    <div className="xmas-lights" aria-hidden="true">
      <svg viewBox="0 0 100 24" preserveAspectRatio="none">
        <polyline points={cable} fill="none" stroke="#0b1220" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
      {puntos.map((p) => (
        <span
          key={p.i}
          className="xmas-bulb"
          style={{
            left: `${p.x}%`,
            top: `${p.y + 3}px`,
            '--c': p.color,
            animationDelay: `${(p.i % 7) * 0.27}s`,
          }}
        />
      ))}
    </div>
  );
}
