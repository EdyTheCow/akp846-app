import { refs } from "../../core/dom.js";

export function mount(card, { settings, general, fmt }) {
  card.classList.add("clock");
  card.setAttribute("aria-label", `Time in ${general.placeName}`);
  card.innerHTML = `
    <div class="head"><span data-ref="date"></span></div>
    <div class="hero"><span class="hm" data-ref="hm">--:--</span><span class="sec" data-ref="sec">--</span></div>
    <div class="detail" data-ref="week"></div>`;
  const r = refs(card);
  if (!settings.showSeconds) r.sec.remove();

  let timer = 0;
  function tick() {
    const now = Date.now();
    r.hm.textContent = fmt.hm(now);
    if (settings.showSeconds) r.sec.textContent = fmt.seconds(now);
    r.date.textContent = fmt.date(now);
    r.week.textContent = settings.showWeek ? `Week ${fmt.isoWeek(now)}` : "";
    // Without seconds, only wake for the minute
    const step = settings.showSeconds ? 1000 : 60000;
    timer = setTimeout(tick, step - (Date.now() % step) + 5);
  }
  tick();

  return { destroy: () => clearTimeout(timer) };
}
