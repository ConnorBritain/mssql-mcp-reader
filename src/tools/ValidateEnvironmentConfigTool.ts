import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { getEnvironmentManager, EnvironmentConfig } from "../config/EnvironmentManager.js";

interface ValidationResult {
  environment: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface ValidateEnvironmentConfigResult {
  success: boolean;
  summary: {
    totalEnvironments: number;
    validCount: number;
    invalidCount: number;
    warningCount: number;
  };
  results: ValidationResult[];
  configPath?: string;
}

export class ValidateEnvironmentConfigTool implements Tool {
  name = "validate_environment_config";
  description = `Validates the environments.json configuration file for correctness and security best practices.

Checks include:
- Required fields (name, server, database for database-level; name, server for server-level)
- Valid authentication mode configuration
- Policy consistency (e.g., readonly + allowedTools including write tools)
- Secret placeholder syntax
- Access level configuration validity
- Tier designation consistency

Returns validation results for each environment with errors and warnings.`;

  inputSchema = {
    type: "object" as const,
    properties: {
      environment: {
        type: "string",
        description: "Specific environment name to validate. If omitted, validates all environments.",
      },
    },
  };

  async run(args?: { environment?: string }): Promise<ValidateEnvironmentConfigResult> {
    const envManager = getEnvironmentManager();
    const environments = envManager.listEnvironments();

    if (environments.length === 0) {
      return {
        success: false,
        summary: {
          totalEnvironments: 0,
          validCount: 0,
          invalidCount: 0,
          warningCount: 0,
        },
        results: [],
        configPath: process.env.ENVIRONMENTS_CONFIG_PATH,
      };
    }

    // Filter to specific environment if requested
    const toValidate = args?.environment
      ? environments.filter((e) => e.name === args.environment)
      : environments;

    if (args?.environment && toValidate.length === 0) {
      return {
        success: false,
        summary: {
          totalEnvironments: environments.length,
          validCount: 0,
          invalidCount: 1,
          warningCount: 0,
        },
        results: [
          {
            environment: args.environment,
            valid: false,
            errors: [`Environment '${args.environment}' not found in configuration.`],
            warnings: [],
          },
        ],
        configPath: process.env.ENVIRONMENTS_CONFIG_PATH,
      };
    }

    const results: ValidationResult[] = [];

    for (const env of toValidate) {
      const result = this.validateEnvironment(env);
      results.push(result);
    }

    const validCount = results.filter((r) => r.valid).length;
    const invalidCount = results.filter((r) => !r.valid).length;
    const warningCount = results.filter((r) => r.warnings.length > 0).length;

    return {
      success: invalidCount === 0,
      summary: {
        totalEnvironments: environments.length,
        validCount,
        invalidCount,
        warningCount,
      },
      results,
      configPath: process.env.ENVIRONMENTS_CONFIG_PATH,
    };
  }

  private validateEnvironment(env: EnvironmentConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!env.name || env.name.trim() === "") {
      errors.push("Missing required field: name");
    }

    if (!env.server || env.server.trim() === "") {
      errors.push("Missing required field: server");
    }

    // Database is required for database-level access
    const accessLevel = env.accessLevel ?? "database";
    if (accessLevel === "database" && (!env.database || env.database.trim() === "")) {
      errors.push("Missing required field: database (required when accessLevel is 'database')");
    }

    // Validate authentication mode
    const validAuthModes = ["sql", "windows", "aad"];
    if (env.authMode && !validAuthModes.includes(env.authMode)) {
      errors.push(`Invalid authMode '${env.authMode}'. Must be one of: ${validAuthModes.join(", ")}`);
    }

    // Check credentials for sql/windows auth
    if (env.authMode === "sql" || env.authMode === "windows") {
      if (!env.username) {
        errors.push(`Missing username for ${env.authMode} authentication`);
      }
      if (!env.password) {
        errors.push(`Missing password for ${env.authMode} authentication`);
      }

      // Check for plaintext passwords (not using secret placeholders)
      if (env.password && !env.password.startsWith("${secret:")) {
        warnings.push("Password appears to be plaintext. Consider using ${secret:NAME} placeholder.");
      }
    }

    // Windows auth requires domain
    if (env.authMode === "windows" && !env.domain) {
      warnings.push("Windows authentication typically requires a domain. Consider adding 'domain' field.");
    }

    // Validate access level
    const validAccessLevels = ["server", "database"];
    if (env.accessLevel && !validAccessLevels.includes(env.accessLevel)) {
      errors.push(`Invalid accessLevel '${env.accessLevel}'. Must be one of: ${validAccessLevels.join(", ")}`);
    }

    // Server-level access warnings
    if (env.accessLevel === "server") {
      if (!env.allowedDatabases && !env.deniedDatabases) {
        warnings.push(
          "Server-level access without allowedDatabases or deniedDatabases allows access to all databases."
        );
      }
    }

    // Validate tier
    const validTiers = ["reader", "writer", "admin"];
    if (env.tier && !validTiers.includes(env.tier)) {
      errors.push(`Invalid tier '${env.tier}'. Must be one of: ${validTiers.join(", ")}`);
    }

    // Validate audit level
    const validAuditLevels = ["none", "basic", "verbose"];
    if (env.auditLevel && !validAuditLevels.includes(env.auditLevel)) {
      errors.push(`Invalid auditLevel '${env.auditLevel}'. Must be one of: ${validAuditLevels.join(", ")}`);
    }

    // Production environment warnings
    if (env.auditLevel === "none") {
      warnings.push("Audit logging is disabled. Consider enabling for compliance and debugging.");
    }

    // Policy consistency checks
    const writeTools = ["insert_data", "update_data", "delete_data"];
    const schemaTools = ["create_table", "create_index", "drop_table"];

    if (env.readonly) {
      // Check if allowedTools includes write operations
      if (env.allowedTools) {
        const conflictingTools = env.allowedTools.filter(
          (t) => writeTools.includes(t) || schemaTools.includes(t)
        );
        if (conflictingTools.length > 0) {
          errors.push(
            `readonly=true conflicts with allowedTools containing write operations: ${conflictingTools.join(", ")}`
          );
        }
      }
    }

    // Tier consistency checks
    if (env.tier === "reader") {
      if (!env.readonly) {
        warnings.push("Tier 'reader' typically has readonly=true. Consider setting readonly=true.");
      }
      if (env.allowedTools) {
        const writingTools = env.allowedTools.filter(
          (t) => writeTools.includes(t) || schemaTools.includes(t)
        );
        if (writingTools.length > 0) {
          warnings.push(
            `Tier 'reader' should not include write tools: ${writingTools.join(", ")}`
          );
        }
      }
    }

    if (env.tier === "writer") {
      if (env.allowedTools) {
        const schemaChanges = env.allowedTools.filter((t) => schemaTools.includes(t));
        if (schemaChanges.length > 0) {
          warnings.push(
            `Tier 'writer' should not include schema modification tools: ${schemaChanges.join(", ")}`
          );
        }
      }
    }

    // Check for overlapping allowed/denied tools
    if (env.allowedTools && env.deniedTools) {
      const overlap = env.allowedTools.filter((t) => env.deniedTools!.includes(t));
      if (overlap.length > 0) {
        errors.push(`Tools appear in both allowedTools and deniedTools: ${overlap.join(", ")}`);
      }
    }

    // Check for overlapping allowed/denied schemas
    if (env.allowedSchemas && env.deniedSchemas) {
      const overlap = env.allowedSchemas.filter((s) => env.deniedSchemas!.includes(s));
      if (overlap.length > 0) {
        warnings.push(`Schema patterns appear in both allowedSchemas and deniedSchemas: ${overlap.join(", ")}`);
      }
    }

    // Check for overlapping allowed/denied databases
    if (env.allowedDatabases && env.deniedDatabases && Array.isArray(env.allowedDatabases)) {
      const overlap = env.allowedDatabases.filter((d) => env.deniedDatabases!.includes(d));
      if (overlap.length > 0) {
        errors.push(`Databases appear in both allowedDatabases and deniedDatabases: ${overlap.join(", ")}`);
      }
    }

    // Port validation
    if (env.port !== undefined) {
      if (typeof env.port !== "number" || env.port < 1 || env.port > 65535) {
        errors.push(`Invalid port '${env.port}'. Must be a number between 1 and 65535.`);
      }
    }

    // Connection timeout validation
    if (env.connectionTimeout !== undefined) {
      if (typeof env.connectionTimeout !== "number" || env.connectionTimeout < 1) {
        errors.push(`Invalid connectionTimeout '${env.connectionTimeout}'. Must be a positive number.`);
      }
    }

    // maxRowsDefault validation
    if (env.maxRowsDefault !== undefined) {
      if (typeof env.maxRowsDefault !== "number" || env.maxRowsDefault < 1) {
        errors.push(`Invalid maxRowsDefault '${env.maxRowsDefault}'. Must be a positive number.`);
      }
      if (env.maxRowsDefault > 100000) {
        warnings.push(`maxRowsDefault of ${env.maxRowsDefault} is very high. Consider limiting for performance.`);
      }
    }

    return {
      environment: env.name,
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
