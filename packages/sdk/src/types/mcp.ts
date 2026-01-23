/**
 * MCP (Model Context Protocol) Schema Types
 * 
 * @description Standard schema for MCP service metadata in CortexRegistry.
 * All registered services should conform to this schema.
 * 
 * @see https://modelcontextprotocol.io
 */

// ============ Core MCP Types ============

/**
 * MCP service capability types
 */
export type MCPCapability =
    | 'tools'           // Can execute functions/actions
    | 'resources'       // Can provide data resources
    | 'prompts'         // Can provide prompt templates
    | 'sampling';       // Can perform text generation

/**
 * Transport protocol for MCP communication
 */
export type MCPTransport =
    | 'stdio'           // Standard input/output (local)
    | 'http'            // HTTP REST endpoints
    | 'websocket';      // WebSocket connections

/**
 * Tool parameter schema (JSON Schema subset)
 */
export interface MCPToolParameter {
    /** Parameter name */
    name: string;
    /** Human-readable description */
    description: string;
    /** JSON Schema type */
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    /** Whether parameter is required */
    required?: boolean;
    /** Default value if not provided */
    default?: unknown;
    /** Enum values for string type */
    enum?: string[];
    /** Nested properties for object type */
    properties?: Record<string, MCPToolParameter>;
    /** Item schema for array type */
    items?: MCPToolParameter;
}

/**
 * MCP Tool definition
 */
export interface MCPTool {
    /** Unique tool identifier */
    name: string;
    /** Human-readable description */
    description: string;
    /** Input parameters schema */
    inputSchema: {
        type: 'object';
        properties: Record<string, MCPToolParameter>;
        required?: string[];
    };
}

/**
 * MCP Resource definition
 */
export interface MCPResource {
    /** Resource URI (unique identifier) */
    uri: string;
    /** Human-readable name */
    name: string;
    /** Resource description */
    description?: string;
    /** MIME type of the resource content */
    mimeType?: string;
}

/**
 * MCP Prompt template definition
 */
export interface MCPPrompt {
    /** Unique prompt identifier */
    name: string;
    /** Human-readable description */
    description?: string;
    /** Prompt arguments schema */
    arguments?: MCPToolParameter[];
}

// ============ CortexRegistry Extensions ============

/**
 * Service pricing information for x402 payments
 */
export interface MCPPricing {
    /** Price per request in wei (1e18 = 1 CRO) */
    pricePerRequest: string;
    /** Accepted payment token address (address(0) for native CRO) */
    paymentToken: string;
    /** Minimum payment for batch requests */
    minPayment?: string;
    /** Maximum requests per payment */
    maxRequestsPerPayment?: number;
}

/**
 * Service health and performance metrics
 */
export interface MCPHealthInfo {
    /** Service endpoint URL */
    endpoint: string;
    /** Health check endpoint (defaults to /health) */
    healthCheckPath?: string;
    /** Expected response time in ms */
    expectedLatencyMs?: number;
    /** Maximum concurrent requests */
    maxConcurrency?: number;
}

/**
 * Service version information
 */
export interface MCPVersionInfo {
    /** MCP protocol version (e.g., "2024-11-05") */
    mcpVersion: string;
    /** Service implementation version */
    serviceVersion: string;
    /** Minimum compatible client version */
    minClientVersion?: string;
}

/**
 * Complete MCP Service Metadata Schema
 * 
 * @description This is the full schema stored on IPFS/Arweave and referenced
 * by the on-chain metadataUri in ICortexRegistry.Service
 */
export interface MCPServiceMetadata {
    // ---- Core Identity ----
    /** Unique service identifier (matches on-chain serviceId) */
    id: string;
    /** Human-readable service name */
    name: string;
    /** Service description */
    description: string;
    /** Service icon URL (optional) */
    iconUrl?: string;

    // ---- MCP Capabilities ----
    /** Supported capabilities */
    capabilities: MCPCapability[];
    /** Transport protocol */
    transport: MCPTransport;
    /** Exposed tools (if capabilities includes 'tools') */
    tools?: MCPTool[];
    /** Available resources (if capabilities includes 'resources') */
    resources?: MCPResource[];
    /** Prompt templates (if capabilities includes 'prompts') */
    prompts?: MCPPrompt[];

    // ---- CortexRegistry Extensions ----
    /** Pricing information for x402 payments */
    pricing: MCPPricing;
    /** Health and endpoint information */
    health: MCPHealthInfo;
    /** Version information */
    version: MCPVersionInfo;

    // ---- Metadata ----
    /** Service provider information */
    provider: {
        name: string;
        website?: string;
        contact?: string;
    };
    /** Category/tags for discovery */
    tags?: string[];
    /** Creation timestamp (ISO 8601) */
    createdAt: string;
    /** Last update timestamp (ISO 8601) */
    updatedAt: string;
}

// ============ JSON Schema for Validation ============

/**
 * JSON Schema for MCPServiceMetadata
 * Can be used with ajv or similar validators
 */
export const MCPServiceMetadataSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://cortexregistry.io/schemas/mcp-service-metadata.json',
    title: 'MCP Service Metadata',
    description: 'CortexRegistry MCP service metadata schema',
    type: 'object',
    required: ['id', 'name', 'description', 'capabilities', 'transport', 'pricing', 'health', 'version', 'provider', 'createdAt', 'updatedAt'],
    properties: {
        id: { type: 'string', pattern: '^0x[a-fA-F0-9]{64}$' },
        name: { type: 'string', minLength: 1, maxLength: 64 },
        description: { type: 'string', minLength: 1, maxLength: 512 },
        iconUrl: { type: 'string', format: 'uri' },
        capabilities: {
            type: 'array',
            items: { type: 'string', enum: ['tools', 'resources', 'prompts', 'sampling'] },
            minItems: 1
        },
        transport: { type: 'string', enum: ['stdio', 'http', 'websocket'] },
        tools: { type: 'array', items: { $ref: '#/$defs/MCPTool' } },
        resources: { type: 'array', items: { $ref: '#/$defs/MCPResource' } },
        prompts: { type: 'array', items: { $ref: '#/$defs/MCPPrompt' } },
        pricing: { $ref: '#/$defs/MCPPricing' },
        health: { $ref: '#/$defs/MCPHealthInfo' },
        version: { $ref: '#/$defs/MCPVersionInfo' },
        provider: { $ref: '#/$defs/MCPProvider' },
        tags: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
    },
    $defs: {
        MCPTool: {
            type: 'object',
            required: ['name', 'description', 'inputSchema'],
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                inputSchema: { type: 'object' }
            }
        },
        MCPResource: {
            type: 'object',
            required: ['uri', 'name'],
            properties: {
                uri: { type: 'string', format: 'uri' },
                name: { type: 'string' },
                description: { type: 'string' },
                mimeType: { type: 'string' }
            }
        },
        MCPPrompt: {
            type: 'object',
            required: ['name'],
            properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                arguments: { type: 'array' }
            }
        },
        MCPPricing: {
            type: 'object',
            required: ['pricePerRequest', 'paymentToken'],
            properties: {
                pricePerRequest: { type: 'string', pattern: '^[0-9]+$' },
                paymentToken: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
                minPayment: { type: 'string', pattern: '^[0-9]+$' },
                maxRequestsPerPayment: { type: 'integer', minimum: 1 }
            }
        },
        MCPHealthInfo: {
            type: 'object',
            required: ['endpoint'],
            properties: {
                endpoint: { type: 'string', format: 'uri' },
                healthCheckPath: { type: 'string' },
                expectedLatencyMs: { type: 'integer', minimum: 0 },
                maxConcurrency: { type: 'integer', minimum: 1 }
            }
        },
        MCPVersionInfo: {
            type: 'object',
            required: ['mcpVersion', 'serviceVersion'],
            properties: {
                mcpVersion: { type: 'string' },
                serviceVersion: { type: 'string' },
                minClientVersion: { type: 'string' }
            }
        },
        MCPProvider: {
            type: 'object',
            required: ['name'],
            properties: {
                name: { type: 'string' },
                website: { type: 'string', format: 'uri' },
                contact: { type: 'string' }
            }
        }
    }
} as const;
