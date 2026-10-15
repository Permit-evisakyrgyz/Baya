"use strict";

/* ==========================================
   BAYA ACCOUNT PORTAL
   Frontend Application
========================================== */

/*
  Replit backend URL.
  Do not add a trailing slash.
*/
const API_BASE =
  "https://3d99bc2a-0e4d-4ed2-a3f3-3addcd0ab3e5-00-26nk7afdzfjn7.sisko.replit.dev";

/*
  API routes matching the supplied server.js.
*/
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
  investments: "/api/investments"
};

const state = {
  user: null,
  csrfToken: "",
  config: {},
  currentPage: "dashboard",
  loading: false,
  requests: [],
  transactions: []
};

const root = document.getElementById("root");
const toastElement = document.getElementById("toast");

/* ==========================================
   GENERAL HELPERS
========================================== */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}

function money(value) {
  const number = Number(value || 0);

  return number.toLocaleString("en-US", {
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

function setLoading(button, loading, originalText = "") {
  if (!button) return;

  if (loading) {
    button.dataset.originalText =
      button.textContent || originalText;

    button.disabled = true;
    button.textContent = "Please wait...";
  } else {
    button.disabled = false;

    button.textContent =
      button.dataset.originalText || originalText || "Submit";
  }
}

function getErrorMessage(data, fallback) {
  if (!data) return fallback;

  return (
    data.message ||
    data.error ||
    data.detail ||
    fallback
  );
}

function getUserName() {
  if (!state.user) return "User";

  return (
    state.user.name ||
    state.user.full_name ||
    state.user.username ||
    state.user.email ||
    "User"
  );
}

function getBalance() {
  if (!state.user) return 0;

  if (state.user.balance !== undefined) {
    return Number(state.user.balance || 0);
  }

  if (state.user.balances) {
    return Number(
      state.user.balances.balance ||
      state.user.balances.available ||
      0
    );
  }

  return 0;
}

function isAdmin() {
  if (!state.user) return false;

  return (
    state.user.role === "admin" ||
    state.user.is_admin === true ||
    state.user.isAdmin === true
  );
}

function apiURL(path) {
  return API_BASE + path;
}

/* ==========================================
   API REQUEST HANDLER
========================================== */

async function apiRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();

  const headers = {
    Accept: "application/json",
    ...(options.headers || {})
  };

  const requestOptions = {
    method,
    headers,
    credentials: "include"
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(options.body);
  }

  /*
    The supplied backend checks CSRF tokens on unsafe
    /api requests. Retrieve a token before POST/PATCH/etc.
  */
  if (
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    path.startsWith("/api/") &&
    path !== API.csrf
  ) {
    if (!state.csrfToken) {
      await loadCsrfToken();
    }

    if (state.csrfToken) {
      headers["x-csrf-token"] = state.csrfToken;
    }
  }

  let response;

  try {
    response = await fetch(apiURL(path), requestOptions);
  } catch (error) {
    throw new Error(
      "Server se connection nahi ho saka. Replit URL, CORS aur server status check karein."
    );
  }

  const contentType =
    response.headers.get("content-type") || "";

  let data;

  if (contentType.includes("application/json")) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { message: text } : {};
  }

  if (!response.ok) {
    if (response.status === 401) {
      state.user = null;
    }

    throw new Error(
      getErrorMessage(data, "Request failed: " + response.status)
    );
  }

  return data;
}

/* ==========================================
   INITIAL SETUP
========================================== */

async function loadCsrfToken() {
  try {
    const data = await apiRequestWithoutCsrf(API.csrf);

    state.csrfToken =
      data.csrfToken ||
      data.csrf_token ||
      data.token ||
      "";
  } catch (error) {
    console.error("CSRF token error:", error);
  }
}

async function apiRequestWithoutCsrf(path) {
  let response;

  try {
    response = await fetch(apiURL(path), {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json"
      }
    });
  } catch (error) {
    throw new Error("Backend server is not reachable.");
  }

  const contentType =
    response.headers.get("content-type") || "";

  const data = contentType.includes("application/json")
    ? await response.json()
    : {};

  if (!response.ok) {
    throw new Error(
      getErrorMessage(data, "Could not initialize session.")
    );
  }

  return data;
}

async function loadConfiguration() {
  try {
    state.config = await apiRequest(API.config);
  } catch (error) {
    console.warn("Configuration unavailable:", error.message);
  }
}

/* ==========================================
   APPLICATION START
========================================== */

async function startApp() {
  if (!root) {
    console.error("Application root element not found.");
    return;
  }

  try {
    await loadCsrfToken();
    await loadConfiguration();

    /*
      Check whether the user already has a session.
    */
    try {
      const sessionData = await apiRequest(API.session);

      if (sessionData.user) {
        state.user = sessionData.user;
      }
    } catch (error) {
      console.info("No existing session.");
    }

    /*
      Load the current user if session did not provide one.
    */
    if (!state.user) {
      try {
        const meData = await apiRequest(API.me);

        state.user =
          meData.user ||
          meData.profile ||
          null;
      } catch (error) {
        state.user = null;
      }
    }

    if (state.user) {
      renderDashboard();
    } else {
      renderLogin();
    }
  } catch (error) {
    renderConnectionError(error.message);
  }
}

/* ==========================================
   CONNECTION ERROR
========================================== */

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
            The application could not connect to the server.
          </p>

          <div class="alert alert-error">
            ${escapeHTML(message)}
          </div>

          <button class="btn btn-primary btn-block"
                  id="retryConnection">
            Try Again
          </button>
        </div>
      </div>
    </section>
  `;

  document.getElementById("retryConnection")
    .addEventListener("click", startApp);
}

/* ==========================================
   LOGIN PAGE
========================================== */

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
                type="email"
                id="loginEmail"
                name="email"
                autocomplete="username"
                required
                placeholder="Enter your email"
              >
            </div>

            <div class="form-group">
              <label for="loginPassword">Password</label>

              <input
                class="form-control"
                type="password"
                id="loginPassword"
                name="password"
                autocomplete="current-password"
                required
                placeholder="Enter your password"
              >
            </div>

            <div id="loginError" class="alert alert-error hidden"></div>

            <button
              type="submit"
              id="loginButton"
              class="btn btn-primary btn-block"
            >
              Sign In
            </button>

          </form>

          <div class="auth-switch">
            Don't have an account?
            <a href="#" id="showRegister">Create Account</a>
          </div>

          <div class="auth-switch">
            <a href="#" id="showAdminLogin">Administrator Login</a>
          </div>

        </div>
      </div>
    </section>
  `;

  document.getElementById("loginForm")
    .addEventListener("submit", handleLogin);

  document.getElementById("showRegister")
    .addEventListener("click", function (event) {
      event.preventDefault();
      renderRegister();
    });

  document.getElementById("showAdminLogin")
    .addEventListener("click", function (event) {
      event.preventDefault();
      renderAdminLogin();
    });
}

/* ==========================================
   REGISTER PAGE
========================================== */

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
                required
                maxlength="100"
                autocomplete="name"
                placeholder="Enter your full name"
              >
            </div>

            <div class="form-group">
              <label for="registerEmail">Email Address</label>

              <input
                class="form-control"
                id="registerEmail"
                name="email"
                type="email"
                required
                autocomplete="email"
                placeholder="Enter your email"
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
                required
                autocomplete="new-password"
                placeholder="At least 10 characters"
              >

              <span class="form-help">
                Use a strong password with at least 10 characters.
              </span>
            </div>

            <div class="form-group">
              <label for="registerConfirmPassword">
                Confirm Password
              </label>

              <input
                class="form-control"
                id="registerConfirmPassword"
                name="confirmPassword"
                type="password"
                minlength="10"
                required
                autocomplete="new-password"
                placeholder="Re-enter your password"
              >
            </div>

            <div id="registerError" class="alert alert-error hidden"></div>

            <button
              type="submit"
              id="registerButton"
              class="btn btn-primary btn-block"
            >
              Create Account
            </button>

          </form>

          <div class="auth-switch">
            Already registered?
            <a href="#" id="showLogin">Sign In</a>
          </div>

        </div>
      </div>
    </section>
  `;

  document.getElementById("registerForm")
    .addEventListener("submit", handleRegister);

  document.getElementById("showLogin")
    .addEventListener("click", function (event) {
      event.preventDefault();
      renderLogin();
    });
}

/* ==========================================
   ADMIN LOGIN PAGE
========================================== */

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
            Sign in using your authorized administrator account.
          </p>

          <form id="adminLoginForm" class="form">

            <div class="form-group">
              <label for="adminEmail">Administrator Email</label>

              <input
                class="form-control"
                id="adminEmail"
                type="email"
                name="email"
                required
                autocomplete="username"
              >
            </div>

            <div class="form-group">
              <label for="adminPassword">Password</label>

              <input
                class="form-control"
                id="adminPassword"
                type="password"
                name="password"
                required
                autocomplete="current-password"
              >
            </div>

            <div id="adminLoginError" class="alert alert-error hidden"></div>

            <button
              type="submit"
              id="adminLoginButton"
              class="btn btn-primary btn-block"
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
    .addEventListener("click", function (event) {
      event.preventDefault();
      renderLogin();
    });
}

/* ==========================================
   AUTHENTICATION ACTIONS
========================================== */

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("loginButton");
  const errorBox = document.getElementById("loginError");

  errorBox.classList.add("hidden");

  const email = form.email.value.trim();
  const password = form.password.value;

  setLoading(button, true);

  try {
    const data = await apiRequest(API.login, {
      method: "POST",
      body: { email, password }
    });

    state.user = data.user || data.profile || null;

    if (!state.user) {
      const meData = await apiRequest(API.me);
      state.user = meData.user || meData.profile || null;
    }

    if (!state.user) {
      throw new Error(
        "Login response did not contain a user. Please try again."
      );
    }

    await loadCsrfToken();

    notify("Login successful.", "success");
    renderDashboard();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    setLoading(button, false, "Sign In");
  }
}

async function handleRegister(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("registerButton");
  const errorBox = document.getElementById("registerError");

  errorBox.classList.add("hidden");

  const name = form.name.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const confirmPassword = form.confirmPassword.value;

  if (password.length < 10) {
    errorBox.textContent =
      "Password must contain at least 10 characters.";

    errorBox.classList.remove("hidden");
    return;
  }

  if (password !== confirmPassword) {
    errorBox.textContent = "Passwords do not match.";
    errorBox.classList.remove("hidden");
    return;
  }

  setLoading(button, true);

  try {
    await apiRequest(API.register, {
      method: "POST",
      body: {
        name,
        email,
        password
      }
    });

    notify(
      "Registration successful. Please sign in.",
      "success"
    );

    renderLogin();

    const emailInput = document.getElementById("loginEmail");

    if (emailInput) {
      emailInput.value = email;
    }
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    setLoading(button, false, "Create Account");
  }
}

async function handleAdminLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("adminLoginButton");
  const errorBox = document.getElementById("adminLoginError");

  errorBox.classList.add("hidden");

  const email = form.email.value.trim();
  const password = form.password.value;

  setLoading(button, true);

  try {
    const data = await apiRequest(API.adminLogin, {
      method: "POST",
      body: { email, password }
    });

    state.user = data.user || data.admin || null;

    if (!state.user) {
      const meData = await apiRequest(API.me);
      state.user = meData.user || meData.profile || null;
    }

    if (!state.user || !isAdmin()) {
      state.user = null;

      throw new Error(
        "Server did not confirm administrator access."
      );
    }

    await loadCsrfToken();

    notify("Administrator login successful.", "success");
    renderDashboard();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    setLoading(button, false, "Administrator Sign In");
  }
}

/* ==========================================
   DASHBOARD LAYOUT
========================================== */

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

          <button type="button" data-page="dashboard" class="active">
            <span>▦</span> Dashboard
          </button>

          <button type="button" data-page="deposit">
            <span>↓</span> Deposit Request
          </button>

          <button type="button" data-page="withdrawal">
            <span>↑</span> Withdrawal
          </button>

          <button type="button" data-page="investments">
            <span>◈</span> Investment Plans
          </button>

          <button type="button" data-page="transactions">
            <span>⇄</span> Transactions
          </button>

          <button type="button" data-page="profile">
            <span>♙</span> My Profile
          </button>

          ${
            isAdmin()
              ? `
                <button type="button" data-page="admin">
                  <span>⚙</span> Admin Panel
                </button>
              `
              : ""
          }

          <button type="button" id="logoutButton">
            <span>↪</span> Logout
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
              aria-label="Open navigation"
            >
              ☰
            </button>

            <div>
              <h1 class="page-title" id="pageTitle">
                Dashboard
              </h1>

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
          <div class="card">Loading dashboard...</div>
        </div>

      </section>

    </div>
  `;

  document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", function () {
      openPage(this.dataset.page);
    });
  });

  document.getElementById("logoutButton")
    .addEventListener("click", handleLogout);

  document.getElementById("mobileMenuButton")
    .addEventListener("click", function () {
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

function openPage(page) {
  if (!state.user) {
    renderLogin();
    return;
  }

  if (page === "admin" && !isAdmin()) {
    notify("Administrator access is required.", "error");
    return;
  }

  state.currentPage = page;
  closeSidebar();

  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === page
    );
  });

  const titles = {
    dashboard: "Dashboard",
    deposit: "Deposit Request",
    withdrawal: "Withdrawal",
    investments: "Investment Plans",
    transactions: "Transactions",
    profile: "My Profile",
    admin: "Admin Panel"
  };

  document.getElementById("pageTitle").textContent =
    titles[page] || "Dashboard";

  const content = document.getElementById("pageContent");

  content.innerHTML =
    '<div class="card">Loading...</div>';

  const renderers = {
    dashboard: renderDashboardHome,
    deposit: renderDepositPage,
    withdrawal: renderWithdrawalPage,
    investments: renderInvestmentsPage,
    transactions: renderTransactionsPage,
    profile: renderProfilePage,
    admin: renderAdminPage
  };

  Promise.resolve(renderers[page]())
    .catch(error => {
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
    });
}

/* ==========================================
   DASHBOARD HOME
========================================== */

async function renderDashboardHome() {
  const content = document.getElementById("pageContent");

  let requestCount = 0;
  let transactionCount = 0;

  try {
    const requestsData = await apiRequest(API.requests);

    state.requests = Array.isArray(requestsData)
      ? requestsData
      : requestsData.requests || [];

    requestCount = state.requests.length;
  } catch (error) {
    console.warn("Could not load requests:", error.message);
  }

  try {
    const transactionData = await apiRequest(API.transactions);

    state.transactions = Array.isArray(transactionData)
      ? transactionData
      : transactionData.transactions || [];

    transactionCount = state.transactions.length;
  } catch (error) {
    console.warn("Could not load transactions:", error.message);
  }

  content.innerHTML = `
    <div class="grid">

      <div class="card">
        <div class="stat-label">Account Balance</div>

        <div class="stat-value">
          ${money(getBalance())}
        </div>

        <div class="stat-note">
          Balance reported by the server
        </div>
      </div>

      <div class="card">
        <div class="stat-label">My Requests</div>

        <div class="stat-value">
          ${requestCount}
        </div>

        <div class="stat-note">
          Deposit and withdrawal requests
        </div>
      </div>

      <div class="card">
        <div class="stat-label">Transactions</div>

        <div class="stat-value">
          ${transactionCount}
        </div>

        <div class="stat-note">
          Recorded account transactions
        </div>
      </div>

    </div>

    <div class="grid-2 mt-3">

      <div class="card">
        <h2 class="card-title">Deposit</h2>

        <p class="text-muted">
          Submit a deposit request for administrator review.
        </p>

        <button class="btn btn-primary"
                id="goDeposit">
          Create Deposit Request
        </button>
      </div>

      <div class="card">
        <h2 class="card-title">Withdrawal</h2>

        <p class="text-muted">
          Submit a withdrawal request for review.
        </p>

        <button class="btn btn-secondary"
                id="goWithdrawal">
          Create Withdrawal Request
        </button>
      </div>

    </div>

    <div class="card mt-3">
      <h2 class="card-title">Recent Transactions</h2>
      ${renderTransactionTable(state.transactions.slice(0, 5))}
    </div>
  `;

  document.getElementById("goDeposit")
    .addEventListener("click", () => openPage("deposit"));

  document.getElementById("goWithdrawal")
    .addEventListener("click", () => openPage("withdrawal"));
}

/* ==========================================
   DEPOSIT PAGE
========================================== */

function renderDepositPage() {
  const content = document.getElementById("pageContent");

  const depositAddress =
    state.config.depositAddress ||
    state.config.deposit_address ||
    "";

  content.innerHTML = `
    <div class="grid-2">

      <div class="card">
        <h2 class="card-title">Submit Deposit Request</h2>

        <div class="alert alert-info">
          Submit your transaction details for review.
          A request does not mean the payment has been confirmed.
        </div>

        <form id="depositForm" class="form">

          <div class="form-group">
            <label for="depositAmount">Amount</label>

            <input
              class="form-control"
              id="depositAmount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              placeholder="Enter amount"
            >
          </div>

          <div class="form-group">
            <label for="depositNetwork">Network</label>

            <select id="depositNetwork"
                    name="network"
                    class="form-control"
                    required>
              <option value="TRC20">TRON (TRC20)</option>
            </select>
          </div>

          <div class="form-group">
            <label for="depositTx">Transaction ID / Hash</label>

            <input
              class="form-control"
              id="depositTx"
              name="transactionHash"
              type="text"
              required
              maxlength="200"
              placeholder="Enter transaction hash"
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
        <h2 class="card-title">Payment Information</h2>

        <p class="text-muted">
          Only send funds to an address confirmed by the
          authorized service administrator.
        </p>

        ${
          depositAddress
            ? `
              <div class="form-group">
                <label>Configured Deposit Address</label>
                <textarea readonly id="depositAddress">${escapeHTML(depositAddress)}</textarea>
                <button class="btn btn-secondary"
                        type="button"
                        id="copyDepositAddress">
                  Copy Address
                </button>
              </div>
            `
            : `
              <div class="alert alert-info">
                No deposit address has been supplied by the server.
                Do not send funds until the address is verified.
              </div>
            `
        }
      </div>

    </div>
  `;

  document.getElementById("depositForm")
    .addEventListener("submit", handleDeposit);

  document.getElementById("copyDepositAddress")
    ?.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(depositAddress);
        notify("Address copied.", "success");
      } catch (error) {
        notify("Copy failed. Please copy the address manually.", "error");
      }
    });
}

async function handleDeposit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const button = document.getElementById("depositButton");

  const amount = Number(form.amount.value);
  const network = form.network.value;
  const transactionHash = form.transactionHash.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    notify("Enter a valid amount.", "error");
    return;
  }

  if (!transactionHash) {
    notify("Enter the transaction hash.", "error");
    return;
  }

  setLoading(button, true);

  try {
    await apiRequest(API.deposit, {
      method: "POST",
      body: {
        amount,
        network,
        transactionHash
      }
    });

    notify("Deposit request submitted for review.", "success");
    openPage("dashboard");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setLoading(button, false, "Submit Deposit Request");
  }
}

/* ==========================================
   WITHDRAWAL PAGE
========================================== */

function renderWithdrawalPage() {
  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="card">

      <h2 class="card-title">Withdrawal Request</h2>

      <div class="alert alert-info">
        Enter your amount and receiving wallet address.
        Your request will need server-side validation and approval.
      </div>

      <form id="withdrawalForm" class="form">

        <div class="form-group">
          <label for="withdrawalAmount">Amount</label>

          <input
            class="form-control"
            id="withdrawalAmount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            placeholder="Enter withdrawal amount"
          >
        </div>

        <div class="form-group">
          <label for="withdrawalNetwork">Network</label>

          <select
            class="form-control"
            id="withdrawalNetwork"
            name="network"
            required
          >
            <option value="TRC20">TRON (TRC20)</option>
          </select>
        </div>

        <div class="form-group">
          <label for="withdrawalAddress">Receiving Wallet Address</label>

          <input
            class="form-control"
            id="withdrawalAddress"
            name="walletAddress"
            type="text"
            required
            maxlength="200"
            placeholder="Enter your wallet address"
          >
        </div>

        <button
          class="btn btn-primary"
          id="withdrawalButton"
          type="submit"
        >
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
  const network = form.network.value;
  const walletAddress = form.walletAddress.value.trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    notify("Enter a valid amount.", "error");
    return;
  }

  if (!walletAddress) {
    notify("Enter your receiving wallet address.", "error");
    return;
  }

  setLoading(button, true);

  try {
    await apiRequest(API.withdrawal, {
      method: "POST",
      body: {
        amount,
        network,
        walletAddress
      }
    });

    notify("Withdrawal request submitted for review.", "success");
    openPage("dashboard");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setLoading(button, false, "Submit Withdrawal Request");
  }
}

/* ==========================================
   INVESTMENT PLANS
========================================== */

async function renderInvestmentsPage() {
  const content = document.getElementById("pageContent");

  let plans = [];

  try {
    const data = await apiRequest("/api/plans");

    plans = Array.isArray(data)
      ? data
      : data.plans || [];
  } catch (error) {
    content.innerHTML = `
      <div class="card">
        <h2 class="card-title">Investment Plans</h2>

        <div class="alert alert-error">
          ${escapeHTML(error.message)}
        </div>

        <p class="text-muted">
          The supplied server may not provide a public plans endpoint.
          Please confirm the server routes before enabling plan requests.
        </p>
      </div>
    `;

    return;
  }

  if (!plans.length) {
    content.innerHTML = `
      <div class="card">
        <h2 class="card-title">Investment Plans</h2>

        <div class="empty-state">
          <h3>No plans available</h3>
          <p>No plans were returned by the server.</p>
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
            ${escapeHTML(plan.name || plan.title || "Plan")}
          </h2>

          <p class="text-muted">
            ${escapeHTML(plan.description || "Plan details supplied by server.")}
          </p>

          <div class="stat-label">Minimum Amount</div>

          <div class="stat-value">
            ${money(plan.minimum_amount ?? plan.min_amount ?? 0)}
          </div>

          <div class="mt-2">
            <button
              class="btn btn-primary btn-block"
              data-plan-id="${escapeHTML(plan.id)}"
            >
              Submit Plan Request
            </button>
          </div>

        </div>
      `).join("")}

    </div>

    <p class="text-muted mt-3">
      Review all terms, risks, fees and applicable legal requirements
      before submitting any financial request.
    </p>
  `;

  content.querySelectorAll("[data-plan-id]").forEach(button => {
    button.addEventListener("click", async function () {
      const planId = this.dataset.planId;

      const amountInput = prompt(
        "Enter the amount for this plan:"
      );

      if (amountInput === null) return;

      const amount = Number(amountInput);

      if (!Number.isFinite(amount) || amount <= 0) {
        notify("Enter a valid amount.", "error");
        return;
      }

      setLoading(this, true);

      try {
        await apiRequest(API.investments, {
          method: "POST",
          body: {
            planId,
            amount
          }
        });

        notify("Plan request submitted for review.", "success");
        openPage("dashboard");
      } catch (error) {
        notify(error.message, "error");
      } finally {
        setLoading(this, false, "Submit Plan Request");
      }
    });
  });
}

/* ==========================================
   TRANSACTIONS
========================================== */

function renderTransactionTable(transactions) {
  if (!transactions || transactions.length === 0) {
    return `
      <div class="empty-state">
        <h3>No transactions found</h3>
        <p>Your server-reported transactions will appear here.</p>
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
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>

        <tbody>
          ${transactions.map(transaction => `
            <tr>
              <td>${escapeHTML(transaction.id ?? "-")}</td>

              <td>
                ${escapeHTML(transaction.type || transaction.kind || "-")}
              </td>

              <td>
                ${money(transaction.amount)}
              </td>

              <td>
                ${renderStatusBadge(transaction.status)}
              </td>

              <td>
                ${escapeHTML(
                  transaction.created_at ||
                  transaction.createdAt ||
                  transaction.date ||
                  "-"
                )}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderStatusBadge(status) {
  const value = String(status || "pending").toLowerCase();

  let badgeClass = "badge-pending";

  if (
    value === "approved" ||
    value === "completed" ||
    value === "success"
  ) {
    badgeClass = "badge-success";
  } else if (
    value === "rejected" ||
    value === "failed" ||
    value === "cancelled"
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

async function renderTransactionsPage() {
  const content = document.getElementById("pageContent");

  const data = await apiRequest(API.transactions);

  state.transactions = Array.isArray(data)
    ? data
    : data.transactions || [];

  content.innerHTML = `
    <div class="card">
      <h2 class="card-title">Transaction History</h2>
      ${renderTransactionTable(state.transactions)}
    </div>
  `;
}

/* ==========================================
   PROFILE
========================================== */

function renderProfilePage() {
  const content = document.getElementById("pageContent");

  const user = state.user || {};

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
            maxlength="100"
            required
            value="${escapeHTML(user.name || user.full_name || "")}"
          >
        </div>

        <div class="form-group">
          <label for="profileEmail">Email Address</label>

          <input
            class="form-control"
            id="profileEmail"
            type="email"
            readonly
            value="${escapeHTML(user.email || "")}"
          >

          <span class="form-help">
            Email address cannot be changed here.
          </span>
        </div>

        <button
          class="btn btn-primary"
          id="profileButton"
          type="submit"
        >
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

  const name = form.name.value.trim();

  if (!name) {
    notify("Enter your name.", "error");
    return;
  }

  setLoading(button, true);

  try {
    const data = await apiRequest(API.profile, {
      method: "PATCH",
      body: { name }
    });

    if (data.user) {
      state.user = data.user;
    } else if (data.profile) {
      state.user = data.profile;
    } else {
      state.user.name = name;
    }

    notify("Profile updated.", "success");
    renderDashboard();
  } catch (error) {
    notify(error.message, "error");
  } finally {
    setLoading(button, false, "Save Profile");
  }
}

/* ==========================================
   ADMIN PANEL
========================================== */

async function renderAdminPage() {
  const content = document.getElementById("pageContent");

  if (!isAdmin()) {
    content.innerHTML = `
      <div class="card">
        <div class="alert alert-error">
          Administrator access is required.
        </div>
      </div>
    `;

    return;
  }

  let requests = [];

  try {
    const data = await apiRequest(API.requests);

    requests = Array.isArray(data)
      ? data
      : data.requests || [];
  } catch (error) {
    content.innerHTML = `
      <div class="card">
        <h2 class="card-title">Admin Panel</h2>

        <div class="alert alert-error">
          Could not load requests: ${escapeHTML(error.message)}
        </div>
      </div>
    `;

    return;
  }

  content.innerHTML = `
    <div class="card">

      <h2 class="card-title">Requests Management</h2>

      <div class="alert alert-info">
        This screen displays requests returned by the server.
        Approval actions must use the server's authenticated admin routes.
      </div>

      ${
        requests.length
          ? `
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>User</th>
                    <th>Type</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  ${requests.map(request => `
                    <tr>
                      <td>${escapeHTML(request.id ?? "-")}</td>

                      <td>
                        ${escapeHTML(
                          request.user_email ||
                          request.email ||
                          request.user_id ||
                          "-"
                        )}
                      </td>

                      <td>
                        ${escapeHTML(request.type || "-")}
                      </td>

                      <td>${money(request.amount)}</td>

                      <td>${renderStatusBadge(request.status)}</td>

                      <td>
                        ${escapeHTML(
                          request.created_at ||
                          request.createdAt ||
                          "-"
                        )}
                      </td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
          : `
            <div class="empty-state">
              <h3>No requests found</h3>
            </div>
          `
      }

    </div>
  `;
}

/* ==========================================
   LOGOUT
========================================== */

async function handleLogout() {
  const confirmed = confirm("Are you sure you want to log out?");

  if (!confirmed) return;

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

/* ==========================================
   START APP
========================================== */

document.addEventListener("DOMContentLoaded", startApp);
