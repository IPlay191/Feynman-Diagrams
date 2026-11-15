// Vercel serverless function: every /api/* request is sent here (see vercel.json).
// Set METEOMATICS_USERNAME and METEOMATICS_PASSWORD in the Vercel project settings.
import { app, errorHandler } from '../server/app.js';

app.use(errorHandler);

export default app;
