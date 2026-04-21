import { DEFAULT_CHARACTERS, DEFAULT_SETTINGS } from "./data.js";

const API_DATA_URL = "/api/data";
const API_UPLOAD_URL = "/api/upload-avatar";
const MOJIBAKE_PATTERN = /(?:[\u00C2\u00C3\u00E2][\u0080-\u00FF]|[\u00C2\u00C3\u00E2])/;

export const state = {
  characters: [],
  chats: [],
  archivedChats: [],
  archivedCharacters: [],
  searchQuery: "",
  activeTag: "All",
  builderTags: [],
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

export function repairMojibake(value) {
  if (typeof value !== "string" || !MOJIBAKE_PATTERN.test(value)) return value;

  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return repaired.includes("\uFFFD") ? value : repaired;
  } catch {
    return value;
  }
}

export function sanitizeTextTree(value) {
  if (typeof value === "string") {
    return repairMojibake(value);
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeTextTree);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, sanitizeTextTree(nestedValue)])
    );
  }

  return value;
}

/**
 * Load all state from the server JSON files.
 * Falls back to defaults if the server has no data yet.
 */
export async function loadState() {
  const types = ["characters", "chats", "archive", "settings"];
  
  try {
    const results = await Promise.all(
      types.map(type => fetch(`${API_DATA_URL}?type=${type}`).then(r => r.json()))
    );
    
    const [charData, chatData, archiveData, settingsData] = results;

    state.characters = Array.isArray(charData.characters) && charData.characters.length
      ? sanitizeTextTree(charData.characters)
      : DEFAULT_CHARACTERS;
    
    state.archivedCharacters = Array.isArray(charData.archivedCharacters) ? sanitizeTextTree(charData.archivedCharacters) : [];
    state.chats = Array.isArray(chatData.chats) ? sanitizeTextTree(chatData.chats) : [];
    state.archivedChats = Array.isArray(archiveData.archivedChats) ? sanitizeTextTree(archiveData.archivedChats) : [];
    state.searchQuery = "";
    state.activeTag = "All";
    state.builderTags = [];

    const settings = settingsData.settings || {};
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
    state.searchQuery = "";
    state.activeTag = "All";
    state.builderTags = [];
  }
}

/**
 * Persist specific parts of the state to the server.
 */
function persistPart(type, payload) {
  fetch(`${API_DATA_URL}?type=${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sanitizeTextTree(payload))
  }).catch(err => console.error(`[EchoAI] Save failed for ${type}:`, err.message));
}

export function saveCharacters() {
  persistPart("characters", { 
    characters: state.characters, 
    archivedCharacters: state.archivedCharacters 
  });
}

export function saveChats() {
  persistPart("chats", { chats: state.chats });
}

export function saveArchivedChats() {
  persistPart("archive", { archivedChats: state.archivedChats });
}

export function saveArchivedCharacters() {
  saveCharacters(); // Shared in characters.json
}

export function saveSettings() {
  persistPart("settings", {
    settings: {
      apiBaseUrl: state.apiBaseUrl,
      selectedModel: state.selectedModel,
      availableModels: state.availableModels,
      temperature: state.temperature
    }
  });
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

