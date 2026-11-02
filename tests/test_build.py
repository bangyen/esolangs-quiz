"""Build tests: the committed index.html must be exactly what
scripts/build.py assembles from src/ + assets/, its inline script
must parse, and the tuned page behaviour (no typing, no timer,
three modes) must still be present in the built page.

Run:  python3 -m unittest discover -s tests
"""
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILT = (ROOT / "index.html").read_text(encoding="utf-8")


class TestBuildFreshness(unittest.TestCase):
    def test_built_page_is_fresh(self):
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts/build.py"), "--check"],
            capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


class TestBuiltPage(unittest.TestCase):
    def test_title_and_modes_present(self):
        self.assertIn("<title>Esolangs Quiz", BUILT)
        for btn in ("modeNormalBtn", "modeHardBtn", "modeExpertBtn"):
            self.assertIn(f'id="{btn}"', BUILT)

    def test_no_typing_no_timer(self):
        self.assertNotIn("<input", BUILT)
        script = re.search(r"<script>(.*?)</script>", BUILT, re.S).group(1)
        for token in ("setInterval", "onTimeout", "timeLeft"):
            self.assertNotIn(token, script)

    def test_social_meta_present(self):
        for prop in ("og:title", "og:description", "og:type", "og:url", "og:image"):
            self.assertIn(f'property="{prop}"', BUILT)

    def test_piet_image_inlined(self):
        self.assertIn('id="codeImg" src="data:image/webp;base64,', BUILT)


@unittest.skipUnless(shutil.which("node"), "node not available — script parse check skipped")
class TestScriptParses(unittest.TestCase):
    def test_inline_script_parses(self):
        script = re.search(r"<script>(.*?)</script>", BUILT, re.S).group(1)
        with tempfile.NamedTemporaryFile(
                "w", suffix=".js", delete=False, encoding="utf-8") as f:
            f.write(script)
            path = f.name
        result = subprocess.run(["node", "--check", path],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
