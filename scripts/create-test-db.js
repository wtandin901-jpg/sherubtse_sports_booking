   // Checks which databases the app can see, and creates the test database if it is missing.
   // Run:  node scripts/create-test-db.js
   process.env.NODE_ENV = 'test'; // read .env.test
   const config = require('../config');
   const { Pool } = require('pg');

   const pool = new Pool({ ...config.db, database: 'postgres' });

   (async () => {
     try {
       console.log(`Connecting to ${config.db.host}:${config.db.port} as ${config.db.user} ...`);
       const { rows } = await pool.query('SELECT datname FROM pg_database ORDER BY datname');
       const names = rows.map((r) => r.datname);
       console.log('Databases this app can see:', names.join(', '));
       if (names.includes(config.db.database)) {
         console.log(`OK: "${config.db.database}" already exists on this server.`);
       } else {
         await pool.query(`CREATE DATABASE "${config.db.database}"`);
         console.log(`Created "${config.db.database}" on this server. Now run: npm run db:setup:test`);
       }
     } catch (err) {
       console.error('ERROR:', err.message);
       process.exitCode = 1;
     } finally {
       await pool.end();
     }
   })();