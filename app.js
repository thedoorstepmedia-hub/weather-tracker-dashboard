const RISK_COLORS = {
  none: "#6b7280",
  low: "#0f7a3d",
  moderate: "#a56a00",
  high: "#b64a0f",
  extreme: "#b91c2c",
};

const RISK_ORDER = ["none", "low", "moderate", "high", "extreme"];
const ACTION_LEVEL_ORDER = ["monitor", "prepare", "act_now"];

const CAR_ICON = '<svg class="pressure-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM3 17V9l2-5h10l4 5h2v8"/></svg>';
const HOUSE_ICON = '<svg class="pressure-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8M5 10v10h14V10"/></svg>';

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function riskClass(bucket) {
  return bucket.toLowerCase();
}

function formatTimestamp(iso) {
  const date = new Date(iso);
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function heroSummary(latest) {
  if (latest.total_active_alerts === 0) {
    return "No active severe weather warnings across Canada right now.";
  }
  const top = latest.provinces[0];
  const plural = latest.total_active_alerts === 1 ? "warning" : "warnings";
  return `${latest.total_active_alerts} active ${plural} across ${latest.provinces.length} region(s). ${escapeHtml(top.province)} is under the most pressure.`;
}

function topRecommendation(latest) {
  if (latest.alerts.length === 0) return null;
  return latest.alerts.reduce((best, alert) =>
    ACTION_LEVEL_ORDER.indexOf(alert.recommendation.level) > ACTION_LEVEL_ORDER.indexOf(best.recommendation.level) ? alert : best
  ).recommendation;
}

function renderHero(latest) {
  document.getElementById("national-bucket").textContent = latest.national_risk_bucket;

  let summary = heroSummary(latest);
  if (latest.national_record.available && latest.national_record.is_record) {
    summary += " This is the highest national risk score recorded since tracking began.";
  }
  document.getElementById("hero-summary").textContent = summary;
  document.getElementById("hero").style.borderTopColor = "var(--risk-" + riskClass(latest.national_risk_bucket) + ")";

  const rec = topRecommendation(latest);
  const actionBox = document.getElementById("hero-action");
  if (rec) {
    actionBox.hidden = false;
    document.getElementById("hero-action-headline").textContent = rec.headline;
    document.getElementById("hero-playbook").innerHTML = rec.playbook.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  } else {
    actionBox.hidden = true;
  }

  document.getElementById("kpi-total-alerts").textContent = latest.total_active_alerts;
  document.getElementById("kpi-provinces").textContent = latest.provinces.length;
  document.getElementById("kpi-top-province").textContent =
    latest.provinces.length > 0 ? latest.provinces[0].province : "None";
}

function renderMapLegend() {
  const legend = document.getElementById("map-legend");
  legend.innerHTML = RISK_ORDER.map(
    (bucket) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${RISK_COLORS[bucket]}"></span>${bucket[0].toUpperCase() + bucket.slice(1)}</span>`
  ).join("");
}

function pressureRowHtml(icon, label, value, className) {
  const pct = Math.max(0, Math.min(100, value));
  return `
    <div class="pressure-metric">
      ${icon}
      <div class="pressure-bar-track"><div class="pressure-bar-fill ${className}" style="width:${pct}%"></div></div>
      <span class="pressure-value">${Math.round(pct)}</span>
    </div>
  `;
}

function phaseShort(t) {
  if (t.phase === "rising") return `rising, peak ~${Math.round(t.hours_to_peak)}h`;
  if (t.phase === "near_peak") return "near peak";
  return "declining";
}

function contextText(alert) {
  const parts = [];
  const pct = alert.context.percentile;
  if (pct.available) {
    parts.push(`More severe than ${pct.percentile}% of past ${alert.alert_name_en} events tracked here`);
  }
  const similar = alert.context.similar_past_events;
  if (similar.length > 0) {
    const durations = similar.map((e) => (e.duration_hours != null ? `${e.duration_hours}h` : "?")).join(", ");
    parts.push(`${similar.length} similar past event(s) in this region, lasting ${durations}`);
  }
  if (parts.length === 0) return "";
  return `<div class="alert-detail-context">${parts.map(escapeHtml).join(" &middot; ")}</div>`;
}

function alertDetailHtml(alert) {
  return `
    <li class="alert-detail-item">
      <div class="alert-detail-name">${escapeHtml(alert.alert_name_en)} &mdash; ${escapeHtml(alert.feature_name_en)}</div>
      <div class="alert-detail-timeline">${escapeHtml(alert.recommendation.headline)}</div>
      <div class="alert-detail-timeline">Auto: ${phaseShort(alert.timeline.auto)} &middot; Property: ${phaseShort(alert.timeline.property)}</div>
      ${contextText(alert)}
    </li>
  `;
}

function renderProvinceGrid(latest) {
  const grid = document.getElementById("province-grid");
  grid.innerHTML = "";

  if (latest.provinces.length === 0) {
    grid.innerHTML = '<div class="empty-state">No active severe weather warnings across Canada right now.</div>';
    return;
  }

  const alertsByProvince = {};
  for (const alert of latest.alerts) {
    (alertsByProvince[alert.province] = alertsByProvince[alert.province] || []).push(alert);
  }

  for (const province of latest.provinces) {
    const card = document.createElement("div");
    card.className = "province-card";
    const alerts = alertsByProvince[province.province] || [];
    const detailItems = alerts.map(alertDetailHtml).join("");
    const compoundBadge = province.is_compound
      ? '<span class="compound-badge" title="Multiple concurrent peril types - historically more damaging than one alone">Compound</span>'
      : "";

    card.innerHTML = `
      <div class="province-card-head">
        <span class="province-name">${escapeHtml(province.province)}</span>
        <div class="badge-row">
          ${compoundBadge}
          <span class="risk-badge ${riskClass(province.risk_bucket)}">${escapeHtml(province.risk_bucket)}</span>
        </div>
      </div>
      <div class="pressure-row">
        ${pressureRowHtml(CAR_ICON, "Auto", province.auto_pressure_index, "auto")}
        ${pressureRowHtml(HOUSE_ICON, "Property", province.property_pressure_index, "property")}
      </div>
      <details>
        <summary>${province.active_alert_count} active warning(s) &mdash; details</summary>
        <ul class="alert-detail-list">${detailItems}</ul>
      </details>
    `;
    grid.appendChild(card);
  }
}

function renderAdvanceOutlook(latest) {
  const container = document.getElementById("advance-outlook-list");
  if (latest.advance_outlook.length === 0) {
    container.innerHTML = '<div class="empty-state">No active watches right now.</div>';
    return;
  }
  container.innerHTML = latest.advance_outlook
    .map(
      (w) => `
        <div class="outlook-item">
          <div class="outlook-item-name">${escapeHtml(w.alert_name_en)} &mdash; ${escapeHtml(w.feature_name_en)}, ${escapeHtml(w.province)}</div>
          <div class="outlook-item-meta">Issued ${formatTimestamp(w.publication_datetime)}</div>
        </div>
      `
    )
    .join("");
}

function renderRecentEvents(recentEvents, trackingSince) {
  const hint = document.getElementById("tracking-since-hint");
  hint.textContent = trackingSince
    ? `Tracking since ${formatTimestamp(trackingSince)} - history and context below grow more meaningful as this accumulates.`
    : "No completed events logged yet.";

  const container = document.getElementById("recent-events-list");
  if (recentEvents.length === 0) {
    container.innerHTML = '<div class="empty-state">No completed events logged yet.</div>';
    return;
  }
  container.innerHTML = recentEvents
    .slice(0, 15)
    .map((e) => {
      const start = new Date(e.first_seen);
      const end = new Date(e.ended_at);
      const durationHours = Math.max(0, Math.round((end - start) / 3600000));
      return `
        <div class="event-item">
          <div class="event-item-name">${escapeHtml(e.alert_name_en)} &mdash; ${escapeHtml(e.feature_name_en)}, ${escapeHtml(e.province)}</div>
          <div class="event-item-meta">${formatTimestamp(e.first_seen)} &middot; lasted ~${durationHours}h</div>
        </div>
      `;
    })
    .join("");
}

function renderMap(latest) {
  const map = L.map("alerts-map", { scrollWheelZoom: false }).setView([56, -96], 3);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 12,
  }).addTo(map);

  const layers = [];
  for (const alert of latest.alerts) {
    const color = RISK_COLORS[riskClass(alert.risk_bucket)] || RISK_COLORS.none;
    const layer = L.geoJSON(alert.geometry, {
      style: { color, weight: 1, fillColor: color, fillOpacity: 0.45 },
    });
    layer.bindPopup(
      `<strong>${escapeHtml(alert.alert_name_en)}</strong><br>${escapeHtml(alert.feature_name_en)}, ${escapeHtml(alert.province)}<br>Risk: ${escapeHtml(alert.risk_bucket)}`
    );
    layer.on("click", () => map.fitBounds(layer.getBounds(), { maxZoom: 9 }));
    layer.addTo(map);
    layers.push(layer);
  }

  if (layers.length > 0) {
    const group = L.featureGroup(layers);
    map.fitBounds(group.getBounds().pad(0.2));
  }

  // Guards against any container-size race (e.g. stylesheet still applying
  // when Leaflet first measures its container).
  setTimeout(() => map.invalidateSize(), 200);
}

function renderTrendChart(history) {
  const labels = history.map((point) => formatTimestamp(point.timestamp));
  const scores = history.map((point) => point.national_risk_score);

  new Chart(document.getElementById("trend-chart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "National risk score",
          data: scores,
          borderColor: "#378ADD",
          backgroundColor: "rgba(55, 138, 221, 0.1)",
          borderWidth: 2,
          fill: true,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 10, ticks: { stepSize: 2 } },
        x: { ticks: { maxTicksLimit: 6 } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

async function loadDashboard() {
  const [latestRes, historyRes, recentEventsRes] = await Promise.all([
    fetch("data/latest.json", { cache: "no-store" }),
    fetch("data/history.json", { cache: "no-store" }),
    fetch("data/recent_events.json", { cache: "no-store" }),
  ]);
  const latest = await latestRes.json();
  const history = await historyRes.json();
  const recentEvents = await recentEventsRes.json();

  document.getElementById("updated-at").innerHTML =
    '<span class="live-dot" aria-hidden="true"></span>Updated ' + formatTimestamp(latest.generated_at);

  renderHero(latest);
  renderMapLegend();
  renderAdvanceOutlook(latest);
  renderMap(latest);
  renderProvinceGrid(latest);
  renderTrendChart(history);
  renderRecentEvents(recentEvents, latest.tracking_since);
}

loadDashboard().catch((err) => {
  document.getElementById("updated-at").textContent = "Failed to load data: " + err.message;
});
