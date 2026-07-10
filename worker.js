const ROLE_RANK = {
  viewer: 1,
  payroll_officer: 2,
  admin: 3,
  owner: 4
};

const PLAN_LIMITS = {
  single_monthly: 1,
  single_yearly: 1,
  multi_monthly: 50,
  multi_yearly: 50
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }), env);
    const url = new URL(request.url);

    try {
      const route = `${request.method} ${url.pathname}`;
      if (route === "GET /api/health") return json({ ok: true, service: "SME Payroll API" }, 200, env);
      if (route === "POST /api/auth/signup") return signup(request, env);
      if (route === "POST /api/auth/signin") return signin(request, env);
      if (route === "POST /api/auth/signout") return signout(request, env);
      if (route === "GET /api/me") return me(request, env);
      if (route === "POST /api/invitations/accept") return acceptInvitation(request, env);
      if (route === "POST /api/paypal/webhook") return paypalWebhook(request, env);

      const user = await requireUser(request, env);
      const match = matchRoute(url.pathname);

      if (request.method === "GET" && url.pathname === "/api/businesses") return listBusinesses(user, env);

      if (match.businessId && match.rest === "/invitations") {
        if (request.method === "GET") return listInvitations(user, env, match.businessId);
        if (request.method === "POST") return createInvitation(request, user, env, match.businessId);
      }

      if (match.businessId && match.rest === "/subscription" && request.method === "GET") {
        await requireMembership(user.id, match.businessId, env, "viewer");
        const subscription = await getSubscription(env, match.businessId);
        return json({ subscription }, 200, env);
      }

      if (match.businessId && match.rest === "/snapshot") {
        if (request.method === "GET") return getPayrollSnapshot(user, env, match.businessId);
        if (request.method === "PUT") return savePayrollSnapshot(request, user, env, match.businessId);
      }

      if (match.businessId && match.rest === "/payroll-periods") {
        if (request.method === "GET") return listPayrollPeriods(user, env, match.businessId);
        if (request.method === "POST") return createPayrollPeriod(request, user, env, match.businessId);
      }

      if (match.businessId && match.rest === "/staff") {
        if (request.method === "GET") return listStaff(user, env, match.businessId);
        if (request.method === "POST") return createStaff(request, user, env, match.businessId);
      }

      if (match.periodId && match.rest === "/time-entries") {
        if (request.method === "GET") return listTimeEntries(user, env, match.periodId);
        if (request.method === "PUT") return upsertTimeEntries(request, user, env, match.periodId);
      }

      if (match.periodId && match.rest === "/payslips") {
        if (request.method === "GET") return listPayslips(user, env, match.periodId);
        if (request.method === "POST") return generatePayslips(user, env, match.periodId);
      }

      if (match.staffId && match.rest === "" && request.method === "PATCH") return updateStaff(request, user, env, match.staffId);
      if (match.periodId && match.rest === "" && request.method === "PATCH") return updatePayrollPeriod(request, user, env, match.periodId);

      return json({ error: "Not found" }, 404, env);
    } catch (error) {
      const status = error.status || 500;
      return json({ error: error.message || "Server error" }, status, env);
    }
  }
};

function matchRoute(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") return {};
  if (parts[1] === "businesses" && parts[2]) return { businessId: parts[2], rest: parts.length > 3 ? "/" + parts.slice(3).join("/") : "" };
  if (parts[1] === "payroll-periods" && parts[2]) return { periodId: parts[2], rest: parts.length > 3 ? "/" + parts.slice(3).join("/") : "" };
  if (parts[1] === "staff" && parts[2]) return { staffId: parts[2], rest: parts.length > 3 ? "/" + parts.slice(3).join("/") : "" };
  return {};
}

async function signup(request, env) {
  const body = await readJson(request);
  const email = cleanEmail(body.email);
  assert(body.name, "Name is required");
  assert(email, "Email is required");
  assert(body.password && body.password.length >= 8, "Password must be at least 8 characters");
  assert(body.businessName, "Business name is required");
  const plan = validPlan(body.plan || "single_monthly");
  const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (exists) throw httpError(409, "This email is already registered");

  const now = new Date();
  const trialEnds = new Date(now);
  trialEnds.setDate(trialEnds.getDate() + 30);
  const userId = id("usr");
  const businessId = id("bus");
  const membershipId = id("mem");
  const subscriptionId = id("sub");
  const passwordHash = await hashPassword(body.password);

  await env.DB.batch([
    env.DB.prepare("INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)").bind(userId, email, body.name.trim(), passwordHash),
    env.DB.prepare("INSERT INTO businesses (id, name, phone, email, address) VALUES (?, ?, ?, ?, ?)").bind(businessId, body.businessName.trim(), body.businessPhone || "", body.businessEmail || "", body.businessAddress || ""),
    env.DB.prepare("INSERT INTO memberships (id, business_id, user_id, role, status) VALUES (?, ?, ?, 'owner', 'active')").bind(membershipId, businessId, userId),
    env.DB.prepare("INSERT INTO subscriptions (id, business_id, plan, status, trial_started_at, trial_ends_at) VALUES (?, ?, ?, 'trial', ?, ?)").bind(subscriptionId, businessId, plan, now.toISOString(), trialEnds.toISOString())
  ]);

  const session = await createSession(env, userId);
  return json({ token: session.token, user: { id: userId, email, name: body.name.trim() }, businessId }, 201, env);
}

async function signin(request, env) {
  const body = await readJson(request);
  const email = cleanEmail(body.email);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  if (!user || !(await verifyPassword(body.password || "", user.password_hash))) throw httpError(401, "Sign-in failed");
  const session = await createSession(env, user.id);
  return json({ token: session.token, user: publicUser(user) }, 200, env);
}

async function signout(request, env) {
  const token = bearerToken(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, env);
}

async function me(request, env) {
  const user = await requireUser(request, env);
  const businesses = await businessesForUser(env, user.id);
  return json({ user: publicUser(user), businesses }, 200, env);
}

async function listBusinesses(user, env) {
  return json({ businesses: await businessesForUser(env, user.id) }, 200, env);
}

async function getPayrollSnapshot(user, env, businessId) {
  await requireMembership(user.id, businessId, env, "viewer");
  await ensureSnapshotTable(env);
  const row = await env.DB.prepare("SELECT payload, updated_at FROM payroll_snapshots WHERE business_id = ?").bind(businessId).first();
  return json({
    businessId,
    snapshot: row?.payload ? JSON.parse(row.payload) : null,
    updatedAt: row?.updated_at || null
  }, 200, env);
}

async function savePayrollSnapshot(request, user, env, businessId) {
  await requireMembership(user.id, businessId, env, "payroll_officer");
  await ensureSnapshotTable(env);
  const body = await readJson(request);
  assert(body.snapshot, "Snapshot is required");
  const payload = JSON.stringify(body.snapshot);
  if (payload.length > 900000) throw httpError(413, "Payroll file is too large for this sync method");
  await env.DB.prepare(
    "INSERT INTO payroll_snapshots (business_id, payload, updated_by_user_id, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(business_id) DO UPDATE SET payload = excluded.payload, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(businessId, payload, user.id).run();
  return json({ saved: true, businessId }, 200, env);
}

async function createInvitation(request, user, env, businessId) {
  const membership = await requireMembership(user.id, businessId, env, "admin");
  const subscription = await getSubscription(env, businessId);
  const count = await activeMembershipCount(env, businessId);
  if (count >= (PLAN_LIMITS[subscription?.plan] || 1)) {
    throw httpError(402, "Upgrade to a multiple-user subscription before inviting more users");
  }
  const body = await readJson(request);
  const invitedEmail = cleanEmail(body.email);
  const role = validInviteRole(body.role || "payroll_officer");
  assert(invitedEmail, "Invited email is required");
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expires = new Date();
  expires.setDate(expires.getDate() + 14);
  await env.DB.prepare(
    "INSERT INTO invitations (id, business_id, invited_email, role, token_hash, invited_by_user_id, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(id("inv"), membership.business_id, invitedEmail, role, tokenHash, user.id, expires.toISOString()).run();
  return json({ inviteLink: `${origin(env)}/apps/sme-payroll-cloud/?invite=${token}`, token, invitedEmail, role }, 201, env);
}

async function listInvitations(user, env, businessId) {
  await requireMembership(user.id, businessId, env, "admin");
  const rows = await env.DB.prepare("SELECT id, invited_email, role, status, expires_at, created_at FROM invitations WHERE business_id = ? ORDER BY created_at DESC").bind(businessId).all();
  return json({ invitations: rows.results || [] }, 200, env);
}

async function acceptInvitation(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  assert(body.token, "Invitation token is required");
  const tokenHash = await sha256Hex(body.token);
  const invite = await env.DB.prepare("SELECT * FROM invitations WHERE token_hash = ? AND status = 'pending'").bind(tokenHash).first();
  if (!invite) throw httpError(404, "Invitation not found or already used");
  if (new Date(invite.expires_at).getTime() < Date.now()) throw httpError(410, "Invitation expired");
  if (cleanEmail(user.email) !== cleanEmail(invite.invited_email)) throw httpError(403, "This invitation belongs to another email address");
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO memberships (id, business_id, user_id, role, status) VALUES (?, ?, ?, ?, 'active')").bind(id("mem"), invite.business_id, user.id, invite.role),
    env.DB.prepare("UPDATE invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ?").bind(invite.id)
  ]);
  return json({ accepted: true, businessId: invite.business_id, role: invite.role }, 200, env);
}

async function listPayrollPeriods(user, env, businessId) {
  await requireMembership(user.id, businessId, env, "viewer");
  const rows = await env.DB.prepare("SELECT * FROM payroll_periods WHERE business_id = ? ORDER BY start_date DESC").bind(businessId).all();
  return json({ payrollPeriods: rows.results || [] }, 200, env);
}

async function createPayrollPeriod(request, user, env, businessId) {
  await requireMembership(user.id, businessId, env, "payroll_officer");
  const body = await readJson(request);
  assert(body.label && body.startDate && body.ppeDate, "Label, start date, and PPE date are required");
  const period = { id: id("pay"), businessId, label: body.label, startDate: body.startDate, ppeDate: body.ppeDate };
  await env.DB.prepare("INSERT INTO payroll_periods (id, business_id, label, start_date, ppe_date, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(period.id, businessId, period.label, period.startDate, period.ppeDate, user.id).run();
  return json({ payrollPeriod: period }, 201, env);
}

async function updatePayrollPeriod(request, user, env, periodId) {
  const period = await periodWithBusiness(env, periodId);
  await requireMembership(user.id, period.business_id, env, "payroll_officer");
  const body = await readJson(request);
  const status = ["pending", "approved", "processed"].includes(body.status) ? body.status : period.status;
  await env.DB.prepare("UPDATE payroll_periods SET label = ?, start_date = ?, ppe_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(body.label || period.label, body.startDate || period.start_date, body.ppeDate || period.ppe_date, status, periodId).run();
  return json({ ok: true }, 200, env);
}

async function listStaff(user, env, businessId) {
  await requireMembership(user.id, businessId, env, "viewer");
  const rows = await env.DB.prepare("SELECT * FROM staff WHERE business_id = ? ORDER BY name").bind(businessId).all();
  return json({ staff: rows.results || [] }, 200, env);
}

async function createStaff(request, user, env, businessId) {
  await requireMembership(user.id, businessId, env, "payroll_officer");
  const body = await readJson(request);
  assert(body.name, "Staff name is required");
  const staffId = id("stf");
  await env.DB.prepare(
    "INSERT INTO staff (id, business_id, name, employee_no, position, department, hourly_rate, bank_name, account_name, account_number, branch, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(staffId, businessId, body.name, body.employeeNo || "", body.position || "", body.department || "", Number(body.hourlyRate || 0), body.bankName || "", body.accountName || "", body.accountNumber || "", body.branch || "", body.active === false ? 0 : 1).run();
  return json({ staff: { id: staffId, business_id: businessId, ...body } }, 201, env);
}

async function updateStaff(request, user, env, staffId) {
  const staff = await env.DB.prepare("SELECT * FROM staff WHERE id = ?").bind(staffId).first();
  if (!staff) throw httpError(404, "Staff not found");
  await requireMembership(user.id, staff.business_id, env, "payroll_officer");
  const body = await readJson(request);
  await env.DB.prepare(
    "UPDATE staff SET name = ?, employee_no = ?, position = ?, department = ?, hourly_rate = ?, bank_name = ?, account_name = ?, account_number = ?, branch = ?, active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).bind(body.name || staff.name, body.employeeNo ?? staff.employee_no, body.position ?? staff.position, body.department ?? staff.department, Number(body.hourlyRate ?? staff.hourly_rate), body.bankName ?? staff.bank_name, body.accountName ?? staff.account_name, body.accountNumber ?? staff.account_number, body.branch ?? staff.branch, body.active === false ? 0 : 1, staffId).run();
  return json({ ok: true }, 200, env);
}

async function listTimeEntries(user, env, periodId) {
  const period = await periodWithBusiness(env, periodId);
  await requireMembership(user.id, period.business_id, env, "viewer");
  const rows = await env.DB.prepare("SELECT * FROM time_entries WHERE payroll_period_id = ? ORDER BY work_date").bind(periodId).all();
  return json({ timeEntries: rows.results || [] }, 200, env);
}

async function upsertTimeEntries(request, user, env, periodId) {
  const period = await periodWithBusiness(env, periodId);
  await requireMembership(user.id, period.business_id, env, "payroll_officer");
  const body = await readJson(request);
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const statements = entries.map(entry => env.DB.prepare(
    "INSERT INTO time_entries (id, payroll_period_id, staff_id, work_date, hours, notes, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(payroll_period_id, staff_id, work_date) DO UPDATE SET hours = excluded.hours, notes = excluded.notes, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP"
  ).bind(id("tim"), periodId, entry.staffId, entry.workDate, Number(entry.hours || 0), entry.notes || "", user.id));
  if (statements.length) await env.DB.batch(statements);
  return json({ saved: statements.length }, 200, env);
}

async function listPayslips(user, env, periodId) {
  const period = await periodWithBusiness(env, periodId);
  await requireMembership(user.id, period.business_id, env, "viewer");
  const rows = await env.DB.prepare("SELECT * FROM payslips WHERE payroll_period_id = ? ORDER BY generated_at DESC").bind(periodId).all();
  return json({ payslips: rows.results || [] }, 200, env);
}

async function generatePayslips(user, env, periodId) {
  const period = await periodWithBusiness(env, periodId);
  await requireMembership(user.id, period.business_id, env, "payroll_officer");
  const rows = await env.DB.prepare(
    "SELECT s.id staff_id, s.hourly_rate, COALESCE(SUM(t.hours), 0) hours FROM staff s LEFT JOIN time_entries t ON t.staff_id = s.id AND t.payroll_period_id = ? WHERE s.business_id = ? GROUP BY s.id"
  ).bind(periodId, period.business_id).all();
  const statements = (rows.results || []).map(row => {
    const gross = Number(row.hours || 0) * Number(row.hourly_rate || 0);
    return env.DB.prepare(
      "INSERT INTO payslips (id, payroll_period_id, staff_id, gross, deductions, net, generated_by_user_id) VALUES (?, ?, ?, ?, 0, ?, ?) ON CONFLICT(payroll_period_id, staff_id) DO UPDATE SET gross = excluded.gross, net = excluded.net, generated_at = CURRENT_TIMESTAMP, generated_by_user_id = excluded.generated_by_user_id"
    ).bind(id("psl"), periodId, row.staff_id, gross, gross, user.id);
  });
  if (statements.length) await env.DB.batch(statements);
  return json({ generated: statements.length }, 200, env);
}

async function paypalWebhook(request, env) {
  const event = await readJson(request);
  // Production TODO:
  // 1. Verify PayPal-Transmission-Sig headers with PayPal before trusting this event.
  // 2. Read the PayPal subscription/order id.
  // 3. Update subscriptions.status and current_period_ends_at for the matching business.
  return json({ received: true, eventType: event.event_type || "unknown" }, 200, env);
}

async function createSession(env, userId) {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const expires = new Date();
  expires.setDate(expires.getDate() + Number(env.SESSION_DAYS || 30));
  await env.DB.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)").bind(id("ses"), userId, tokenHash, expires.toISOString()).run();
  return { token, expiresAt: expires.toISOString() };
}

async function requireUser(request, env) {
  const token = bearerToken(request);
  if (!token) throw httpError(401, "Authentication required");
  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > CURRENT_TIMESTAMP"
  ).bind(tokenHash).first();
  if (!row) throw httpError(401, "Session expired or invalid");
  return row;
}

async function requireMembership(userId, businessId, env, minimumRole) {
  const row = await env.DB.prepare("SELECT * FROM memberships WHERE user_id = ? AND business_id = ? AND status = 'active'").bind(userId, businessId).first();
  if (!row) throw httpError(403, "You are not a member of this business");
  if ((ROLE_RANK[row.role] || 0) < (ROLE_RANK[minimumRole] || 0)) throw httpError(403, "Your role does not allow this action");
  return row;
}

async function businessesForUser(env, userId) {
  const rows = await env.DB.prepare(
    "SELECT b.*, m.role, m.status membership_status, s.plan, s.status subscription_status, s.trial_ends_at FROM businesses b JOIN memberships m ON m.business_id = b.id LEFT JOIN subscriptions s ON s.business_id = b.id WHERE m.user_id = ? AND m.status = 'active' ORDER BY b.name"
  ).bind(userId).all();
  return rows.results || [];
}

async function getSubscription(env, businessId) {
  return env.DB.prepare("SELECT * FROM subscriptions WHERE business_id = ?").bind(businessId).first();
}

async function ensureSnapshotTable(env) {
  await env.DB.prepare(
    "CREATE TABLE IF NOT EXISTS payroll_snapshots (business_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_by_user_id TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  ).run();
}

async function activeMembershipCount(env, businessId) {
  const row = await env.DB.prepare("SELECT COUNT(*) count FROM memberships WHERE business_id = ? AND status = 'active'").bind(businessId).first();
  return Number(row?.count || 0);
}

async function periodWithBusiness(env, periodId) {
  const period = await env.DB.prepare("SELECT * FROM payroll_periods WHERE id = ?").bind(periodId).first();
  if (!period) throw httpError(404, "Payroll period not found");
  return period;
}

async function hashPassword(password) {
  const salt = randomToken(16);
  const hash = await pbkdf2(password, salt);
  return `pbkdf2:${salt}:${hash}`;
}

async function verifyPassword(password, stored) {
  const [method, salt, expected] = String(stored || "").split(":");
  if (method !== "pbkdf2" || !salt || !expected) return false;
  return timingSafeEqual(await pbkdf2(password, salt), expected);
}

async function pbkdf2(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 }, key, 256);
  return hex(bits);
}

async function sha256Hex(value) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return [...array].map(b => b.toString(16).padStart(2, "0")).join("");
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw httpError(400, "Invalid JSON body");
  }
}

function validPlan(plan) {
  if (!PLAN_LIMITS[plan]) throw httpError(400, "Invalid subscription plan");
  return plan;
}

function validInviteRole(role) {
  if (!["admin", "payroll_officer", "viewer"].includes(role)) throw httpError(400, "Invalid invitation role");
  return role;
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function cleanEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assert(value, message) {
  if (!value) throw httpError(400, message);
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function origin(env) {
  return env.APP_ORIGIN || "https://www.saufotrading.com";
}

function json(data, status = 200, env = {}) {
  return withCors(new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  }), env);
}

function withCors(response, env) {
  response.headers.set("access-control-allow-origin", "*");
  response.headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  response.headers.set("access-control-allow-headers", "content-type,authorization");
  return response;
}
