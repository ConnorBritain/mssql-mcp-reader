#!/usr/bin/env node
import { startMcpServer } from "@connorbritain/mssql-mcp-core";

startMcpServer({
  name: "mssql-mcp-reader",
  version: "0.2.0",
  tier: "reader",
}).catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
