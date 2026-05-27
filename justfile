set shell := ["bash", "-cu"]

root := justfile_directory()
python_dir := root + "/python"

# --- Python (uv) ---

uv-sync:
    cd {{python_dir}} && uv sync --all-groups

uv-add PACKAGE:
    cd {{python_dir}} && uv add {{PACKAGE}}

uv-test:
    cd {{python_dir}} && uv run pytest

uv-server:
    cd {{python_dir}} && uv run sql-studio-server

uv-lock:
    cd {{python_dir}} && uv lock

# --- Full project ---

install:
    npm install
    cd webview-ui && npm install
    just uv-sync

build:
    npm run build

build-ext:
    npm run build:ext

build-webview:
    npm run build:webview

watch:
    npm run watch &
    cd webview-ui && npm run dev

test:
    just uv-test
    npm run lint

package:
    npm run build
    npx vsce package --no-dependencies

dev:
    @echo "1. just install && just build"
    @echo "2. Press F5 in VS Code/Cursor (Extension Development Host)"
    @echo "Backend: uv run --directory python sql-studio-server"
