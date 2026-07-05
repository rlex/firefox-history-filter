#!/usr/bin/env python3

import pathlib
import zipfile


ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "dist" / "history-filter-unsigned.xpi"
FILES = [
    "manifest.json",
    "background.js",
    "matcher.js",
    "settings.js",
    "options.css",
    "options.html",
    "options.js",
    "icons/icon-16.png",
    "icons/icon-19.png",
    "icons/icon-32.png",
    "icons/icon-38.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
    "icons/page-on-19.png",
    "icons/page-on-38.png",
    "icons/page-off-19.png",
    "icons/page-off-38.png",
]


def main():
    OUTPUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for file_name in FILES:
            archive.write(ROOT / file_name, file_name)
    print(OUTPUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
