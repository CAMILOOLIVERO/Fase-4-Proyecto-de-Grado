const { Pool } = require('pg');
const cfg = require('./config');
module.exports = new Pool(cfg.db);
