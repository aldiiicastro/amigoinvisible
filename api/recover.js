import { createHandler } from './_lib/http.js';
import { recoverMethods } from './_lib/handlers.js';

export default createHandler(recoverMethods);
