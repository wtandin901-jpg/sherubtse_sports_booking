const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log(`Sherubtse Sports Booking running at http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => require('./config/db').pool.end().then(() => process.exit(0)));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
