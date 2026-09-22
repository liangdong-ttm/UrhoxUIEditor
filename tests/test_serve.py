"""Read-only project bridge contract; all fixture files live in a temp directory."""
import importlib.util
import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen


spec = importlib.util.spec_from_file_location("editor_serve", Path(__file__).parents[1] / "serve.py")
serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve)


class ProjectPreviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name).resolve()
        serve.PROJECT = cls.root / "game"
        assets = serve.PROJECT / "assets"
        assets.mkdir(parents=True)
        (assets / "screen.ui.json").write_text('{"type":"Panel"}')
        (assets / "screen.ui.json.meta").write_text("{}")
        (assets / "other.UI.JSON").write_text("{}")
        (assets / "image.png").write_bytes(b"image")
        (assets / "image.png.meta").write_text("{}")
        outside = serve.PROJECT / "private.txt"
        outside.write_text("not an asset")
        (assets / "escape.ui.json").symlink_to(outside)
        cls.server = serve.ThreadingHTTPServer(("127.0.0.1", 0), serve.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def test_manifest_excludes_meta_and_symlinks(self):
        with urlopen(self.base + "/api/project") as response:
            manifest = json.load(response)
        self.assertEqual({f["name"] for f in manifest["ui"]},
                         {"screen.ui.json", "other.UI.JSON"})
        self.assertEqual(len(manifest["assets"]), 1)
        self.assertTrue(manifest["assets"][0]["hasMeta"])

    def test_assets_are_readable(self):
        with urlopen(self.base + "/project/assets/screen.ui.json") as response:
            self.assertEqual(json.load(response), {"type": "Panel"})

    def test_paths_cannot_escape_assets(self):
        for path in ("/project/private.txt", "/project/assets/../private.txt",
                     "/project/assets/%2e%2e/private.txt", "/project/assets/escape.ui.json"):
            with self.subTest(path=path):
                with self.assertRaises(HTTPError) as error:
                    urlopen(self.base + path)
                self.assertEqual(error.exception.code, 404)

    def test_save_cannot_write_project_bridge(self):
        request = Request(self.base + "/api/save", method="POST",
                          data=json.dumps({"path": "/project/assets/screen.ui.json",
                                           "content": "{}"}).encode(),
                          headers={"Content-Type": "application/json"})
        with self.assertRaises(HTTPError) as error:
            urlopen(request)
        self.assertEqual(error.exception.code, 400)
        self.assertEqual((serve.PROJECT / "assets/screen.ui.json").read_text(), '{"type":"Panel"}')


if __name__ == "__main__":
    unittest.main()
