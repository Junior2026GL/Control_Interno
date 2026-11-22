import './ChristmasScenery.css';

// Posiciones fijas (sin azar en cada render): 16 estrellas repartidas por el fondo
const ESTRELLAS = Array.from({ length: 16 }, (_, i) => ({
  left: `${((i * 37 + 11) % 97) + 1}%`,
  top: `${((i * 53 + 7) % 62) + 3}%`,
  size: 10 + ((i * 7) % 9),
  delay: `${(i % 6) * 0.45}s`,
  dur: `${2.2 + (i % 4) * 0.5}s`,
}));

/** Estrellas doradas que titilan en el fondo. */
export default function ChristmasScenery() {
  return (
    <div className="xmas-scenery" aria-hidden="true">
      {ESTRELLAS.map((s, i) => (
        <span
          key={i}
          className="xmas-star"
          style={{ left: s.left, top: s.top, fontSize: s.size, animationDelay: s.delay, animationDuration: s.dur }}
        >
          ✦
        </span>
      ))}
    </div>
  );
}
