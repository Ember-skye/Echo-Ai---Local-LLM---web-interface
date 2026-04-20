import { state, saveSettings, saveChats, getCharacterById } from "./state.js";
import { setConnectionStatus, toast, renderSettingsPanel, renderCurrentChat, renderSidebar, hideTyping, showTyping, renderMarkdown, $ } from "./ui.js";
import { DEFAULT_SETTINGS } from "./data.js";

const RECENT_MESSAGE_WINDOW = 8;
const MEMORY_MIN_MESSAGES = 12;
const memoryUpdateLocks = new Set();
const MOJIBAKE_PATTERN = /(?:[\u00C2\u00C3\u00E2][\u0080-\u00FF]|[\u00C2\u00C3\u00E2])/;

function repairMojibake(value) {
  if (typeof value !== "string" || !MOJIBAKE_PATTERN.test(value)) return value;

  try {
    const bytes = Uint8Array.from(Array.from(value, (char) => char.charCodeAt(0) & 0xff));
    const repaired = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return repaired.includes("\uFFFD") ? value : repaired;
  } catch {
    return value;
  }
}

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

  const sliced = alternating.slice(-12); // Slightly larger window for better context
  
  // Ensure the first message is from the user to comply with API requirements
  while (sliced.length && sliced[0].role !== "user") {
    sliced.shift();
  }
  
  return sliced;
}

function getMeaningfulHistory(chat) {
  return (chat.messages || []).filter((message) => {
    return ["user", "assistant"].includes(message.role) && message.content.trim();
  });
}

function getMemoryState(chat) {
  if (!chat.memoryState || typeof chat.memoryState !== "object") {
    chat.memoryState = { lastProcessedIndex: 0 };
  }

  if (!Number.isInteger(chat.memoryState.lastProcessedIndex) || chat.memoryState.lastProcessedIndex < 0) {
    chat.memoryState.lastProcessedIndex = 0;
  }

  return chat.memoryState;
}

export async function updateChatMemory(chat) {
  if (!chat?.id || memoryUpdateLocks.has(chat.id)) return;

  const history = getMeaningfulHistory(chat);
  if (history.length <= MEMORY_MIN_MESSAGES) return;

  const stableCutoff = Math.max(0, history.length - RECENT_MESSAGE_WINDOW);
  if (stableCutoff <= 0) return;

  const memoryState = getMemoryState(chat);
  const startIndex = Math.min(memoryState.lastProcessedIndex, stableCutoff);
  const toProcess = history.slice(startIndex, stableCutoff);
  if (!toProcess.length) return;

  const contextText = toProcess.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  memoryUpdateLocks.add(chat.id);

  try {
    // Layer 2: Update Summary (Long-Term Memory)
    const summaryTask = async () => {
      const prompt = `Summarize only the new conversation segment below and merge it into the running summary.
Do not invent motives, threats, romance, or backstory unless explicitly stated in the dialogue.
Keep it grounded in observable events and clearly expressed feelings.

Current Summary: ${chat.summary || "None"}

New segments to add:
${contextText}

New Revised Summary:`;

      try {
        const response = await fetch(getChatCompletionsUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: state.selectedModel,
            temperature: 0.3,
            max_tokens: 300,
            messages: [
              { role: "system", content: "You are a context preservation engine. Preserve continuity accurately and avoid speculation." },
              { role: "user", content: prompt }
            ]
          })
        });
        const data = await readJsonResponse(response);
        return data.choices[0]?.message?.content?.trim();
      } catch (e) {
        console.error("Summary update failed:", e);
        return null;
      }
    };

    // Layer 3: Extract Facts (Persistent Memory)
    const factsTask = async () => {
      const prompt = `Extract only facts that are explicitly stated in the dialogue below.
Do not infer motives, personality traits, relationship labels, or hidden context.
If a field is unknown, use an empty string for strings and [] for arrays.
Prefer concrete, durable facts over momentary emotional guesses.

Return ONLY a valid JSON object with this structure:
{
  "userName": "string",
  "relationship": "string",
  "facts": ["list of key facts"],
  "events": ["list of major recent events"]
}

Current Metadata: ${JSON.stringify(chat.metadata || {})}

Dialogue:
${contextText}`;

      try {
        const response = await fetch(getChatCompletionsUrl(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: state.selectedModel,
            temperature: 0.1,
            max_tokens: 400,
            messages: [
              { role: "system", content: "You are a fact extraction engine. Return only valid JSON with no markdown and no speculation." },
              { role: "user", content: prompt }
            ]
          })
        });
        const data = await readJsonResponse(response);
        const content = data.choices[0]?.message?.content?.trim();
        // Try to find JSON in the response (sometimes models add markdown blocks)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
      } catch (e) {
        console.error("Fact extraction failed:", e);
        return null;
      }
    };

    // Run both updates
    const [newSummary, newMetadata] = await Promise.all([summaryTask(), factsTask()]);

    let changed = false;
    if (newSummary) {
      chat.summary = newSummary;
      changed = true;
    }
    if (newMetadata) {
      chat.metadata = chat.metadata || { userName: "", relationship: "", facts: [], events: [] };
      if (newMetadata.userName) chat.metadata.userName = newMetadata.userName;
      if (newMetadata.relationship) chat.metadata.relationship = newMetadata.relationship;
      
      // Merge lists avoiding duplicates
      const merge = (oldList, newList) => [...new Set([...(oldList || []), ...((newList || []).filter(Boolean))])].slice(-20);
      chat.metadata.facts = merge(chat.metadata.facts, newMetadata.facts);
      chat.metadata.events = merge(chat.metadata.events, newMetadata.events);
      changed = true;
    }

    memoryState.lastProcessedIndex = stableCutoff;
    changed = true;

    if (changed) saveChats();
  } finally {
    memoryUpdateLocks.delete(chat.id);
  }
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

  // Trigger background memory update
  updateChatMemory(chat);

  state.isGenerating = true;
  if ($("send-btn")) $("send-btn").disabled = true;
  showTyping();

  try {
    // Build Complex Prompt with 3 Memory Layers if meaningful data exists
    const meta = chat.metadata || {};
    const hasMemory = !!(chat.summary || (meta.facts && meta.facts.length) || (meta.events && meta.events.length) || meta.userName || meta.relationship);

    let systemContent = character.systemPrompt;

    // Inject initial greeting/scene into system prompt to preserve context
    // while keeping the message list starting with a user message.
    const firstMessage = chat.messages[0];
    if (firstMessage && firstMessage.role === "assistant") {
      systemContent += `\n\n[SCENE START]\n${character.name}: ${firstMessage.content}`;
    }
    
    if (hasMemory) {
      const memoryPrompt = `
[LONG TERM MEMORY]:
${chat.summary || "No prior history recorded."}

[USER INFO]:
Name: ${meta.userName || "Unknown"}
Relationship: ${meta.relationship || "Acquaintances"}

[IMPORTANT FACTS]:
${(meta.facts || []).join("\n") || "None"}

[PAST EVENTS]:
${(meta.events || []).join("\n") || "None"}
`.trim();
      systemContent += `\n\nSTAY CONSISTENT WITH THIS MEMORY:\n${memoryPrompt}`;
    }

    const response = await fetch(getChatCompletionsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: state.selectedModel,
        temperature: state.temperature,
        max_tokens: 512,
        stream: true,
        messages: [
          { role: "system", content: systemContent },
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
            <div class="message-meta">${character.name}</div>
            <div class="message-content" id="streaming-content"></div>
          </div>
        </div>
      `);
    }
    const streamContentNode = $("streaming-content");
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    
    let pending = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() || "";
      
      for (const line of lines) {
        if (line.startsWith("data: ") && line !== "data: [DONE]") {
          try {
            const data = JSON.parse(line.slice(6));
            const delta = data.choices[0]?.delta?.content || "";
            assistantMessage.content += delta;
            const renderedContent = repairMojibake(assistantMessage.content);
            if (streamContentNode) streamContentNode.innerHTML = renderMarkdown(renderedContent);
            if (messageList) messageList.scrollTop = messageList.scrollHeight;
          } catch (e) { }
        }
      }
    }

    pending += decoder.decode();
    for (const line of pending.split("\n")) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        try {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices[0]?.delta?.content || "";
          assistantMessage.content += delta;
          const renderedContent = repairMojibake(assistantMessage.content);
          if (streamContentNode) streamContentNode.innerHTML = renderMarkdown(renderedContent);
        } catch (e) { }
      }
    }

    assistantMessage.content = repairMojibake(assistantMessage.content);
    
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
