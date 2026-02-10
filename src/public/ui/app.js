import { wireForms, loadCategories } from "./modules/forms.js";
import { loadIssues } from "./modules/list.v2.js";
import { getConfig } from "./modules/api.js";
import { ensureMap } from "./modules/map.js";
import { setStatus, $ } from "./modules/utils.js";
import { LS_THEME } from "./modules/config.js";
import { startStatsPolling } from "./modules/stats.js";
import { isAuthenticated, getUser, login, logout, register, changePassword } from "./modules/auth.js";

console.log("[App] Módulos cargados correctamente.");

// Global Error Handler
window.onerror = function(msg, url, line) {
  if (msg === "ResizeObserver loop completed with undelivered notifications.") return;
  const err = `JS Error: ${msg}`;
  console.error(err);
  const el = $("#status");
  if(el) { el.textContent = err; el.dataset.kind = "error"; }
};

// Global click delegation
document.addEventListener("click", (ev) => {
  const t = ev.target;
  const refreshBtn = t.closest?.("#btnRefresh");
  if (refreshBtn) {
    ev.preventDefault();
    setStatus("Refrescando...", "info");
    loadIssues({ reset: true }).catch(e => setStatus(e.message, "error"));
  }
}, true);

// Theme logic
function initTheme() {
  const sel = $("#themeSelect");
  if (!sel) return;
  
  const saved = localStorage.getItem(LS_THEME) || "auto";
  sel.value = saved;
  
  const apply = (v) => {
    let mode = v;
    if (v === "auto") mode = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", mode);
  };
  
  apply(saved);
  sel.onchange = () => {
    localStorage.setItem(LS_THEME, sel.value);
    apply(sel.value);
  };
  
  window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
    if (localStorage.getItem(LS_THEME) === "auto") apply("auto");
  });
}

async function initAuth() {
  const modal = $("#loginModal");
  const form = $("#loginForm");
  const btnLogout = $("#btnLogout");
  const userInfo = $("#userInfo");
  const userName = $("#userName");
  
  // Profile Logic
  const profileModal = $("#profileModal");
  const profileClose = $("#profileClose");
  const changePassForm = $("#changePassForm");
  
  if(userInfo) {
    userInfo.style.cursor = "pointer";
    userInfo.onclick = () => {
      if(profileModal) {
        profileModal.style.display = "flex";
        const cp = $("#currentPass"); if(cp) cp.value = "";
        const np = $("#newPass"); if(np) np.value = "";
        const st = $("#profileStatus"); if(st) st.textContent = "";
      }
    };
  }
  
  if(profileClose) profileClose.onclick = () => profileModal.style.display = "none";
  
  if(changePassForm) {
    changePassForm.onsubmit = async (e) => {
      e.preventDefault();
      const curr = $("#currentPass").value;
      const newP = $("#newPass").value;
      const st = $("#profileStatus");
      
      try {
        st.textContent = "Guardando...";
        st.style.color = "var(--text)";
        await changePassword(curr, newP);
        st.textContent = "Contraseña cambiada ✅";
        st.style.color = "var(--ok)";
        setTimeout(() => profileModal.style.display = "none", 1500);
      } catch(err) {
        let msg = err.message;
        if(err.data && Array.isArray(err.data.error)) msg = err.data.error.map(x => x.message).join(", ");
        st.textContent = msg || "Error";
        st.style.color = "var(--bad)";
      }
    };
  }
  
  // UI Elements
  const title = modal.querySelector("h2");
  const subtitle = modal.querySelector("p");
  const btnSubmit = form.querySelector("button");
  const lnkRegister = $("#lnkRegister");
  const lnkRecovery = $("#lnkRecovery");
  const togglePass = $("#togglePass");
  const passInput = $("#loginPass");
  const errEl = $("#loginError");

  let isRegisterMode = false;

  // Toggle Password
  if(togglePass) {
    togglePass.onclick = () => {
      const type = passInput.type === "password" ? "text" : "password";
      passInput.type = type;
      togglePass.textContent = type === "password" ? "👁️" : "🔒";
    };
  }

  // Switch Mode
  if(lnkRegister) {
    lnkRegister.onclick = (e) => {
      e.preventDefault();
      isRegisterMode = !isRegisterMode;
      if(isRegisterMode) {
        title.textContent = "Crear Cuenta";
        subtitle.textContent = "Elige usuario y contraseña";
        btnSubmit.textContent = "Registrarme";
        lnkRegister.textContent = "Ya tengo cuenta (Entrar)";
        lnkRecovery.style.display = "none";
      } else {
        title.textContent = "Gestor de Tareas";
        subtitle.textContent = "Identifícate para continuar";
        btnSubmit.textContent = "Entrar";
        lnkRegister.textContent = "Crear cuenta";
        lnkRecovery.style.display = "inline";
      }
      errEl.textContent = "";
    };
  }
  
  if(lnkRecovery) {
    lnkRecovery.onclick = (e) => {
      e.preventDefault();
      alert("Contacta con el administrador para resetear tu clave.");
    };
  }

  const check = () => {
    if (isAuthenticated()) {
      const user = getUser();
      modal.style.display = "none";
      if(userInfo) userInfo.style.display = "inline";
      if(btnLogout) btnLogout.style.display = "inline";
      if(userName) userName.textContent = user?.username || "Usuario";
      return true;
    } else {
      modal.style.display = "flex";
      if(userInfo) userInfo.style.display = "none";
      if(btnLogout) btnLogout.style.display = "none";
      return false;
    }
  };

  if (btnLogout) btnLogout.onclick = () => {
    if(confirm("¿Cerrar sesión?")) logout();
  };

  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      const userInp = $("#loginUser");
      const passInp = $("#loginPass");
      
      try {
        errEl.textContent = "Procesando...";
        
        if (isRegisterMode) {
           await register(userInp.value, passInp.value);
           await login(userInp.value, passInp.value);
           location.reload();
        } else {
           await login(userInp.value, passInp.value);
           location.reload();
        }
      } catch (err) {
        if(err.data && Array.isArray(err.data.error)) {
           errEl.textContent = err.data.error.map(e => e.message).join(", ");
        } else {
           errEl.textContent = err.message || "Error al procesar";
        }
      }
    };
  }

  return check();
}

// Boot
(async () => {
  try {
    // Esperar DOM si no está listo (aunque defer ayuda)
    if (document.readyState === "loading") {
        await new Promise(r => document.addEventListener("DOMContentLoaded", r));
    }

    const isAuth = await initAuth();
    if (!isAuth) return; // Detener carga si no está autenticado

    wireForms();
    initTheme();
    ensureMap(); 
    
    await getConfig();
    await loadCategories();
    await loadIssues({ reset: true });
    
    // Iniciar polling de stats
    startStatsPolling();
    
  } catch (e) {
    console.error(e);
    setStatus(`Error inicio: ${e.message}`, "error");
  }
})();