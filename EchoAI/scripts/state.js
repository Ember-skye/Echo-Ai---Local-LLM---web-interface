import { DEFAULT_CHARACTERS, DEFAULT_SETTINGS } from "./data.js";

const API_DATA_URL = "/api/data";
const API_UPLOAD_URL = "/api/upload-avatar";

export const state = {
  characters: [],
  chats: [],
  archivedChats: [],
  archivedCharacters: [],
  currentChatId: null,
  apiBaseUrl: DEFAULT_SETTINGS.apiBaseUrl,
  selectedModel: DEFAULT_SETTINGS.selectedModel,
  availableModels: DEFAULT_SETTINGS.availableModels,
  temperature: DEFAULT_SETTINGS.temperature,
  uploadedImagePath: "",
  isGenerating: false
};

// Debounce timer for batching rapid save calls
let _saveTimer = null;

/**
 * Load all state from the server JSON file.
 * Falls back to defaults if the server has no data yet.
 */
export async function loadState() {
  try {
    const response = await fetch(API_DATA_URL);
    const data = await response.json();

    state.characters = Array.isArray(data.characters) && data.characters.length
      ? data.characters
      : DEFAULT_CHARACTERS;

    state.chats = Array.isArray(data.chats) ? data.chats : [];
    state.archivedChats = Array.isArray(data.archivedChats) ? data.archivedChats : [];
    state.archivedCharacters = Array.isArray(data.archivedCharacters) ? data.archivedCharacters : [];

    const settings = data.settings || {};
    state.apiBaseUrl = settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl;
    state.selectedModel = settings.selectedModel || "";
    state.availableModels = Array.isArray(settings.availableModels) ? settings.availableModels : [];
    state.temperature = Number(settings.temperature ?? DEFAULT_SETTINGS.temperature);
  } catch (error) {
    console.warn("[EchoAI] Could not load server data, using defaults:", error.message);
    state.characters = [...DEFAULT_CHARACTERS];
    state.chats = [];
    state.archivedChats = [];
    state.archivedCharacters = [];
  }
}

/**
 * Persist the full state to the server JSON file.
 * Debounced to avoid hammering the server on rapid updates.
 */
function persistState() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    const payload = {
      characters: state.characters,
      chats: state.chats,
      archivedChats: state.archivedChats,
      archivedCharacters: state.archivedCharacters,
      settings: {
        apiBaseUrl: state.apiBaseUrl,
        selectedModel: state.selectedModel,
        availableModels: state.availableModels,
        temperature: state.temperature
      }
    };

    fetch(API_DATA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(err => console.error("[EchoAI] Save failed:", err.message));
  }, 300);
}

export function saveCharacters() {
  persistState();
}

export function saveChats() {
  persistState();
}

export function saveArchivedChats() {
  persistState();
}

export function saveArchivedCharacters() {
  persistState();
}

export function saveSettings() {
  persistState();
}

/**
 * Upload an avatar image file to the server.
 * Returns the relative path to the saved image (e.g. "./assets/char_upload_123.png").
 */
export async function uploadAvatar(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(API_UPLOAD_URL, {
    method: "POST",
    body: formData
  });

  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Upload failed");
  return result.path;
}

export function getCharacterById(id) {
  return state.characters.find((character) => character.id === id) || null;
}

export function getCurrentChat() {
  return state.chats.find((chat) => chat.id === state.currentChatId) || null;
}

export function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
