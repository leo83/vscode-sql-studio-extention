set shell := ["bash", "-cu"]

root := justfile_directory()
python_dir := root + "/python"
version := `node -p "require('./package.json').version"`
publisher_url := "https://marketplace.visualstudio.com/manage/publishers/LevRagulin"

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
    cd webview-ui && npm run test

package:
    npm run build
    npx vsce package --no-dependencies --no-rewrite-relative-links

# Builds the .vsix and opens the Marketplace manage page for a manual upload
# (Update button) — no Azure DevOps org / PAT needed, since creating one
# requires a payment method on file that isn't available here.
publish:
    just package
    @echo ""
    @echo "Upload manually — no valid PAT available:"
    @echo "  1. {{publisher_url}}"
    @echo "  2. SQL Studio -> (...) -> Update"
    @echo "  3. Upload cursor-sql-studio-{{version}}.vsix"
    open {{publisher_url}}

# Bypasses the local proxy — vsce's Node HTTP client can't complete an
# NTLM/Kerberos proxy handshake that curl/system tools negotiate transparently.
# Requires a valid Marketplace PAT (`vsce login LevRagulin` or $VSCE_PAT).
publish-pat:
    env -u HTTP_PROXY -u http_proxy -u HTTPS_PROXY -u https_proxy -u ALL_PROXY -u all_proxy npx vsce publish --no-dependencies

dev:
    @echo "1. just install && just build"
    @echo "2. Press F5 in VS Code/Cursor (Extension Development Host)"
    @echo "Backend: uv run --directory python sql-studio-server"
