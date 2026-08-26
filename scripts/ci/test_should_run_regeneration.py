#!/usr/bin/env python3
"""Regression tests for independent PDF and actor-share activity clocks."""
from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parent / "should-run-regeneration.sh"


class RegenerationScopeTests(unittest.TestCase):
    def _git(self, repo: Path, *args: str, date: str | None = None) -> None:
        env = os.environ.copy()
        if date:
            env["GIT_AUTHOR_DATE"] = date
            env["GIT_COMMITTER_DATE"] = date
        subprocess.run(
            ["git", *args], cwd=repo, env=env, check=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

    def test_each_scope_uses_its_own_latest_generated_commit(self) -> None:
        with tempfile.TemporaryDirectory() as raw_temp:
            root = Path(raw_temp)
            repo = root / "repo"
            fake_bin = root / "bin"
            repo.mkdir()
            fake_bin.mkdir()
            self._git(repo, "init", "-q")
            self._git(repo, "config", "user.name", "Test")
            self._git(repo, "config", "user.email", "test@example.com")

            actor_file = repo / "public/court-actors/manifest.json"
            actor_file.parent.mkdir(parents=True)
            actor_file.write_text("{}\n")
            self._git(repo, "add", str(actor_file.relative_to(repo)))
            self._git(
                repo, "commit", "-qm", "actor output",
                date="2026-08-26T07:00:00+00:00",
            )

            pdf_file = repo / "public/state-reports/index.json"
            pdf_file.parent.mkdir(parents=True)
            pdf_file.write_text("[]\n")
            self._git(repo, "add", str(pdf_file.relative_to(repo)))
            self._git(
                repo, "commit", "-qm", "pdf output",
                date="2026-08-26T08:00:00+00:00",
            )

            fake_curl = fake_bin / "curl"
            fake_curl.write_text(
                "#!/usr/bin/env bash\n"
                "printf 'HTTP/2 200\\r\\nContent-Range: 0-0/0\\r\\n\\r\\n'\n"
            )
            fake_curl.chmod(0o755)

            def run_scope(scope: str) -> str:
                output_path = root / f"{scope}.output"
                env = os.environ.copy()
                env.update({
                    "PATH": f"{fake_bin}:{env['PATH']}",
                    "GITHUB_EVENT_NAME": "schedule",
                    "GITHUB_OUTPUT": str(output_path),
                    "NEXT_PUBLIC_SUPABASE_URL": "https://example.supabase.co",
                    "SUPABASE_SERVICE_ROLE_KEY": "test-only",
                    "REGENERATION_SCOPE": scope,
                })
                result = subprocess.run(
                    ["bash", str(SCRIPT)], cwd=repo, env=env, check=True,
                    text=True, capture_output=True,
                )
                return result.stdout

            self.assertIn(
                "Last generated commit timestamp: 2026-08-26T07:00:00Z",
                run_scope("actor"),
            )
            self.assertIn(
                "Last generated commit timestamp: 2026-08-26T08:00:00Z",
                run_scope("pdf"),
            )


if __name__ == "__main__":
    unittest.main()
