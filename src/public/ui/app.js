import { wireForms, loadCategories } from "./modules/forms.js";
import { loadIssues } from "./modules/list.v2.js";
import { getConfig, fetchJson } from "./modules/api.js";
import { ensureMap, initMapModule } from "./modules/map.js";
import { setStatus, $ } from "./modules/utils.js";
import { LS_THEME, API_BASE } from "./modules/config.js";
import { startStatsPolling, initStatsModule } from "./modules/stats.js";
import { isAuthenticated, getUser, login, logout, register, updateProfile } from "./modules/auth.js";
import { initUsersModule } from "./modules/users.js";
import { initMapsModule, loadMaps } from "./modules/maps.js";

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
        const user = getUser();
        const cp = $("#currentPass"); if(cp) cp.value = "";
        const np = $("#newPass"); if(np) np.value = "";
        const pe = $("#profileEmail"); if(pe) pe.value = user?.email || "";
        const st = $("#profileStatus"); if(st) st.textContent = "";
      }
    };
  }
  
  if(profileClose) profileClose.onclick = () => profileModal.style.display = "none";
  
  if(changePassForm) {
    changePassForm.onsubmit = async (e) => {
      e.preventDefault();
      const curr = $("#currentPass")?.value;
      const newP = $("#newPass")?.value;
      const email = $("#profileEmail")?.value;
      const st = $("#profileStatus");
      
      try {
        st.textContent = "Guardando...";
        st.style.color = "var(--text)";
        
        const payload = { email };
        // Solo enviamos contraseñas si el usuario ha escrito algo en "nueva contraseña"
        if (newP && newP.trim().length > 0) {
          payload.currentPassword = curr;
          payload.newPassword = newP;
        }

        await updateProfile(payload);
        
        // Refrescar datos del usuario localmente
        const { user } = await fetchJson(`${API_BASE}/auth/me`);
        localStorage.setItem("cc_user", JSON.stringify(user));
        if(userName) userName.textContent = user.username;

        st.textContent = "Perfil actualizado ✅";
        st.style.color = "var(--ok)";
        
        // Limpiar campos de password
        const cp = $("#currentPass"); if(cp) cp.value = "";
        const np = $("#newPass"); if(np) np.value = "";

        setTimeout(() => profileModal.style.display = "none", 1500);
      } catch(err) {
        let msg = err.message;
        if(err.data && err.data.error) {
           if (Array.isArray(err.data.error)) msg = err.data.error.map(x => x.message).join(", ");
           else msg = err.data.error;
        } else if (err.data && err.data.message) {
           msg = err.data.message;
        }
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
      const emailGroup = $("#registerEmailGroup");
      if(isRegisterMode) {
        title.textContent = "Crear Cuenta";
        subtitle.textContent = "Elige usuario y contraseña";
        btnSubmit.textContent = "Registrarme";
        lnkRegister.textContent = "Ya tengo cuenta (Entrar)";
        lnkRecovery.style.display = "none";
        if(emailGroup) emailGroup.style.display = "block";
      } else {
        title.textContent = "Gestor de Tareas";
        subtitle.textContent = "Identifícate para continuar";
        btnSubmit.textContent = "Entrar";
        lnkRegister.textContent = "Crear cuenta";
        lnkRecovery.style.display = "inline";
        if(emailGroup) emailGroup.style.display = "none";
      }
      errEl.textContent = "";
    };
  }
  
  if(lnkRecovery) {
    lnkRecovery.onclick = (e) => {
      e.preventDefault();
      modal.style.display = "none";
      $("#forgotModal").style.display = "flex";
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
      const emailInp = $("#registerEmail");
      
      try {
        errEl.textContent = "Procesando...";
        
        if (isRegisterMode) {
           await register(userInp.value, passInp.value, emailInp?.value);
           await login(userInp.value, passInp.value);
           location.reload();
        } else {
           await login(userInp.value, passInp.value);
           location.reload();
        }
      } catch (err) {
        let msg = err.message;
        if(err.data && err.data.error) {
           if (Array.isArray(err.data.error)) msg = err.data.error.map(x => x.message).join(", ");
           else msg = err.data.error;
        } else if (err.data && err.data.message) {
           msg = err.data.message;
        }
        errEl.textContent = msg || "Error al procesar";
      }
    };
  }

  return check();
}

function initRecovery() {
  const forgotModal = $("#forgotModal");
  const forgotForm = $("#forgotForm");
  const forgotCancel = $("#forgotCancel");
  const forgotStatus = $("#forgotStatus");

  if (forgotCancel) {
    forgotCancel.onclick = () => {
      forgotModal.style.display = "none";
      $("#loginModal").style.display = "flex";
    };
  }

  if (forgotForm) {
    forgotForm.onsubmit = async (e) => {
      e.preventDefault();
      const email = $("#forgotEmail").value;
      try {
        forgotStatus.textContent = "Enviando...";
        forgotStatus.style.color = "var(--text)";
        await fetchJson(`${API_BASE}/auth/forgot-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email })
        });
        forgotStatus.textContent = "Instrucciones enviadas. Revisa tu email.";
        forgotStatus.style.color = "var(--ok)";
        setTimeout(() => {
          forgotModal.style.display = "none";
          $("#loginModal").style.display = "flex";
        }, 3000);
      } catch (err) {
        forgotStatus.textContent = err.message;
        forgotStatus.style.color = "var(--bad)";
      }
    };
  }

  // Lógica de Reseteo (cuando viene del email)
  const resetForm = $("#resetForm");
  const resetModal = $("#resetModal");
  const resetStatus = $("#resetStatus");

  if (resetForm) {
    resetForm.onsubmit = async (e) => {
      e.preventDefault();
      const token = $("#resetToken").value;
      const password = $("#resetPass").value;
      try {
        resetStatus.textContent = "Actualizando...";
        await fetchJson(`${API_BASE}/auth/reset-password`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password })
        });
        resetStatus.textContent = "Contraseña actualizada. Ya puedes entrar.";
        resetStatus.style.color = "var(--ok)";
        setTimeout(() => {
          resetModal.style.display = "none";
          window.location.hash = ""; // Limpiar URL
          $("#loginModal").style.display = "flex";
        }, 2500);
      } catch (err) {
        resetStatus.textContent = err.message;
        resetStatus.style.color = "var(--bad)";
      }
    };
  }

  // Detectar token en URL
  const checkToken = () => {
    const hash = window.location.hash;
    if (hash.startsWith("#reset-password")) {
      const urlParams = new URLSearchParams(hash.split("?")[1]);
      const token = urlParams.get("token");
      if (token) {
        $("#resetToken").value = token;
        $("#loginModal").style.display = "none";
        resetModal.style.display = "flex";
      }
    }
  };

  checkToken();
}

// Boot
(async () => {
  try {
    // Esperar DOM si no está listo (aunque defer ayuda)
    if (document.readyState === "loading") {
        await new Promise(r => document.addEventListener("DOMContentLoaded", r));
    }

    const isAuth = await initAuth();
    initRecovery(); // Siempre inicializar para detectar tokens en URL

    if (!isAuth) return; // Detener carga si no está autenticado

    // Inicializar módulos
    initUsersModule();
    initMapsModule();
    initMapModule();
    initStatsModule();
    
    // Mostrar botón de usuarios si es admin
    const currentUser = getUser();
    if (currentUser && currentUser.role === 'admin') {
       const btnUsers = $("#btnUsers");
       if (btnUsers) btnUsers.style.display = "inline-block";
    }

    wireForms();
    initTheme();
    ensureMap(); 
    
    await getConfig();
    await loadCategories();
    await loadMaps(); // Cargar mapas antes
    await loadIssues({ reset: true });
    
    // Iniciar polling de stats
    startStatsPolling();
    
  } catch (e) {
    console.error(e);
    setStatus(`Error inicio: ${e.message}`, "error");
  }
})();