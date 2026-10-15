"use strict";

/* =====================================================
   BAYA ACCOUNT PORTAL
   Complete Frontend Application
   Backend: Replit Express + SQLite
===================================================== */

const API_BASE =
  "https://3d99bc2a-0e4d-4ed2-a3f3-3addcd0ab3e5-00-26nk7afdzfjn7.sisko.replit.dev";

const API = {
  status: "/api/status",
  config: "/api/config",
  csrf: "/api/csrf",
  session: "/api/session",

  register: "/api/auth/register",
  login: "/api/auth/login",
  adminLogin: "/api/admin/login",
  logout: "/api/auth/logout",

  me: "/api/me",
  profile: "/api/profile",

  requests: "/api/requests",
  transactions: "/api/transactions",

  deposit: "/api/requests/deposit",
  withdrawal: "/api/requests/withdrawal",
  investments: "/api/investments",

  adminOverview: "/api/admin/overview",
  adminUsers: "/api/admin/users",
  adminRequests: "/api/admin/requests",
  adminTransactions: "/api/admin/transactions",
  adminAudit: "/api/admin/audit",
  adminPlans: "/api/admin/plans"
};

const state = {
  user: null,
  csrfToken: "",
  config: {},
  requests: [],
  transactions: [],
  currentPage: "dashboard",
  adminType: "deposit"
};

const root = document.getElementById("root");
const toastElement = document.getElementById("toast");

/* =====================================================
   HELPERS
===================================================== */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function notify(message, type = "info") {
  if (!toastElement) {
    alert(message);
    return;
  }

  toastElement.textContent = message;
  toastElement.className = "toast show";

  if (type === "success") {
    toastElement.classList.add("success");
  }

  if (type === "error") {
    toastElement.classList.add("error");
  }

  clearTimeout(notify.timer);

  notify.timer = setTimeout(() => {
    toastElement.className = "toast";
  }, 3500);
}

function showError(elementId, message) {
  const element = document.getElementById(elementId);

  if (!element) {
    notify(message, "error");
    return;
  }

  element.textContent = message;
  element.classList.remove("hidden");
}

function hideError(elementId) {
  const element = document.getElementById(elementId);

  if (element) {
    element.textContent = "";
    element.classList.add("hidden");
  }
}

function setLoading(button, loading, defaultText) {
  if (!button) return;

  if (loading) {
    if (!button.dataset.originalText) {
      button.dataset.originalText =
        button.textContent || defaultText || "Submit";
    }

    button.disabled = true;
    button.textContent = "Please wait...";
  } else {
    button.disabled = false;
    button.textContent =
      button.dataset.originalText || defaultText || "Submit";

    delete button.dataset.originalText;
  }
}

function apiURL(path) {
  return API_BASE + path;
}

function getUserName() {
  return (
    state.user?.name ||
    state.user?.full_name ||
    state.user?.email ||
    state.user?.username ||
    "User"
  );
}

function getBalance() {
  return Number(state.user?.balance ?? 0);
}

function isAdmin() {
  return state.user?.role === "admin";
}

function getErrorMessage(data, fallback = "Something went wrong.") {
  return data?.error || data?.message || fallback;
}

/* =====================================================
   API + SESSION + CSRF
===================================================== */

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();

  return text ? { message: text } : {};
}

async function loadCsrfToken() {
  const response = await fetch(apiURL(API.csrf), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, "Could not obtain security token.")
    );
  }

  state.csrfToken = data.csrfToken || "";

  return state.csrfToken;
}

async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  const requestOptions = {
    method,
    credentials: "include",
    headers
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(options.body);
  }

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (!state.csrfToken) {
      await loadCsrfToken();
    }

    headers["x-csrf-token"] = state.csrfToken;
  }

  let response;

  try {
    response = await fetch(apiURL(path), requestOptions);
  } catch (error) {
    throw new Error(
      "Replit server se connection nahi ho saka. CORS aur server status check karein."
    );
  }

  const data = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, `Request failed (${response.status}).`)
    );
  }

  return data;
}

/*
  The backend /api/me endpoint returns:
  {
    user: {...},
    balance: 0,
    invested: 0,
    pendingCount: 0,
    referrals: 0
  }
*/

async function refreshCurrentUser() {
  const data = await apiRequest(API.me);

  state.user = {
    ...(data.user || {}),
    balance: Number(data.balance ?? 0),
    invested: Number(data.invested ?? 0),
    pendingCount: Number(data.pendingCount ?? 0),
    referrals: Number(data.referrals ?? 0)
  };

  return state.user;
}

async function loadConfiguration() {
  state.config = await apiRequest(API.config);
}

/* =====================================================
   START APPLICATION
===================================================== */

async function startApp() {
  if (!root) return;

  renderLoading();

  try {
    await loadCsrfToken();

    let sessionData;

    try {
      sessionData = await apiRequest(API.session);
    } catch (error) {
      sessionData = { authenticated: false };
    }

    if (
      sessionData.authenticated &&
      sessionData.role === "admin"
    ) {
      state.user = {
        role: "admin",
        username: sessionData.name,
        name: sessionData.name
      };

      await loadConfiguration();
      renderDashboard();
      return;
    }

    if (
      sessionData.authenticated &&
      sessionData.role === "user"
    ) {
      await refreshCurrentUser();
      await loadConfiguration();

      renderDashboard();
      return;
    }

    state.user = null;

    try {
      await loadConfiguration();
    } catch (error) {
      console.warn("Configuration unavailable:", error.message);
    }

    renderLogin();
  } catch (error) {
    renderConnectionError(error.message);
  }
}

function renderLoading() {
  root.innerHTML = `
    <section class="loading-screen">
      <div class="loading-brand">BAYA</div>
      <div class="loading-spinner"></div>
      <p>Loading your account...</p>
    </section>
  `;
}

function renderConnectionError(message) {
  root.innerHTML = `
    <section class="auth-page">
      <div class="auth-container">
        <div class="auth-card text-center">

          <div class="auth-brand">
            <div class="brand-mark">B</div>
            <h1>BAYA</h1>
          </div>

          <h2 class="auth-heading">Connection Problem</h2>

          <p class="auth-description">
            Unable to connect to the application server.
          </p>

          <div class="alert alert-error">
            ${escapeHTML(message)}
          </div>

          <button class="btn btn-primary btn-block" id="retryButton">
            Try Again
          </button>

        </div>
      </div>
    </section>
  `;

  document.getElementById("retryButton")
    .addEventListener("click", startApp);
}

/* =====================================================
   LOGIN
===================================================== */

function renderLogin() {
  root.innerHTML = `
    <section class="auth-page">
      <div class="auth-container">
        <div class="auth-card">

          <div class="auth-brand">
            <div class="brand-mark">B</div>
            <h1>BAYA</h1>
          </div>

          <h2 class="auth-heading">Welcome Back</h2>

          <p class="auth-description">
            Sign in to your BAYA account.
          </p>

          <form id="loginForm" class="form">

            <div class="form-group">
              <label for="loginEmail">Email Address</label>

              <input
                class="form-control"
                id="loginEmail"
                name="email"
                type="email"
                required
                autocomplete="username"
                placeholder="Enter your email"
              >
            </div>

            <div class="form-group">
              <label for="loginPassword">Password</label>

              <input
                class="form-control"
                id="loginPassword"
                name="password"
                type="password"
                required
                autocomplete="current-password"
                placeholder="Enter your password"
              >
            </div>

            <div id="loginError" class="alert alert-error hidden"></div>

            <button
              class="btn btn-primary btn-block"
              id="loginButton"
              type="submit"
            >
              Sign In
            </button>

          </form>

          <div class="auth-switch">
            Don't have an account?
            <a href="#" id="registerLink">Create Account</a>
          </div>

          <div class="auth-switch">
            <a href="#" id="adminLink">Administrator Login</a>
          </div>

        </div>
      </div>
    </section>
  `;

  document.getElementById("loginForm")
    .addEventListener("submit", handleLogin);

  document.getElementById("registerLink")
    .addEventListener("click", event => {
      event.preventDefault();
      renderRegister();
    });

  document.getElementById("adminLink")
    .addEventListener("click", event => {
      event.preventDefault();
      renderAdminLogin();
    });
}

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("loginButton");

  hideError("loginError");
  setLoading(button, true, "Sign In");

  try {
    await apiRequest(API.login, {
      method: "POST",
      body: {
        email: form.email.value.trim(),
        password: form.password.value
      }
    });

    /*
      The backend login response does not include the user object.
      Fetch the actual profile and balance after login.
    */
    await loadCsrfToken();
    await refreshCurrentUser();
    await loadConfiguration();

    notify("Login successful.", "success");
    renderDashboard();
  } catch (error) {
    showError("loginError", error.message);
  } finally {
    setLoading(button, false, "Sign In");
  }
}

/* =====================================================
   REGISTRATION
===================================================== */

function renderRegister() {
  root.innerHTML = `
    <section class="auth-page">
      <div class="auth-container">
        <div class="auth-card">

          <div class="auth-brand">
            <div class="brand-mark">B</div>
            <h1>BAYA</h1>
          </div>

          <h2 class="auth-heading">Create Account</h2>

          <p class="auth-description">
            Register for your BAYA account.
          </p>

          <form id="registerForm" class="form">

            <div class="form-group">
              <label for="registerName">Full Name</label>

              <input
                class="form-control"
                id="registerName"
                name="name"
                type="text"
                minlength="2"
                maxlength="70"
                required
                autocomplete="name"
              >
            </div>

            <div class="form-group">
              <label for="registerEmail">Email Address</label>

              <input
                class="form-control"
                id="registerEmail"
                name="email"
                type="email"
                maxlength="254"
                required
                autocomplete="email"
              >
            </div>

            <div class="form-group">
              <label for="registerReferral">Referral Code (Optional)</label>

              <input
                class="form-control"
                id="registerReferral"
                name="referralCode"
                type="text"
                maxlength="30"
                value="${escapeHTML(new URLSearchParams(location.search).get("ref") || "")}"
              >
            </div>

            <div class="form-group">
              <label for="registerPassword">Password</label>

              <input
                class="form-control"
                id="registerPassword"
                name="password"
                type="password"
                minlength="10"
                maxlength="72"
                required
                autocomplete="new-password"
              >

              <span class="form-help">
                Use at least 10 characters.
              </span>
            </div>

            <div class="form-group">
              <label for="registerConfirm">Confirm Password</label>

              <input
                class="form-control"
                id="registerConfirm"
                name="confirmPassword"
                type="password"
                minlength="10"
                maxlength="72"
                required
                autocomplete="new-password"
              >
            </div>

            <div id="registerError" class="alert alert-error hidden"></div>

            <button
              class="btn btn-primary btn-block"
              id="registerButton"
              type="submit"
            >
              Create Account
            </button>

          </form>

          <div class="auth-switch">
            Already registered?
            <a href="#" id="loginLink">Sign In</a>
          </div>

        </div>
      </div>
    </section>
  `;

  document.getElementById("registerForm")
    .addEventListener("submit", handleRegister);

  document.getElementById("loginLink")
    .addEventListener("click", event => {
      event.preventDefault();
      renderLogin();
    });
}

async function handleRegister(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("registerButton");

  hideError("registerError");

  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;
  const referralCode = form.referralCode.value.trim();

  if (password.length < 10) {
    showError(
      "registerError",
      "Password must be at least 10 characters."
    );
    return;
  }

  if (password !== confirmPassword) {
    showError("registerError", "Passwords do not match.");
    return;
  }

  setLoading(button, true, "Create Account");

  try {
    await apiRequest(API.register, {
      method: "POST",
      body: {
        name,
        email,
        password,
        referralCode
      }
    });

    /*
      Registration automatically creates a user session.
      Refresh CSRF and profile data for the new session.
    */
    await loadCsrfToken();
    await refreshCurrentUser();
    await loadConfiguration();

    notify("Account created successfully.", "success");
    renderDashboard();
  } catch (error) {
    showError("registerError", error.message);
  } finally {
    setLoading(button, false, "Create Account");
  }
}

/* =====================================================
   ADMIN LOGIN
===================================================== */

function renderAdminLogin() {
  root.innerHTML = `
    <section class="auth-page">
      <div class="auth-container">
        <div class="auth-card">

          <div class="auth-brand">
            <div class="brand-mark">B</div>
            <h1>BAYA</h1>
          </div>

          <h2 class="auth-heading">Administrator Login</h2>

          <p class="auth-description">
            Sign in with your configured administrator credentials.
          </p>

          <form id="adminLoginForm" class="form">

            <div class="form-group">
              <label for="adminUsername">Administrator Username</label>

              <input
                class="form-control"
                id="adminUsername"
                name="username"
                type="text"
                required
                autocomplete="username"
              >
            </div>

            <div class="form-group">
              <label for="adminPassword">Password</label>

              <input
                class="form-control"
                id="adminPassword"
                name="password"
                type="password"
                required
                autocomplete="current-password"
              >
            </div>

            <div id="adminLoginError" class="alert alert-error hidden"></div>

            <button
              class="btn btn-primary btn-block"
              id="adminLoginButton"
              type="submit"
            >
              Administrator Sign In
            </button>

          </form>

          <div class="auth-switch">
            <a href="#" id="backToLogin">Back to User Login</a>
          </div>

        </div>
      </div>
    </section>
  `;

  document.getElementById("adminLoginForm")
    .addEventListener("submit", handleAdminLogin);

  document.getElementById("backToLogin")
    .addEventListener("click", event => {
      event.preventDefault();
      renderLogin();
    });
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("adminLoginButton");

  hideError("adminLoginError");
  setLoading(button, true, "Administrator Sign In");

  try {
    await apiRequest(API.adminLogin, {
      method: "POST",
      body: {
        username: form.username.value.trim(),
        password: form.password.value
      }
    });

    await loadCsrfToken();

    const sessionData = await apiRequest(API.session);

    if (
      !sessionData.authenticated ||
      sessionData.role !== "admin"
    ) {
      throw new Error(
        "The server did not confirm administrator access."
      );
    }

    state.user = {
      role: "admin",
      username: sessionData.name,
      name: sessionData.name
    };

    await loadConfiguration();

    notify("Administrator login successful.", "success");
    renderDashboard();
  } catch (error) {
    showError("adminLoginError", error.message);
  } finally {
    setLoading(button, false, "Administrator Sign In");
  }
}

/* =====================================================
   MAIN DASHBOARD LAYOUT
===================================================== */

function renderDashboard() {
  if (!state.user) {
    renderLogin();
    return;
  }

  root.innerHTML = `
    <div class="app-layout">

      <div class="overlay" id="sidebarOverlay"></div>

      <aside class="sidebar" id="sidebar">

        <div class="brand">
          <span class="brand-mark">B</span>
          <span>BAYA</span>
        </div>

        <nav class="sidebar-nav" id="sidebarNav">

          <button type="button" data-page="dashboard">
            ▦ &nbsp; Dashboard
          </button>

          ${
            !isAdmin()
              ? `
                <button type="button" data-page="deposit">
                  ↓ &nbsp; Deposit Request
                </button>

                <button type="button" data-page="withdrawal">
                  ↑ &nbsp; Withdrawal
                </button>

                <button type="button" data-page="investments">
                  ◈ &nbsp; Investment Plans
                </button>

                <button type="button" data-page="transactions">
                  ⇄ &nbsp; Transactions
                </button>

                <button type="button" data-page="profile">
                  ♙ &nbsp; My Profile
                </button>
              `
              : `
                <button type="button" data-page="admin">
                  ⚙ &nbsp; Admin Panel
                </button>

                <button type="button" data-page="adminUsers">
                  ♙ &nbsp; Users
                </button>

                <button type="button" data-page="adminTransactions">
                  ⇄ &nbsp; All Transactions
                </button>

                <button type="button" data-page="adminPlans">
                  ◈ &nbsp; Manage Plans
                </button>

                <button type="button" data-page="adminAudit">
                  ▤ &nbsp; Audit Log
                </button>
              `
          }

          <button type="button" id="logoutButton">
            ↪ &nbsp; Logout
          </button>

        </nav>

        <div class="sidebar-footer">
          BAYA Account Portal
        </div>

      </aside>

      <section class="main-content">

        <header class="topbar">

          <div style="display:flex;align-items:center;gap:12px;">

            <button
              class="mobile-menu-button"
              id="mobileMenuButton"
              type="button"
              aria-label="Open menu"
            >☰</button>

            <div>
              <h1 class="page-title" id="pageTitle">Dashboard</h1>
              <p class="page-subtitle">
                Welcome to your BAYA account.
              </p>
            </div>

          </div>

          <div class="user-menu">

            <div class="user-avatar">
              ${escapeHTML(getUserName().charAt(0).toUpperCase())}
            </div>

            <div class="user-name">
              <strong>${escapeHTML(getUserName())}</strong>

              <div class="text-muted">
                ${isAdmin() ? "Administrator" : "Account User"}
              </div>
            </div>

          </div>

        </header>

        <div id="pageContent">
          <div class="card">Loading...</div>
        </div>

      </section>

    </div>
  `;

  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
      openPage(button.dataset.page);
    });
  });

  document.getElementById("logoutButton")
    .addEventListener("click", handleLogout);

  document.getElementById("mobileMenuButton")
    .addEventListener("click", () => {
      document.getElementById("sidebar").classList.add("open");
      document.getElementById("sidebarOverlay").classList.add("show");
    });

  document.getElementById("sidebarOverlay")
    .addEventListener("click", closeSidebar);

  openPage("dashboard");
}

function closeSidebar() {
  document.getElementById("sidebar")?.classList.remove("open");
  document.getElementById("sidebarOverlay")?.classList.remove("show");
}

async function openPage(page) {
  if (!state.user) {
    renderLogin();
    return;
  }

  const adminPages = [
    "admin",
    "adminUsers",
    "adminTransactions",
    "adminPlans",
    "adminAudit"
  ];

  if (adminPages.includes(page) && !isAdmin()) {
    notify("Administrator access required.", "error");
    return;
  }

  state.currentPage = page;
  closeSidebar();

  const titles = {
    dashboard: "Dashboard",
    deposit: "Deposit Request",
    withdrawal: "Withdrawal",
    investments: "Investment Plans",
    transactions: "Transactions",
    profile: "My Profile",
    admin: "Admin Panel",
    adminUsers: "Users",
    adminTransactions: "All Transactions",
    adminPlans: "Manage Plans",
    adminAudit: "Audit Log"
  };

  document.getElementById("pageTitle").textContent =
    titles[page] || "Dashboard";

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  const content = document.getElementById("pageContent");
  content.innerHTML = `<div class="card">Loading...</div>`;

  const pages = {
    dashboard: renderDashboardHome,
    deposit: renderDepositPage,
    withdrawal: renderWithdrawalPage,
    investments: renderInvestmentsPage,
    transactions: renderTransactionsPage,
    profile: renderProfilePage,
    admin: renderAdminPage,
    adminUsers: renderAdminUsersPage,
    adminTransactions: renderAdminTransactionsPage,
    adminPlans: renderAdminPlansPage,
    adminAudit: renderAdminAuditPage
  };

  try {
    await pages[page]();
  } catch (error) {
    content.innerHTML = `
      <div class="card">
        <div class="alert alert-error">
          ${escapeHTML(error.message)}
        </div>

        <button class="btn btn-primary" id="retryPage">
          Try Again
        </button>
      </div>
    `;

    document.getElementById("retryPage")
      ?.addEventListener("click", () => openPage(page));
  }
}

/* =====================================================
   USER DASHBOARD
===================================================== */

async function renderDashboardHome() {
  const content = document.getElementById("pageContent");

  let requests = [];
  let transactions = [];

  if (!isAdmin()) {
    const results = await Promise.allSettled([
      apiRequest(API.requests),
      apiRequest(API.transactions)
    ]);

    if (results[0].status === "fulfilled") {
      requests = results[0].value.requests || [];
    }

    if (results[1].status === "fulfilled") {
      transactions = results[1].value.transactions || [];
    }
  } else {
    const overview = await apiRequest(API.adminOverview);

    content.innerHTML = `
      <div class="grid">

        <div class="card">
          <div class="stat-label">Registered Users</div>
          <div class="stat-value">${Number(overview.users || 0)}</div>
        </div>

        <div class="card">
          <div class="stat-label">Pending Deposits</div>
          <div class="stat-value">${Number(overview.pendingDeposits || 0)}</div>
        </div>

        <div class="card">
          <div class="stat-label">Pending Withdrawals</div>
          <div class="stat-value">${Number(overview.pendingWithdrawals || 0)}</div>
        </div>

        <div class="card">
          <div class="stat-label">Pending Investments</div>
          <div class="stat-value">${Number(overview.pendingInvestments || 0)}</div>
        </div>

      </div>

      <div class="card mt-3">
        <h2 class="card-title">Administration</h2>

        <p class="text-muted">
          Review requests and account records using the admin menu.
        </p>

        <button class="btn btn-primary" id="openAdmin">
          Open Admin Panel
        </button>
      </div>
    `;

    document.getElementById("openAdmin")
      .addEventListener("click", () => openPage("admin"));

    return;
  }

  state.requests = requests;
  state.transactions = transactions;

  content.innerHTML = `
    <div class="grid">

      <div class="card">
        <div class="stat-label">Account Balance</div>
        <div class="stat-value">${money(getBalance())} USDT</div>
        <div class="stat-note">Balance reported by the server</div>
      </div>

      <div class="card">
        <div class="stat-label">Pending Requests</div>
        <div class="stat-value">${Number(state.user.pendingCount || 0)}</div>
        <div class="stat-note">Requests awaiting review</div>
      </div>

      <div class="card">
        <div class="stat-label">Approved Allocations</div>
        <div class="stat-value">${money(state.user.invested)} USDT</div>
        <div class="stat-note">Server-reported allocations</div>
      </div>

      <div class="card">
        <div class="stat-label">Referrals</div>
        <div class="stat-value">${Number(state.user.referrals || 0)}</div>
        <div class="stat-note">Registered referrals</div>
      </div>

    </div>

    <div class="grid-2 mt-3">

      <div class="card">
        <h2 class="card-title">Deposit</h2>

        <p class="text-muted">
          Submit your transaction ID for manual review.
        </p>

        <button class="btn btn-primary" id="goDeposit">
          Deposit Request
        </button>
      </div>

      <div class="card">
        <h2 class="card-title">Withdrawal</h2>

        <p class="text-muted">
          Submit a withdrawal request for review.
        </p>

        <button class="btn btn-secondary" id="goWithdrawal">
          Withdrawal Request
        </button>
      </div>

    </div>

    <div class="card mt-3">
      <h2 class="card-title">Recent Transactions</h2>
      ${renderTransactionTable(transactions.slice(0, 5))}
    </div>

    <div class="alert alert-info mt-3">
      Financial requests require review. Investment returns are not guaranteed.
    </div>
  `;

  document.getElementById("goDeposit")
    .addEventListener("click", () => openPage("deposit"));

  document.getElementById("goWithdrawal")
    .addEventListener("click", () => openPage("withdrawal"));
}

/* =====================================================
   DEPOSIT
===================================================== */

function renderDepositPage() {
  const content = document.getElementById("pageContent");

  const address =
    state.config.depositAddress ||
    "";

  content.innerHTML = `
    <div class="grid-2">

      <div class="card">
        <h2 class="card-title">Deposit Request</h2>

        <div class="alert alert-info">
          Submit the exact transaction hash for administrator review.
          Your balance will not change until the deposit is approved.
        </div>

        <form id="depositForm" class="form">

          <div class="form-group">
            <label for="depositAmount">Amount (USDT)</label>

            <input
              class="form-control"
              id="depositAmount"
              name="amount"
              type="number"
              min="0.000001"
              max="1000000000"
              step="0.000001"
              required
            >
          </div>

          <div class="form-group">
            <label>Network</label>
            <input class="form-control" value="TRON (TRC20)" readonly>
          </div>

          <div class="form-group">
            <label for="depositTxid">Transaction ID (TXID)</label>

            <input
              class="form-control"
              id="depositTxid"
              name="txid"
              type="text"
              minlength="64"
              maxlength="64"
              pattern="[a-fA-F0-9]{64}"
              required
              placeholder="64-character transaction hash"
            >
          </div>

          <button class="btn btn-primary btn-block"
                  id="depositButton"
                  type="submit">
            Submit Deposit Request
          </button>

        </form>
      </div>

      <div class="card">
        <h2 class="card-title">Deposit Address</h2>

        ${
          address
            ? `
              <div class="form-group">
                <label>Configured TRC20 Address</label>

                <textarea id="depositAddress" readonly>${escapeHTML(address)}</textarea>

                <button class="btn btn-secondary" id="copyAddress" type="button">
                  Copy Address
                </button>
              </div>
            `
            : `
              <div class="alert alert-error">
                Deposit address is not configured on the server.
                Do not send funds until the administrator confirms it.
              </div>
            `
        }
      </div>

    </div>
  `;

  document.getElementById("depositForm")
    .addEventListener("submit", handleDeposit);

  document.getElementById("copyAddress")
    ?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(address);
        notify("Address copied.", "success");
      } catch (error) {
        notify("Please copy the address manually.", "error");
      }
    });
}

async function handleDeposit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("depositButton");

  const amount = Number(form.amount.value);
  const txid = form.txid.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    notify("Enter a valid amount.", "error");
    return;
  }

  if (!/^[a-fA-F0-9]{64}$/.test(txid)) {
    notify("Enter a valid 64-character transaction ID.", "error");
    return;
  }

  setLoading(button, true, "Submit Deposit Request");

  try {
    await apiRequest(API.deposit, {
      method: "POST",
      body: {
        amount,
        txid: txid.toLowerCase()
      }
    });

    notify("Deposit request submitted for review.", "success");
    await openPage("dashboard");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setLoading(button, false, "Submit Deposit Request");
  }
}

/* =====================================================
   WITHDRAWAL
===================================================== */

function renderWithdrawalPage() {
  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="card">

      <h2 class="card-title">Withdrawal Request</h2>

      <p class="text-muted">
        Available balance: ${money(getBalance())} USDT
      </p>

      <form id="withdrawalForm" class="form">

        <div class="form-group">
          <label for="withdrawalAmount">Amount (USDT)</label>

          <input
            class="form-control"
            id="withdrawalAmount"
            name="amount"
            type="number"
            min="0.000001"
            max="1000000000"
            step="0.000001"
            required
          >
        </div>

        <div class="form-group">
          <label>Network</label>
          <input class="form-control" value="TRON (TRC20)" readonly>
        </div>

        <div class="form-group">
          <label for="withdrawalWallet">Receiving TRC20 Wallet</label>

          <input
            class="form-control"
            id="withdrawalWallet"
            name="wallet"
            type="text"
            minlength="26"
            maxlength="41"
            required
            placeholder="Enter your TRON wallet address"
          >
        </div>

        <button class="btn btn-primary"
                id="withdrawalButton"
                type="submit">
          Submit Withdrawal Request
        </button>

      </form>

    </div>
  `;

  document.getElementById("withdrawalForm")
    .addEventListener("submit", handleWithdrawal);
}

async function handleWithdrawal(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("withdrawalButton");

  const amount = Number(form.amount.value);
  const wallet = form.wallet.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    notify("Enter a valid amount.", "error");
    return;
  }

  if (!/^T[1-9A-HJ-NP-Za-km-z]{25,40}$/.test(wallet)) {
    notify("Enter a valid TRON wallet address.", "error");
    return;
  }

  setLoading(button, true, "Submit Withdrawal Request");

  try {
    await apiRequest(API.withdrawal, {
      method: "POST",
      body: {
        amount,
        wallet
      }
    });

    notify("Withdrawal request submitted for review.", "success");
    await openPage("dashboard");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setLoading(button, false, "Submit Withdrawal Request");
  }
}

/* =====================================================
   INVESTMENT PLANS
===================================================== */

async function renderInvestmentsPage() {
  const content = document.getElementById("pageContent");

  const plans = state.config.plans || [];

  if (!plans.length) {
    content.innerHTML = `
      <div class="card">
        <h2 class="card-title">Investment Plans</h2>

        <div class="empty-state">
          <h3>No plans available</h3>
          <p>The server has not returned any active plans.</p>
        </div>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="grid">

      ${plans.map(plan => `
        <div class="card">

          <h2 class="card-title">
            ${escapeHTML(plan.title)}
          </h2>

          <p class="text-muted">
            ${escapeHTML(plan.description)}
          </p>

          <div class="stat-label">Minimum Amount</div>

          <div class="stat-value">
            ${money(plan.minimumAmount)} USDT
          </div>

          <div class="stat-label mt-2">Maximum Amount</div>

          <div>
            ${
              plan.maximumAmount === null
                ? "No configured maximum"
                : money(plan.maximumAmount) + " USDT"
            }
          </div>

          <div class="form-group mt-2">
            <label for="amount-${escapeHTML(plan.key)}">Request Amount</label>

            <input
              class="form-control"
              type="number"
              min="${Number(plan.minimumAmount)}"
              ${
                plan.maximumAmount === null
                  ? ""
                  : `max="${Number(plan.maximumAmount)}"`
              }
              step="0.000001"
              id="amount-${escapeHTML(plan.key)}"
            >
          </div>

          <div class="form-group mt-2">
            <label for="duration-${escapeHTML(plan.key)}">Duration</label>

            <select class="form-control"
                    id="duration-${escapeHTML(plan.key)}">
              ${(plan.durations || []).map(day => `
                <option value="${Number(day)}">
                  ${Number(day)} days
                </option>
              `).join("")}
            </select>
          </div>

          <button
            class="btn btn-primary btn-block mt-2"
            data-invest-plan="${escapeHTML(plan.key)}"
            type="button"
          >
            Submit Plan Request
          </button>

        </div>
      `).join("")}

    </div>

    <div class="alert alert-info mt-3">
      Requests are subject to review. Returns are not guaranteed.
    </div>
  `;

  content.querySelectorAll("[data-invest-plan]").forEach(button => {
    button.addEventListener("click", async () => {
      const key = button.dataset.investPlan;
      const amount = Number(
        document.getElementById(`amount-${key}`).value
      );
      const durationDays = Number(
        document.getElementById(`duration-${key}`).value
      );

      const plan = plans.find(item => item.key === key);

      if (!plan || !Number.isFinite(amount) || amount <= 0) {
        notify("Enter a valid plan amount.", "error");
        return;
      }

      if (
        amount < Number(plan.minimumAmount) ||
        (
          plan.maximumAmount !== null &&
          amount > Number(plan.maximumAmount)
        )
      ) {
        notify("Amount is outside this plan's range.", "error");
        return;
      }

      setLoading(button, true, "Submit Plan Request");

      try {
        await apiRequest(API.investments, {
          method: "POST",
          body: {
            planKey: key,
            amount,
            durationDays
          }
        });

        notify("Plan request submitted for review.", "success");
        await openPage("dashboard");
      } catch (error) {
        notify(error.message, "error");
      } finally {
        setLoading(button, false, "Submit Plan Request");
      }
    });
  });
}

/* =====================================================
   TRANSACTION TABLE
===================================================== */

function renderStatusBadge(status) {
  const value = String(status || "pending").toLowerCase();

  let badgeClass = "badge-pending";

  if (
    ["approved", "completed", "paid", "success"].includes(value)
  ) {
    badgeClass = "badge-success";
  } else if (
    ["rejected", "failed", "cancelled"].includes(value)
  ) {
    badgeClass = "badge-danger";
  } else if (value === "processing") {
    badgeClass = "badge-info";
  }

  return `
    <span class="badge ${badgeClass}">
      ${escapeHTML(status || "Pending")}
    </span>
  `;
}

function renderTransactionTable(transactions) {
  if (!transactions || transactions.length === 0) {
    return `
      <div class="empty-state">
        <h3>No transactions found</h3>
        <p>Transactions will appear here when available.</p>
      </div>
    `;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Type</th>
            <th>Amount</th>
            <th>Description</th>
            <th>Date</th>
          </tr>
        </thead>

        <tbody>
          ${transactions.map(item => `
            <tr>
              <td>${escapeHTML(item.id)}</td>
              <td>${escapeHTML(item.type)}</td>
              <td>${money(item.amount)} USDT</td>
              <td>${escapeHTML(item.description || "-")}</td>
              <td>${escapeHTML(item.createdAt || "-")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function renderTransactionsPage() {
  const content = document.getElementById("pageContent");

  const data = await apiRequest(API.transactions);

  state.transactions = data.transactions || [];

  content.innerHTML = `
    <div class="card">
      <h2 class="card-title">Transaction History</h2>
      ${renderTransactionTable(state.transactions)}
    </div>
  `;
}

/* =====================================================
   PROFILE
===================================================== */

function renderProfilePage() {
  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="card">

      <h2 class="card-title">My Profile</h2>

      <form id="profileForm" class="form">

        <div class="form-group">
          <label for="profileName">Full Name</label>

          <input
            class="form-control"
            id="profileName"
            name="name"
            type="text"
            minlength="2"
            maxlength="70"
            required
            value="${escapeHTML(state.user.name || "")}"
          >
        </div>

        <div class="form-group">
          <label for="profileEmail">Email Address</label>

          <input
            class="form-control"
            id="profileEmail"
            type="email"
            readonly
            value="${escapeHTML(state.user.email || "")}"
          >
        </div>

        <div class="form-group">
          <label>Referral Code</label>

          <input
            class="form-control"
            readonly
            value="${escapeHTML(state.user.referral_code || "")}"
          >
        </div>

        <button class="btn btn-primary"
                id="profileButton"
                type="submit">
          Save Profile
        </button>

      </form>

    </div>
  `;

  document.getElementById("profileForm")
    .addEventListener("submit", handleProfileUpdate);
}

async function handleProfileUpdate(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("profileButton");

  setLoading(button, true, "Save Profile");

  try {
    await apiRequest(API.profile, {
      method: "PATCH",
      body: {
        name: form.name.value.trim()
      }
    });

    await refreshCurrentUser();

    notify("Profile updated successfully.", "success");
    renderDashboard();
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setLoading(button, false, "Save Profile");
  }
}

/* =====================================================
   ADMIN: OVERVIEW + REQUEST MANAGEMENT
===================================================== */

async function renderAdminPage() {
  const content = document.getElementById("pageContent");

  const overview = await apiRequest(API.adminOverview);

  content.innerHTML = `
    <div class="grid">

      <div class="card">
        <div class="stat-label">Users</div>
        <div class="stat-value">${Number(overview.users || 0)}</div>
      </div>

      <div class="card">
        <div class="stat-label">Pending Deposits</div>
        <div class="stat-value">${Number(overview.pendingDeposits || 0)}</div>
      </div>

      <div class="card">
        <div class="stat-label">Pending Withdrawals</div>
        <div class="stat-value">${Number(overview.pendingWithdrawals || 0)}</div>
      </div>

      <div class="card">
        <div class="stat-label">Pending Investments</div>
        <div class="stat-value">${Number(overview.pendingInvestments || 0)}</div>
      </div>

    </div>

    <div class="card mt-3">

      <h2 class="card-title">Review Requests</h2>

      <div class="form-group">
        <label for="adminRequestType">Request Type</label>

        <select id="adminRequestType" class="form-control">
          <option value="deposit">Deposits</option>
          <option value="withdrawal">Withdrawals</option>
          <option value="investment">Investments</option>
        </select>
      </div>

      <button class="btn btn-primary mt-2" id="loadAdminRequests">
        Load Requests
      </button>

      <div id="adminRequestsTable" class="mt-3">
        Select a request type to load records.
      </div>

    </div>
  `;

  const typeSelect = document.getElementById("adminRequestType");

  document.getElementById("loadAdminRequests")
    .addEventListener("click", () => {
      loadAdminRequests(typeSelect.value);
    });

  await loadAdminRequests("deposit");
}

async function loadAdminRequests(type) {
  const container = document.getElementById("adminRequestsTable");

  if (!container) return;

  container.innerHTML = `<p class="text-muted">Loading requests...</p>`;

  try {
    const data = await apiRequest(
      `${API.adminRequests}?type=${encodeURIComponent(type)}`
    );

    const requests = data.requests || [];

    if (!requests.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No requests found</h3>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>User</th>
              <th>Amount</th>
              ${type === "investment" ? "<th>Plan</th><th>Duration</th>" : ""}
              ${type === "deposit" ? "<th>TXID</th>" : ""}
              ${type === "withdrawal" ? "<th>Wallet</th>" : ""}
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            ${requests.map(request => `
              <tr>
                <td>${escapeHTML(request.id)}</td>

                <td>
                  ${escapeHTML(request.userName || "")}<br>
                  <small>${escapeHTML(request.email || "")}</small>
                </td>

                <td>${money(request.amount)} USDT</td>

                ${
                  type === "investment"
                    ? `
                      <td>${escapeHTML(request.planTitle || "")}</td>
                      <td>${Number(request.durationDays || 0)} days</td>
                    `
                    : ""
                }

                ${
                  type === "deposit"
                    ? `<td>${escapeHTML(request.txid || "")}</td>`
                    : ""
                }

                ${
                  type === "withdrawal"
                    ? `<td>${escapeHTML(request.wallet || "")}</td>`
                    : ""
                }

                <td>${renderStatusBadge(request.status)}</td>

                <td>
                  ${
                    request.status === "pending"
                      ? `
                        <button class="btn btn-success btn-small"
                          data-action="approve"
                          data-id="${Number(request.id)}"
                          data-type="${type}">
                          Approve
                        </button>

                        <button class="btn btn-danger btn-small"
                          data-action="reject"
                          data-id="${Number(request.id)}"
                          data-type="${type}">
                          Reject
                        </button>
                      `
                      : type === "withdrawal" && request.status === "approved"
                        ? `
                          <button class="btn btn-primary btn-small"
                            data-action="paid"
                            data-id="${Number(request.id)}"
                            data-type="${type}">
                            Mark Paid
                          </button>
                        `
                        : "-"
                  }
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll("[data-action]").forEach(button => {
      button.addEventListener("click", async () => {
        const action = button.dataset.action;
        const id = Number(button.dataset.id);
        const requestType = button.dataset.type;

        const promptText = action === "approve"
          ? "Approve this request?"
          : action === "reject"
            ? "Reject this request?"
            : "Confirm that this withdrawal has actually been paid?";

        if (!confirm(promptText)) return;

        let note = "";

        if (action === "reject") {
          note = prompt("Optional rejection note:") || "";
        }

        setLoading(button, true, action);

        try {
          await apiRequest(`/api/admin/requests/${id}/action`, {
            method: "POST",
            body: {
              action,
              type: requestType,
              note
            }
          });

          notify("Request updated.", "success");
          await loadAdminRequests(requestType);
        } catch (error) {
          notify(error.message, "error");
          setLoading(button, false, action);
        }
      });
    });
  } catch (error) {
    container.innerHTML = `
      <div class="alert alert-error">
        ${escapeHTML(error.message)}
      </div>
    `;
  }
}

/* =====================================================
   ADMIN: USERS
===================================================== */

async function renderAdminUsersPage() {
  const content = document.getElementById("pageContent");

  const data = await apiRequest(API.adminUsers);
  const users = data.users || [];

  content.innerHTML = `
    <div class="card">

      <h2 class="card-title">Registered Users</h2>

      ${
        users.length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Balance</th>
                    <th>Referrals</th>
                    <th>Joined</th>
                  </tr>
                </thead>

                <tbody>
                  ${users.map(user => `
                    <tr>
                      <td>${Number(user.id)}</td>
                      <td>${escapeHTML(user.name)}</td>
                      <td>${escapeHTML(user.email)}</td>
                      <td>${money(user.balance)} USDT</td>
                      <td>${Number(user.referrals || 0)}</td>
                      <td>${escapeHTML(user.createdAt || "-")}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `
            <div class="empty-state">
              <h3>No users found</h3>
            </div>
          `
      }

    </div>
  `;
}

/* =====================================================
   ADMIN: TRANSACTIONS
===================================================== */

async function renderAdminTransactionsPage() {
  const content = document.getElementById("pageContent");

  const data = await apiRequest(API.adminTransactions);

  content.innerHTML = `
    <div class="card">
      <h2 class="card-title">All Transactions</h2>

      ${
        (data.transactions || []).length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Email</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Description</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  ${data.transactions.map(item => `
                    <tr>
                      <td>${Number(item.id)}</td>
                      <td>${escapeHTML(item.userName)}</td>
                      <td>${escapeHTML(item.email)}</td>
                      <td>${escapeHTML(item.type)}</td>
                      <td>${money(item.amount)} USDT</td>
                      <td>${escapeHTML(item.description)}</td>
                      <td>${escapeHTML(item.createdAt)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `<div class="empty-state">No transactions found.</div>`
      }
    </div>
  `;
}

/* =====================================================
   ADMIN: PLANS
===================================================== */

async function renderAdminPlansPage() {
  const content = document.getElementById("pageContent");

  const data = await apiRequest(API.adminPlans);
  const plans = data.plans || [];

  content.innerHTML = `
    <div class="card">

      <h2 class="card-title">Investment Plans</h2>

      <div class="alert alert-info">
        Update the existing plan terms carefully. Changes are saved on the server.
      </div>

      ${
        plans.map(plan => `
          <form class="form card mt-2"
                data-plan-form="${escapeHTML(plan.key)}">

            <h3>${escapeHTML(plan.title)}</h3>

            <div class="form-row">

              <div class="form-group">
                <label>Title</label>

                <input
                  class="form-control"
                  name="title"
                  maxlength="50"
                  required
                  value="${escapeHTML(plan.title)}"
                >
              </div>

              <div class="form-group">
                <label>Minimum Amount</label>

                <input
                  class="form-control"
                  name="minimumAmount"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  required
                  value="${Number(plan.minimumAmount)}"
                >
              </div>

            </div>

            <div class="form-row">

              <div class="form-group">
                <label>Maximum Amount (blank for no maximum)</label>

                <input
                  class="form-control"
                  name="maximumAmount"
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value="${plan.maximumAmount === null ? "" : Number(plan.maximumAmount)}"
                >
              </div>

              <div class="form-group">
                <label>Durations in Days (comma separated)</label>

                <input
                  class="form-control"
                  name="durations"
                  required
                  value="${escapeHTML((plan.durations || []).join(","))}"
                >
              </div>

            </div>

            <div class="form-group">
              <label>Description</label>

              <input
                class="form-control"
                name="description"
                maxlength="150"
                required
                value="${escapeHTML(plan.description)}"
              >
            </div>

            <button class="btn btn-primary" type="submit">
              Save ${escapeHTML(plan.title)}
            </button>

          </form>
        `).join("")
      }

    </div>
  `;

  content.querySelectorAll("[data-plan-form]").forEach(form => {
    form.addEventListener("submit", async event => {
      event.preventDefault();

      const key = form.dataset.planForm;
      const button = form.querySelector("button");

      const minimumAmount = Number(form.minimumAmount.value);
      const maximumRaw = form.maximumAmount.value.trim();

      const durations = form.durations.value
        .split(",")
        .map(value => Number(value.trim()))
        .filter(value => Number.isInteger(value));

      if (!Number.isFinite(minimumAmount) || minimumAmount <= 0) {
        notify("Enter a valid minimum amount.", "error");
        return;
      }

      setLoading(button, true, "Save Plan");

      try {
        await apiRequest(`/api/admin/plans/${encodeURIComponent(key)}`, {
          method: "PATCH",
          body: {
            title: form.title.value.trim(),
            minimumAmount,
            maximumAmount: maximumRaw === "" ? null : Number(maximumRaw),
            durations,
            description: form.description.value.trim()
          }
        });

        await loadConfiguration();

        notify("Plan updated successfully.", "success");
      } catch (error) {
        notify(error.message, "error");
      } finally {
        setLoading(button, false, "Save Plan");
      }
    });
  });
}

/* =====================================================
   ADMIN: AUDIT LOG
===================================================== */

async function renderAdminAuditPage() {
  const content = document.getElementById("pageContent");

  const data = await apiRequest(API.adminAudit);
  const events = data.events || [];

  content.innerHTML = `
    <div class="card">

      <h2 class="card-title">Audit Log</h2>

      ${
        events.length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Entity ID</th>
                    <th>Previous Status</th>
                    <th>New Status</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  ${events.map(item => `
                    <tr>
                      <td>${Number(item.id)}</td>
                      <td>${escapeHTML(item.actor)}</td>
                      <td>${escapeHTML(item.action)}</td>
                      <td>${escapeHTML(item.entityType)}</td>
                      <td>${escapeHTML(item.entityId ?? "-")}</td>
                      <td>${escapeHTML(item.previousStatus || "-")}</td>
                      <td>${escapeHTML(item.newStatus || "-")}</td>
                      <td>${escapeHTML(item.createdAt)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `<div class="empty-state">No audit events found.</div>`
      }

    </div>
  `;
}

/* =====================================================
   LOGOUT
===================================================== */

async function handleLogout() {
  if (!confirm("Are you sure you want to log out?")) return;

  try {
    await apiRequest(API.logout, {
      method: "POST",
      body: {}
    });
  } catch (error) {
    console.warn("Logout request failed:", error.message);
  }

  state.user = null;
  state.csrfToken = "";
  state.requests = [];
  state.transactions = [];

  renderLogin();
}

/* =====================================================
   INITIALIZE
===================================================== */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startApp);
} else {
  startApp();
}
