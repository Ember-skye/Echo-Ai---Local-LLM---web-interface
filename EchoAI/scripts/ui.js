import { state, getCharacterById, getCurrentChat } from "./state.js";
import { DEFAULT_SETTINGS, HERO_BANNERS } from "./data.js";

export function $(id) {
  return document.getElementById(id);
}

// We no longer need cacheDom or the dom object export, as we query the DOM directly to avoid any cross-module caching reference issues.
export function cacheDom() {}

export function escapeHTML(value) {
  if (value == null) return "";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function renderAvatar(character, className) {
  const name = character?.name || "Entity";
  if (character?.avatarImage) {
    return `<div class="${className}"><img src="${character.avatarImage}" alt="${escapeHTML(name)} avatar"></div>`;
  }
  return `<div class="${className}">${escapeHTML(character?.avatar || "✨")}</div>`;
}

export function setConnectionStatus(text, online = false) {
  const statusEl = $("connection-status");
  if (!statusEl) return;
  statusEl.classList.toggle("is-online", online);
  statusEl.innerHTML = `
    <span class="status-pill__dot"></span>
    <span>${escapeHTML(text)}</span>
  `;
}

export function toast(message, tone = "success") {
  const node = document.createElement("div");
  node.className = `toast toast--${tone}`;
  node.textContent = message;
  const stack = $("toast-stack");
  if (stack) stack.appendChild(node);
  window.setTimeout(() => node.remove(), 3200);
}

export function openModal(id) {
  const el = $(id);
  if (el) el.classList.remove("hidden");
}

export function closeModal(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

export function goHome() {
  state.currentChatId = null;
  const chatScreen = $("chat-screen");
  const welcomeScreen = $("welcome-screen");
  const archiveScreen = $("archive-screen");
  const navExplore = $("nav-explore-btn");
  const navArchive = $("nav-archive-btn");
  
  if (chatScreen) chatScreen.classList.add("hidden");
  if (archiveScreen) archiveScreen.classList.add("hidden");
  if (welcomeScreen) welcomeScreen.classList.remove("hidden");
  
  if (navArchive) navArchive.classList.remove("is-active");
  if (navExplore) navExplore.classList.add("is-active");
  renderSidebar();
}

export function goArchive() {
  state.currentChatId = null;
  const chatScreen = $("chat-screen");
  const welcomeScreen = $("welcome-screen");
  const archiveScreen = $("archive-screen");
  const navExplore = $("nav-explore-btn");
  const navArchive = $("nav-archive-btn");
  
  if (chatScreen) chatScreen.classList.add("hidden");
  if (welcomeScreen) welcomeScreen.classList.add("hidden");
  if (archiveScreen) archiveScreen.classList.remove("hidden");
  
  if (navExplore) navExplore.classList.remove("is-active");
  if (navArchive) navArchive.classList.add("is-active");
  
  renderArchiveScreen();
  renderSidebar();
}

export function resetBuilder() {
  if ($("edit-character-id")) $("edit-character-id").value = "";
  if ($("builder-title")) $("builder-title").textContent = "Create an Entity";
  if ($("builder-submit-btn")) $("builder-submit-btn").textContent = "Create Entity";
  if ($("custom-name")) $("custom-name").value = "";
  if ($("custom-description")) $("custom-description").value = "";
  if ($("custom-prompt")) $("custom-prompt").value = "";
  if ($("avatar-file")) $("avatar-file").value = "";
  
  const preview = $("avatar-preview");
  if (preview) {
    preview.innerHTML = "";
    preview.classList.add("hidden");
  }
  state.uploadedImagePath = "";
}

export function openEditCharacter(characterId) {
  const char = getCharacterById(characterId);
  if(!char) return;
  
  resetBuilder();
  if ($("edit-character-id")) $("edit-character-id").value = char.id;
  if ($("builder-title")) $("builder-title").textContent = "Edit Entity";
  if ($("builder-submit-btn")) $("builder-submit-btn").textContent = "Save Changes";
  
  if ($("custom-name")) $("custom-name").value = char.name;
  if ($("custom-description")) $("custom-description").value = char.description;
  if ($("custom-prompt")) $("custom-prompt").value = char.systemPrompt;
  
  if (char.avatarImage) {
    state.uploadedImagePath = char.avatarImage;
    const preview = $("avatar-preview");
    if (preview) {
      preview.innerHTML = `<img src="${char.avatarImage}" alt="Uploaded avatar preview">`;
      preview.classList.remove("hidden");
    }
  }
  
  openModal("builder-modal");
}

export function renderHeroCards() {
  const container = $("hero-character-preview");
  if (!container) return;

  const html = state.characters.map((character) => {
    const tagsHtml = character.tags ? character.tags.map(t => `<span class="hero-card-tag">${escapeHTML(t)}</span>`).join('') : '';
    
    let editBtnHtml = `<button class="secondary-button secondary-button--compact" type="button" data-edit-character="${character.id}">Edit</button>`;

    return `
      <article class="hero-preview-card">
        ${renderAvatar(character, "profile-avatar")}
        <div class="hero-card-tags">${tagsHtml}</div>
        <div>
          <strong>${escapeHTML(character.name)}</strong>
          <br>
          <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--tertiary); font-weight:700;">${escapeHTML(character.title || "")}</span>
          <br>
          <span>${escapeHTML(character.description)}</span>
        </div>
        <div class="hero-card-actions">
          <button class="primary-button primary-button--compact" type="button" data-start-chat="${character.id}">Chat Now</button>
          ${editBtnHtml}
          <button class="secondary-button secondary-button--compact" type="button" data-delete-character="${character.id}">Delete</button>
        </div>
      </article>
    `;
  }).join("");

  container.innerHTML = html;
}

export function renderSidebar() {
  const chatList = $("chat-list");
  if (!chatList) return;

  if (!state.chats.length) {
    chatList.innerHTML = `<div class="sidebar-empty-state"><span style="color:var(--text-muted); font-size:0.8rem;">No active connections. Start a chat from Explore.</span></div>`;
    return;
  }

  chatList.innerHTML = state.chats.map((chat) => {
    const active = chat.id === state.currentChatId ? "is-active" : "";
    const character = getCharacterById(chat.characterId);
    const preview = chat.messages.at(-1)?.content || "Connection established.";
    return `
      <article class="chat-card ${active}" data-chat-id="${chat.id}">
        ${renderAvatar(character, "avatar-token")}
        <div>
          <div class="chat-card__title">${escapeHTML(chat.title)}</div>
          <div class="chat-card__meta">${escapeHTML(preview.slice(0, 40))}</div>
        </div>
        <button class="icon-button" type="button" data-delete-chat="${chat.id}" title="Sever link">×</button>
      </article>
    `;
  }).join("");
}

export function renderArchiveScreen() {
  const container = $("archive-list");
  if (!container) return;

  let html = "";

  // Archived Chats Section
  html += `<div class="archive-section-heading"><h3>Archived Chats</h3></div>`;
  if (!state.archivedChats || !state.archivedChats.length) {
    html += `<div class="sidebar-empty-state" style="grid-column: 1 / -1;"><span style="color:var(--text-muted); font-size:0.95rem;">No archived chats.</span></div>`;
  } else {
    html += state.archivedChats.map((chat) => {
      const character = getCharacterById(chat.characterId);
      const preview = chat.messages.at(-1)?.content || "Connection established.";
      return `
        <article class="archive-card">
          <div style="display: flex; gap: 1rem; align-items: center;">
            ${renderAvatar(character, "avatar-token")}
            <div>
              <strong>${escapeHTML(chat.title)}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHTML(preview.slice(0, 60))}...</div>
            </div>
          </div>
          <div class="archive-card__actions">
            <button class="primary-button primary-button--compact" type="button" data-restore-chat="${chat.id}">Restore</button>
            <button class="secondary-button secondary-button--compact danger-button" type="button" data-perm-delete-chat="${chat.id}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
  }

  // Archived Characters Section
  html += `<div class="archive-section-heading" style="grid-column: 1 / -1;"><h3>Archived Characters</h3></div>`;
  if (!state.archivedCharacters || !state.archivedCharacters.length) {
    html += `<div class="sidebar-empty-state" style="grid-column: 1 / -1;"><span style="color:var(--text-muted); font-size:0.95rem;">No archived entities.</span></div>`;
  } else {
    html += state.archivedCharacters.map((character) => {
      return `
        <article class="archive-card">
          <div style="display: flex; gap: 1rem; align-items: center;">
            ${renderAvatar(character, "avatar-token")}
            <div>
              <strong>${escapeHTML(character.name)}</strong>
              <div style="font-size: 0.8rem; color: var(--text-muted);">${escapeHTML(character.description?.slice(0, 60) || "")}...</div>
            </div>
          </div>
          <div class="archive-card__actions">
            <button class="primary-button primary-button--compact" type="button" data-restore-character="${character.id}">Restore</button>
            <button class="secondary-button secondary-button--compact danger-button" type="button" data-perm-delete-character="${character.id}">Delete</button>
          </div>
        </article>
      `;
    }).join("");
  }

  container.innerHTML = html;
}

export function renderSettingsPanel() {
  if ($("api-base-url")) $("api-base-url").value = state.apiBaseUrl;
  if ($("temperature-slider")) $("temperature-slider").value = String(state.temperature);
  if ($("temperature-label")) $("temperature-label").textContent = state.temperature.toFixed(1);

  const modelSelect = $("model-select");
  if (!modelSelect) return;

  if (!state.availableModels.length) {
    modelSelect.innerHTML = `<option value="">Detect models first</option>`;
    modelSelect.value = "";
    return;
  }

  modelSelect.innerHTML = state.availableModels
    .map((model) => `<option value="${escapeHTML(model)}">${escapeHTML(model)}</option>`)
    .join("");
  modelSelect.value = state.selectedModel;
}

export function renderMarkdown(content) {
  if (window.marked) {
    return marked.parse(content || "");
  }
  return escapeHTML(content);
}

export function renderMessages(messages) {
  return messages.map((message) => `
    <div class="message-row message-row--${message.role}">
      <div class="message-bubble">
        <div class="message-meta">${message.role === "user" ? "You" : "Entity"}</div>
        <div class="message-content">${message.role === "user" ? escapeHTML(message.content) : renderMarkdown(message.content)}</div>
      </div>
    </div>
  `).join("");
}

export function renderCurrentChat() {
  const chat = getCurrentChat();
  if (!chat) {
    goHome();
    return;
  }

  const character = getCharacterById(chat.characterId);
  
  if ($("welcome-screen")) $("welcome-screen").classList.add("hidden");
  if ($("nav-explore-btn")) $("nav-explore-btn").classList.remove("is-active");
  if ($("chat-screen")) $("chat-screen").classList.remove("hidden");
  
  if ($("character-avatar")) {
    $("character-avatar").innerHTML = character?.avatarImage
      ? `<img src="${character.avatarImage}" alt="${escapeHTML(character?.name)} avatar">`
      : escapeHTML(character?.avatar || "✨");
  }
  
  if ($("character-name")) $("character-name").textContent = character?.name || "Unknown Entity";
  if ($("character-status")) $("character-status").textContent = `Connection established ${formatTime(chat.createdAt)}`;
  
  const messageList = $("message-list");
  if (messageList) {
    messageList.innerHTML = renderMessages(chat.messages);
    messageList.scrollTop = messageList.scrollHeight;
  }
  
  if ($("message-input")) setTimeout(() => $("message-input").focus(), 50);
}

export function renderInfoDrawer() {
  const chat = getCurrentChat();
  if (!chat) return;

  const character = getCharacterById(chat.characterId);
  if (!character) return;

  const content = $("info-drawer-content");
  if (!content) return;

  content.innerHTML = `
    <div class="profile-card">
      ${renderAvatar(character, "info-avatar")}
      <div>
        <h3>${escapeHTML(character.name)}</h3>
        <span style="font-size:0.8rem; color:var(--tertiary); font-weight:700; display:block; margin-bottom:0.5rem;">${escapeHTML(character.title || "")}</span>
        <div class="profile-copy">${escapeHTML(character.description)}</div>
      </div>
      <div class="profile-section">
        <strong>System Directives</strong>
        <pre>${escapeHTML(character.systemPrompt)}</pre>
      </div>
      <div class="profile-section">
        <strong>Entity Class</strong>
        <div style="color:var(--text-muted);">${character.isCustom ? "Unbound (Custom)" : "Curated (Default)"}</div>
      </div>
    </div>
  `;
}

export function autoResizeTextarea() {
  const input = $("message-input");
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
}

export function showTyping() {
  const messageList = $("message-list");
  if (!messageList) return;
  messageList.insertAdjacentHTML("beforeend", `
    <div class="message-row message-row--assistant" id="typing-row">
      <div class="message-bubble" style="background:transparent; box-shadow:none; padding: 0.5rem;">
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  `);
  messageList.scrollTop = messageList.scrollHeight;
}

export function hideTyping() {
  const row = $("typing-row");
  if (row) row.remove();
}

export function toggleSidebar() {
  if ($("sidebar")) $("sidebar").classList.toggle("is-open");
  if ($("sidebar-backdrop")) {
    $("sidebar-backdrop").classList.toggle("is-active", $("sidebar").classList.contains("is-open"));
  }
}

export function closeSidebar() {
  if ($("sidebar")) $("sidebar").classList.remove("is-open");
  if ($("sidebar-backdrop")) {
    $("sidebar-backdrop").classList.remove("is-active");
  }
}

// Hero Banner Logic
let heroBannerInterval = null;
let currentHeroIndex = 0;

export function setHeroBanner(index) {
  if (!HERO_BANNERS || !HERO_BANNERS.length) return;
  const banner = HERO_BANNERS[index % HERO_BANNERS.length];
  
  if ($("hero-banner-image")) $("hero-banner-image").style.backgroundImage = `url('${banner.image}')`;
  if ($("hero-banner-title")) $("hero-banner-title").textContent = banner.name;
  if ($("hero-banner-desc")) $("hero-banner-desc").textContent = banner.description;
  if ($("hero-banner-tag")) $("hero-banner-tag").textContent = banner.tag;
}

export function initHeroBannerRotation() {
  setHeroBanner(0);
  if (heroBannerInterval) clearInterval(heroBannerInterval);
  
  heroBannerInterval = setInterval(() => {
    currentHeroIndex++;
    setHeroBanner(currentHeroIndex);
  }, 5000); // Rotate every 5 seconds
}
