import { createHandler } from './_lib/http.js';
import { recoveryCodeMethods } from './_lib/handlers.js';

export default createHandler(recoveryCodeMethods);
