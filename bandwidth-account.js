(function () {
  "use strict";
  const form = document.getElementById("bandwidthSubmissionForm");
  if (!form) return;
  const status = document.getElementById("bandwidthSubmissionStatus");
  const body = document.getElementById("bandwidthRecordsBody");
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const apiBase = () => {
    if (window.DataXNative && window.DataXNative.getApiBaseUrl) return String(window.DataXNative.getApiBaseUrl() || "").replace(/\/$/, "");
    return String(localStorage.getItem("datax-api-base-url") || "").replace(/\/$/, "");
  };
  async function request(path, options) {
    const base = apiBase() || window.location.origin;
    const response = await fetch(base + path, Object.assign({ credentials: "include", headers: { "content-type": "application/json" } }, options || {}));
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  }
  function dateLabel(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : "—";
  }
  // datetime-local values carry no zone; convert from the member's local time to UTC ISO so the
  // server does not misread them as UTC.
  function toIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  function statusPill(value) {
    const raw = String(value || "pending").toLowerCase();
    const css = raw === "verified" ? "verified" : raw === "rejected" ? "rejected" : "pending";
    return '<span class="status ' + css + '">' + escapeHtml(raw).toUpperCase() + "</span>";
  }
  async function load() {
    try {
      const result = await request("/api/bandwidth/events", { method: "GET", headers: {} });
      const events = result.events || [];
      body.innerHTML = events.map(event => '<tr><td class="ref">' + escapeHtml(String(event.id).slice(0, 8)) + '</td><td>' + dateLabel(event.created_at) + '</td><td>' + escapeHtml(String(event.source_type).replaceAll("_", " ")) + '</td><td>' + Number(event.bytes_up).toLocaleString() + ' B</td><td>' + Number(event.bytes_down).toLocaleString() + ' B</td><td>' + statusPill(event.verification_status) + '</td></tr>').join("") || '<tr><td colspan="6" class="empty-state">No submitted records yet.</td></tr>';
      status.textContent = events.length + " server record(s) loaded. Pending records do not earn DTX.";
      return true;
    } catch (error) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">Sign in to view your submitted records.</td></tr>';
      status.textContent = error.message;
      return false;
    }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!document.getElementById("bandwidthConsent").checked) {
      status.textContent = "Confirm that you are authorised to submit this record.";
      return;
    }
    const payload = {
      sourceType: document.getElementById("bandwidthSourceType").value,
      sourceReference: document.getElementById("bandwidthSourceReference").value.trim(),
      bytesUp: document.getElementById("bandwidthBytesUp").value,
      bytesDown: document.getElementById("bandwidthBytesDown").value,
      sessionStartedAt: toIso(document.getElementById("bandwidthStartedAt").value),
      sessionEndedAt: toIso(document.getElementById("bandwidthEndedAt").value),
      idempotencyKey: "DXB-" + crypto.randomUUID()
    };
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = "Submitting record securely…";
    try {
      const result = await request("/api/bandwidth/events", { method: "POST", body: JSON.stringify(payload) });
      status.textContent = result.event.message;
      form.reset();
      await load();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  const refresh = document.getElementById("refreshBandwidthRecords");
  if (refresh) refresh.addEventListener("click", load);
  window.addEventListener("datax:account", event => {
    if (!event.detail) {
      body.innerHTML = '<tr><td colspan="6" class="empty-state">Sign in to load your records.</td></tr>';
      status.textContent = "";
    }
  });
  window.DataXBandwidth = { load };
})();
