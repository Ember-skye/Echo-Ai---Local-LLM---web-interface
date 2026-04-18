"""
EchoAI Server — lightweight Python HTTP server with JSON storage API.
No external dependencies required (pure stdlib).

Endpoints:
  GET  /api/data           → Read all app data from data/storage.json
  POST /api/data           → Write all app data to data/storage.json
  POST /api/upload-avatar  → Upload an image to assets/, returns { "path": "..." }
  *    /*                   → Serve static files from project root
"""

import http.server
import json
import os
import time
import shutil
import sys
import re

PORT = 5500
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATA_FILE = os.path.join(DATA_DIR, "storage.json")
ASSETS_DIR = os.path.join(BASE_DIR, "assets")


def ensure_dirs():
    """Create data/ and assets/ directories if they don't exist."""
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(ASSETS_DIR, exist_ok=True)


def read_storage():
    """Read and return the storage JSON, or empty dict if not found."""
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def write_storage(data):
    """Write data to storage.json atomically via temp file."""
    tmp_path = DATA_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    shutil.move(tmp_path, DATA_FILE)


def parse_multipart(body, boundary):
    """Parse a multipart/form-data body and return (filename, file_bytes)."""
    parts = body.split(b"--" + boundary)
    for part in parts:
        if b"Content-Disposition" not in part:
            continue
        # Split headers from content
        header_end = part.find(b"\r\n\r\n")
        if header_end == -1:
            continue
        header_section = part[:header_end].decode("utf-8", errors="replace")
        file_data = part[header_end + 4:]
        # Strip trailing \r\n--
        if file_data.endswith(b"\r\n"):
            file_data = file_data[:-2]

        # Extract filename from Content-Disposition
        match = re.search(r'filename="([^"]+)"', header_section)
        if match:
            return match.group(1), file_data
    return None, None


class EchoAIHandler(http.server.SimpleHTTPRequestHandler):
    """Custom handler that adds API endpoints on top of static file serving."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Add CORS headers for local development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/data":
            self._handle_get_data()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/data":
            self._handle_post_data()
        elif self.path == "/api/upload-avatar":
            self._handle_upload_avatar()
        else:
            self.send_error(404, "Not Found")

    def _handle_get_data(self):
        """Return all stored app data as JSON."""
        data = read_storage()
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _handle_post_data(self):
        """Save the full app state to storage.json."""
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(content_length)
            data = json.loads(raw.decode("utf-8"))
            write_storage(data)

            body = json.dumps({"ok": True}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json.dumps({"ok": False, "error": str(e)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def _handle_upload_avatar(self):
        """Save an uploaded image file to assets/ and return its path."""
        try:
            content_type = self.headers.get("Content-Type", "")
            if "multipart/form-data" not in content_type:
                raise ValueError("Expected multipart/form-data")

            # Extract boundary from Content-Type header
            match = re.search(r"boundary=(.+)", content_type)
            if not match:
                raise ValueError("No boundary found in Content-Type")
            boundary = match.group(1).strip().encode("utf-8")

            # Read and parse multipart body
            content_length = int(self.headers.get("Content-Length", 0))
            body_raw = self.rfile.read(content_length)
            filename, file_data = parse_multipart(body_raw, boundary)

            if not filename or not file_data:
                raise ValueError("No file found in upload")

            # Determine extension from original filename
            _, ext = os.path.splitext(filename)
            if ext.lower() not in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
                ext = ".png"

            # Generate unique filename
            timestamp = int(time.time() * 1000)
            safe_name = f"char_upload_{timestamp}{ext}"
            filepath = os.path.join(ASSETS_DIR, safe_name)

            # Write the file
            with open(filepath, "wb") as f:
                f.write(file_data)

            rel_path = f"./assets/{safe_name}"
            body = json.dumps({"ok": True, "path": rel_path}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            body = json.dumps({"ok": False, "error": str(e)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, format, *args):
        """Cleaner log output."""
        sys.stdout.write(f"[EchoAI] {args[0]}\n")


def main():
    ensure_dirs()
    server = http.server.HTTPServer(("", PORT), EchoAIHandler)
    print(f"[EchoAI] Server running at http://localhost:{PORT}/")
    print(f"[EchoAI] Data stored in: {DATA_FILE}")
    print(f"[EchoAI] Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[EchoAI] Server stopped.")
        server.server_close()


if __name__ == "__main__":
    main()
