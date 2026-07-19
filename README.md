# Grok Forge

**Grok Forge** is a desktop coding-agent shell for Windows: multi-task chat, live tool timeline, git review (accept / reject / hunks / patch export), terminals, and ACP sessions — packaged as **Grok Forge.exe**.

Repository: [github.com/moreg/grok-forge](https://github.com/moreg/grok-forge)

## What is in this repo

| Area | Path | Description |
|------|------|-------------|
| Desktop app | [`apps/desktop`](apps/desktop) | React + Tauri UI, ACP client, review panel, rebuild scripts |
| Agent / TUI runtime | [`crates/`](crates) | Rust agent runtime and terminal UI crates used with `grok agent stdio` |

The desktop app talks to a local Grok agent over the **Agent Client Protocol (ACP)**. Install or build a compatible `grok` / agent binary on `PATH` for native connect mode.

## Quick start (desktop)

```powershell
cd apps\desktop
npm install
npm run desktop          # Tauri dev
# or browser UI only:
npm run dev              # http://localhost:5173
```

### Release build (Windows)

```powershell
# From repo root (ASCII script; recommended)
.\rebuild.bat

# Or from apps\desktop
cd apps\desktop
npm run desktop:publish
```

Outputs:

| File | Location |
|------|----------|
| `Grok Forge.exe` | repo root |
| `grok-forge-desktop.exe` | repo root (alias) |
| Installer | `dist\Grok Forge_0.1.0_x64-setup.exe` |

Details: [`apps/desktop/README.md`](apps/desktop/README.md)

## Desktop features (summary)

- Auto-connect / reconnect to the local agent over ACP  
- Task list, tags, search, pin/archive, session restore  
- Live messages, thoughts, plan timeline, tool events  
- Git review: unified/split diff, per-file & per-hunk decisions, local git fallback  
- Terminals (agent + local interactive shell)  
- MCP server config, model preference, theme / shortcuts  

## Agent / TUI from source

Requires **Rust** (see [`rust-toolchain.toml`](rust-toolchain.toml)) and **protoc**.

```sh
cargo run -p xai-grok-pager-bin
cargo build -p xai-grok-pager-bin --release
```

User guide (pager): [`crates/codegen/xai-grok-pager/docs/user-guide/`](crates/codegen/xai-grok-pager/docs/user-guide/)

## Repository layout

```
apps/desktop/     # Grok Forge desktop (primary product UI)
crates/           # Agent runtime, tools, TUI, shared libs
rebuild.bat       # One-click Windows desktop rebuild + publish
```

## Development

```powershell
cd apps\desktop
npm test
npm run build
```

```sh
cargo check -p xai-grok-pager-bin
```

## License

See [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES) in this repository.
