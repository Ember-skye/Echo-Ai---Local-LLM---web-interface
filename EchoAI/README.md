# EchoAI Remix

An improved multi-file version of the original single-file `3.html` project.

## What's improved

- Split into separate HTML, CSS, and JavaScript files
- Removed inline event handlers in favor of organized module-based logic
- Cleaner responsive layout for desktop and mobile
- More polished visual design and better spacing
- Local character builder with emoji or image avatar support
- LM Studio model detection and local chat persistence

## Run

You can still open `index.html` directly, but the cleaner option is to run the included launcher:

- Double-click `start-echoai.bat`
- It starts a local Python server on `http://localhost:5500`
- It opens the app in your browser automatically

For LM Studio replies, make sure:

1. LM Studio server is running
2. CORS is allowed
3. The base URL matches your local LM Studio server
