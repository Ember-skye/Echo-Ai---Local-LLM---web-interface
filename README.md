# ✦ EchoAI

**EchoAI** is a sleek, local-first web interface designed for chatting with Large Language Models (LLMs) hosted via the **LM Studio API**. Modeled after modern character-based chat platforms, it allows you to interact with your favorite models privately, with all data staying on your own hardware.

## 🚀 Key Features

* **LM Studio Integration**: Connects seamlessly to any local model running via the LM Studio API (OpenAI-compatible).
* **Character Personalization**: Create custom AI personas with unique names, descriptions, and deep system prompts to define their behavior.
* **Local-First Privacy**: All chat histories, custom characters, and settings are saved directly in your browser's **LocalStorage**. No external databases or cloud tracking.
* **Rich UI/UX**:
    * **Character Picker**: Quick-start conversations with built-in personas like Luna, Ember, or Nova.
    * **Avatar Builder**: Supports both emoji-based avatars and custom image uploads (Base64 encoded).
    * **Dynamic Settings**: Real-time control over API endpoints, model selection, and temperature (creativity) levels.
    * **Mobile Friendly**: Responsive sidebar and chat screens for a great experience on any device.
* **Smart Message Management**: Supports message regeneration, conversation clearing, and history tracking.

## 🛠️ Tech Stack

* **Frontend**: HTML5, CSS3 (Modern Flexbox/Grid), and Vanilla JavaScript.
* **Backend (Local)**: LM Studio (Local Inference Server).
* **Storage**: Web Storage API (LocalStorage).

## 🚥 Getting Started

1.  **Launch LM Studio**: Open LM Studio and start the **Local Server** (usually on port 1234).
2.  **Enable CORS**: Ensure "Cross-Origin Resource Sharing" is enabled in your LM Studio settings to allow the web app to communicate with the server.
3.  **Clone & Open**: Clone this repository and open `index.html` in any modern browser.
4.  **Connect**: Open the **Settings** modal in EchoAI, detect your models, and start chatting!

## 📄 License

This project is open-source and available under the **Apache 2.0**.
