// dok.js: gemensam rendering av legend, lagerkort och full lagerdokumentation.
// Används av atlas.js (kartans panel) och dokumentation.js (dokumentationssidan),
// så att samma text och samma uppgifter visas på båda ställena.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const tal = (x) => (x == null ? "–" : Number(x).toLocaleString("sv-SE"));

const datum = (d) => {
  if (!d) return "–";
  const t = new Date(d + "T12:00:00");
  return isNaN(t) ? esc(d) : t.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
};

const lank = (url, text) =>
  url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text || url)}<span class="ka-ext" aria-hidden="true">↗</span></a>` : esc(text || "");

// En legendsymbol: yta, linje eller punkt
export function symbol(p) {
  const f = esc(p.farg || "#83888A");
  const k = esc(p.kant || "rgba(0,0,0,.35)");
  if (p.typ === "linje") {
    const d = p.streckad ? ` stroke-dasharray="4 3"` : "";
    const w = p.bredd || 2.2;
    return `<svg class="ka-sym" viewBox="0 0 24 14" aria-hidden="true"><line x1="1" y1="7" x2="23" y2="7" stroke="${f}" stroke-width="${w}" stroke-linecap="round"${d}/></svg>`;
  }
  if (p.typ === "punkt") {
    return `<svg class="ka-sym" viewBox="0 0 24 14" aria-hidden="true"><circle cx="12" cy="7" r="${p.r || 4.5}" fill="${f}" stroke="${k}" stroke-width="1"/></svg>`;
  }
  return `<svg class="ka-sym" viewBox="0 0 24 14" aria-hidden="true"><rect x="2" y="1.5" width="20" height="11" rx="2" fill="${f}" stroke="${k}" stroke-width="1"/></svg>`;
}

export function legendHTML(l) {
  if (!l.legend?.length) return "";
  return `<ul class="ka-legend">${l.legend
    .map((p) => `<li>${symbol(p)}<span>${esc(p.etikett)}</span></li>`)
    .join("")}</ul>`;
}

// Kort källrad: "Lantmäteriet, Översiktskartan (CC0 1.0)"
export function kallrad(l) {
  const k = l.kalla || {};
  return `${esc(k.myndighet)}, ${esc(k.dataset)}${k.licens ? ` (${esc(k.licens)})` : ""}`;
}

// Full dokumentation av ett lager som en definitionslista
export function dokHTML(l, { rubrikniva = 0 } = {}) {
  const k = l.kalla || {};
  const rader = [];
  const rad = (dt, dd) => dd && rader.push(`<div class="ka-dok-rad"><dt>${dt}</dt><dd>${dd}</dd></div>`);

  rad("Så läser du lagret", esc(l.las_sa));
  rad("Det här visar lagret inte", esc(l.visar_inte));
  rad("Källa", [
    `${esc(k.myndighet)}: ${lank(k.lank, k.dataset)}`,
    k.version ? `<span class="ka-dim">${esc(k.version)}</span>` : "",
    k.metadata && k.metadata !== k.lank ? lank(k.metadata, "Produktbeskrivning och metadata") : "",
  ].filter(Boolean).join("<br>"));
  rad("Licens", `${lank(k.licens_lank, k.licens)}${k.attribution ? `<br><span class="ka-dim">Ange källa som: ${esc(k.attribution)}</span>` : ""}`);
  rad("Avser", esc(l.aktualitet));
  if (l.uttag) rad("Data hämtad", datum(l.uttag));
  if (l.bearbetning?.length) {
    rad("Så har vi bearbetat datat", `<ol class="ka-steg">${l.bearbetning.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`);
  }
  if (l.antal_objekt != null) {
    const enhet = l.data?.typ === "bild" ? "bildpunkter med data" : "objekt";
    rad("Datamängd", `${tal(l.antal_objekt)} ${enhet}, ${tal(l.filstorlek_kb)} kB${l.kallfiler?.length && !l.anrop?.length ? `<br><span class="ka-dim">Ur ${l.kallfiler.map(esc).join(", ")}</span>` : ""}`);
  }
  if (l.anrop?.length) {
    const kort = (u) => { try { const x = new URL(u); return x.host + x.pathname.replace(/\/(query|wfs|wcs)$/i, "/$1"); } catch (_) { return u; } };
    rad(`Så hämtades datat (${l.anrop.length} anrop till källan)`,
      `<ol class="ka-anrop">${l.anrop.map((a) => `<li><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(kort(a.url))}</a><span class="ka-dim"> hämtat ${esc(String(a.hamtad).slice(0, 10))}, ${a.bytes < 1024 ? "under 1" : tal(Math.round(a.bytes / 1024))} kB</span></li>`).join("")}</ol>`);
  }
  if (l.kontroller?.length) {
    const sym = { OK: "✓", VARNING: "!", FEL: "✗" };
    rad("Kontroller vid bygget",
      `<ul class="ka-kontroller">${l.kontroller.map((k) => `<li class="ka-k-${esc(k.status)}"><span class="ka-k-sym" aria-label="${esc(k.status)}">${sym[k.status] || ""}</span><div><b>${esc(k.namn)}:</b> ${esc(k.utfall)}${k.forklaring ? `<br><span class="ka-dim">${esc(k.forklaring)}</span>` : ""}</div></li>`).join("")}</ul>`);
  }
  if (l.noter?.length) rad("Noter", l.noter.map(esc).join("<br>"));
  if (l.data?.typ === "raster") rad("Teknik", "Hämtas direkt från myndighetens karttjänst och visas som bild. Kartan visar därför alltid myndighetens senaste version.");
  const h = rubrikniva ? `<h${rubrikniva} class="ka-dok-titel">${esc(l.titel)}</h${rubrikniva}>` : "";
  return `${h}<dl class="ka-dok">${rader.join("")}</dl>`;
}
