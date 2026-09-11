"use strict";

const REFRESH_INTERVAL_MS = 30000;
const RING_RADIUS = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const TYPE_LABELS = {
  A: "A permit",
  B: "B permit",
  V: "Visitor",
  S: "S permit",
  EV: "Electric vehicle",
  Accessible: "Accessible",
  PV: "PV permit",
  SR: "SR permit",
  M: "M permit",
  "2P Carpool": "2-person carpool",
};

const TYPE_ICONS = {
  V: "🚗",
  EV: "⚡",
  Accessible: "♿",
  "2P Carpool": "👥",
};

const state = {
  data: [],
  rawData: null,
  neighborhoods: [],
  selectedNeighborhood: "all",
  search: "",
  sort: "availability",
  lastUpdated: null,
  error: null,
  loading: false,
};

let fetchTimer = null;
let countdownTimer = null;
let nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;

const elements = {
  grid: document.getElementById("grid"),
  emptyState: document.getElementById("emptyState"),
  liveBadge: document.getElementById("liveBadge"),
  liveText: document.getElementById("liveText"),
  lastUpdated: document.getElementById("lastUpdated"),
  refreshButton: document.getElementById("refreshButton"),
  rawToggle: document.getElementById("rawToggle"),
  rawSection: document.getElementById("rawSection"),
  rawJson: document.getElementById("rawJson"),
  errorBanner: document.getElementById("errorBanner"),
  errorMessage: document.getElementById("errorMessage"),
  retryButton: document.getElementById("retryButton"),
  searchInput: document.getElementById("searchInput"),
  chips: document.getElementById("neighborhoodChips"),
  sortSelect: document.getElementById("sortSelect"),
  statStructures: document.getElementById("statStructures"),
  statOpen: document.getElementById("statOpen"),
  statTotal: document.getElementById("statTotal"),
  statPercent: document.getElementById("statPercent"),
  ringValue: document.getElementById("ringValue"),
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function formatNumber(value) {
  return Number(value).toLocaleString();
}

function availabilityLevel(pct) {
  if (pct > 0.4) return "green";
  if (pct > 0.15) return "amber";
  return "red";
}

function statusLabel(pct) {
  if (pct > 0.4) return "Available";
  if (pct > 0.15) return "Filling up";
  if (pct > 0) return "Nearly full";
  return "Full";
}

function normalizeStructure(entry) {
  const availability = Object.entries(entry.Availability || {})
    .map(([type, counts]) => ({
      type,
      open: Number(counts && counts.Open) || 0,
      total: Number(counts && counts.Total) || 0,
    }))
    .filter(({ open, total }) => open > 0 || total > 0)
    .sort((a, b) => b.total - a.total);

  const open = availability.reduce((sum, item) => sum + item.open, 0);
  const total = availability.reduce((sum, item) => sum + item.total, 0);

  return {
    id: String(entry.LocationId ?? entry.LocationName ?? Math.random()),
    name: entry.LocationName || entry.LocationId || "Unknown",
    context: entry.LocationContext || "",
    provider: entry.LocationProvider || "",
    neighborhood: entry.neighborhood || entry.LocationContext || "Other",
    isStructure: Boolean(entry.isStructure),
    availability,
    open,
    total,
    pct: total > 0 ? open / total : 0,
  };
}

function barHtml(pct, level, open, total, big) {
  const width = Math.min(100, Math.max(0, pct * 100)).toFixed(1);
  return `
    <div class="bar${big ? " big" : ""}" role="progressbar" aria-valuenow="${open}"
         aria-valuemin="0" aria-valuemax="${total}" aria-label="${open} of ${total} spaces open">
      <div class="bar-fill ${level}" style="width: ${width}%"></div>
    </div>`;
}

function typeBadge(type) {
  const icon = TYPE_ICONS[type] || "";
  const label = TYPE_LABELS[type] || type;
  return `<span class="type-badge" title="${escapeHtml(label)}">${icon ? icon + " " : ""}${escapeHtml(type)}</span>`;
}

function cardHtml(structure) {
  const level = availabilityLevel(structure.pct);
  const subtitleParts = [structure.context, structure.provider].filter(Boolean);
  const typeRows = structure.availability
    .map(({ type, open, total }) => {
      const pct = total > 0 ? open / total : 0;
      return `
        <li class="type-row">
          ${typeBadge(type)}
          ${barHtml(pct, availabilityLevel(pct), open, total, false)}
          <span class="type-count"><strong>${formatNumber(open)}</strong> / ${formatNumber(total)}</span>
        </li>`;
    })
    .join("");

  return `
    <article class="card">
      <header class="card-head">
        <div>
          <h3 class="card-title">${escapeHtml(structure.name)}</h3>
          <p class="card-sub">${escapeHtml(subtitleParts.join(" · "))}</p>
        </div>
        <span class="status-pill ${level}">${statusLabel(structure.pct)}</span>
      </header>
      <div class="card-total">
        ${barHtml(structure.pct, level, structure.open, structure.total, true)}
        <p class="card-total-text">
          <strong>${formatNumber(structure.open)}</strong> open of
          <strong>${formatNumber(structure.total)}</strong> · ${(structure.pct * 100).toFixed(0)}%
        </p>
      </div>
      ${structure.availability.length ? `<ul class="types">${typeRows}</ul>` : ""}
    </article>`;
}

function getFiltered() {
  const search = state.search.trim().toLowerCase();
  return state.data
    .filter((structure) => {
      const matchesNeighborhood =
        state.selectedNeighborhood === "all" ||
        structure.neighborhood === state.selectedNeighborhood;
      if (!matchesNeighborhood) return false;
      if (!search) return true;
      return [structure.name, structure.context, structure.neighborhood, structure.provider]
        .some((field) => field.toLowerCase().includes(search));
    })
    .sort((a, b) => {
      if (state.sort === "open") return b.open - a.open;
      if (state.sort === "name") return a.name.localeCompare(b.name);
      return b.pct - a.pct;
    });
}

function renderSummary() {
  const totalOpen = state.data.reduce((sum, s) => sum + s.open, 0);
  const totalSpaces = state.data.reduce((sum, s) => sum + s.total, 0);
  const pct = totalSpaces > 0 ? totalOpen / totalSpaces : 0;

  elements.statStructures.textContent = formatNumber(state.data.length);
  elements.statOpen.textContent = formatNumber(totalOpen);
  elements.statTotal.textContent = formatNumber(totalSpaces);
  elements.statPercent.textContent = `${(pct * 100).toFixed(0)}%`;

  elements.ringValue.style.strokeDasharray = RING_CIRCUMFERENCE;
  elements.ringValue.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - pct);
  elements.ringValue.style.stroke = `var(--${availabilityLevel(pct)})`;
}

function renderChips() {
  const counts = new Map();
  state.data.forEach((structure) => {
    counts.set(structure.neighborhood, (counts.get(structure.neighborhood) || 0) + 1);
  });

  const neighborhoods = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!neighborhoods.some(([name]) => name === state.selectedNeighborhood)) {
    state.selectedNeighborhood = "all";
  }

  const chip = (key, label) => `
    <button class="chip${state.selectedNeighborhood === key ? " active" : ""}"
            type="button" data-neighborhood="${escapeHtml(key)}">${escapeHtml(label)}</button>`;

  elements.chips.innerHTML = [
    chip("all", `All (${state.data.length})`),
    ...neighborhoods.map(([name, count]) => chip(name, `${name} (${count})`)),
  ].join("");
}

function renderGrid() {
  const filtered = getFiltered();
  elements.grid.innerHTML = filtered.map(cardHtml).join("");
  elements.emptyState.hidden = filtered.length > 0;
}

function renderRaw() {
  if (state.rawData === null) {
    elements.rawJson.textContent = "";
    return;
  }
  const json = JSON.stringify(state.rawData, null, 2);
  elements.rawJson.innerHTML = highlightJson(json);
}

function highlightJson(json) {
  return escapeHtml(json).replace(
    /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cssClass = "json-number";
      if (match.startsWith("&quot;") || match.startsWith('"')) {
        cssClass = /:$/.test(match) ? "json-key" : "json-string";
      } else if (/^(true|false)$/.test(match)) {
        cssClass = "json-boolean";
      } else if (match === "null") {
        cssClass = "json-null";
      }
      return `<span class="${cssClass}">${match}</span>`;
    }
  );
}

function renderAll() {
  renderSummary();
  renderChips();
  renderGrid();
  renderRaw();
}

function renderSkeletons() {
  elements.grid.innerHTML = Array.from({ length: 6 }, () => '<div class="skeleton-card"></div>').join("");
  elements.emptyState.hidden = true;
}

function renderError() {
  elements.errorBanner.hidden = !state.error;
  if (state.error) {
    elements.errorMessage.textContent = state.error;
    elements.liveBadge.classList.add("error");
    elements.liveText.textContent = "Error";
  }
}

function scheduleRefresh() {
  clearTimeout(fetchTimer);
  nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
  fetchTimer = setTimeout(() => {
    fetchStatus();
  }, REFRESH_INTERVAL_MS);
}

function startCountdown() {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (state.error) return;
    if (document.hidden) {
      elements.liveText.textContent = "Paused";
      return;
    }
    const remaining = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
    elements.liveText.textContent = `Live · refreshes in ${remaining}s`;
  }, 1000);
}

async function fetchStatus() {
  if (state.loading) return;
  state.loading = true;
  state.error = null;
  elements.errorBanner.hidden = true;
  elements.liveBadge.classList.remove("error");
  elements.refreshButton.disabled = true;
  if (state.data.length === 0) renderSkeletons();

  try {
    const response = await fetch("/api/parking/status", {
      headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error((body && body.detail) || `HTTP ${response.status}`);
    }
    if (!Array.isArray(body)) {
      throw new Error("Unexpected response shape from the parking API.");
    }

    state.rawData = body;
    state.data = body.map(normalizeStructure);
    state.lastUpdated = new Date();
    state.error = null;

    elements.errorBanner.hidden = true;
    elements.liveBadge.classList.remove("error");
    elements.lastUpdated.textContent = `Updated ${state.lastUpdated.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })}`;
    renderAll();
  } catch (error) {
    console.error("Failed to load parking data:", error);
    state.error = error.message || "Unknown error.";
    renderError();
  } finally {
    state.loading = false;
    elements.refreshButton.disabled = false;
    scheduleRefresh();
    startCountdown();
  }
}

elements.refreshButton.addEventListener("click", () => {
  fetchStatus();
});

elements.retryButton.addEventListener("click", () => {
  fetchStatus();
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderGrid();
});

elements.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderGrid();
});

elements.chips.addEventListener("click", (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  state.selectedNeighborhood = chip.dataset.neighborhood;
  renderChips();
  renderGrid();
});

elements.rawToggle.addEventListener("click", () => {
  const expanded = elements.rawToggle.getAttribute("aria-expanded") === "true";
  elements.rawToggle.setAttribute("aria-expanded", String(!expanded));
  elements.rawSection.hidden = expanded;
  if (!expanded) {
    elements.rawSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(fetchTimer);
  } else if (Date.now() >= nextRefreshAt) {
    fetchStatus();
  } else {
    fetchTimer = setTimeout(fetchStatus, Math.max(0, nextRefreshAt - Date.now()));
  }
});

renderSkeletons();
fetchStatus();
