const API_BASE = localStorage.getItem("sme_api_base") || location.origin;
let token = localStorage.getItem("sme_token") || "";
let businesses = [];
let activeBusinessId = "";
let payrollPeriods = [];
let staff = [];

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function setToken(nextToken) {
  token = nextToken || "";
  if (token) localStorage.setItem("sme_token", token);
  else localStorage.removeItem("sme_token");
}

function activeBusiness() {
  return businesses.find(b => b.id === activeBusinessId) || businesses[0];
}

async function refresh() {
  if (!token) {
    $("sessionStatus").textContent = "Signed out";
    $("workspace").classList.add("hidden");
    return;
  }
  const me = await api("/api/me");
  businesses = me.businesses || [];
  activeBusinessId ||= businesses[0]?.id || "";
  $("sessionStatus").textContent = `Signed in as ${me.user.email}`;
  $("workspace").classList.toggle("hidden", !businesses.length);
  renderBusiness();
  if (businesses.length) await loadWorkspace();
}

function renderBusiness() {
  $("businessSelect").innerHTML = businesses.map(b => `<option value="${b.id}" ${b.id === activeBusinessId ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("");
  const b = activeBusiness();
  if (!b) return;
  $("businessName").textContent = b.name;
  $("businessMeta").textContent = `Role: ${b.role} | Subscription: ${b.subscription_status || "trial"} | Plan: ${planLabel(b.plan)}`;
}

async function loadWorkspace() {
  const b = activeBusiness();
  payrollPeriods = (await api(`/api/businesses/${b.id}/payroll-periods`)).payrollPeriods || [];
  staff = (await api(`/api/businesses/${b.id}/staff`)).staff || [];
  renderPayrolls();
  renderStaff();
  renderSelectors();
  await renderInvites();
}

function renderPayrolls() {
  $("payrollPeriods").innerHTML = payrollPeriods.length ? payrollPeriods.map(p => `
    <div class="item"><strong>${escapeHtml(p.label)}</strong><span>${p.start_date} to PPE ${p.ppe_date} | ${p.status}</span></div>
  `).join("") : `<p class="small">No PPE periods yet. Create one from the Calendar tab.</p>`;
}

function renderStaff() {
  $("staffList").innerHTML = staff.length ? staff.map(s => `
    <div class="item"><strong>${escapeHtml(s.name)}</strong><span>${escapeHtml(s.position || "No position")} | ${escapeHtml(s.department || "No department")} | Rate ${Number(s.hourly_rate || 0).toFixed(2)}</span></div>
  `).join("") : `<p class="small">No staff added yet.</p>`;
}

function renderSelectors() {
  $("timePeriodSelect").innerHTML = payrollPeriods.map(p => `<option value="${p.id}">${escapeHtml(p.label)}</option>`).join("");
  $("timeStaffSelect").innerHTML = staff.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
}

async function renderInvites() {
  const b = activeBusiness();
  if (!b) return;
  try {
    const rows = (await api(`/api/businesses/${b.id}/invitations`)).invitations || [];
    $("inviteList").innerHTML = rows.map(i => `<div class="item"><strong>${escapeHtml(i.invited_email)}</strong><span>${i.role} | ${i.status}</span></div>`).join("");
  } catch {
    $("inviteList").innerHTML = `<p class="small">Only owners/admins can view invitations.</p>`;
  }
}

document.querySelectorAll("[data-tab]").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll("[data-tab]").forEach(b => b.classList.toggle("active", b === btn));
    ["calendar", "staff", "time", "invites"].forEach(name => $(`${name}Tab`).classList.toggle("hidden", name !== btn.dataset.tab));
  };
});

$("signupForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  const data = await api("/api/auth/signup", { method: "POST", body: JSON.stringify(form) });
  setToken(data.token);
  await refresh();
};

$("signinForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  const data = await api("/api/auth/signin", { method: "POST", body: JSON.stringify(form) });
  setToken(data.token);
  await refresh();
};

$("signOutBtn").onclick = async () => {
  try { await api("/api/auth/signout", { method: "POST", body: "{}" }); } catch {}
  setToken("");
  await refresh();
};

$("businessSelect").onchange = async (event) => {
  activeBusinessId = event.target.value;
  renderBusiness();
  await loadWorkspace();
};

$("payrollForm").onsubmit = async (event) => {
  event.preventDefault();
  const b = activeBusiness();
  const form = Object.fromEntries(new FormData(event.target));
  await api(`/api/businesses/${b.id}/payroll-periods`, { method: "POST", body: JSON.stringify(form) });
  event.target.reset();
  await loadWorkspace();
};

$("staffForm").onsubmit = async (event) => {
  event.preventDefault();
  const b = activeBusiness();
  const form = Object.fromEntries(new FormData(event.target));
  await api(`/api/businesses/${b.id}/staff`, { method: "POST", body: JSON.stringify(form) });
  event.target.reset();
  await loadWorkspace();
};

$("saveTimeBtn").onclick = async () => {
  const periodId = $("timePeriodSelect").value;
  const entry = {
    staffId: $("timeStaffSelect").value,
    workDate: $("timeDate").value,
    hours: Number($("timeHours").value || 0),
    notes: ""
  };
  await api(`/api/payroll-periods/${periodId}/time-entries`, { method: "PUT", body: JSON.stringify({ entries: [entry] }) });
  $("timeEntries").innerHTML = `<div class="item"><strong>Saved</strong><span>${entry.workDate}: ${entry.hours} hours</span></div>`;
};

$("generatePayslipsBtn").onclick = async () => {
  const periodId = $("timePeriodSelect").value;
  const result = await api(`/api/payroll-periods/${periodId}/payslips`, { method: "POST", body: "{}" });
  $("timeEntries").innerHTML = `<div class="item"><strong>Payslips generated</strong><span>${result.generated} payslip records created or updated.</span></div>`;
};

$("inviteForm").onsubmit = async (event) => {
  event.preventDefault();
  const b = activeBusiness();
  const form = Object.fromEntries(new FormData(event.target));
  const result = await api(`/api/businesses/${b.id}/invitations`, { method: "POST", body: JSON.stringify(form) });
  $("inviteResult").textContent = `Invite link: ${result.inviteLink}`;
  await renderInvites();
};

$("acceptInviteForm").onsubmit = async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.target));
  await api("/api/invitations/accept", { method: "POST", body: JSON.stringify(form) });
  await refresh();
};

function planLabel(plan) {
  return ({
    single_monthly: "$10 single monthly",
    single_yearly: "$100 single yearly",
    multi_monthly: "$20 multi-user monthly",
    multi_yearly: "$200 multi-user yearly"
  })[plan] || "Trial";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[ch]));
}

const inviteToken = new URL(location.href).searchParams.get("invite");
if (inviteToken) {
  $("acceptInviteForm").token.value = inviteToken;
}

refresh().catch(error => {
  $("sessionStatus").textContent = error.message;
});
