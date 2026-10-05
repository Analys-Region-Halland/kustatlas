// dokumentation.js: dokumentationssidan, byggd ur samma lager.json som kartans panel.

import { esc, legendHTML, kallrad, dokHTML } from "./dok.js";

const reg = await fetch("lager.json").then((r) => r.json());
const teman = reg.teman
  .map((t) => ({ ...t, lager: reg.lager.filter((l) => l.tema === t.id) }))
  .filter((t) => t.lager.length);

document.getElementById("kd-utgivare").textContent = `${reg.atlas.utgivare} · ${reg.atlas.titel}`;

document.getElementById("kd-toc").innerHTML = teman
  .map((t) => `<div><p class="kd-toc-tema">${esc(t.titel)}</p><ul>${t.lager
    .map((l) => `<li><a href="#${l.id}">${esc(l.titel)}</a></li>`).join("")}</ul></div>`)
  .join("");

document.getElementById("kd-innehall").innerHTML = teman
  .map((t) => `
  <section class="kd-tema">
    <h2>${esc(t.titel)}</h2>
    <p class="kd-tema-text">${esc(t.beskrivning)}</p>
    ${t.lager.map((l) => `
    <article class="kd-lager" id="${l.id}">
      <h3>${esc(l.titel)}</h3>
      <p class="kd-kort">${esc(l.kort)}</p>
      <div class="kd-rutnat">
        <div>${dokHTML(l)}</div>
        <aside class="kd-sida">
          ${legendHTML(l)}
          <p class="ka-kort-kalla">Källa: ${kallrad(l)}</p>
          <a class="kd-visa" href="./#l=${l.id}">Visa lagret i kartan →</a>
        </aside>
      </div>
    </article>`).join("")}
  </section>`)
  .join("");

document.getElementById("kd-fot").innerHTML =
  `<p>Byggd ${esc(reg.byggt)}. ${esc(reg.atlas.utgivare)}. Bakgrundskarta © OpenStreetMap-bidragsgivare, © CARTO.</p>`;

if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
