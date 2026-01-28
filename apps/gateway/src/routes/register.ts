import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../../../../packages/sdk/mcp.schema.json');

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * Register Routes
 * 
 * @description API endpoints for service registration and validation
 * @see Task-O00: MCP Protocol Compliance
 */
export default async function registerRoutes(app: FastifyInstance): Promise<void> {
    // Load schema once during route registration
    let schema: any;
    try {
        const schemaContent = await fs.readFile(SCHEMA_PATH, 'utf-8');
        schema = JSON.parse(schemaContent);
    } catch (err) {
        app.log.error(`Failed to load MCP schema from ${SCHEMA_PATH}: ${err}`);
    }

    /**
     * POST /v1/register/validate
     * 
     * Validates service metadata against MCP JSON Schema
     */
    app.post('/v1/register/validate', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!schema) {
            return reply.status(500).send({
                error: 'Schema not loaded',
                message: 'The MCP validation schema is currently unavailable.'
            });
        }

        const validate = ajv.compile(schema);
        const valid = validate(request.body);

        if (!valid) {
            return reply.status(400).send({
                error: 'Validation Failed',
                message: 'Service metadata does not comply with MCP protocol schema.',
                details: validate.errors
            });
        }

        return {
            status: 'valid',
            message: 'Metadata is compliant with MCP protocol.',
            timestamp: new Date().toISOString()
        };
    });
}
