import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'

const svg = readFileSync('src-tauri/icons/app-icon.svg', 'utf-8')

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1024 },
  background: 'rgba(0,0,0,0)',
})
const png = resvg.render().asPng()
writeFileSync('src-tauri/icons/app-icon.png', png)
console.log('rendered app-icon.png', png.length, 'bytes')
