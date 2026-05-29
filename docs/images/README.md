# Marketplace screenshots

Add PNG or GIF files here before publishing to the VS Code Marketplace. Recommended captures:

| File | Content | Status |
|------|---------|--------|
| `results-table.png` | SQL Results panel — table view | added |
| `results-chart.png` | SQL Results panel — chart view | added |
| `explorer.png` | Database Explorer with expanded schema and connection tags | optional |
| `er-diagram.png` | ER diagram webview with pan/zoom toolbar | optional |
| `connection-dialog.png` | Add Connection webview (with tags) | optional |
| `sql-editor.png` | SQL editor with run button and status bar connection | optional |

## Usage in README

Reference from [README.md](../README.md) with relative paths:

```markdown
![Database Explorer](docs/images/explorer.png)
```

For Marketplace, GitHub `raw` URLs or paths rewritten by `vsce publish --baseImagesUrl` also work.

## Tips

- Use VS Code dark theme for consistency with `galleryBanner` in `package.json`
- Blur or fake hostnames, usernames, and data in screenshots
- Keep file sizes reasonable (< 500 KB per PNG when possible)
