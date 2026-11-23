import { createHandler } from './_lib/http.js';
import { participantMethods } from './_lib/handlers.js';

export default createHandler(participantMethods);
