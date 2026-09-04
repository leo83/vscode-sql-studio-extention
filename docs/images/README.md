# Marketplace screenshots

Add PNG or GIF files here before publishing to the VS Code Marketplace. Recommended captures:

| File | Content | Status |
|------|---------|--------|
| `results-table.png` | Full window — Database Explorer, SQL editor, SQL Results table | added |
| `results-filter.png` | Results panel — expression filter over loaded rows | added |
| `results-context-menu.png` | Results grid — copy / hide column / filter values menu | added |
| `results-chart-line.png` | Results panel — line chart with value labels | added |
| `results-chart.png` | Results panel — pie chart with scrollable legend | added |
| `explorer.png` | Database Explorer with expanded schema and connection tags | optional |
| `er-diagram.png` | ER diagram webview with pan/zoom toolbar | added |
| `connection-dialog.png` | Add Connection webview (with tags) | optional |
| `sql-editor.png` | SQL editor with run button and status bar connection | optional |

## Usage in README

Reference from [README.md](../README.md) with **absolute** `raw` URLs — the Marketplace
cannot resolve relative paths, and `just package` builds with `--no-rewrite-relative-links`:

```markdown
![Database Explorer](https://raw.githubusercontent.com/leo83/vscode-sql-studio-extention/main/docs/images/explorer.png)
```

That means the Marketplace page serves these files from the pushed `main` branch, not from the
`.vsix` — updated screenshots go live on push, with no repackage or version bump.

## Tips

- Use VS Code dark theme for consistency with `galleryBanner` in `package.json`
- Blur or fake hostnames, usernames, and data in screenshots
- Keep file sizes reasonable (< 500 KB per PNG when possible)
