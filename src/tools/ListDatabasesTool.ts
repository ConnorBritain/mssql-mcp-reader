import sql from "mssql";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getEnvironmentManager } from "../config/EnvironmentManager.js";

export class ListDatabasesTool implements Tool {
  [key: string]: any;
  name = "list_databases";
  description = "Lists databases on the SQL Server instance. Requires server-level access. Filtered by environment policies.";
  inputSchema = {
    type: "object",
    properties: {
      environment: {
        type: "string",
        description: "Target environment name (optional, uses default if not specified)",
      },
      includeSystemDbs: {
        type: "boolean",
        description: "Include system databases (master, msdb, model, tempdb). Default: false",
      },
      stateFilter: {
        type: "string",
        enum: ["ONLINE", "OFFLINE", "RESTORING", "RECOVERING", "SUSPECT", "ALL"],
        description: "Filter by database state. Default: ONLINE",
      },
    },
    required: [],
  } as any;

  async run(params: any) {
    const { environment, includeSystemDbs = false, stateFilter = "ONLINE" } = params ?? {};

    try {
      const envManager = getEnvironmentManager();
      const envConfig = envManager.getEnvironment(environment);

      // Check if environment has server-level access
      const accessLevel = envConfig.accessLevel ?? "database";
      if (accessLevel !== "server") {
        return {
          success: false,
          message: `Environment '${envConfig.name}' has database-level access only. ` +
            `list_databases requires server-level access (accessLevel: "server").`,
          error: "ACCESS_LEVEL_DENIED",
        };
      }

      const request = new sql.Request();

      // Build the query
      let query = `
        SELECT
          d.name AS database_name,
          d.database_id,
          d.state_desc AS state,
          d.recovery_model_desc AS recovery_model,
          d.compatibility_level,
          d.collation_name,
          d.create_date,
          d.is_read_only,
          CAST(SUM(mf.size) * 8.0 / 1024 AS DECIMAL(10,2)) AS size_mb
        FROM sys.databases d
        LEFT JOIN sys.master_files mf ON d.database_id = mf.database_id
        WHERE 1=1
      `;

      // Filter by state
      if (stateFilter && stateFilter !== "ALL") {
        query += ` AND d.state_desc = '${stateFilter}'`;
      }

      // Exclude system databases if not requested
      if (!includeSystemDbs) {
        query += ` AND d.database_id > 4`; // System DBs have IDs 1-4
      }

      query += `
        GROUP BY d.name, d.database_id, d.state_desc, d.recovery_model_desc,
                 d.compatibility_level, d.collation_name, d.create_date, d.is_read_only
        ORDER BY d.name
      `;

      const result = await request.query(query);

      // Filter results by allowedDatabases/deniedDatabases policies
      const filteredDatabases = result.recordset.filter((db: any) => {
        const check = envManager.isDatabaseAllowed(environment, db.database_name);
        return check.allowed;
      });

      // Mark which databases are accessible vs restricted
      const databases = result.recordset.map((db: any) => {
        const check = envManager.isDatabaseAllowed(environment, db.database_name);
        return {
          ...db,
          accessible: check.allowed,
          restriction_reason: check.reason,
        };
      });

      return {
        success: true,
        message: `Found ${result.recordset.length} database(s), ${filteredDatabases.length} accessible`,
        environment: envConfig.name,
        accessLevel: accessLevel,
        totalDatabases: result.recordset.length,
        accessibleDatabases: filteredDatabases.length,
        databases: databases,
      };
    } catch (error) {
      console.error("Error listing databases:", error);
      return {
        success: false,
        message: `Failed to list databases: ${error}`,
        error: "QUERY_FAILED",
      };
    }
  }
}
