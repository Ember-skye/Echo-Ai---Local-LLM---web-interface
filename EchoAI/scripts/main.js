import { state, loadState, saveCharacters, saveChats, saveArchivedChats, saveArchivedCharacters, saveSettings, uploadAvatar, getCharacterById, getCurrentChat, uid } from "./state.js";
import { $, renderHeroCards, renderSidebar, renderSettingsPanel, renderCurrentChat, renderInfoDrawer, goHome, goArchive, resetBuilder, openEditCharacter, toast, openModal, closeModal, autoResizeTextarea, initHeroBannerRotation, toggleSidebar, closeSidebar, renderArchiveScreen } from "./ui.js";
import { requestAssistantReply, detectModels, refreshConnectionStatus, normalizeApiBaseUrl } from "./api.js";

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
        content: `Connection secured. I am ${character.name}. ${character.description} What are your directives?`
      }
    ]
  };

  state.chats.unshift(chat);
  saveChats();
  closeModal("builder-modal");
  openChat(chat.id);
}

function openChat(chatId) {
  state.currentChatId = chatId;
  renderSidebar();
  renderCurrentChat();
}

function deleteChat(chatId) {
  if (!window.confirm("Sever this connection completely?")) return;
  const chatToArchive = state.chats.find((chat) => chat.id === chatId);
  if (chatToArchive) {
    state.archivedChats.unshift(chatToArchive);
    saveArchivedChats();
  }
  
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

export function restoreChat(chatId) {
  const chatToRestore = state.archivedChats.find((chat) => chat.id === chatId);
  if (chatToRestore) {
    state.archivedChats = state.archivedChats.filter((chat) => chat.id !== chatId);
    state.chats.unshift(chatToRestore);
    saveArchivedChats();
    saveChats();
    renderSidebar();
    renderArchiveScreen();
    toast("Connection restored.");
  }
}

export function permanentlyDeleteChat(chatId) {
  if (!window.confirm("Permanently erase this connection? This cannot be undone.")) return;
  state.archivedChats = state.archivedChats.filter((chat) => chat.id !== chatId);
  saveArchivedChats();
  renderArchiveScreen();
  toast("Connection permanently erased.");
}

function deleteCharacter(characterId) {
  const character = getCharacterById(characterId);
  if (!character) return;
  if (!window.confirm(`Archive ${character.name} and all associated neural links?`)) return;

  // Archive the character
  state.archivedCharacters.unshift({ ...character });
  saveArchivedCharacters();

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

  toast(`${character.name} archived.`);
}

export function restoreCharacter(characterId) {
  const charToRestore = state.archivedCharacters.find((c) => c.id === characterId);
  if (charToRestore) {
    state.archivedCharacters = state.archivedCharacters.filter((c) => c.id !== characterId);
    state.characters.unshift(charToRestore);
    saveArchivedCharacters();
    saveCharacters();
    renderHeroCards();
    renderSidebar();
    renderArchiveScreen();
    toast(`${charToRestore.name} restored.`);
  }
}

export function permanentlyDeleteCharacter(characterId) {
  const char = state.archivedCharacters.find((c) => c.id === characterId);
  if (!window.confirm(`Permanently erase ${char?.name || 'this entity'}? This cannot be undone.`)) return;
  state.archivedCharacters = state.archivedCharacters.filter((c) => c.id !== characterId);
  saveArchivedCharacters();
  renderArchiveScreen();
  toast("Entity permanently erased.");
}

function clearCurrentChat() {
  const chat = getCurrentChat();
  if (!chat) return;
  if (!window.confirm("Purge this conversation data?")) return;
  chat.messages = chat.messages.slice(0, 1);
  saveChats();
  renderCurrentChat();
  toast("Conversation purged.");
}

function clearAllChats() {
  if (!window.confirm("Purge all neural links?")) return;
  state.chats = [];
  state.currentChatId = null;
  saveChats();
  renderSidebar();
  goHome();
  toast("All links purged.");
}

function saveCustomCharacter(event) {
  event.preventDefault();

  const editId = $("edit-character-id").value;
  const name = $("custom-name").value.trim();
  const description = $("custom-description").value.trim() || "Unbound Entity";
  const prompt = $("custom-prompt").value.trim();

  if (!name || !prompt) {
    toast("Name and directives are required.", "error");
    return;
  }

  if (!state.uploadedImagePath) {
    toast("A visual manifestation (image) is required.", "error");
    return;
  }

  if (editId) {
    // Editing existing
    const charIndex = state.characters.findIndex(c => c.id === editId);
    if (charIndex > -1) {
      state.characters[charIndex].name = name;
      state.characters[charIndex].description = description;
      state.characters[charIndex].systemPrompt = prompt;
      state.characters[charIndex].avatar = "";
      state.characters[charIndex].avatarImage = state.uploadedImagePath;
      
      // Update chat titles if name changed
      state.chats.forEach(chat => {
        if (chat.characterId === editId && chat.title === getCharacterById(editId).name) {
            chat.title = name;
        }
      });
      toast(`${name} updated.`);
    }
  } else {
    // Creating new
    state.characters.unshift({
      id: uid("character"),
      name,
      title: "UNBOUND ENTITY",
      description,
      systemPrompt: prompt,
      avatar: "",
      avatarImage: state.uploadedImagePath,
      isCustom: true
    });
    toast(`${name} forged.`);
  }

  saveCharacters();
  saveChats();
  renderHeroCards();
  renderSidebar();
  
  if (state.currentChatId && getCurrentChat()?.characterId === editId) {
    renderCurrentChat();
  }
  
  resetBuilder();
  closeModal("builder-modal");
}

async function handleAvatarUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    toast("Invalid optical format.", "error");
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    toast("File exceeds neural capacity (2MB).", "error");
    return;
  }

  try {
    const path = await uploadAvatar(file);
    state.uploadedImagePath = path;
    const preview = $("avatar-preview");
    if (preview) {
      preview.innerHTML = `<img src="${path}" alt="Avatar preview">`;
      preview.classList.remove("hidden");
    }
    toast("Image uploaded.");
  } catch (err) {
    toast(`Upload failed: ${err.message}`, "error");
  }
}

async function sendMessage() {
  if (state.isGenerating) return;
  const chat = getCurrentChat();
  const text = $("message-input").value.trim();
  if (!chat || !text) return;

  chat.messages.push({ role: "user", content: text });
  $("message-input").value = "";
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

function saveSettingsFromForm() {
  const urlInput = $("api-base-url");
  if (urlInput) {
    state.apiBaseUrl = normalizeApiBaseUrl(urlInput.value);
    urlInput.value = state.apiBaseUrl;
  }
  
  const modelSelect = $("model-select");
  if (modelSelect) state.selectedModel = modelSelect.value || "";
  
  const tempSlider = $("temperature-slider");
  if (tempSlider) state.temperature = Number(tempSlider.value);
  saveSettings();
  closeModal("settings-modal");
  renderSettingsPanel();
  refreshConnectionStatus(false);
}

function bindEvents() {
  $("nav-explore-btn").addEventListener("click", () => {
    goHome();
    closeSidebar();
  });

  if ($("nav-archive-btn")) {
    $("nav-archive-btn").addEventListener("click", () => {
      goArchive();
      closeSidebar();
    });
  }

  if ($("new-character-btn")) {
    $("new-character-btn").addEventListener("click", () => {
      resetBuilder();
      openModal("builder-modal");
      closeSidebar();
    });
  }

  $("nav-settings-btn").addEventListener("click", () => {
    renderSettingsPanel();
    openModal("settings-modal");
  });

  if ($("chat-settings-btn")) {
    $("chat-settings-btn").addEventListener("click", () => {
      renderSettingsPanel();
      openModal("settings-modal");
    });
  }

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
    const drawer = $("info-drawer");
    if (drawer) drawer.classList.remove("hidden");
  });
  $("close-info-btn").addEventListener("click", () => {
    const drawer = $("info-drawer");
    if (drawer) drawer.classList.add("hidden");
  });
  $("detect-models-btn").addEventListener("click", detectModels);
  $("save-settings-btn").addEventListener("click", saveSettingsFromForm);
  $("temperature-slider").addEventListener("input", () => {
    const label = $("temperature-label");
    const slider = $("temperature-slider");
    if (label && slider) label.textContent = Number(slider.value).toFixed(1);
  });
  
  // Hero Banner connect action
  $("hero-banner-action").addEventListener("click", () => {
     // A fun interaction: Maybe scroll to characters or open custom builder
     $("hero-character-preview").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Sidebar toggles
  $("sidebar-open").addEventListener("click", toggleSidebar);
  $("sidebar-close").addEventListener("click", closeSidebar);
  const backdrop = $("sidebar-backdrop");
  if(backdrop) {
    backdrop.addEventListener("click", closeSidebar);
  }

  document.addEventListener("click", (event) => {
    const closeTarget = event.target.closest("[data-close-modal]");
    if (closeTarget) closeModal(closeTarget.dataset.closeModal);

    const startChat = event.target.closest("[data-start-chat]");
    if (startChat) {
      createNewChat(startChat.dataset.startChat);
      closeSidebar();
    }

    const editCharacterBtn = event.target.closest("[data-edit-character]");
    if (editCharacterBtn) {
      openEditCharacter(editCharacterBtn.dataset.editCharacter);
    }
    
    const restoreChatBtn = event.target.closest("[data-restore-chat]");
    if (restoreChatBtn) restoreChat(restoreChatBtn.dataset.restoreChat);

    const permDeleteChatBtn = event.target.closest("[data-perm-delete-chat]");
    if (permDeleteChatBtn) permanentlyDeleteChat(permDeleteChatBtn.dataset.permDeleteChat);

    const restoreCharBtn = event.target.closest("[data-restore-character]");
    if (restoreCharBtn) restoreCharacter(restoreCharBtn.dataset.restoreCharacter);

    const permDeleteCharBtn = event.target.closest("[data-perm-delete-character]");
    if (permDeleteCharBtn) permanentlyDeleteCharacter(permDeleteCharBtn.dataset.permDeleteCharacter);

    const chatCard = event.target.closest("[data-chat-id]");
    if (chatCard && !event.target.closest("[data-delete-chat]")) {
      openChat(chatCard.dataset.chatId);
      closeSidebar();
    }

    const deleteButton = event.target.closest("[data-delete-chat]");
    if (deleteButton) deleteChat(deleteButton.dataset.deleteChat);

    const deleteCharacterButton = event.target.closest("[data-delete-character]");
    if (deleteCharacterButton) deleteCharacter(deleteCharacterButton.dataset.deleteCharacter);

  });
}

async function init() {
  await loadState();
  bindEvents();
  renderHeroCards();
  renderSidebar();
  renderSettingsPanel();
  autoResizeTextarea();
  initHeroBannerRotation();

  if (state.currentChatId) {
    renderCurrentChat();
  } else {
    goHome();
  }

  refreshConnectionStatus(true);
}

window.addEventListener("load", init);
