import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve(import.meta.dirname, '../src/styles.css')
let s = fs.readFileSync(file, 'utf8')
const bad = 'ui-monospace, "Cascadia Code", Consolas, "JetBrains Mono", ui-monospace, monospace'
const good = 'ui-monospace, "Cascadia Code", Consolas, "JetBrains Mono", monospace'
while (s.includes(bad)) s = s.split(bad).join(good)
fs.writeFileSync(file, s)
console.log('fixed', bad, '→', good)
