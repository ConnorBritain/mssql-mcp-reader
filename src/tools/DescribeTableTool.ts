import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getEnvironmentManager } from "../config/EnvironmentManager.js";

export class DescribeTableTool implements Tool {
  [key: string]: any;
  name = "describe_table";
  description =
    "Describes the schema (columns and types) of a specified MSSQL Database table. " +
    "For server-level access environments, you can specify a database to target.";
  inputSchema = {
    type: "object",
    properties: {
      tableName: {
        type: "string",
        description: "Name of the table to describe (can include schema: 'dbo.TableName')",
      },
      database: {
        type: "string",
        description: "Optional: Target database name for server-level access environments.",
      },
    },
    required: ["tableName"],
  } as any;

  async run(params: { tableName: string; database?: string; environment?: string }) {
    try {
      const { tableName, database, environment } = params;

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

      // Parse schema and table name
      let schemaName = "dbo";
      let actualTableName = tableName;
      if (tableName.includes(".")) {
        const parts = tableName.split(".");
        schemaName = parts[0];
        actualTableName = parts[1];
      }

      const request = new sql.Request();

      // Build query with optional database context
      let query: string;
      if (database) {
        const safeDbName = database.replace(/]/g, "]]");
        query = `
          USE [${safeDbName}];
          SELECT
            COLUMN_NAME as name,
            DATA_TYPE as type,
            CHARACTER_MAXIMUM_LENGTH as max_length,
            IS_NULLABLE as nullable,
            COLUMN_DEFAULT as default_value,
            ORDINAL_POSITION as position
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @schemaName
          ORDER BY ORDINAL_POSITION
        `;
      } else {
        query = `
          SELECT
            COLUMN_NAME as name,
            DATA_TYPE as type,
            CHARACTER_MAXIMUM_LENGTH as max_length,
            IS_NULLABLE as nullable,
            COLUMN_DEFAULT as default_value,
            ORDINAL_POSITION as position
          FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_NAME = @tableName AND TABLE_SCHEMA = @schemaName
          ORDER BY ORDINAL_POSITION
        `;
      }

      request.input("tableName", sql.NVarChar, actualTableName);
      request.input("schemaName", sql.NVarChar, schemaName);
      const result = await request.query(query);

      if (result.recordset.length === 0) {
        return {
          success: false,
          message: `Table '${schemaName}.${actualTableName}' not found${database ? ` in database [${database}]` : ""}.`,
          error: "TABLE_NOT_FOUND",
        };
      }

      return {
        success: true,
        message: `Described table '${schemaName}.${actualTableName}'${database ? ` in [${database}]` : ""}`,
        database: database || undefined,
        schema: schemaName,
        tableName: actualTableName,
        columnCount: result.recordset.length,
        columns: result.recordset,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to describe table: ${error}`,
        error: "QUERY_FAILED",
      };
    }
  }
}
