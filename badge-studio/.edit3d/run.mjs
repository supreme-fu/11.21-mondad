// 3D Editor plugin launcher. SDK/CLI are supplied by the installed plugin.
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
const config = JSON.parse(await readFile(new URL('./plugin.json', import.meta.url), 'utf8'))
const configured = process.env.KIMI_EDIT3D_PLUGIN_ENTRY || config.entry
// plugin.json 里的 entry 是安装插件那台机器的绝对路径，换机后不存在。
// 仓库自带 @edit3d/cli（package.json 的 file: 依赖）时回退到本地安装，保证 npm run check/build 可用。
const local = fileURLToPath(new URL('../node_modules/@edit3d/cli/dist/cli.js', import.meta.url))
const entry = existsSync(configured) ? configured : local
if (!existsSync(entry)) {
  console.error(`3D Editor plugin unavailable: ${configured} 不存在，且 ${local} 未安装。请运行 npm install。`)
  process.exitCode = 1
} else {
  if (entry !== configured) console.error(`[run.mjs] 插件入口 ${configured} 不存在，回退到仓库内的 ${local}`)
  const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env })
  child.on('error', (error) => { console.error('3D Editor plugin unavailable:', error.message); process.exitCode = 1 })
  child.on('exit', (code) => { process.exitCode = code ?? 1 })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
}
