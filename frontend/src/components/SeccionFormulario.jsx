/* Tarjeta numerada de los formularios de viáticos (estilos vs-sec en pages/ViaticosSeguridad.css) */
export default function SeccionFormulario({ n, titulo, desc, extra, children }) {
  return (
    <section className="vs-sec">
      <div className="vs-sec-head">
        <span className="vs-step">{n}</span>
        <div>
          <h3 className="vs-sec-title">{titulo}</h3>
          <p className="vs-sec-desc">{desc}</p>
        </div>
        {extra && <div className="vs-sec-extra">{extra}</div>}
      </div>
      <div className="vs-sec-body">{children}</div>
    </section>
  );
}
