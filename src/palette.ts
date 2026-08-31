import "./palette.css";

const variants = [
  ["#E7C34C", "#87B967", "#5E9FC7", "#D86C61", "#E4993A", "#A19C91", "#D66A85"],
  ["#F0B429", "#78A641", "#3E8FB0", "#C6534C", "#D97A2B", "#8C8B86", "#C95376"],
  ["#E6D13E", "#78B797", "#4F87C7", "#D96472", "#E59046", "#9A9A9A", "#CF6D9C"],
  ["#D9B64A", "#5C9B76", "#4E91A6", "#C8664A", "#C98A38", "#8C867D", "#BA627D"],
  ["#E3C55B", "#93B85A", "#6A8FD1", "#CF6B62", "#D89A43", "#A49E92", "#CF778D"],
  ["#F2C94C", "#58A66F", "#4B9CCC", "#E05D50", "#F09A34", "#99948B", "#D95479"],
  ["#D4B83F", "#72A467", "#5684B8", "#BC5D57", "#D27C37", "#8B8B84", "#BE5E83"],
  ["#E1BD4A", "#76B58B", "#538BB3", "#D47658", "#D99039", "#A6A197", "#C66B91"],
  ["#E9C65A", "#8EB26A", "#527FC3", "#CE5B66", "#E58B39", "#999991", "#D16C96"],
  ["#DDB94E", "#6FAA71", "#4E9AB2", "#D05F55", "#D78B42", "#918C82", "#CC6683"],
];
const days = ["MO", "DI", "MI", "DO", "FR", "SA", "SO"];

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <section class="sheet">
    <header><div><p>WOCHENWERK</p><h1>7-day colour directions</h1><span>dark ground · bold, calm, readable</span></div><button type="button" aria-pressed="true">Kräftig</button></header>
    <div class="variants">${variants.map((palette, index) => `<article><b>${String(index + 1).padStart(2, "0")}</b><div class="swatches">${palette.map((color, day) => `<div style="--swatch:${color}"><span>${days[day]}</span><i>${color}</i></div>`).join("")}</div></article>`).join("")}</div>
  </section>`;
const button = app.querySelector<HTMLButtonElement>("button")!;
button.addEventListener("click", () => { const muted = app.classList.toggle("muted"); button.textContent = muted ? "Gemutet" : "Kräftig"; button.setAttribute("aria-pressed", String(!muted)); });
