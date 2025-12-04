# @connorbritain/mssql-mcp-reader

**Read-only** Model Context Protocol server for SQL Server. Safe schema discovery, profiling, and querying - no write operations included.

This is the read-only tier of the [mssql-mcp-server](https://github.com/ConnorBritain/mssql-mcp-server) family. Use this package when you need database exploration without any risk of data modification.

## Tools Included (14 read-only tools)

| Category | Tools |
|----------|-------|
| **Discovery** | `search_schema`, `describe_table`, `list_table`, `list_databases`, `list_environments` |
| **Profiling** | `profile_table`, `inspect_relationships`, `inspect_dependencies`, `explain_query` |
| **Querying** | `read_data` (SELECT only) |
| **Scripts** | `list_scripts`, `run_script` (readonly scripts only) |
| **Operations** | `test_connection`, `validate_environment_config` |

## What's NOT included

- `insert_data`, `update_data`, `delete_data` - data modification
- `create_table`, `create_index`, `drop_table` - schema changes

For write operations, use [@connorbritain/mssql-mcp-writer](https://github.com/ConnorBritain/mssql-mcp-writer) or [@connorbritain/mssql-mcp-server](https://github.com/ConnorBritain/mssql-mcp-server).

## Install

```bash
npm install -g @connorbritain/mssql-mcp-reader@latest
# or run directly
npx @connorbritain/mssql-mcp-reader@latest
```

## MCP Client Config

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

## Configuration

| Variable | Required | Notes |
|----------|----------|-------|
| `SERVER_NAME` | Yes | SQL Server hostname/IP |
| `DATABASE_NAME` | Yes | Database to target |
| `SQL_AUTH_MODE` | | `sql`, `windows`, or `aad` (default: `aad`) |
| `SQL_USERNAME` / `SQL_PASSWORD` | | Required for `sql`/`windows` modes |
| `ENVIRONMENTS_CONFIG_PATH` | | Path to multi-environment JSON config |
| `SCRIPTS_PATH` | | Path to named SQL scripts directory |

## Package Tiers

| Package | Tools | Use Case |
|---------|-------|----------|
| **mssql-mcp-reader** (this) | Read-only (14 tools) | Analysts, auditors, safe exploration |
| [mssql-mcp-writer](https://github.com/ConnorBritain/mssql-mcp-writer) | Reader + data ops (17 tools) | Data engineers, ETL developers |
| [mssql-mcp-server](https://github.com/ConnorBritain/mssql-mcp-server) | All tools (20 tools) | DBAs, full admin access |

## Documentation

**Full documentation:** [mssql-mcp-server README](https://github.com/ConnorBritain/mssql-mcp-server#readme)

**Issues:** https://github.com/ConnorBritain/mssql-mcp-reader/issues
