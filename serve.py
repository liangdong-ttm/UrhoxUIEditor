#!/usr/bin/env python3
"""Local static server plus save API that writes .ui.json back to disk."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import posixpath
import argparse
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 4190
PROJECT = None


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if PROJECT and path == "/api/project":
            entries = []
            assets = []
            for file in sorted((PROJECT / "assets").rglob("*")):
                if not file.is_file() or not file.resolve().is_relative_to(PROJECT / "assets"):
                    continue
                rel = file.relative_to(PROJECT).as_posix()
                entry = {"path": "/project/" + rel, "name": file.name,
                         "dir": str(file.relative_to(PROJECT).parent),
                         "assetRoot": "/project/assets/"}
                if file.name.lower().endswith(".ui.json"):
                    entry["kind"] = "ui"
                    entries.append(entry)
                elif file.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".ttf", ".otf"):
                    entry.update(kind="font" if file.suffix.lower() in (".ttf", ".otf") else "image",
                                 ref=file.relative_to(PROJECT / "assets").as_posix(),
                                 hasMeta=Path(str(file) + ".meta").is_file())
                    assets.append(entry)
            body = json.dumps({"name": PROJECT.name, "ui": entries, "assets": assets}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path.startswith("/project/"):
            file = (PROJECT / path[len("/project/"):]).resolve() if PROJECT else None
            if not file or not file.is_relative_to(PROJECT / "assets") or not file.is_file():
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", self.guess_type(str(file)))
            self.send_header("Content-Length", str(file.stat().st_size))
            self.end_headers()
            with file.open("rb") as source:
                self.copyfile(source, self.wfile)
            return
        super().do_GET()

    def do_POST(self):
        if self.path.rstrip("/") != "/api/save":
            self.send_error(404, "unknown api")
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            rel = (payload.get("path") or "").replace("\\", "/").lstrip("/")
            content = payload.get("content")
            if not rel or not isinstance(content, str):
                raise ValueError("path and content required")
            if ".." in rel.split("/"):
                raise ValueError("invalid path")
            if rel.startswith("project/"):
                raise ValueError("external project preview is read-only")
            if not rel.endswith(".json"):
                raise ValueError("only json files can be saved")
            dest = os.path.abspath(os.path.join(ROOT, posixpath.normpath(rel)))
            root = os.path.abspath(ROOT)
            if dest != root and not dest.startswith(root + os.sep):
                raise ValueError("path outside workspace")
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "w", encoding="utf-8", newline="\n") as handle:
                handle.write(content)
            body = json.dumps({"ok": True, "path": rel}).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            body = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
            self.send_response(400)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        if "/api/save" in str(args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--project", type=Path, help="Read-only project assets for local acceptance")
    args = parser.parse_args()
    PORT = args.port
    PROJECT = args.project.resolve() if args.project else None
    if PROJECT and not (PROJECT / "assets").is_dir():
        parser.error("project must contain an assets directory")
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print("Serving http://127.0.0.1:%s/  POST /api/save writes json under this folder" % PORT)
    server.serve_forever()
