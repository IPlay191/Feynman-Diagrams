// Local server: the /api routes plus (after `npm run build`) the website from dist/.
// On Vercel, api/index.js serves the same routes and Vercel serves the website.
import express from 'express';
import path from 'node:path';
import { app, errorHandler } from './app.js';

const PORT = Number(process.env.PORT) || 8787;

const dist = path.resolve('dist');
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), (err) => err && next()));
app.use(errorHandler);

const server = app.listen(PORT, (err) => {
  if (!err) console.log(`API ready on http://localhost:${PORT}`);
});
// Make a busy port impossible to miss (otherwise the weather silently stops working).
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use: another copy of this server is still running.\n  Close the other terminal running "npm run dev" (or set PORT in .env), then try again.\n`);
  } else console.error('[api] could not start:', e.message);
  process.exit(1);
});
