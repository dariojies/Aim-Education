// Imprimir (o guardar en PDF) un documento hecho en la pantalla (#452): se mete
// en la página y, al imprimir, se ve solo él. Antes se quitaba al segundo; si el
// navegador imprimía después (la vista previa ya estaba hecha), salía la web
// entera en vez del documento. Ahora se quita cuando el navegador avisa de que
// ha terminado (afterprint) o, si no avisa, a los diez minutos.
export function imprimirHtml(id, html) {
  document.getElementById(`${id}-style`)?.remove();
  document.getElementById(id)?.remove();
  const style = document.createElement('style');
  style.id = `${id}-style`;
  style.innerHTML = `#${id} { display: none; }
@media print { body > *:not(#${id}) { display: none !important; } #${id} { display: block !important; position: static; background: white; } }`;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = id;
  el.innerHTML = html;
  document.body.appendChild(el);
  let quitado = false;
  const quitar = () => {
    if (quitado) return;
    quitado = true;
    window.removeEventListener('afterprint', quitar);
    style.remove();
    el.remove();
  };
  window.addEventListener('afterprint', quitar);
  setTimeout(quitar, 10 * 60_000);
  window.print();
}
