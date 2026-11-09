const db = require('../config/db');

exports.log = (actorId, action, entityType, entityId, details = {}, executor = db) =>
  executor.query(
    'INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
    [actorId, action, entityType, entityId, JSON.stringify(details)]
  );
