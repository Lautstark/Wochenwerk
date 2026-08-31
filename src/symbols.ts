import "./symbols.css";

const root = "/metacom-local/";
const symbols = ["Berufe/kindergaertnerin.png", "Spielen/spielplatz.png", "Therapie/sprachtherapielogopaedie.png", "Lebensmittel_Essen/abendessen.png"];
const treatments = [["Original", "original"], ["Druck", "ink"], ["Negativ", "negative"], ["Sanft", "soft"], ["Transparent", "multiply"]] as const;

document.querySelector<HTMLElement>("#app")!.innerHTML = `<section class="sheet"><header><p>WOCHENWERK</p><h1>METACOM symbol treatments</h1><span>same symbols · different visual treatment</span></header><div class="grid">${treatments.map(([name, style]) => `<article><h2>${name}</h2><div class="samples ${style}">${symbols.map(symbol => `<div><img src="${root}${symbol}" alt="" /></div>`).join("")}</div></article>`).join("")}</div></section>`;
