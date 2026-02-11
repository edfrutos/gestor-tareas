import { API_BASE } from "./config.js";
import { fetchJson } from "./api.js";
import { getUser } from "./auth.js";
import { $, safeText, toast, setButtonBusy } from "./utils.js";

let usersList = [];
let currentPage = 1;
const pageSize = 15;

export function initUsersModule() {
  const btnUsers = $("#btnUsers");
  const modal = $("#usersModal");
  const close = $("#usersClose");

  if (btnUsers) {
    btnUsers.onclick = () => {
      currentPage = 1;
      openUsersModal();
    };
  }

  if (close && modal) {
    close.onclick = () => {
      modal.style.display = "none";
    };
    modal.onclick = (e) => {
      if (e.target === modal) modal.style.display = "none";
    };
  }

  // Pagination listeners
  const btnPrev = $("#btnUsersPrev");
  const btnNext = $("#btnUsersNext");

  if (btnPrev) {
    btnPrev.onclick = () => {
      if (currentPage > 1) {
        currentPage--;
        openUsersModal();
      }
    };
  }

  if (btnNext) {
    btnNext.onclick = () => {
      currentPage++;
      openUsersModal();
    };
  }

  // Init edit modal
  const editModal = $("#editUserModal");
  const editCancel = $("#editUserCancel");
  const editForm = $("#editUserForm");

  if (editCancel && editModal) {
    editCancel.onclick = () => {
      editModal.style.display = "none";
    };
    editModal.onclick = (e) => {
      if (e.target === editModal) editModal.style.display = "none";
    };
  }

  if (editForm) {
    editForm.onsubmit = async (e) => {
      e.preventDefault();
      const id = $("#editUserId").value;
      const role = $("#editUserRole").value;
      const pass = $("#editUserPass").value;

      const btn = editForm.querySelector("button[type=submit]");
      setButtonBusy(btn, true, "Guardando...");

      try {
        const payload = { role };
        if (pass && pass.trim()) payload.password = pass;

        await fetchJson(`${API_BASE}/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        toast("Usuario actualizado", "ok");
        editModal.style.display = "none";
        openUsersModal(); // Recargar lista
      } catch (err) {
        toast(err.message, "error");
      } finally {
        setButtonBusy(btn, false);
      }
    };
  }
}

export async function openUsersModal() {
  const modal = $("#usersModal");
  if (!modal) return;
  modal.style.display = "flex";

  const tbody = $("#usersListBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">Cargando...</td></tr>`;

  try {
    const data = await fetchJson(`${API_BASE}/users?page=${currentPage}&pageSize=${pageSize}`);
    usersList = data.items || [];
    renderUsersTable(usersList);
    
    // Update pagination UI
    const total = data.total || 0;
    const totalPages = Math.ceil(total / pageSize) || 1;
    
    const usersTotal = $("#usersTotal");
    if (usersTotal) usersTotal.textContent = `Total: ${total}`;
    
    const usersPageInfo = $("#usersPageInfo");
    if (usersPageInfo) usersPageInfo.textContent = `${currentPage} / ${totalPages}`;
    
    const btnPrev = $("#btnUsersPrev");
    if (btnPrev) btnPrev.disabled = currentPage <= 1;
    
    const btnNext = $("#btnUsersNext");
    if (btnNext) btnNext.disabled = currentPage >= totalPages;

  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--bad); padding:20px;">Error al cargar usuarios: ${err.message}</td></tr>`;
  }
}

function renderUsersTable(users) {
  const tbody = $("#usersListBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const currentUser = getUser();

  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px;">No hay usuarios.</td></tr>`;
    return;
  }

  users.forEach(u => {
    const tr = document.createElement("tr");
    tr.style.borderBottom = "1px solid var(--border2)";
    
    const isMe = currentUser && currentUser.id === u.id;
    const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString() : "-";

    tr.innerHTML = `
      <td style="padding:10px 14px;">
        <div style="font-weight:600;">${safeText(u.username)}</div>
        ${isMe ? '<span style="font-size:10px; color:var(--ok);"> (Tú)</span>' : ''}
      </td>
      <td style="padding:10px 14px;">
        <span class="badge" style="font-size:11px; ${u.role === 'admin' ? 'background:rgba(124,92,255,.2); color:var(--accent);' : 'background:var(--chip);'}">
          ${u.role}
        </span>
      </td>
      <td style="padding:10px 14px; font-size:12px; color:var(--muted);">${dateStr}</td>
      <td style="padding:10px 14px; text-align:right;">
        <button class="btn small btn-edit-user" data-id="${u.id}">✎</button>
        ${!isMe ? `<button class="btn small danger btn-del-user" data-id="${u.id}">🗑️</button>` : ''}
      </td>
    `;
    
    const btnEdit = tr.querySelector(".btn-edit-user");
    btnEdit.onclick = () => openEditUser(u);

    const btnDel = tr.querySelector(".btn-del-user");
    if (btnDel) {
      btnDel.onclick = () => deleteUser(u.id, u.username);
    }

    tbody.appendChild(tr);
  });
}

function openEditUser(u) {
  const modal = $("#editUserModal");
  if (!modal) return;
  
  $("#editUserId").value = u.id;
  $("#editUserName").value = u.username;
  $("#editUserRole").value = u.role;
  $("#editUserPass").value = ""; // Limpiar
  
  modal.style.display = "flex";
}

async function deleteUser(id, username) {
  if (!confirm(`¿Estás seguro de borrar el usuario "${username}"? Esta acción no se puede deshacer.`)) return;

  try {
    await fetchJson(`${API_BASE}/users/${id}`, { method: "DELETE" });
    toast("Usuario eliminado", "ok");
    openUsersModal(); // Recargar
  } catch (err) {
    toast(err.message, "error");
  }
}
