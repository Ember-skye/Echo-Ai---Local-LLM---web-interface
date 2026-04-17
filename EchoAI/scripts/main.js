const { DEFAULT_CHARACTERS, DEFAULT_SETTINGS, EMOJIS, STORAGE_KEYS } = window.EchoAIData;

const state = {
  characters: [],
  chats: [],
  currentChatId: null,
  apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
  selectedModel: DEFAULT_SETTINGS.selectedModel,
  availableModels: DEFAULT_SETTINGS.availableModels,
  temperature: DEFAULT_SETTINGS.temperature,
  selectedEmoji: EMOJIS[0],
  uploadedImageBase64: "",
  isGenerating: false
};

const dom = {};

const elementIds = [
  "sidebar", "chat-list", "hero-character-preview", "emoji-grid", "welcome-screen", "chat-screen",
  "character-avatar", "character-name", "character-status", "message-list", "message-input", "send-btn",
  "toast-stack", "info-drawer", "info-drawer-content", "connection-status", "custom-name",
  "custom-description", "custom-prompt", "avatar-file", "avatar-preview", "api-base-url",
  "model-select", "temperature-slider", "temperature-label"
];

function $(id) {
  return document.getElementById(id);
}

function cacheDom() {
  elementIds.forEach((id) => {
    dom[id] = $(id);
  });
}

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHTML(value = "") {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function loadState() {
  state.characters = loadJSON(STORAGE_KEYS.characters, DEFAULT_CHARACTERS);
  state.chats = loadJSON(STORAGE_KEYS.chats, []);
  const settings = loadJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
  state.apiBaseUrl = settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
  state.selectedModel = settings.selectedModel || "";
  state.availableModels = Array.isArray(settings.availableModels) ? settings.availableModels : [];
  state.temperature = Number(settings.temperature ?? DEFAULT_SETTINGS.temperature);
}

function saveCharacters() {
  saveJSON(STORAGE_KEYS.characters, state.characters);
}

function saveChats() {
  saveJSON(STORAGE_KEYS.chats, state.chats);
}

function saveSettings() {
  saveJSON(STORAGE_KEYS.settings, {
    apiBaseUrl: state.apiBaseUrl,
    selectedModel: state.selectedModel,
    availableModels: state.availableModels,
    temperature: state.temperature
  });
}

function getCharacterById(id) {
  return state.characters.find((character) => character.id === id) || null;
}

function getCurrentChat() {
  return state.chats.find((chat) => chat.id === state.currentChatId) || null;
}

function renderAvatar(character, className) {
  const name = character?.name || "Character";
  if (character?.avatarImage) {
    return `<div class="${className}"><img src="${character.avatarImage}" alt="${escapeHTML(name)} avatar"></div>`;
  }
  return `<div class="${className}">${escapeHTML(character?.avatar || "✨")}</div>`;
}

function setConnectionStatus(text, online = false) {
  dom["connection-status"].classList.toggle("is-online", online);
  dom["connection-status"].innerHTML = `
    <span class="status-pill__dot"></span>
    <span>${escapeHTML(text)}</span>
  `;
}

function toast(message, tone = "success") {
  const node = document.createElement("div");
  node.className = `toast toast--${tone}`;
  node.textContent = message;
  dom["toast-stack"].appendChild(node);
  window.setTimeout(() => node.remove(), 3200);
}

function openModal(id) {
  $(id).classList.remove("hidden");
}

function closeModal(id) {
  $(id).classList.add("hidden");
}

function goHome() {
  state.currentChatId = null;
  dom["chat-screen"].classList.add("hidden");
  dom["welcome-screen"].classList.remove("hidden");
  renderSidebar();
}

function resetBuilder() {
  dom["custom-name"].value = "";
  dom["custom-description"].value = "";
  dom["custom-prompt"].value = "";
  dom["avatar-file"].value = "";
  dom["avatar-preview"].innerHTML = "";
  dom["avatar-preview"].classList.add("hidden");
  state.selectedEmoji = EMOJIS[0];
  state.uploadedImageBase64 = "";
  renderEmojiPicker();
}

function renderHeroCards() {
  dom["hero-character-preview"].innerHTML = state.characters.map((character) => `
    <article class="hero-preview-card">
      ${renderAvatar(character, "profile-avatar")}
      <div>
        <strong>${escapeHTML(character.name)}</strong>
        <span>${escapeHTML(character.description)}</span>
      </div>
      <div class="hero-card-actions">
        <button class="primary-button primary-button--compact" type="button" data-start-chat="${character.id}">Start Chat</button>
        <button class="secondary-button secondary-button--compact" type="button" data-delete-character="${character.id}">Delete</button>
      </div>
    </article>
  `).join("");
}

function renderSidebar() {
  if (!state.chats.length) {
    dom["chat-list"].innerHTML = `<div class="hero-preview-card"><strong>No chats yet</strong><span>Start one from the home character list.</span></div>`;
    return;
  }

  dom["chat-list"].innerHTML = state.chats.map((chat) => {
    const active = chat.id === state.currentChatId ? "is-active" : "";
    const character = getCharacterById(chat.characterId);
    const preview = chat.messages.at(-1)?.content || "New chat";
    return `
      <article class="chat-card ${active}" data-chat-id="${chat.id}">
        ${renderAvatar(character, "avatar-token")}
        <div>
          <div class="chat-card__title">${escapeHTML(chat.title)}</div>
          <div class="chat-card__meta">${escapeHTML(preview.slice(0, 72))}</div>
        </div>
        <button class="icon-button" type="button" data-delete-chat="${chat.id}" title="Delete chat">×</button>
      </article>
    `;
  }).join("");
}

function renderEmojiPicker() {
  dom["emoji-grid"].innerHTML = EMOJIS.map((emoji) => `
    <button class="emoji-button ${emoji === state.selectedEmoji ? "is-selected" : ""}" type="button" data-emoji="${emoji}">
      ${emoji}
    </button>
  `).join("");
}

function renderSettingsPanel() {
  dom["api-base-url"].value = state.apiBaseUrl;
  dom["temperature-slider"].value = String(state.temperature);
  dom["temperature-label"].textContent = state.temperature.toFixed(1);

  if (!state.availableModels.length) {
    dom["model-select"].innerHTML = `<option value="">Detect models first</option>`;
    dom["model-select"].value = "";
    return;
  }

  dom["model-select"].innerHTML = state.availableModels
    .map((model) => `<option value="${escapeHTML(model)}">${escapeHTML(model)}</option>`)
    .join("");
  dom["model-select"].value = state.selectedModel;
}

function renderMessages(messages) {
  return messages.map((message) => `
    <div class="message-row message-row--${message.role}">
      <div class="message-bubble">
        <div class="message-meta">${message.role === "user" ? "You" : "Assistant"}</div>
        <div>${escapeHTML(message.content)}</div>
      </div>
    </div>
  `).join("");
}

function renderCurrentChat() {
  const chat = getCurrentChat();
  if (!chat) {
    goHome();
    return;
  }

  const character = getCharacterById(chat.characterId);
  dom["welcome-screen"].classList.add("hidden");
  dom["chat-screen"].classList.remove("hidden");
  dom["character-avatar"].innerHTML = character?.avatarImage
    ? `<img src="${character.avatarImage}" alt="${escapeHTML(character.name)} avatar">`
    : escapeHTML(character?.avatar || "✨");
  dom["character-name"].textContent = character?.name || "Unknown";
  dom["character-status"].textContent = `Chat created ${formatTime(chat.createdAt)}`;
  dom["message-list"].innerHTML = renderMessages(chat.messages);
  dom["message-list"].scrollTop = dom["message-list"].scrollHeight;
}

function renderInfoDrawer() {
  const chat = getCurrentChat();
  if (!chat) return;

  const character = getCharacterById(chat.characterId);
  if (!character) return;

  dom["info-drawer-content"].innerHTML = `
    <div class="profile-card">
      ${renderAvatar(character, "info-avatar")}
      <div>
        <h3>${escapeHTML(character.name)}</h3>
        <div class="profile-copy">${escapeHTML(character.description)}</div>
      </div>
      <div class="profile-section">
        <strong>System Prompt</strong>
        <pre>${escapeHTML(character.systemPrompt)}</pre>
      </div>
      <div class="profile-section">
        <strong>Type</strong>
        <div>${character.isCustom ? "Custom character" : "Built-in character"}</div>
      </div>
    </div>
  `;
}

function openChat(chatId) {
  state.currentChatId = chatId;
  renderSidebar();
  renderCurrentChat();
}

function createNewChat(characterId) {
  const character = getCharacterById(characterId);
  if (!character) return;

  const chat = {
    id: uid("chat"),
    characterId: character.id,
    title: character.name,
    createdAt: Date.now(),
    messages: [
      {
        role: "assistant",
        content: `Hello, I'm ${character.name}. ${character.description} What would you like to explore today?`
      }
    ]
  };

  state.chats.unshift(chat);
  saveChats();
  closeModal("builder-modal");
  openChat(chat.id);
}

function deleteChat(chatId) {
  if (!window.confirm("Delete this chat?")) return;
  state.chats = state.chats.filter((chat) => chat.id !== chatId);
  if (state.currentChatId === chatId) {
    state.currentChatId = state.chats[0]?.id || null;
  }
  saveChats();
  renderSidebar();
  if (state.currentChatId) {
    renderCurrentChat();
  } else {
    goHome();
  }
}

function deleteCharacter(characterId) {
  const character = getCharacterById(characterId);
  if (!character) return;
  if (!window.confirm(`Delete ${character.name} and its chats?`)) return;

  state.characters = state.characters.filter((item) => item.id !== characterId);
  state.chats = state.chats.filter((chat) => chat.characterId !== characterId);

  if (getCurrentChat()?.characterId === characterId) {
    state.currentChatId = null;
  }

  saveCharacters();
  saveChats();
  renderHeroCards();
  renderSidebar();

  if (state.currentChatId) {
    renderCurrentChat();
  } else {
    goHome();
  }

  toast(`${character.name} deleted.`);
}

function clearCurrentChat() {
  const chat = getCurrentChat();
  if (!chat) return;
  if (!window.confirm("Clear this conversation?")) return;
  chat.messages = chat.messages.slice(0, 1);
  saveChats();
  renderCurrentChat();
  toast("Conversation cleared.");
}

function clearAllChats() {
  if (!window.confirm("Delete all chats?")) return;
  state.chats = [];
  state.currentChatId = null;
  saveChats();
  renderSidebar();
  goHome();
  toast("All chats deleted.");
}

function saveCustomCharacter(event) {
  event.preventDefault();

  const name = dom["custom-name"].value.trim();
  const description = dom["custom-description"].value.trim() || "Custom local character";
  const prompt = dom["custom-prompt"].value.trim();

  if (!name || !prompt) {
    toast("Name and personality prompt are required.", "error");
    return;
  }

  state.characters.unshift({
    id: uid("character"),
    name,
    description,
    systemPrompt: prompt,
    avatar: state.uploadedImageBase64 ? "" : state.selectedEmoji,
    avatarImage: state.uploadedImageBase64,
    isCustom: true
  });

  saveCharacters();
  renderHeroCards();
  resetBuilder();
  closeModal("builder-modal");
  toast(`${name} created.`);
}

function handleAvatarUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    toast("Please choose an image file.", "error");
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    toast("Image must be under 2MB.", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.uploadedImageBase64 = String(reader.result || "");
    dom["avatar-preview"].innerHTML = `<img src="${state.uploadedImageBase64}" alt="Uploaded avatar preview">`;
    dom["avatar-preview"].classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

function autoResizeTextarea() {
  dom["message-input"].style.height = "auto";
  dom["message-input"].style.height = `${Math.min(dom["message-input"].scrollHeight, 180)}px`;
}

function normalizeApiBaseUrl(value) {
  let normalized = (value || "").trim() || DEFAULT_SETTINGS.apiBaseUrl;
  normalized = normalized.replace(/\/$/, "");
  normalized = normalized.replace(/\/chat\/completions$/i, "");
  normalized = normalized.replace(/\/models$/i, "");

  if (!/\/v1$/i.test(normalized)) {
    normalized = `${normalized}/v1`;
  }

  return normalized;
}

function getModelsUrl() {
  return `${normalizeApiBaseUrl(state.apiBaseUrl)}/models`;
}

function getChatCompletionsUrl() {
  return `${normalizeApiBaseUrl(state.apiBaseUrl)}/chat/completions`;
}

async function readJsonResponse(response) {
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new Error(text || `HTTP ${response.status}`);
    }
    throw new Error("Invalid JSON response from LM Studio.");
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `HTTP ${response.status}`);
  }
  return data;
}

async function detectModels() {
  state.apiBaseUrl = normalizeApiBaseUrl(dom["api-base-url"].value);
  dom["api-base-url"].value = state.apiBaseUrl;
  saveSettings();

  try {
    const response = await fetch(getModelsUrl());
    const data = await readJsonResponse(response);
    state.availableModels = Array.isArray(data.data) ? data.data.map((entry) => entry.id).filter(Boolean) : [];

    if (!state.availableModels.length) {
      state.selectedModel = "";
      saveSettings();
      renderSettingsPanel();
      toast("No models found in LM Studio.", "error");
      return;
    }

    if (!state.availableModels.includes(state.selectedModel)) {
      state.selectedModel = state.availableModels[0];
    }

    saveSettings();
    renderSettingsPanel();
    await refreshConnectionStatus(false);
    toast(`Found ${state.availableModels.length} model(s).`);
  } catch (error) {
    state.availableModels = [];
    state.selectedModel = "";
    saveSettings();
    renderSettingsPanel();
    setConnectionStatus("LM Studio offline or blocked", false);
    toast(`Could not detect models: ${error.message}`, "error");
  }
}

function buildChatMessages(chat) {
  const filtered = chat.messages
    .filter((message) => ["user", "assistant"].includes(message.role) && message.content.trim())
    .map(({ role, content }) => ({ role, content }));

  while (filtered.length && filtered[0].role !== "user") {
    filtered.shift();
  }

  const alternating = [];
  for (const message of filtered) {
    const previous = alternating.at(-1);
    if (!previous || previous.role !== message.role) {
      alternating.push(message);
    }
  }

  return alternating.slice(-20);
}

function showTyping() {
  dom["message-list"].insertAdjacentHTML("beforeend", `
    <div class="message-row message-row--assistant" id="typing-row">
      <div class="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  `);
  dom["message-list"].scrollTop = dom["message-list"].scrollHeight;
}

function hideTyping() {
  $("typing-row")?.remove();
}

async function requestAssistantReply(chat) {
  if (state.isGenerating) return;
  const character = getCharacterById(chat.characterId);
  if (!character) return;

  if (!state.selectedModel) {
    renderSettingsPanel();
    openModal("settings-modal");
    toast("Select a model first.", "error");
    return;
  }

  state.isGenerating = true;
  dom["send-btn"].disabled = true;
  showTyping();

  try {
    const response = await fetch(getChatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: state.selectedModel,
        temperature: state.temperature,
        max_tokens: 256,
        stream: false,
        messages: [
          { role: "system", content: character.systemPrompt },
          ...buildChatMessages(chat)
        ]
      })
    });

    const data = await readJsonResponse(response);
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error("Empty response from LM Studio.");

    hideTyping();
    chat.messages.push({ role: "assistant", content: reply });
    saveChats();
    renderCurrentChat();
    renderSidebar();
  } catch (error) {
    hideTyping();
    toast(`LM Studio error: ${error.message}`, "error");
  } finally {
    state.isGenerating = false;
    dom["send-btn"].disabled = false;
  }
}

async function sendMessage() {
  if (state.isGenerating) return;
  const chat = getCurrentChat();
  const text = dom["message-input"].value.trim();
  if (!chat || !text) return;

  chat.messages.push({ role: "user", content: text });
  dom["message-input"].value = "";
  autoResizeTextarea();
  saveChats();
  renderCurrentChat();
  renderSidebar();
  await requestAssistantReply(chat);
}

async function regenerateLastMessage() {
  if (state.isGenerating) return;
  const chat = getCurrentChat();
  if (!chat) return;
  if (chat.messages.at(-1)?.role === "assistant") {
    chat.messages.pop();
  }
  saveChats();
  renderCurrentChat();
  await requestAssistantReply(chat);
}

async function refreshConnectionStatus(silent = true) {
  try {
    const response = await fetch(getModelsUrl());
    const data = await readJsonResponse(response);
    const count = Array.isArray(data.data) ? data.data.length : 0;
    setConnectionStatus(`LM Studio online • ${count} model(s)`, true);
    if (!silent) toast("LM Studio connected.");
  } catch {
    setConnectionStatus("LM Studio offline or blocked", false);
  }
}

function saveSettingsFromForm() {
  state.apiBaseUrl = normalizeApiBaseUrl(dom["api-base-url"].value);
  dom["api-base-url"].value = state.apiBaseUrl;
  state.selectedModel = dom["model-select"].value || "";
  state.temperature = Number(dom["temperature-slider"].value);
  saveSettings();
  closeModal("settings-modal");
  renderSettingsPanel();
  refreshConnectionStatus(false);
}

function bindEvents() {
  $("new-chat-btn").addEventListener("click", goHome);
  $("hero-open-picker").addEventListener("click", () => {
    dom["hero-character-preview"].scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("hero-open-settings").addEventListener("click", () => {
    renderSettingsPanel();
    openModal("settings-modal");
  });
  $("chat-settings-btn").addEventListener("click", () => {
    renderSettingsPanel();
    openModal("settings-modal");
  });
  $("open-custom-builder").addEventListener("click", () => {
    resetBuilder();
    openModal("builder-modal");
  });
  $("back-to-home-btn").addEventListener("click", goHome);
  $("character-form").addEventListener("submit", saveCustomCharacter);
  $("avatar-file").addEventListener("change", handleAvatarUpload);
  $("message-input").addEventListener("input", autoResizeTextarea);
  $("message-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  $("send-btn").addEventListener("click", sendMessage);
  $("clear-chat-btn").addEventListener("click", clearCurrentChat);
  $("clear-all-btn").addEventListener("click", clearAllChats);
  $("regenerate-btn").addEventListener("click", regenerateLastMessage);
  $("character-info-btn").addEventListener("click", () => {
    renderInfoDrawer();
    dom["info-drawer"].classList.remove("hidden");
  });
  $("close-info-btn").addEventListener("click", () => dom["info-drawer"].classList.add("hidden"));
  $("detect-models-btn").addEventListener("click", detectModels);
  $("save-settings-btn").addEventListener("click", saveSettingsFromForm);
  $("temperature-slider").addEventListener("input", () => {
    dom["temperature-label"].textContent = Number(dom["temperature-slider"].value).toFixed(1);
  });
  $("sidebar-open").addEventListener("click", () => dom["sidebar"].classList.add("is-open"));
  $("sidebar-close").addEventListener("click", () => dom["sidebar"].classList.remove("is-open"));

  document.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-close-modal]");
    if (closeTarget) closeModal(closeTarget.dataset.closeModal);

    const startChat = event.target.closest("[data-start-chat]");
    if (startChat) {
      createNewChat(startChat.dataset.startChat);
      dom["sidebar"].classList.remove("is-open");
    }

    const chatCard = event.target.closest("[data-chat-id]");
    if (chatCard && !event.target.closest("[data-delete-chat]")) {
      openChat(chatCard.dataset.chatId);
      dom["sidebar"].classList.remove("is-open");
    }

    const deleteButton = event.target.closest("[data-delete-chat]");
    if (deleteButton) deleteChat(deleteButton.dataset.deleteChat);

    const deleteCharacterButton = event.target.closest("[data-delete-character]");
    if (deleteCharacterButton) deleteCharacter(deleteCharacterButton.dataset.deleteCharacter);

    const emojiButton = event.target.closest("[data-emoji]");
    if (emojiButton) {
      state.selectedEmoji = emojiButton.dataset.emoji;
      state.uploadedImageBase64 = "";
      dom["avatar-preview"].innerHTML = "";
      dom["avatar-preview"].classList.add("hidden");
      renderEmojiPicker();
    }
  });
}

function init() {
  cacheDom();
  loadState();
  bindEvents();
  renderHeroCards();
  renderSidebar();
  renderEmojiPicker();
  renderSettingsPanel();
  autoResizeTextarea();

  if (state.currentChatId) {
    renderCurrentChat();
  } else {
    goHome();
  }

  refreshConnectionStatus(true);
}

window.addEventListener("load", init);
