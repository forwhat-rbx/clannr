import { Logger } from './logger';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Directly patches the Bloxy library's RESTRequest.js file to fix the requester error
 */
export function patchBloxyLibrary() {
    try {
        Logger.info('Patching Bloxy library RESTRequest.js file...', 'BloxyPatch');

        // Find the path to the RESTRequest.js file
        const modulePath = require.resolve('bloxy');
        const bloxyDir = path.dirname(modulePath);
        const restRequestPath = path.join(bloxyDir, 'controllers', 'rest', 'request', 'RESTRequest.js');

        // Check if file exists
        if (!fs.existsSync(restRequestPath)) {
            Logger.error(`Could not find RESTRequest.js at ${restRequestPath}`, 'BloxyPatch');
            return false;
        }

        // Read the file content
        let fileContent = fs.readFileSync(restRequestPath, 'utf8');

        // Find the problematic line and replace it with a fixed version
        const problematicCode = 'const responseData = yield (typeof this.controller.requester === \'function\' \n    ? this.controller.requester(this.requestOptions)\n    : this.controller.request(this.requestOptions));';
        const fixedCode = 'const responseData = yield this.controller.request(this.requestOptions);';

        if (fileContent.includes(problematicCode)) {
            // Replace the problematic code
            fileContent = fileContent.replace(problematicCode, fixedCode);

            // Write the fixed content back to the file
            fs.writeFileSync(restRequestPath, fileContent, 'utf8');
            Logger.info('Successfully patched Bloxy RESTRequest.js file', 'BloxyPatch');
            return true;
        } else {
            Logger.warn('Could not find the problematic code in RESTRequest.js. The file format may have changed.', 'BloxyPatch');
            return false;
        }
    } catch (error) {
        Logger.error('Failed to patch Bloxy library:', 'BloxyPatch', error);
        return false;
    }
}

/**
 * Alternative approach: Monkey patch the Bloxy library at runtime
 * This is safer but might not work in all cases
 */
export function monkeyPatchBloxyLibrary() {
    try {
        Logger.info('Applying Bloxy library monkey patch...', 'BloxyPatch');

        // Try to require the RESTController module from Bloxy
        const RESTRequest = require('bloxy/dist/controllers/rest/request/RESTRequest').default;

        // Save original send method
        const originalSend = RESTRequest.prototype.send;

        // Override the send method to fix the issue
        RESTRequest.prototype.send = async function (options) {
            await require('bloxy/dist/controllers/rest/request/prepare').default(this, options || this.requestOptions);
            await Promise.all(this.controller.requestHandlers.map(handler => handler(this)));

            // Just use request instead of requester
            const responseData = await this.controller.request(this.requestOptions);

            this.attempts++;
            const response = new (require('bloxy/dist/controllers/rest/response').default)(this.controller, this, responseData);
            return response.process();
        };

        Logger.info('Successfully applied Bloxy monkey patch', 'BloxyPatch');
        return true;
    } catch (error) {
        Logger.error('Failed to apply Bloxy monkey patch:', 'BloxyPatch', error);
        return false;
    }
}