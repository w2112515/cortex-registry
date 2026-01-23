/**
 * Environment Configuration
 *
 * CRITICAL: This file must be imported BEFORE any other modules that read process.env
 * to ensure environment variables are loaded correctly.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load environment variables from app directory
dotenv.config();
// Fallback to project root .env (priority to local env)
dotenv.config({
    path: path.resolve(__dirname, '../../../.env'),
    override: false
});
console.log('[ENV] Environment variables loaded');
console.log(`[ENV] START_BLOCK=${process.env.START_BLOCK || 'NOT SET'}`);
console.log(`[ENV] REGISTRY_ADDRESS=${process.env.REGISTRY_ADDRESS || 'NOT SET'}`);
//# sourceMappingURL=env.js.map