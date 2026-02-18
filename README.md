# MSSQL MCP Reader

[![npm version](https://img.shields.io/npm/v/@connorbritain/mssql-mcp-reader.svg)](https://www.npmjs.com/package/@connorbritain/mssql-mcp-reader)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Read-only Model Context Protocol server for Microsoft SQL Server.**

Safe schema discovery, profiling, and querying with zero risk of data modification. Ideal for analysts, auditors, and anyone who needs database exploration without write access.

## Architecture

This package is a thin wrapper around [`@connorbritain/mssql-mcp-core`](https://github.com/ConnorBritain/mssql-mcp-core), which contains all shared logic, tools, and governance features. The wrapper selects the `"reader"` tier and delegates to the core's `startMcpServer()` function. This design enables:

- **Hard separation** at the package level — regulated enterprises can guarantee that certain builds physically cannot perform destructive operations
- **Independent versioning** — each tier can be published separately with its own release cycle
- **Clear audit trail** — `"we only allow mssql-mcp-reader in prod"` is a compile-time guarantee

The core library handles all SQL Server connections, tool dispatch, audit logging, and governance enforcement.

---

## Package Tiers

| Package | npm | Tools | Use Case |
|---------|-----|-------|----------|
| **mssql-mcp-reader** (this) | `@connorbritain/mssql-mcp-reader` | 14 read-only | Analysts, auditors, safe exploration |
| **[mssql-mcp-writer](https://github.com/ConnorBritain/mssql-mcp-writer)** | `@connorbritain/mssql-mcp-writer` | 17 (reader + data ops) | Data engineers, ETL developers |
| **[mssql-mcp-server](https://github.com/ConnorBritain/mssql-mcp-server)** | `@connorbritain/mssql-mcp-server` | 20 (all tools) | DBAs, full admin access |

---

## Tools Included

| Category | Tools |
|----------|-------|
| **Discovery** | `search_schema`, `describe_table`, `list_table`, `list_databases`, `list_environments` |
| **Profiling** | `profile_table`, `inspect_relationships`, `inspect_dependencies`, `explain_query` |
| **Querying** | `read_data` (SELECT only) |
| **Scripts** | `list_scripts`, `run_script` (readonly scripts only) |
| **Operations** | `test_connection`, `validate_environment_config` |

**Not included:** `insert_data`, `update_data`, `delete_data`, `create_table`, `create_index`, `drop_table`

---

## Quick Start

### Install

```bash
npm install -g @connorbritain/mssql-mcp-reader@latest
```

### MCP Client Configuration

```json
{
  "mcpServers": {
    "mssql": {
      "command": "npx",
      "args": ["@connorbritain/mssql-mcp-reader@latest"],
      "env": {
        "SERVER_NAME": "127.0.0.1",
        "DATABASE_NAME": "mydb",
        "SQL_AUTH_MODE": "sql",
        "SQL_USERNAME": "readonly_user",
        "SQL_PASSWORD": "YourPassword123"
      }
    }
  }
}
```

---

## Configuration

| Variable | Required | Notes |
|----------|----------|-------|
| `SERVER_NAME` | Yes | SQL Server hostname/IP |
| `DATABASE_NAME` | Yes | Target database |
| `SQL_AUTH_MODE` | | `sql`, `windows`, or `aad` (default: `aad`) |
| `SQL_USERNAME` / `SQL_PASSWORD` | | Required for `sql`/`windows` modes |
| `ENVIRONMENTS_CONFIG_PATH` | | Path to multi-environment JSON config |
| `SCRIPTS_PATH` | | Path to named SQL scripts directory |
| `AUDIT_LOG_PATH` | | Custom audit log path |

---

## Features

All packages in the MSSQL MCP family share:

- **Multi-environment support** - Named database environments (prod, staging, dev) with per-environment policies
- **Governance controls** - `allowedTools`, `deniedTools`, `allowedSchemas`, `deniedSchemas`, `requireApproval`
- **Audit logging** - JSON Lines logs with session IDs and auto-redaction
- **Secret management** - `${secret:NAME}` placeholders for secure credential handling
- **Named SQL scripts** - Pre-approved parameterized queries with governance controls

---

## Documentation

Full documentation, configuration examples, and governance details are available in the main repository:

**[MSSQL MCP Server Documentation](https://github.com/ConnorBritain/mssql-mcp-server#readme)**

---

## License

MIT License. See [LICENSE](./LICENSE) for details.

---

**Repository:** https://github.com/ConnorBritain/mssql-mcp-reader
**Issues:** https://github.com/ConnorBritain/mssql-mcp-reader/issues
**npm:** https://www.npmjs.com/package/@connorbritain/mssql-mcp-reader
