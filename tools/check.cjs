'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname,'..');
for (const folder of ['src','server','tools']) {
  for (const file of fs.readdirSync(path.join(root,folder)).filter(name=>/\.(?:js|cjs)$/.test(name))) {
    const result = spawnSync(process.execPath,['--check',path.join(root,folder,file)],{stdio:'inherit'});
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('All JavaScript syntax checks passed.');
