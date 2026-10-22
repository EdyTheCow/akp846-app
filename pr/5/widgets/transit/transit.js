// Live departures from Entur's journey planner (Ruter and the rest of Norway).
// A route's `fromId` is a whole stop place or one platform (quay); departures
// are kept only if the vehicle calls at `dest` after leaving.
import { lineIcon, make, onTap, refs } from "../../core/dom.js";
import { ICONS } from "../../core/icons.js";
import { fetchJSON } from "../../core/net.js";
import { store } from "../../core/store.js";

const ENTUR = "https://api.entur.io/journey-planner/v3/graphql";
const REFRESH_MS = 30 * 1000;
const RETRY_MS = 60 * 1000;

// Room for a long run of cancellations (a closed station cancels every call) without losing the trains that do run
const CALLS = `estimatedCalls(numberOfDepartures: 20, timeRange: 21600, whiteListedModes: $modes,
                              arrivalDeparture: departures, includeCancelledTrips: true) {
    aimedDepartureTime expectedDepartureTime realtime cancellation
    quay { id }
    situations { summary { value language } }
    serviceJourney {
      line { publicCode presentation { colour textColour } }
      estimatedCalls { quay { id stopPlace { id parent { id } } } aimedDepartureTime expectedArrivalTime }
    }
  }`;
const queryFor = (kind) => `query ($id: String!, $modes: [TransportMode]) { place: ${kind}(id: $id) { ${CALLS} } }`;

function parseDepartures(calls, route) {
  return calls.flatMap((c) => {
    const journey = c.serviceJourney.estimatedCalls;
    // Only stops after this departure count: a line can pass the destination earlier on its way
    const here = journey.findIndex((s) => s.quay?.id === c.quay?.id && s.aimedDepartureTime === c.aimedDepartureTime);
    const stop = journey.slice(here + 1).find(({ quay }) =>
      quay?.stopPlace && (quay.stopPlace.id === route.dest || quay.stopPlace.parent?.id === route.dest));
    if (!stop) return [];
    // The disruption message, e.g. "Sognsvann station is closed", in English when Entur has it
    const summary = c.situations?.[0]?.summary ?? [];
    const notice = (summary.find((s) => s.language === "en") ?? summary[0])?.value;
    return [{
      dep: Date.parse(c.expectedDepartureTime),
      aimed: Date.parse(c.aimedDepartureTime),
      arr: Date.parse(stop.expectedArrivalTime),
      realtime: c.realtime,
      cancelled: c.cancellation,
      notice,
      line: c.serviceJourney.line.publicCode,
      colour: c.serviceJourney.line.presentation?.colour,
      textColour: c.serviceJourney.line.presentation?.textColour,
    }];
  });
}

const minutesUntil = (t) => Math.floor((t - Date.now()) / 60000);

export function mount(card, { settings, fmt }) {
  card.classList.add("transit");
  card.setAttribute("aria-label", "Next departures");
  card.innerHTML = `
    <div class="head">
      <span class="line-badge" data-ref="badge"></span>
      <span data-ref="routeName"></span>
    </div>
    <div class="hero countdown" data-ref="countdown" hidden></div>
    <div class="detail" data-ref="meta">Loading departures…</div>
    <div class="chip-row"><span class="chip" data-ref="flag"></span></div>
    <div class="later" data-ref="laterBlock"><ol data-ref="later"></ol></div>`;
  const r = refs(card);
  const routes = settings.routes;
  const { hm } = fmt;

  let routeIndex = Math.min(Number(store.get("transit-route")) || 0, routes.length - 1);
  let departures = [];
  let transitOk = 0;
  let timer = 0;
  let alive = true;
  const cacheKey = () => `transit-${routes[routeIndex].fromId}-${routes[routeIndex].dest}`;

  function flag(dotClass, label) {
    const dot = dotClass ? [make("i", { className: `dot ${dotClass}` })] : [];
    r.flag.replaceChildren(...dot, label);
  }

  function render() {
    const route = routes[routeIndex];
    const now = Date.now();
    const upcoming = departures.filter((d) => d.dep > now - 20 * 1000);
    const next = upcoming.find((d) => !d.cancelled);
    const skipped = next ? upcoming.filter((d) => d.cancelled && d.dep < next.dep) : [];
    const later = next ? upcoming.filter((d) => d.dep > next.dep).slice(0, 3) : [];

    r.routeName.textContent = route.name;
    const first = next ?? upcoming[0];
    const colour = first?.colour ?? route.colour, textColour = first?.textColour ?? "FFFFFF";
    r.badge.textContent = first?.line ?? route.line;
    r.badge.hidden = !r.badge.textContent;
    if (/^[0-9a-f]{6}$/i.test(colour)) r.badge.style.background = `#${colour}`;
    if (/^[0-9a-f]{6}$/i.test(textColour)) r.badge.style.color = `#${textColour}`;

    const offline = transitOk && now - transitOk > 3 * 60 * 1000;
    // Every departure cancelled: say so, and why, across the whole card
    const allCancelled = !next && upcoming.length > 0;
    card.classList.toggle("disrupted", allCancelled);
    r.countdown.hidden = !next;
    r.laterBlock.hidden = !later.length;
    if (!next) {
      r.meta.textContent = allCancelled ? upcoming.find((d) => d.notice)?.notice ?? "No departures running"
        : transitOk ? "Nothing in the next 6 hours" : "Loading departures…";
      if (offline) flag("serious", `Offline since ${hm(transitOk)}`);
      else if (allCancelled) flag("critical", "All departures cancelled");
      else r.flag.replaceChildren();
    } else {
      const m = minutesUntil(next.dep);
      r.countdown.classList.toggle("far", m >= 60);
      if (m < 1) r.countdown.replaceChildren("Now");
      else if (m < 60) r.countdown.replaceChildren(String(m), make("small", { textContent: "min" }));
      else r.countdown.replaceChildren(hm(next.dep));
      // The header already names both stops, so departure -> arrival needs no labels
      r.meta.textContent = `${hm(next.dep)} → ${hm(next.arr)}`;

      const delay = Math.round((next.dep - next.aimed) / 60000);
      if (offline) flag("serious", `Offline since ${hm(transitOk)}`);
      else if (skipped.length > 2) flag("critical", `${skipped.length} earlier cancelled`);
      else if (skipped.length) flag("critical", `${skipped.map((d) => hm(d.aimed)).join(", ")} cancelled`);
      else if (delay >= 2) flag("serious", `${delay} min late`);
      else if (next.realtime) flag("good", "Live");
      else flag("", "Scheduled");
    }

    r.later.replaceChildren(...later.map((d) => {
      const m = minutesUntil(d.dep);
      const until = m < 60 ? `${Math.max(m, 0)} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
      const inCell = make("span", { className: "in", textContent: d.cancelled ? "Cancelled" : until });
      if (d.cancelled) inCell.prepend(make("i", { className: "dot critical" }));
      const li = make("li", { className: d.cancelled ? "cancelled" : "" });
      li.append(make("span", { className: "dep", textContent: hm(d.dep) }), inCell);
      return li;
    }));
  }

  async function refresh() {
    clearTimeout(timer);
    const index = routeIndex, route = routes[index];
    let next = REFRESH_MS;
    try {
      const json = await fetchJSON(ENTUR, {
        method: "POST",
        headers: { "Content-Type": "application/json", "ET-Client-Name": settings.clientName },
        body: JSON.stringify({ query: queryFor(route.fromKind), variables: { id: route.fromId, modes: [route.mode] } }),
      });
      if (json.errors?.length) throw new Error(json.errors[0].message);
      if (!alive || index !== routeIndex) return; // switched route while this was in flight
      if (!json.data.place) throw new Error(`Entur doesn't know ${route.fromId}`);
      departures = parseDepartures(json.data.place.estimatedCalls, route);
      transitOk = Date.now();
      store.setJSON(cacheKey(), { departures, transitOk });
    } catch (err) {
      if (!alive || index !== routeIndex) return;
      console.warn("Departures refresh failed:", err);
      next = RETRY_MS;
    }
    render();
    timer = setTimeout(refresh, next);
  }

  function loadRoute() {
    departures = [];
    transitOk = 0;
    const cached = store.getJSON(cacheKey());
    if (cached) ({ departures, transitOk } = cached);
    render();
    refresh();
  }

  // Several routes: a button for each at the top of the card, the one on show filled
  if (routes.length > 1) {
    const group = make("div", { className: "routes", role: "group" });
    group.setAttribute("aria-label", "Routes");
    const buttons = routes.map((route, i) => {
      const button = make("button", { type: "button", className: "route-btn" });
      button.setAttribute("aria-label", `${route.label || route.name}: ${route.name}`);
      button.append(lineIcon(ICONS[route.icon]), make("span", { textContent: route.label || route.name }));
      onTap(button, () => {
        if (i === routeIndex) return;
        routeIndex = i;
        store.set("transit-route", String(routeIndex));
        showChosen();
        loadRoute();
      });
      return button;
    });
    const showChosen = () => buttons.forEach((b, i) => {
      b.classList.toggle("on", i === routeIndex);
      b.setAttribute("aria-pressed", String(i === routeIndex));
    });
    showChosen();
    group.append(...buttons);
    card.append(group);
  }

  loadRoute();
  // Countdowns tick between fetches
  const ticker = setInterval(render, 5 * 1000);

  return {
    destroy() {
      alive = false;
      clearTimeout(timer);
      clearInterval(ticker);
    },
  };
}
