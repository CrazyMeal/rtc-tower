export const timeFormat = new Intl.DateTimeFormat('fr-CA', {timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
export function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
export function svg(viewBox, className, paths, attributes = {}) {
  const ns = 'http://www.w3.org/2000/svg', node = document.createElementNS(ns, 'svg');
  node.setAttribute('viewBox', viewBox); node.setAttribute('class', className); node.setAttribute('aria-hidden', 'true');
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  for (const [pathClass, d] of paths) { const path = document.createElementNS(ns, 'path'); if (pathClass) path.setAttribute('class', pathClass); path.setAttribute('d', d); node.append(path); }
  return node;
}
