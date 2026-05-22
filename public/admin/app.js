import { t, getLocale, setLocale, initLocale, intlLocale, localeOptions } from "./i18n.js";

initLocale();

const STORAGE_KEY = "wf_admin";

const state = {
  apiBase: localStorage.getItem(STORAGE_KEY + "_base") || location.origin,
  apiKey: localStorage.getItem(STORAGE_KEY + "_key") || "",
  user: null,
  health: null,
  accounts: [],
  rules: [],
  records: [],
  recordTotal: 0,
  recordFilters: { accountId: "", sourceUid: "", limit: 20, offset: 0 },
  scopeUserId: localStorage.getItem(STORAGE_KEY + "_scope_user") || "",
  tenantUsers: [],
  promptTemplates: [],
  promptSettings: { promptTemplateId: "libai", customPrompt: "" },
  log: [],
  executionLog: [],
  runBusy: false,
  lastRunDryRun: false,
};

function isAdminUser() {
  return state.user?.role === "admin";
}

function renderExecutionLogCard() {
  const lines = state.executionLog.length
    ? state.executionLog.join("\n")
    : state.runBusy
      ? t("executionLogRunning")
      : t("executionLogEmpty");
  return `
    <div class="card execution-log-card ${state.runBusy ? "is-running" : ""}">
      <div class="execution-log-header">
        <h2 class="card-title">${t("executionLog")}</h2>
        <div class="execution-log-badges">
          ${state.runBusy ? `<span class="run-badge running">${t("taskRunning")}</span>` : ""}
          ${state.lastRunDryRun && !state.runBusy ? `<span class="run-badge dry">${t("dryRunBadge")}</span>` : ""}
        </div>
      </div>
      <pre class="execution-log-panel" id="executionLogPanel">${esc(lines)}</pre>
    </div>`;
}

function scrollExecutionLogToBottom() {
  requestAnimationFrame(() => {
    const el = document.getElementById("executionLogPanel");
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function appendExecutionLogs(lines, { dryRun = false } = {}) {
  if (!Array.isArray(lines)) return;
  for (const line of lines) {
    if (line) state.executionLog.push(line);
  }
  state.lastRunDryRun = !!dryRun;
  scrollExecutionLogToBottom();
}

function applyRunBusyUi() {
  document.querySelectorAll("[data-run-action]").forEach((el) => {
    el.disabled = state.runBusy;
    el.setAttribute("aria-busy", state.runBusy ? "true" : "false");
  });
  const panel = document.getElementById("executionLogPanel");
  if (panel && state.runBusy) scrollExecutionLogToBottom();
}

async function runWithLock(taskLabel, fn) {
  if (state.runBusy) {
    toast(t("runInProgress"), "error");
    return null;
  }
  state.runBusy = true;
  state.executionLog = [];
  state.lastRunDryRun = false;
  logLine(t("runStarted", { label: taskLabel }));
  applyRunBusyUi();
  if (location.hash === "#/dashboard" || location.hash === "#/rules") render();

  try {
    return await fn();
  } finally {
    state.runBusy = false;
    applyRunBusyUi();
    if (location.hash === "#/dashboard" || location.hash === "#/rules") render();
  }
}

function templateOptions(selectedId, includeInherit = false) {
  const parts = [];
  if (includeInherit) {
    parts.push(
      `<option value="" ${!selectedId ? "selected" : ""}>${t("promptInherit")}</option>`,
    );
  }
  for (const tpl of state.promptTemplates) {
    parts.push(
      `<option value="${esc(tpl.id)}" ${selectedId === tpl.id ? "selected" : ""}>${t(tpl.nameKey)}</option>`,
    );
  }
  return parts.join("");
}

function userScopeParams() {
  const p = new URLSearchParams();
  if (isAdminUser() && state.scopeUserId) p.set("userId", state.scopeUserId);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** 评语风格绑定规则所属平台用户；管理员侧栏筛选谁，设置页就改谁 */
function promptSettingsQuery() {
  return userScopeParams();
}

function promptSettingsOwnerLabel() {
  if (!isAdminUser()) return "";
  if (!state.scopeUserId) {
    return `<p class="muted prompt-owner-hint">${t("promptOwnerAdminSelf")}</p>`;
  }
  const u = state.tenantUsers.find((x) => x.id === state.scopeUserId);
  return `<p class="muted prompt-owner-hint">${t("promptOwnerScoped", { name: u?.username ?? state.scopeUserId.slice(0, 8) })}</p>`;
}

async function savePromptSettings(showToast = true) {
  const promptTemplateId = document.getElementById("userPromptTemplate")?.value;
  if (!promptTemplateId) return;
  const customPrompt = document.getElementById("userPromptCustom")?.value.trim() || null;
  const body = { promptTemplateId, customPrompt };
  if (isAdminUser() && state.scopeUserId) body.userId = state.scopeUserId;
  const data = await api(`/api/v1/me/prompt-settings${promptSettingsQuery()}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  state.promptSettings = {
    promptTemplateId: data.promptTemplateId,
    customPrompt: data.customPrompt ?? "",
  };
  if (showToast) toast(t("saved"), "success");
}

function saveAuth() {
  localStorage.setItem(STORAGE_KEY + "_base", state.apiBase);
  localStorage.setItem(STORAGE_KEY + "_key", state.apiKey);
}

function logLine(msg) {
  const time = new Date().toLocaleTimeString(intlLocale());
  state.log.unshift(`[${time}] ${msg}`);
  if (state.log.length > 80) state.log.pop();
}

async function api(path, options = {}) {
  const url = state.apiBase.replace(/\/$/, "") + path;
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (state.apiKey) headers.Authorization = `Bearer ${state.apiKey}`;
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = data?.error || data?.raw || res.statusText;
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }
  return data;
}

function toast(msg, type = "") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

// --- views ---

function pageHeader(title, subtitle = "") {
  return `
    <header class="page-header">
      <h1>${esc(title)}</h1>
      ${subtitle ? `<p class="page-subtitle">${subtitle}</p>` : ""}
    </header>`;
}

function renderLogin() {
  return `
    <div class="login-wrap">
      <div class="login-page">
        <img src="/admin/logo.svg" alt="" class="login-logo" width="56" height="56" />
        <h1>${t("appTitle")}</h1>
        <p class="login-lead">${t("appTagline")}</p>
        <div class="card">
          <p class="login-hint">${t("loginHint")}</p>
          <label>${t("apiUrl")}</label>
          <input id="apiBase" value="${esc(state.apiBase)}" placeholder="http://localhost:3000" />
          <label>${t("username")}</label>
          <input id="username" placeholder="admin" autocomplete="username" />
          <label>${t("password")}</label>
          <input id="password" type="password" placeholder="" autocomplete="current-password" />
          <div class="actions">
            <button id="btnLogin">${t("login")}</button>
            <button class="secondary" id="btnRegister">${t("register")}</button>
          </div>
        </div>
      </div>
    </div>`;
}

function bindLogin() {
  document.getElementById("btnLogin")?.addEventListener("click", async () => {
    try {
      state.apiBase = document.getElementById("apiBase").value.trim() || location.origin;
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;
      const data = await api("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      state.apiKey = data.apiKey;
      saveAuth();
      logLine(t("loginOk"));
      toast(t("loginOk"), "success");
      location.hash = "#/dashboard";
      await refreshAll();
    } catch (e) {
      const hint =
        e.message.includes("用户名或密码") || e.message.includes("401") || e.message.includes("Invalid")
          ? t("authHint", { msg: e.message })
          : e.message;
      toast(hint, "error");
    }
  });

  document.getElementById("btnRegister")?.addEventListener("click", async () => {
    try {
      state.apiBase = document.getElementById("apiBase").value.trim() || location.origin;
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;
      const data = await api("/api/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      state.apiKey = data.apiKey;
      saveAuth();
      toast(t("registerOk"), "success");
      location.hash = "#/dashboard";
      await refreshAll();
    } catch (e) {
      toast(e.message, "error");
    }
  });
}

function shell(content, active) {
  return `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <img src="/admin/logo.svg" alt="" class="brand-logo" width="28" height="28" />
          <span class="brand-text">${t("brand")}</span>
        </div>
        ${adminScopeBar()}
        <nav>
          <a href="#/dashboard" class="${active === "dashboard" ? "active" : ""}">${t("navDashboard")}</a>
          <a href="#/accounts" class="${active === "accounts" ? "active" : ""}">${t("navAccounts")}</a>
          <a href="#/rules" class="${active === "rules" ? "active" : ""}">${t("navRules")}</a>
          <a href="#/records" class="${active === "records" ? "active" : ""}">${t("navRecords")}</a>
          <a href="#/settings" class="${active === "settings" ? "active" : ""}">${t("navSettings")}</a>
        </nav>
        <div class="sidebar-footer">
          <button class="secondary" id="btnLogout">${t("logout")}</button>
        </div>
      </aside>
      <main class="main"><div class="main-inner">${content}</div></main>
    </div>`;
}

function adminScopeBar() {
  if (!isAdminUser()) return "";
  const opts = [
    `<option value="">${t("adminScopeAll")}</option>`,
    ...state.tenantUsers.map(
      (u) =>
        `<option value="${esc(u.id)}" ${state.scopeUserId === u.id ? "selected" : ""}>${esc(u.username)}</option>`,
    ),
  ].join("");
  return `
    <div class="admin-scope">
      <label class="admin-scope-label">${t("adminScopeLabel")}</label>
      <select id="scopeUser">${opts}</select>
    </div>`;
}

function bindShell() {
  document.getElementById("scopeUser")?.addEventListener("change", async (e) => {
    state.scopeUserId = e.target.value;
    localStorage.setItem(STORAGE_KEY + "_scope_user", state.scopeUserId);
    await refreshAll();
    render();
  });

  document.getElementById("btnLogout")?.addEventListener("click", () => {
    state.apiKey = "";
    state.user = null;
    localStorage.removeItem(STORAGE_KEY + "_key");
    location.hash = "#/login";
    render();
  });
}

function renderDashboard() {
  const h = state.health;
  return shell(`
    ${pageHeader(t("dashboardTitle"), t("dashboardSubtitle"))}
    <div class="stat-row">
      <div class="stat"><span class="muted">${t("statAccounts")}</span><strong>${state.accounts.length}</strong></div>
      <div class="stat"><span class="muted">${t("statRules")}</span><strong>${state.rules.length}</strong></div>
      <div class="stat"><span class="muted">${t("statReposted")}</span><strong>${state.recordTotal}</strong></div>
      <div class="stat"><span class="muted">${t("statCommentEngine")}</span><strong class="stat-sm">${esc(h?.commentGenerator ?? "—")}</strong></div>
    </div>
    <div class="card">
      <h2 class="card-title">${t("quickActions")}</h2>
      <div class="actions">
        <button id="btnRunAll" data-run-action>${t("runAll")}</button>
        <button class="secondary" id="btnRunAllDry" data-run-action>${t("runAllDry")}</button>
        <a class="btn secondary" href="#/accounts">${t("manageAccounts")}</a>
        <a class="btn secondary" href="#/rules">${t("manageRules")}</a>
        <a class="btn secondary" href="#/records">${t("viewRecords")}</a>
      </div>
    </div>
    ${renderExecutionLogCard()}
    <div class="card card-muted">
      <h2 class="card-title">${t("runLog")}</h2>
      <div class="log-panel">${state.log.map(esc).join("\n") || t("noLog")}</div>
    </div>
  `, "dashboard");
}

function bindDashboard() {
  bindShell();
  document.getElementById("btnRunAll")?.addEventListener("click", () => runAll(false));
  document.getElementById("btnRunAllDry")?.addEventListener("click", () => runAll(true));
}

async function runAll(dryRun) {
  await runWithLock(dryRun ? t("runAllDry") : t("runAll"), async () => {
    try {
      const payload = { dryRun };
      if (isAdminUser() && state.scopeUserId) payload.userId = state.scopeUserId;
      const data = await api("/api/v1/rules/run-all", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      appendExecutionLogs(data.logs, { dryRun: data.dryRun ?? dryRun });
      const n = data.totalForwarded ?? 0;
      const p = data.processed ?? 0;
      logLine(t("logRunAll", { n }));
      if (dryRun || data.dryRun) {
        toast(t("dryRunDone", { p, n }), "success");
      } else {
        toast(t("doneForwarded", { n }), "success");
      }
      await loadRecordTotal();
      return data;
    } catch (e) {
      logLine(t("logRunAllFail", { msg: e.message }));
      appendExecutionLogs([`[error] ${e.message}`]);
      toast(e.message, "error");
      throw e;
    }
  });
}

function renderAccounts() {
  const rows = state.accounts
    .map(
      (a) => `
    <tr>
      <td>${esc(a.name)}</td>
      <td><code style="font-size:0.75rem">${esc(a.id.slice(0, 8))}…</code></td>
      <td>
        <button class="secondary btn-qr" data-id="${esc(a.id)}">${t("qrLogin")}</button>
        <button class="secondary btn-upload" data-id="${esc(a.id)}">${t("uploadState")}</button>
        <button class="danger btn-del-acc" data-id="${esc(a.id)}">${t("delete")}</button>
      </td>
    </tr>`,
    )
    .join("");

  return shell(`
    ${pageHeader(t("accountsTitle"), t("accountsSubtitle"))}
    <div class="card">
      <h2 class="card-title">${t("newAccount")}</h2>
      <label>${t("displayName")}</label>
      <input id="accName" placeholder="${esc(t("namePlaceholder"))}" />
      <button id="btnCreateAcc">${t("create")}</button>
    </div>
    <div class="card table-card">
      <h2 class="card-title" style="padding:1.25rem 1.5rem 0;margin:0">${t("accountList")}</h2>
      <div class="table-scroll">
      <table>
        <thead><tr><th>${t("colName")}</th><th>${t("colId")}</th><th>${t("colActions")}</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="3" class="muted">${t("noAccounts")}</td></tr>`}</tbody>
      </table>
      </div>
    </div>
    <input type="file" id="fileStorage" accept=".json,application/json" class="hidden" />
  `, "accounts");
}

function bindAccounts() {
  bindShell();

  document.getElementById("btnCreateAcc")?.addEventListener("click", async () => {
    const name = document.getElementById("accName").value.trim();
    if (!name) return toast(t("enterName"), "error");
    try {
      await api("/api/v1/accounts", { method: "POST", body: JSON.stringify({ name }) });
      toast(t("created"), "success");
      await loadAccounts();
      render();
    } catch (e) {
      toast(e.message, "error");
    }
  });

  document.querySelectorAll(".btn-del-acc").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(t("confirmDeleteAccount"))) return;
      try {
        await api(`/api/v1/accounts/${btn.dataset.id}`, { method: "DELETE" });
        toast(t("deleted"), "success");
        await loadAccounts();
        render();
      } catch (e) {
        toast(e.message, "error");
      }
    });
  });

  const fileInput = document.getElementById("fileStorage");
  let uploadAccountId = null;

  document.querySelectorAll(".btn-upload").forEach((btn) => {
    btn.addEventListener("click", () => {
      uploadAccountId = btn.dataset.id;
      fileInput.click();
    });
  });

  fileInput?.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file || !uploadAccountId) return;
    try {
      const json = JSON.parse(await file.text());
      await api(`/api/v1/accounts/${uploadAccountId}/storage-state`, {
        method: "POST",
        body: JSON.stringify(json),
      });
      toast(t("sessionUploaded"), "success");
      logLine(t("logSessionUploaded", { id: uploadAccountId.slice(0, 8) }));
    } catch (e) {
      toast(e.message, "error");
    }
    fileInput.value = "";
  });

  document.querySelectorAll(".btn-qr").forEach((btn) => {
    btn.addEventListener("click", () => openQrLogin(btn.dataset.id));
  });
}

async function openQrLogin(accountId) {
  try {
    const data = await api(`/api/v1/accounts/${accountId}/login-sessions`, {
      method: "POST",
    });
    showQrModal(data, accountId);
  } catch (e) {
    toast(e.message, "error");
  }
}

function showQrModal(session, accountId) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const pollUrl = `${state.apiBase.replace(/\/$/, "")}/api/v1/public/login-sessions/${session.sessionId}?token=${encodeURIComponent(session.loginToken)}`;
  const qrUrl = `${state.apiBase.replace(/\/$/, "")}/api/v1/public/login-sessions/${session.sessionId}/qr?token=${encodeURIComponent(session.loginToken)}`;

  backdrop.innerHTML = `
    <div class="modal">
      <h2>${t("qrTitle")}</h2>
      <p class="muted" id="qrStatus">${t("qrLoading")}</p>
      <img id="qrImg" alt="QR" />
      <div class="actions" style="margin-top:1rem">
        <a class="btn secondary" href="${esc(session.webUrl)}" target="_blank" rel="noopener">${t("qrOpenWindow")}</a>
        <button class="secondary" id="qrClose">${t("close")}</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const statusEl = backdrop.querySelector("#qrStatus");
  const img = backdrop.querySelector("#qrImg");

  function refreshImg() {
    img.src = qrUrl + "&t=" + Date.now();
  }
  refreshImg();

  const timer = setInterval(async () => {
    try {
      const res = await fetch(pollUrl);
      const data = await res.json();
      if (data.status === "succeeded") {
        statusEl.textContent = t("qrSuccess");
        statusEl.style.color = "var(--success)";
        clearInterval(timer);
        logLine(t("logQrOk", { id: accountId.slice(0, 8) }));
        toast(t("weiboLoginOk"), "success");
        setTimeout(() => backdrop.remove(), 1500);
        return;
      }
      if (data.status === "failed" || data.status === "expired") {
        statusEl.textContent = data.errorMessage || t("qrFailed");
        clearInterval(timer);
        return;
      }
      statusEl.textContent = t("qrScanHint");
      refreshImg();
    } catch {
      /* ignore */
    }
  }, 2000);

  backdrop.querySelector("#qrClose").addEventListener("click", () => {
    clearInterval(timer);
    backdrop.remove();
  });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      clearInterval(timer);
      backdrop.remove();
    }
  });
}

function renderRules() {
  const accOpts = state.accounts
    .map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`)
    .join("");

  const rows = state.rules
    .map(
      (r) => `
    <tr>
      <td>${esc(r.id.slice(0, 8))}…</td>
      <td>${esc(state.accounts.find((a) => a.id === r.forwardAccountId)?.name ?? r.forwardAccountId.slice(0, 8))}</td>
      <td>${esc(r.sourceUid)}</td>
      <td>${r.limit}</td>
      <td><code style="font-size:0.7rem">${esc(r.schedule || "—")}</code></td>
      <td><span class="badge ${r.enabled ? "on" : "off"}">${r.enabled ? t("enabled") : t("disabled")}</span></td>
      <td>
        <button class="secondary btn-run" data-run-action data-id="${esc(r.id)}">${t("run")}</button>
        <button class="secondary btn-dry" data-run-action data-id="${esc(r.id)}">${t("dryRun")}</button>
        <button class="secondary btn-toggle" data-id="${esc(r.id)}" data-on="${r.enabled}">${r.enabled ? t("disable") : t("enable")}</button>
        <button class="danger btn-del-rule" data-id="${esc(r.id)}">${t("delete")}</button>
      </td>
    </tr>`,
    )
    .join("");

  return shell(`
    ${pageHeader(t("rulesTitle"), t("rulesSubtitle"))}
    <div class="card">
      <h2 class="card-title">${t("newRule")}</h2>
      <div class="grid2">
        <div>
          <label>${t("forwardAccount")}</label>
          <select id="ruleAccount">${accOpts || `<option value="">${t("selectAccountFirst")}</option>`}</select>
        </div>
        <div>
          <label>${t("sourceUid")}</label>
          <input id="ruleSource" placeholder="1234567890" />
        </div>
        <div>
          <label>${t("limitPerRun")}</label>
          <input id="ruleLimit" type="number" value="1" min="1" />
        </div>
        <div>
          <label>${t("cronOptional")}</label>
          <input id="ruleSchedule" placeholder="0 9 * * *" />
        </div>
      </div>
      <p class="muted">${t("cronHint")}</p>
      <div class="prompt-block">
        <label>${t("rulePromptMode")}</label>
        <select id="rulePromptMode">
          <option value="inherit">${t("promptInherit")}</option>
          <option value="template">${t("promptUseTemplate")}</option>
          <option value="custom">${t("promptUseCustom")}</option>
        </select>
        <div id="rulePromptTemplateWrap">
          <label>${t("promptTemplate")}</label>
          <select id="rulePromptTemplate">${templateOptions(state.promptSettings.promptTemplateId, false)}</select>
        </div>
        <div id="rulePromptCustomWrap" class="hidden">
          <label>${t("promptCustom")}</label>
          <textarea id="rulePromptCustom" rows="4" placeholder="${esc(t("promptCustomPlaceholder"))}"></textarea>
        </div>
      </div>
      <button id="btnCreateRule">${t("createRule")}</button>
    </div>
    ${renderExecutionLogCard()}
    <div class="card table-card">
      <h2 class="card-title" style="padding:1.25rem 1.5rem 0;margin:0">${t("ruleList")}</h2>
      <div class="table-scroll">
      <table>
        <thead>
          <tr><th>${t("colId")}</th><th>${t("colAccount")}</th><th>${t("colSourceUid")}</th><th>limit</th><th>${t("colSchedule")}</th><th>${t("colStatus")}</th><th>${t("colActions")}</th></tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="7" class="muted">${t("noRules")}</td></tr>`}</tbody>
      </table>
      </div>
    </div>
  `, "rules");
}

function syncRulePromptFields() {
  const mode = document.getElementById("rulePromptMode")?.value ?? "inherit";
  document.getElementById("rulePromptTemplateWrap")?.classList.toggle("hidden", mode !== "template");
  document.getElementById("rulePromptCustomWrap")?.classList.toggle("hidden", mode !== "custom");
}

function rulePromptPayload() {
  const mode = document.getElementById("rulePromptMode")?.value ?? "inherit";
  if (mode === "inherit") return { promptInherit: true };
  if (mode === "custom") {
    return { customPrompt: document.getElementById("rulePromptCustom")?.value.trim() || "" };
  }
  const tid = document.getElementById("rulePromptTemplate")?.value;
  return { promptTemplateId: tid || state.promptSettings.promptTemplateId };
}

function bindRules() {
  bindShell();
  document.getElementById("rulePromptMode")?.addEventListener("change", syncRulePromptFields);
  syncRulePromptFields();

  document.getElementById("btnCreateRule")?.addEventListener("click", async () => {
    const forwardAccountId = document.getElementById("ruleAccount").value;
    const sourceUid = document.getElementById("ruleSource").value.trim();
    const limit = parseInt(document.getElementById("ruleLimit").value, 10) || 1;
    const schedule = document.getElementById("ruleSchedule").value.trim() || null;
    if (!forwardAccountId || !sourceUid) return toast(t("fillAccountUid"), "error");
    try {
      await api("/api/v1/rules", {
        method: "POST",
        body: JSON.stringify({
          forwardAccountId,
          sourceUid,
          limit,
          schedule,
          enabled: true,
          ...rulePromptPayload(),
        }),
      });
      toast(t("ruleCreated"), "success");
      await loadRules();
      render();
    } catch (e) {
      toast(e.message, "error");
    }
  });

  document.querySelectorAll(".btn-run").forEach((btn) => {
    btn.addEventListener("click", () => runRule(btn.dataset.id, false));
  });
  document.querySelectorAll(".btn-dry").forEach((btn) => {
    btn.addEventListener("click", () => runRule(btn.dataset.id, true));
  });

  document.querySelectorAll(".btn-toggle").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const enabled = btn.dataset.on !== "true";
      try {
        await api(`/api/v1/rules/${btn.dataset.id}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        });
        await loadRules();
        render();
      } catch (e) {
        toast(e.message, "error");
      }
    });
  });

  document.querySelectorAll(".btn-del-rule").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(t("confirmDeleteRule"))) return;
      try {
        await api(`/api/v1/rules/${btn.dataset.id}`, { method: "DELETE" });
        toast(t("deleted"), "success");
        await loadRules();
        render();
      } catch (e) {
        toast(e.message, "error");
      }
    });
  });
}

async function runRule(ruleId, dryRun) {
  await runWithLock(dryRun ? t("dryRun") : t("run"), async () => {
    try {
      const data = await api(`/api/v1/rules/${ruleId}/run`, {
        method: "POST",
        body: JSON.stringify({ dryRun }),
      });
      appendExecutionLogs(data.logs, { dryRun: data.dryRun ?? dryRun });
      logLine(t("logRuleRun", { id: ruleId.slice(0, 8), p: data.processed, f: data.forwarded }));
      if (dryRun || data.dryRun) {
        toast(t("dryRunDone", { p: data.processed, n: data.forwarded }), "success");
      } else {
        toast(t("doneForwarded", { n: data.forwarded }), "success");
      }
      await loadRecordTotal();
      return data;
    } catch (e) {
      logLine(t("logRuleFail", { msg: e.message }));
      appendExecutionLogs([`[error] ${e.message}`]);
      toast(e.message, "error");
      throw e;
    }
  });
}

function formatRecordDay(iso) {
  if (!iso) return t("unknownDay");
  try {
    return new Intl.DateTimeFormat(intlLocale(), {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatRecordDayKey(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function formatRecordTime(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(intlLocale(), {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function accountName(accountId) {
  return state.accounts.find((a) => a.id === accountId)?.name ?? accountId?.slice(0, 8) + "…";
}

async function copyTextToClipboard(text, successMsg = t("linkCopied")) {
  if (!text) {
    toast(t("noLinks"), "error");
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast(successMsg, "success");
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast(successMsg, "success");
      return true;
    } catch {
      toast(t("copyFailed"), "error");
      return false;
    }
  }
}

function renderMyRepostCell(url) {
  if (!url) return '<span class="muted">—</span>';
  return `
    <div class="link-copy-row">
      <input class="link-copy-input" type="text" readonly value="${esc(url)}" title="${esc(url)}" />
      <button type="button" class="secondary btn-copy-link" data-url="${esc(url)}">${t("copy")}</button>
      <a href="${esc(url)}" target="_blank" rel="noopener" class="link-open">${t("open")}</a>
    </div>`;
}

function buildRecordsTableRows(records) {
  if (!records.length) {
    return `<tr><td colspan="7" class="muted">${t("noRecords")}</td></tr>`;
  }

  const byDay = new Map();
  for (const r of records) {
    const key = formatRecordDayKey(r.forwardedAt);
    const list = byDay.get(key) ?? [];
    list.push(r);
    byDay.set(key, list);
  }

  const dayKeys = [...byDay.keys()].sort((a, b) => b.localeCompare(a));
  const parts = [];

  for (const dayKey of dayKeys) {
    const dayRecords = byDay.get(dayKey);
    if (!dayRecords?.length) continue;

    const dayLinks = dayRecords.map((r) => r.myRepostUrl).filter(Boolean);
    const dayCopyPayload = encodeURIComponent(dayLinks.join("\t"));

    parts.push(`
    <tr class="day-group">
      <td colspan="7">
        <div class="day-group-bar">
          <span>${esc(t("dayCount", { day: formatRecordDay(dayRecords[0].forwardedAt), n: dayRecords.length }))}</span>
          <button
            type="button"
            class="secondary btn-copy-day-links"
            data-copy="${dayCopyPayload}"
            data-count="${dayLinks.length}"
            ${dayLinks.length ? "" : "disabled"}
          >${t("copyDayLinks")}</button>
        </div>
      </td>
    </tr>`);

    for (const r of dayRecords) {
      const comment = r.comment ?? "";
      parts.push(`
    <tr>
      <td class="nowrap time-cell">${esc(formatRecordTime(r.forwardedAt))}</td>
      <td>${esc(accountName(r.forwardAccountId))}</td>
      <td><code>${esc(r.sourceUid)}</code></td>
      <td><code>${esc(r.mid)}</code></td>
      <td class="comment-cell" title="${esc(comment)}">${esc(comment.slice(0, 50))}${comment.length > 50 ? "…" : ""}</td>
      <td class="source-link-cell">
        ${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${t("sourcePost")}</a>` : '<span class="muted">—</span>'}
      </td>
      <td class="repost-link-cell">${renderMyRepostCell(r.myRepostUrl)}</td>
    </tr>`);
    }
  }

  return parts.join("");
}

function renderRecords() {
  const f = state.recordFilters;
  const accOpts = [
    `<option value="">${t("allAccounts")}</option>`,
    ...state.accounts.map((a) => `<option value="${esc(a.id)}" ${f.accountId === a.id ? "selected" : ""}>${esc(a.name)}</option>`),
  ].join("");

  const rows = buildRecordsTableRows(state.records);

  const page = Math.floor(f.offset / f.limit) + 1;
  const totalPages = Math.max(1, Math.ceil(state.recordTotal / f.limit));
  const hasPrev = f.offset > 0;
  const hasNext = f.offset + f.limit < state.recordTotal;

  return shell(`
    ${pageHeader(
      t("recordsTitle"),
      t("recordsSubtitle", { total: state.recordTotal, page, pages: totalPages }),
    )}
    <div class="card">
      <h2 class="card-title">${t("filter")}</h2>
      <div class="grid2">
        <div>
          <label>${t("forwardAccount")}</label>
          <select id="recAccount">${accOpts}</select>
        </div>
        <div>
          <label>${t("sourceUidFilter")}</label>
          <input id="recSource" value="${esc(f.sourceUid)}" placeholder="${esc(t("filterAllPlaceholder"))}" />
        </div>
      </div>
      <div class="actions">
        <button id="btnRecFilter">${t("search")}</button>
        <button class="secondary" id="btnRecReset">${t("reset")}</button>
      </div>
    </div>
    <div class="card table-card">
      <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>${t("colTime")}</th>
            <th>${t("colAccount")}</th>
            <th>${t("colSourceUid")}</th>
            <th>${t("colMid")}</th>
            <th>${t("colComment")}</th>
            <th>${t("colSource")}</th>
            <th>${t("colMyRepost")}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
      <div class="table-footer actions">
        <button class="secondary" id="btnRecPrev" ${hasPrev ? "" : "disabled"}>${t("prevPage")}</button>
        <button class="secondary" id="btnRecNext" ${hasNext ? "" : "disabled"}>${t("nextPage")}</button>
      </div>
    </div>
  `, "records");
}

function bindRecords() {
  bindShell();

  document.querySelectorAll(".btn-copy-link").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await copyTextToClipboard(btn.dataset.url ?? "");
    });
  });

  document.querySelectorAll(".btn-copy-day-links").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const raw = btn.dataset.copy ?? "";
      const text = raw ? decodeURIComponent(raw) : "";
      const count = parseInt(btn.dataset.count ?? "0", 10);
      await copyTextToClipboard(
        text,
        count > 0 ? t("dayLinksCopied", { n: count }) : undefined,
      );
    });
  });

  document.querySelectorAll(".link-copy-input").forEach((input) => {
    input.addEventListener("focus", () => input.select());
    input.addEventListener("click", () => input.select());
  });

  document.getElementById("btnRecFilter")?.addEventListener("click", async () => {
    state.recordFilters.accountId = document.getElementById("recAccount").value;
    state.recordFilters.sourceUid = document.getElementById("recSource").value.trim();
    state.recordFilters.offset = 0;
    await loadRecords();
    render();
  });

  document.getElementById("btnRecReset")?.addEventListener("click", async () => {
    state.recordFilters = { accountId: "", sourceUid: "", limit: 20, offset: 0 };
    await loadRecords();
    render();
  });

  document.getElementById("btnRecPrev")?.addEventListener("click", async () => {
    state.recordFilters.offset = Math.max(0, state.recordFilters.offset - state.recordFilters.limit);
    await loadRecords();
    render();
  });

  document.getElementById("btnRecNext")?.addEventListener("click", async () => {
    state.recordFilters.offset += state.recordFilters.limit;
    await loadRecords();
    render();
  });
}

function renderSettings() {
  const langOpts = localeOptions
    .map(
      (o) =>
        `<option value="${esc(o.value)}" ${getLocale() === o.value ? "selected" : ""}>${t(o.labelKey)}</option>`,
    )
    .join("");

  return shell(`
    ${pageHeader(t("settingsTitle"), t("settingsSubtitle"))}
    <div class="card">
      <h2 class="card-title">${t("language")}</h2>
      <label>${t("language")}</label>
      <select id="setLocale">${langOpts}</select>
    </div>
    <div class="card">
      <h2 class="card-title">${t("promptSettingsTitle")}</h2>
      ${promptSettingsOwnerLabel()}
      <p class="muted">${t("promptSettingsHint")}</p>
      <label>${t("promptTemplate")}</label>
      <select id="userPromptTemplate">${templateOptions(state.promptSettings.promptTemplateId, false)}</select>
      <label>${t("promptCustomOptional")}</label>
      <textarea id="userPromptCustom" rows="6" placeholder="${esc(t("promptCustomPlaceholder"))}">${esc(state.promptSettings.customPrompt ?? "")}</textarea>
      <button id="btnSavePrompt">${t("save")}</button>
    </div>
    <div class="card">
      <h2 class="card-title">${t("connection")}</h2>
      <label>${t("apiUrl")}</label>
      <input id="setBase" value="${esc(state.apiBase)}" />
      <label>${t("apiKey")}</label>
      <input id="setKey" value="${esc(state.apiKey)}" type="password" />
      <div class="actions">
        <button id="btnSaveConn">${t("save")}</button>
        <button class="secondary" id="btnRotateKey">${t("rotateKey")}</button>
      </div>
    </div>
    <div class="card">
      <h2 class="card-title">${t("currentUser")}</h2>
      <p>${t("userLabel")}: <strong>${esc(state.user?.username ?? "—")}</strong></p>
      <p>${t("userRole")}: <strong>${state.user?.role === "admin" ? t("roleAdmin") : t("roleUser")}</strong></p>
      <p class="muted">${t("userId")}: ${esc(state.user?.id ?? "—")}</p>
    </div>
    <div class="card card-muted">
      <h2 class="card-title">${t("serviceStatus")}</h2>
      <p>${t("commentEngine")}: ${esc(state.health?.commentGenerator ?? "—")}</p>
      <p>${t("cronStatus")}: ${state.health?.cronEnabled ? t("cronOn") : t("cronOff")}</p>
    </div>
  `, "settings");
}

function bindSettings() {
  bindShell();
  document.getElementById("setLocale")?.addEventListener("change", (e) => {
    setLocale(e.target.value);
    document.title = t("appTitle");
    render();
  });
  document.getElementById("btnSaveConn")?.addEventListener("click", () => {
    state.apiBase = document.getElementById("setBase").value.trim() || location.origin;
    state.apiKey = document.getElementById("setKey").value.trim();
    saveAuth();
    toast(t("saved"), "success");
    refreshAll().then(() => render());
  });
  document.getElementById("btnSavePrompt")?.addEventListener("click", async () => {
    try {
      await savePromptSettings(true);
    } catch (e) {
      toast(e.message, "error");
    }
  });

  document.getElementById("userPromptTemplate")?.addEventListener("change", async () => {
    try {
      await savePromptSettings(true);
    } catch (e) {
      toast(e.message, "error");
    }
  });

  document.getElementById("btnRotateKey")?.addEventListener("click", async () => {
    try {
      const data = await api("/api/v1/auth/rotate-key", { method: "POST" });
      state.apiKey = data.apiKey;
      saveAuth();
      document.getElementById("setKey").value = state.apiKey;
      toast(t("keyRotated"), "success");
    } catch (e) {
      toast(e.message, "error");
    }
  });
}

// --- data ---

async function loadHealth() {
  try {
    state.health = await api("/health");
  } catch {
    state.health = null;
  }
}

async function loadMe() {
  state.user = await api("/api/v1/me");
}

async function loadPromptSettings() {
  try {
    const data = await api(`/api/v1/me/prompt-settings${promptSettingsQuery()}`);
    state.promptTemplates = data.templates ?? [];
    state.promptSettings = {
      promptTemplateId: data.promptTemplateId ?? "libai",
      customPrompt: data.customPrompt ?? "",
    };
  } catch {
    try {
      const data = await api("/api/v1/prompt-templates");
      state.promptTemplates = data.templates ?? [];
    } catch {
      state.promptTemplates = [];
    }
  }
}

async function loadTenantUsers() {
  if (!isAdminUser()) {
    state.tenantUsers = [];
    return;
  }
  try {
    const data = await api("/api/v1/users");
    state.tenantUsers = data.users ?? [];
  } catch {
    state.tenantUsers = [];
  }
}

async function loadAccounts() {
  const data = await api(`/api/v1/accounts${userScopeParams()}`);
  state.accounts = data.accounts ?? [];
}

async function loadRules() {
  const data = await api(`/api/v1/rules${userScopeParams()}`);
  state.rules = data.rules ?? [];
}

async function loadRecords() {
  const f = state.recordFilters;
  const params = new URLSearchParams();
  if (f.accountId) params.set("accountId", f.accountId);
  if (f.sourceUid) params.set("sourceUid", f.sourceUid);
  params.set("limit", String(f.limit));
  params.set("offset", String(f.offset));
  if (isAdminUser() && state.scopeUserId) params.set("userId", state.scopeUserId);
  const data = await api(`/api/v1/forward-records?${params}`);
  state.records = data.records ?? [];
  state.recordTotal = data.total ?? 0;
}

async function loadRecordTotal() {
  try {
    const params = new URLSearchParams({ limit: "1", offset: "0" });
    if (isAdminUser() && state.scopeUserId) params.set("userId", state.scopeUserId);
    const data = await api(`/api/v1/forward-records?${params}`);
    state.recordTotal = data.total ?? 0;
  } catch {
    state.recordTotal = 0;
  }
}

async function refreshAll() {
  await loadHealth();
  if (state.apiKey) {
    await loadMe();
    await loadPromptSettings();
    await loadTenantUsers();
    await loadAccounts();
    await loadRules();
    await loadRecordTotal();
  }
}

// --- router ---

function getRoute() {
  const hash = location.hash.slice(1) || "/dashboard";
  return hash.startsWith("/") ? hash : "/" + hash;
}

async function render() {
  const app = document.getElementById("app");
  const route = getRoute();

  if (!state.apiKey && route !== "/login") {
    location.hash = "#/login";
    return;
  }

  if (route === "/login") {
    app.innerHTML = renderLogin();
    bindLogin();
    return;
  }

  try {
    await refreshAll();
  } catch (e) {
    toast(t("loadFailed", { msg: e.message }), "error");
    if (e.message.includes("401") || e.message.includes("无效") || e.message.includes("Invalid")) {
      state.apiKey = "";
      saveAuth();
      location.hash = "#/login";
      return render();
    }
  }

  switch (route) {
    case "/dashboard":
      app.innerHTML = renderDashboard();
      bindDashboard();
      break;
    case "/accounts":
      app.innerHTML = renderAccounts();
      bindAccounts();
      break;
    case "/rules":
      app.innerHTML = renderRules();
      bindRules();
      break;
    case "/records":
      await loadRecords();
      app.innerHTML = renderRecords();
      bindRecords();
      break;
    case "/settings":
      app.innerHTML = renderSettings();
      bindSettings();
      break;
    default:
      location.hash = "#/dashboard";
  }
}

window.addEventListener("hashchange", () => render());

if (state.apiKey) {
  location.hash = location.hash || "#/dashboard";
} else {
  location.hash = "#/login";
}
render();
