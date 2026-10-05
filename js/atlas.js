// atlas.js: kustatlasens panel och lata lager.
//
// Läser lager.json (byggd av R/bygg.R ur lager/lager.yml) och
//   • bygger panelen: teman som hopfällbara grupper, ett reglage per lager,
//     ett lagerkort (förklaring, legend, källa) och full dokumentation under "Om lagret",
//   • lägger till ett lagers källa och kartlager FÖRST när lagret tänds första gången,
//     i en fast ritordning (yta < linje < punkt, sedan registrets ordning), under
//     bakgrundskartans ortnamn,
//   • visar popup vid klick, sparar tända lager och kartvy i adressen (#l=…&v=…)
//     så att en vy kan delas som länk.

import { esc, legendHTML, kallrad, dokHTML, symbol } from "./dok.js";

const NIVA = { yta: 0, linje: 1, punkt: 2 };
const panel = document.getElementById("atlas-panel");
const el = document.getElementById("atlas-karta");

const reg = await fetch("lager.json").then((r) => r.json());
const lager = reg.lager.map((l, i) => ({ ...l, _i: i }));
const perId = Object.fromEntries(lager.map((l) => [l.id, l]));
const ordning = [...lager].sort((a, b) => NIVA[a.niva] - NIVA[b.niva] || a._i - b._i).map((l) => l.id);

const tillagda = new Set();   // lager vars källa och kartlager finns i kartan
const tanda = new Set();      // lager som är synliga
const variant = {};           // vald variant per lager med varianter (t.ex. typ av påverkan)
const klickbara = [];         // kartlager med popup, överst först vid klick
let oppetKort = null;

lager.filter((l) => l.varianter).forEach((l) => (variant[l.id] = l.varianter.standard || l.varianter.lista[0].id));

// ── Startläge ur adressen ────────────────────────────────────────────────────
const hash = new URLSearchParams(location.hash.slice(1));
if (hash.has("l")) {
  hash.get("l").split(",").filter((id) => perId[id]).forEach((id) => tanda.add(id));
} else {
  lager.filter((l) => l.start).forEach((l) => tanda.add(l.id));
}
(hash.get("var") || "").split(",").forEach((p) => {
  const [id, v] = p.split(":");
  if (perId[id]?.varianter?.lista.some((x) => x.id === v)) variant[id] = v;
});

const valdVariant = (l) => l.varianter?.lista.find((x) => x.id === variant[l.id]);
// Lagrets ritning med variantens fält insatt där registret skriver {falt}
const ritning = (l) => {
  if (!l.varianter) return l.ritning;
  return JSON.parse(JSON.stringify(l.ritning).replaceAll("{falt}", valdVariant(l).falt));
};

// ── Panelen ──────────────────────────────────────────────────────────────────
// En legend med en enda post som bara upprepar lagrets namn behövs inte (ikonen i raden räcker)
const upprepar = (l) => l.legend?.length === 1 && l.legend[0].etikett.toLowerCase().startsWith(l.titel.toLowerCase().slice(0, 10));

function lagerRad(l) {
  const ikon = l.legend?.[0] ? symbol(l.legend[0]) : "";
  return `
  <li class="ka-lager${tanda.has(l.id) ? " ka-tand" : ""}" data-id="${l.id}">
    <div class="ka-lager-rad">
      <label class="ka-vaxel">
        <input type="checkbox" ${tanda.has(l.id) ? "checked" : ""} aria-describedby="ka-kort-${l.id}">
        <span class="ka-vaxel-spar" aria-hidden="true"></span>
        <span class="ka-lager-ikon">${ikon}</span>
        <span class="ka-lager-titel">${esc(l.titel)}</span>
      </label>
      <span class="ka-laddar" aria-hidden="true"></span>
      <button class="ka-info" type="button" aria-expanded="false" aria-controls="ka-kort-${l.id}" title="Om lagret">
        <span class="ka-visually-hidden">Om lagret ${esc(l.titel)}</span>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    ${l.varianter ? `
    <label class="ka-variant">
      <span>${esc(l.varianter.etikett)}</span>
      <select data-variant="${l.id}">
        ${l.varianter.lista.map((v) => `<option value="${v.id}" ${v.id === variant[l.id] ? "selected" : ""}>${esc(v.etikett)}</option>`).join("")}
      </select>
    </label>` : ""}
    ${upprepar(l) ? "" : `<div class="ka-rad-legend" aria-label="Teckenförklaring för ${esc(l.titel)}">${legendHTML(l)}</div>`}
    <div class="ka-kort" id="ka-kort-${l.id}" hidden>
      <p class="ka-kort-text">${esc(l.kort)}</p>
      <p class="ka-kort-kalla">Källa: ${kallrad(l)}</p>
      <details class="ka-om">
        <summary>Om lagret: läsanvisning, källa och bearbetning</summary>
        ${dokHTML(l)}
        <p class="ka-om-lank"><a href="dokumentation.html#${l.id}">Lagret i dokumentationen</a></p>
      </details>
    </div>
  </li>`;
}

function byggPanel() {
  const a = reg.atlas;
  const teman = reg.teman
    .map((t) => ({ ...t, lager: lager.filter((l) => l.tema === t.id) }))
    .filter((t) => t.lager.length);
  panel.innerHTML = `
    <div class="ka-handtag" aria-hidden="true"><span></span></div>
    <header class="ka-huvud">
      <p class="ka-overrad">${esc(a.utgivare)}</p>
      <h1>${esc(a.titel)}</h1>
      <p class="ka-underrubrik">${esc(a.underrubrik)}</p>
      <p class="ka-ingress">${esc(a.ingress)}</p>
    </header>
    <div class="ka-status"><span class="ka-antal" aria-live="polite"></span><span class="ka-status-knappar"><button type="button" class="ka-bara" aria-pressed="false">Visa bara tända</button><button type="button" class="ka-slack">Släck alla</button></span></div>
    <nav class="ka-teman">
      ${teman.map((t) => `
      <section class="ka-tema" data-tema="${t.id}">
        <h2><button type="button" class="ka-tema-knapp" aria-expanded="true">
          <span class="ka-tema-titel">${esc(t.titel)}</span>
          <span class="ka-tema-antal"></span>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button></h2>
        <div class="ka-tema-innehall">
          <p class="ka-tema-text">${esc(t.beskrivning)}</p>
          <ul class="ka-lagerlista">${t.lager.map(lagerRad).join("")}</ul>
        </div>
      </section>`).join("")}
    </nav>
    <footer class="ka-fot">
      <a href="dokumentation.html">Dokumentation för alla lager</a>
      <button type="button" class="ka-dela">Kopiera länk till vyn</button>
      <p>Byggd ${esc(reg.byggt)}. Bakgrundskarta © OpenStreetMap-bidragsgivare, © CARTO.</p>
    </footer>`;

  panel.addEventListener("change", (e) => {
    const li = e.target.closest(".ka-lager");
    if (li && e.target.type === "checkbox") satt(li.dataset.id, e.target.checked);
    if (e.target.dataset.variant) sattVariant(e.target.dataset.variant, e.target.value);
  });
  panel.addEventListener("click", (e) => {
    const info = e.target.closest(".ka-info");
    if (info) return visaKort(info.closest(".ka-lager").dataset.id);
    const tk = e.target.closest(".ka-tema-knapp");
    if (tk) {
      const oppen = tk.getAttribute("aria-expanded") === "true";
      tk.setAttribute("aria-expanded", String(!oppen));
      tk.closest(".ka-tema").classList.toggle("ka-stangd", oppen);
      return;
    }
    if (e.target.closest(".ka-slack")) { [...tanda].forEach((id) => satt(id, false)); return visaBaraTanda(false); }
    if (e.target.closest(".ka-bara")) return visaBaraTanda(!panel.classList.contains("ka-bara-tanda"));
    if (e.target.closest(".ka-dela")) return dela(e.target.closest(".ka-dela"));
    if (e.target.closest(".ka-handtag")) panel.classList.toggle("ka-uppfalld");
  });
  uppdateraRaknare();
}

function visaKort(id, tvinga) {
  const nytt = oppetKort === id && !tvinga ? null : id;
  panel.querySelectorAll(".ka-lager").forEach((li) => {
    const oppna = li.dataset.id === nytt;
    li.classList.toggle("ka-vald", oppna);
    li.querySelector(".ka-kort").hidden = !oppna;
    li.querySelector(".ka-info").setAttribute("aria-expanded", String(oppna));
  });
  oppetKort = nytt;
}

// "Visa bara tända": panelen krymper till de tända lagren med sina legender, så att
// alla teckenförklaringar syns samlat högst upp utan att man skrollar
function visaBaraTanda(pa) {
  panel.classList.toggle("ka-bara-tanda", pa);
  const k = panel.querySelector(".ka-bara");
  k.setAttribute("aria-pressed", String(pa));
  k.textContent = pa ? "Visa alla lager" : "Visa bara tända";
  if (pa) panel.scrollTo({ top: 0, behavior: "smooth" });
}

function uppdateraRaknare() {
  const n = tanda.size;
  panel.querySelector(".ka-antal").textContent = n ? `${n} ${n === 1 ? "lager tänt" : "lager tända"}` : "Inga lager tända";
  panel.querySelector(".ka-slack").hidden = !n;
  panel.querySelector(".ka-bara").hidden = !n && !panel.classList.contains("ka-bara-tanda");
  panel.querySelectorAll(".ka-tema").forEach((s) => s.classList.toggle("ka-har-tanda",
    lager.some((l) => l.tema === s.dataset.tema && tanda.has(l.id))));
  panel.querySelectorAll(".ka-tema").forEach((s) => {
    const k = lager.filter((l) => l.tema === s.dataset.tema && tanda.has(l.id)).length;
    s.querySelector(".ka-tema-antal").textContent = k ? String(k) : "";
  });
}

async function dela(knapp) {
  skrivAdress();
  try {
    await navigator.clipboard.writeText(location.href);
    knapp.textContent = "Länken är kopierad";
  } catch (_) {
    knapp.textContent = "Kopiera adressen i webbläsaren";
  }
  setTimeout(() => (knapp.textContent = "Kopiera länk till vyn"), 2200);
}

// ── Kartan ───────────────────────────────────────────────────────────────────
const map = await new Promise((ok) => {
  const vanta = () => (el?.map ? ok(el.map) : setTimeout(vanta, 30));
  vanta();
});
await new Promise((ok) => (map.loaded() || map.isStyleLoaded() ? ok() : map.once("load", ok)));

const basLager = new Set(map.getStyle().layers.map((l) => l.id));
const forstaEtikett = map.getStyle().layers.find((l) => l.type === "symbol")?.id;

function justeraBaskarta() {
  const s = (id, prop, v) => { try { map.getLayer(id) && map.setPaintProperty(id, prop, v); } catch (_) { /* */ } };
  s("background", "background-color", "#F3F4EE");
  s("water", "fill-color", "#DCEEF6");
  ["waterway", "water_shadow"].forEach((id) => s(id, "line-color", "#C3E1F0"));
  // bakgrundens rosa administrativa gränser konkurrerar med atlasens lager: gör dem grå
  // riksgränsen i bakgrundskartan dras genom Kattegatt utanför Skåne och saknar funktion i atlasens område
  // läns- och regiongränserna fortsätter ut i havet och krockar med vattenlagren;
  // atlasens eget kommungränslager tar över den rollen
  ["boundary_county", "boundary_state", "boundary_country_inner", "boundary_country_outline"].forEach((id) => { try { map.getLayer(id) && map.setLayoutProperty(id, "visibility", "none"); } catch (_) { /* */ } });
  map.getStyle().layers.forEach((l) => {
    if (l.type !== "symbol") return;
    const tf = JSON.stringify(map.getLayoutProperty(l.id, "text-field") || "");
    if (/name/.test(tf)) {
      try { map.setLayoutProperty(l.id, "text-field", ["coalesce", ["get", "name:sv"], ["get", "name"], ["get", "name_en"]]); } catch (_) { /* */ }
    }
  });
}
justeraBaskarta();

const kartlagerId = (l, i) => `ka-${l.id}-${i}`;

function placering(id) {
  // Rita under det närmaste redan tillagda lagret som ska ligga ovanför, annars under ortnamnen
  const pos = ordning.indexOf(id);
  for (const ovan of ordning.slice(pos + 1)) {
    if (tillagda.has(ovan)) return kartlagerId(perId[ovan], 0);
  }
  return forstaEtikett;
}

// Källans id följer datafilen, så att lager som visar samma fil delar källa
// (vattendrag och ekologisk status läser båda vattenforekomster.json)
const kallId = (l) => `ka-src-${(l.data.fil || l.data.url || l.data.tiles || l.id).replace(/[^A-Za-z0-9]+/g, "-")}`;

function kalla(l) {
  const d = l.data;
  const attribution = l.kalla?.attribution;
  if (d.typ === "geojson") return { type: "geojson", data: d.fil, attribution };
  if (d.typ === "bild") return { type: "image", url: d.fil, coordinates: d.koordinater };
  if (d.typ === "pmtiles") return { type: "vector", url: `pmtiles://${new URL(d.url, location.href).href}`, attribution };
  if (d.typ === "raster") return { type: "raster", tiles: [d.tiles], tileSize: d.tileSize || 256, attribution };
  throw new Error(`Okänd datatyp för ${l.id}`);
}

function laggTill(l) {
  if (tillagda.has(l.id)) return;
  const li = panel.querySelector(`.ka-lager[data-id="${l.id}"]`);
  const kid = kallId(l);
  const ny = !map.getSource(kid);
  if (ny) {
    li?.classList.add("ka-laddas");
    map.addSource(kid, kalla(l));
  }
  const fore = placering(l.id);
  ritning(l).forEach((r, i) => {
    const def = {
      id: kartlagerId(l, i),
      type: r.typ,
      source: kid,
      paint: r.paint || {},
      layout: { ...(r.layout || {}), visibility: "visible" },
    };
    if (l.data.kalllager) def["source-layer"] = l.data.kalllager;
    if (r.filter) def.filter = r.filter;
    if (r.minzoom != null) def.minzoom = r.minzoom;
    if (r.maxzoom != null) def.maxzoom = r.maxzoom;
    map.addLayer(def, r.typ === "symbol" ? undefined : fore);
    if (l.popup && r.typ !== "symbol") klickbara.push(def.id);
  });
  // Bildkällor saknar attribution i MapLibre: en tom källa med ett osynligt lager bär källangivelsen
  if (l.data.typ === "bild" && l.kalla?.attribution) {
    map.addSource(`${kid}-k`, { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: l.kalla.attribution });
    map.addLayer({ id: `ka-${l.id}-k`, type: "circle", source: `${kid}-k` });
  }
  tillagda.add(l.id);
  if (!ny) return;
  const klar = () => li?.classList.remove("ka-laddas");
  const lyssna = (e) => {
    if (e.sourceId === kid && map.isSourceLoaded(kid)) { klar(); map.off("sourcedata", lyssna); }
  };
  map.on("sourcedata", lyssna);
  setTimeout(klar, 15000);
}

const kartlagerFor = (l) => [...l.ritning.map((_, i) => kartlagerId(l, i)), `ka-${l.id}-k`].filter((id) => map.getLayer(id));

function satt(id, pa) {
  const l = perId[id];
  if (!l) return;
  if (pa) {
    tanda.add(id);
    if (!tillagda.has(id)) laggTill(l);
    else kartlagerFor(l).forEach((id) => map.setLayoutProperty(id, "visibility", "visible"));
  } else {
    tanda.delete(id);
    if (tillagda.has(id)) kartlagerFor(l).forEach((id) => map.setLayoutProperty(id, "visibility", "none"));
  }
  const li = panel.querySelector(`.ka-lager[data-id="${id}"]`);
  if (li) { li.querySelector("input").checked = pa; li.classList.toggle("ka-tand", pa); }
  uppdateraRaknare();
  skrivAdress();
}

function sattVariant(id, v) {
  const l = perId[id];
  variant[id] = v;
  if (tillagda.has(id)) {
    ritning(l).forEach((r, i) => {
      Object.entries(r.paint || {}).forEach(([k, val]) => map.setPaintProperty(kartlagerId(l, i), k, val));
      if (r.filter) map.setFilter(kartlagerId(l, i), r.filter);   // varianter kan också filtrera (t.ex. scenario)
    });
  }
  if (!tanda.has(id)) satt(id, true);
  skrivAdress();
}

// ── Popup: det översta klickbara objektet under markören ────────────────────
let popup = null;
function visaPopup(l, f, lngLat) {
  const p = f.properties || {};
  const pop = l.popup;
  const fyll = (s) => String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => p[k] ?? "");
  const varde = (v) => (pop.varden && pop.varden[v]) || v;
  const rader = (pop.rader || [])
    .filter(([, k]) => p[k] != null && p[k] !== "" && p[k] !== "N/A")
    .map(([et, k, enhet]) => {
      const v = typeof p[k] === "number" ? p[k].toLocaleString("sv-SE") : varde(p[k]);
      return `<tr><th>${esc(et)}</th><td>${esc(v)}${enhet ? ` ${esc(enhet)}` : ""}</td></tr>`;
    }).join("");
  const vald = l.varianter ? `<p class="ka-pop-variant">Visar: ${esc(valdVariant(l).etikett)}</p>` : "";
  const lank = pop.lank && p[pop.lank]
    ? `<a class="ka-pop-lank" href="${esc(p[pop.lank])}" target="_blank" rel="noopener">${esc(pop.lank_text || "Läs mer")} ↗</a>` : "";
  const html = `<div class="ka-pop"><p class="ka-pop-lager">${esc(l.titel)}</p>
    <p class="ka-pop-titel">${esc(fyll(pop.titel))}</p>${vald}
    ${rader ? `<table>${rader}</table>` : ""}${lank}</div>`;
  popup?.remove();
  popup = new maplibregl.Popup({ maxWidth: "320px", className: "ka-popup" }).setLngLat(lngLat).setHTML(html).addTo(map);
}
const lagerFranKartlager = (kid) => perId[kid.replace(/^ka-/, "").replace(/-\d+$/, "")];
map.on("click", (e) => {
  const aktiva = klickbara.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
  if (!aktiva.length) return;
  const f = map.queryRenderedFeatures(e.point, { layers: aktiva })[0];
  if (f) visaPopup(lagerFranKartlager(f.layer.id), f, e.lngLat);
});
map.on("mousemove", (e) => {
  const aktiva = klickbara.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, "visibility") !== "none");
  const traff = aktiva.length && map.queryRenderedFeatures(e.point, { layers: aktiva }).length;
  map.getCanvas().style.cursor = traff ? "pointer" : "";
});

// ── Adressen ─────────────────────────────────────────────────────────────────
let adressTimer = null;
function skrivAdress() {
  clearTimeout(adressTimer);
  adressTimer = setTimeout(() => {
    const c = map.getCenter();
    const q = new URLSearchParams();
    q.set("l", ordning.filter((id) => tanda.has(id)).join(","));
    const v = Object.entries(variant).filter(([id, x]) => tanda.has(id) && x !== perId[id].varianter.standard);
    if (v.length) q.set("var", v.map(([id, x]) => `${id}:${x}`).join(","));
    q.set("v", `${map.getZoom().toFixed(2)}/${c.lat.toFixed(4)}/${c.lng.toFixed(4)}`);
    history.replaceState(null, "", `#${q.toString().replace(/%2C/g, ",").replace(/%2F/g, "/").replace(/%3A/g, ":")}`);
  }, 150);
}
map.on("moveend", skrivAdress);

// ── Hemknapp ─────────────────────────────────────────────────────────────────
class HemKnapp {
  onAdd() {
    const d = document.createElement("div");
    d.className = "maplibregl-ctrl maplibregl-ctrl-group";
    d.innerHTML = `<button type="button" class="ka-hem" title="Tillbaka till startvyn" aria-label="Tillbaka till startvyn">
      <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 9.5L10 4l6.5 5.5M5.5 8v7.5h9V8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg></button>`;
    d.querySelector("button").onclick = () => map.fitBounds(reg.atlas.startvy, { padding: 24, duration: 900 });
    return d;
  }
  onRemove() {}
}
map.addControl(new HemKnapp(), "top-right");

// ── Smal skärm: kartans mitt ska ligga ovanför panelarket ───────────────────
const smal = matchMedia("(max-width: 760px)");
function anpassaPadding(flytta) {
  const pad = smal.matches ? { top: 0, right: 0, left: 0, bottom: panel.getBoundingClientRect().height } : { top: 0, right: 0, bottom: 0, left: 0 };
  map.setPadding(pad);
  if (flytta) map.fitBounds(reg.atlas.startvy, { padding: 16, duration: 0 });
}
smal.addEventListener("change", () => anpassaPadding(false));
panel.addEventListener("transitionend", (e) => e.propertyName === "height" && anpassaPadding(false));

// ── Start ────────────────────────────────────────────────────────────────────
byggPanel();
anpassaPadding(smal.matches && !hash.has("v"));
if (hash.has("v")) {
  const [z, lat, lng] = hash.get("v").split("/").map(Number);
  if ([z, lat, lng].every(Number.isFinite)) map.jumpTo({ zoom: z, center: [lng, lat] });
}
ordning.filter((id) => tanda.has(id)).forEach((id) => laggTill(perId[id]));
// den kompakta källraden startar utfälld i MapLibre; fäll ihop den
document.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show");
document.documentElement.classList.add("ka-redo");
