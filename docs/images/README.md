# Marketplace screenshots

Add PNG or GIF files here before publishing to the VS Code Marketplace. Recommended captures:

| File | Content | Suggested size |
|------|---------|----------------|
| `explorer.png` | Database Explorer with expanded schema | 1280×720 or wider |
| `results.png` | Query Results panel with sort/filter | 1280×720 |
| `connection-dialog.png` | Add Connection webview | 1280×720 |
| `sql-editor.png` | SQL editor with run button and status bar connection | 1280×720 |
| `chart.png` | Results chart view (if highlighting charts) | 1280×720 |

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
