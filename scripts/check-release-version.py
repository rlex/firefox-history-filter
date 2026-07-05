#!/usr/bin/env python3

import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def main():
    tag_name = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GITHUB_REF_NAME", "")

    with (ROOT / "manifest.json").open(encoding="utf-8") as manifest_file:
        manifest = json.load(manifest_file)

    expected_tag = manifest["version"]

    if not re.fullmatch(r"\d+\.\d+\.\d+", tag_name):
        print(f"Release tags must use MAJOR.MINOR.PATCH format. Got: {tag_name}", file=sys.stderr)
        return 1

    if tag_name != expected_tag:
        print(
            f"Tag {tag_name} does not match manifest version {manifest['version']}. Expected {expected_tag}.",
            file=sys.stderr
        )
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
