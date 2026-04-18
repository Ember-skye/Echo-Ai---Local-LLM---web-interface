import { state, saveSettings, saveChats, getCharacterById } from "./state.js";
import { setConnectionStatus, toast, renderSettingsPanel, renderCurrentChat, renderSidebar, hideTyping, showTyping, renderMarkdown, $ } from "./ui.js";
import { DEFAULT_SETTINGS } from "./data.js";

export function normalizeApiBaseUrl(value) {
  let normalized = (value || "").trim() || DEFAULT_SETTINGS.apiBaseUrl;
  normalized = normalized.replace(/\/$/, "");
  normalized = normalized.replace(/\/chat\/completions$/i, "");
  normalized = normalized.replace(/\/models$/i, "");

  if (!/\/v1$/i.test(normalized)) {
    normalized = `${normalized}/v1`;
  }

  return normalized;
}

export function getModelsUrl() {
  return `${normalizeApiBaseUrl(state.apiBaseUrl)}/models`;
}

export function getChatCompletionsUrl() {
  return `${normalizeApiBaseUrl(state.apiBaseUrl)}/chat/completions`;
}

export async function readJsonResponse(response) {
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

export async function detectModels() {
  const urlInput = $("api-base-url");
  if (!urlInput) return;
  state.apiBaseUrl = normalizeApiBaseUrl(urlInput.value);
  urlInput.value = state.apiBaseUrl;
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

export async function refreshConnectionStatus(silent = true) {
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

export function buildChatMessages(chat) {
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

export async function requestAssistantReply(chat) {
  if (state.isGenerating) return;
  const character = getCharacterById(chat.characterId);
  if (!character) return;

  if (!state.selectedModel) {
    renderSettingsPanel();
    const ui = await import('./ui.js');
    ui.openModal("settings-modal");
    toast("Select a model first.", "error");
    return;
  }

  state.isGenerating = true;
  if ($("send-btn")) $("send-btn").disabled = true;
  showTyping();

  try {
    const response = await fetch(getChatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: state.selectedModel,
        temperature: state.temperature,
        max_tokens: 512,
        stream: true,
        messages: [
          { role: "system", content: character.systemPrompt },
          ...buildChatMessages(chat)
        ]
      })
    });

    if (!response.ok) {
      const errData = await readJsonResponse(response);
      throw new Error("HTTP error " + response.status);
    }

    hideTyping();
    
    // Create new message placeholder
    const assistantMessage = { role: "assistant", content: "" };
    chat.messages.push(assistantMessage);
    
    // Append a streaming row
  const messageList = $("message-list");
  if (messageList) {
    messageList.insertAdjacentHTML("beforeend", `
      <div class="message-row message-row--assistant">
        <div class="message-bubble">
          <div class="message-meta">Assistant</div>
          <div class="message-content" id="streaming-content"></div>
        </div>
      </div>
    `);
  }
    const streamContentNode = $("streaming-content");
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");
      
      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices[0]?.delta?.content || "";
            assistantMessage.content += delta;
            if (streamContentNode) streamContentNode.innerHTML = renderMarkdown(assistantMessage.content);
            if (messageList) messageList.scrollTop = messageList.scrollHeight;
          } catch (e) {
            // parsing error on chunk, ignore
          }
        }
      }
    }
    
    // Remove stream id
    if(streamContentNode) streamContentNode.removeAttribute("id");

    saveChats();
    renderSidebar();
  } catch (error) {
    hideTyping();
    toast(`LM Studio error: ${error.message}`, "error");
  } finally {
    state.isGenerating = false;
    if ($("send-btn")) $("send-btn").disabled = false;
  }
}
