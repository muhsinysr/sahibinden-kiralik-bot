'use strict';

const fs = require('fs');
const path = require('path');
const { migrateData } = require('../lib/data-migration');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');
const apply = process.argv.includes('--apply');
const current = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const result = migrateData(current);

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...result.report }, null, 2));
if (apply) fs.writeFileSync(dbPath, JSON.stringify(result.data, null, 2), 'utf8');
