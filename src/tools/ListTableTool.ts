import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getEnvironmentManager } from "../config/EnvironmentManager.js";

export class ListTableTool implements Tool {
  [key: string]: any;
  name = "list_tables";
  description =
    "Lists tables in an MSSQL Database, optionally filtered by schema. " +
    "For server-level access environments, you can specify a database to list tables from.";
  inputSchema = {
    type: "object",
    properties: {
      database: {
        type: "string",
        description: "Optional: Target database name for server-level access environments.",
      },
      schemas: {
        type: "array",
        description: "Schemas to filter by (optional)",
        items: {
          type: "string",
        },
        minItems: 0,
      },
    },
    required: [],
  } as any;

  async run(params: any) {
    try {
      const { database, schemas, environment } = params ?? {};

      // Validate database access if specified
      if (database) {
        const envManager = getEnvironmentManager();
        const dbCheck = envManager.isDatabaseAllowed(environment, database);
        if (!dbCheck.allowed) {
          return {
            success: false,
            message: dbCheck.reason || `Access to database '${database}' is not allowed.`,
            error: "DATABASE_ACCESS_DENIED",
          };
        }
      }

      const request = new sql.Request();
      const schemaFilter =
        schemas && schemas.length > 0
          ? `AND TABLE_SCHEMA IN (${schemas.map((p: string) => `'${p.replace(/'/g, "''")}'`).join(", ")})`
          : "";

      // Build query with optional database prefix
      let query: string;
      if (database) {
        const safeDbName = database.replace(/]/g, "]]");
        query = `
          USE [${safeDbName}];
          SELECT TABLE_SCHEMA + '.' + TABLE_NAME AS table_name, TABLE_SCHEMA, TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_TYPE = 'BASE TABLE' ${schemaFilter}
          ORDER BY TABLE_SCHEMA, TABLE_NAME
        `;
      } else {
        query = `
          SELECT TABLE_SCHEMA + '.' + TABLE_NAME AS table_name, TABLE_SCHEMA, TABLE_NAME
          FROM INFORMATION_SCHEMA.TABLES
          WHERE TABLE_TYPE = 'BASE TABLE' ${schemaFilter}
          ORDER BY TABLE_SCHEMA, TABLE_NAME
        `;
      }

      const result = await request.query(query);
      return {
        success: true,
        message: `Found ${result.recordset.length} table(s)${database ? ` in [${database}]` : ""}`,
        database: database || undefined,
        tableCount: result.recordset.length,
        tables: result.recordset,
      };
    } catch (error) {
      console.error("Error listing tables:", error);
      return {
        success: false,
        message: `Failed to list tables: ${error}`,
        error: "QUERY_FAILED",
      };
    }
  }
}
