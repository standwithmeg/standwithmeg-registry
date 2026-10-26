#!/usr/bin/env python3
"""A cached JPEG deck must not hide or replace an existing actor portrait."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import regenerate_deployed_actors as regen


class PhotoPreservationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.public = self.root / "public"
        self.export = self.root / "export"
        self.actor = self.public / "ok" / "example_actor"
        self.generated = self.export / "example_actor"
        self.actor.mkdir(parents=True)
        self.generated.mkdir(parents=True)
        for name, value in (("PUBLIC_ACTORS_DIR", self.public), ("EXPORT_ROOT", self.export)):
            patched = patch.object(regen, name, value)
            patched.start()
            self.addCleanup(patched.stop)

    def write_deck(self, directory, has_photo):
        (directory / "spec.json").write_text(json.dumps({
            "actor": {"display_name": "Example Actor", "role": "Judge"},
            "photo": {"exists": has_photo, "path": "/temporary/portrait.png" if has_photo else None},
        }))
        # Published pages contain pre-rendered JPEGs, not the placeholder HTML.
        (directory / "share.html").write_text(
            '<article class="frame" id="frame-01"><img src="frame-01.jpg"></article>'
        )
        (directory / "frame-01.jpg").write_bytes(b"portrait frame" if has_photo else b"placeholder frame")

    def test_cached_placeholder_is_not_healthy_when_a_portrait_exists(self):
        self.write_deck(self.actor, False)
        (self.actor / "image_1080.png").write_bytes(b"approved portrait")
        self.assertFalse(regen.actor_photo_wired("example_actor", "OK"))

    def test_missing_previously_rendered_portrait_is_not_healthy(self):
        self.write_deck(self.actor, True)
        self.assertFalse(regen.actor_photo_wired("example_actor", "OK"))

    def test_deck_without_any_portrait_is_still_valid(self):
        self.write_deck(self.actor, False)
        self.assertTrue(regen.actor_photo_wired("example_actor", "OK"))

    def test_persisted_portrait_does_not_need_the_old_temporary_path(self):
        self.write_deck(self.actor, True)
        (self.actor / "image_1080.png").write_bytes(b"approved portrait")
        self.assertTrue(regen.actor_photo_wired("example_actor", "OK"))

    def test_rejects_photo_loss_before_touching_published_files(self):
        self.write_deck(self.actor, True)
        (self.actor / "image_1080.png").write_bytes(b"approved portrait")
        self.write_deck(self.generated, False)
        before = {p.name: p.read_bytes() for p in self.actor.iterdir()}
        with self.assertRaisesRegex(RuntimeError, "portrait"):
            regen.copy_generated_assets("example_actor", "OK")
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.actor.iterdir()})

    def test_healthy_rebuild_preserves_existing_portrait_bytes(self):
        self.write_deck(self.actor, False)
        (self.actor / "image_1080.png").write_bytes(b"approved portrait")
        self.write_deck(self.generated, True)
        regen.copy_generated_assets("example_actor", "OK")
        self.assertEqual((self.actor / "image_1080.png").read_bytes(), b"approved portrait")
        self.assertEqual((self.actor / "frame-01.jpg").read_bytes(), b"portrait frame")


if __name__ == "__main__":
    unittest.main()
