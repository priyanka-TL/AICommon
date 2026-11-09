import type { Deployment } from '@/data/types'
import { allocationOf } from '@/lib/quota'
import { COMPUTE_TIERS } from '@/lib/labels'
import { envHost, execStart, isStatic } from '@/lib/deploy'
import { buildFs, displayPath, genContext, homeOf, hostnameFor, lookup, maskSecrets, resolvePath, usernameFor, type FsNode, type ShellContext } from './fs'

/* ---------- session ---------- */

type SvcState = 'running' | 'stopped' | 'failed' | 'activating'

export interface ShellSession {
  ctx: ShellContext
  fs: FsNode
  home: string
  cwd: string
  history: string[]
  readOnly: boolean
  svcState: Record<string, SvcState>
}

export interface CommandResult {
  output: string
  clear?: boolean
  exit?: boolean
}

export function createSession(ctx: ShellContext, readOnly: boolean): ShellSession {
  const home = homeOf(ctx)
  const svcState: Record<string, SvcState> = {}
  for (const d of ctx.deployments) svcState[d.serviceName] = d.status === 'running' ? 'running' : d.status === 'failed' ? 'failed' : d.status === 'deploying' ? 'activating' : 'stopped'
  return { ctx, fs: buildFs(ctx), home, cwd: home, history: [], readOnly, svcState }
}

export const promptFor = (s: ShellSession) =>
  `${A.green}${A.bold}${usernameFor(s.ctx.user)}@${hostnameFor(s.ctx.env)}${A.reset}:${A.blue}${A.bold}${displayPath(s.cwd, s.home)}${A.reset}$ `

/* ---------- formatting ---------- */

export const A = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
}
const col = (s: string | number, n: number) => String(s).padEnd(n)
const rcol = (s: string | number, n: number) => String(s).padStart(n)
const note = (s: string) => `${A.dim}${s}${A.reset}`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const two = (n: number) => String(n).padStart(2, '0')
const hms = (d: Date) => `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`
const journalStamp = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${two(d.getUTCDate())} ${hms(d)}`
const sinceStamp = (d: Date) => `${DAYS[d.getUTCDay()]} ${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())} ${hms(d)} UTC`
function ago(d: Date) {
  const s = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000))
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}min ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}min ago`
  const days = Math.floor(s / 86400)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
const pidOf = (svc: string) => 1000 + (hash(svc) % 8000)
const gib = (gb: number) => (gb >= 10 ? `${Math.round(gb)}Gi` : `${gb.toFixed(1)}Gi`)

/* ---------- command catalogue ---------- */

export const COMMANDS = [
  'help', 'clear', 'whoami', 'hostname', 'pwd', 'ls', 'cd', 'cat', 'uname', 'df', 'free', 'top', 'nvidia-smi', 'docker', 'systemctl', 'journalctl',
  'pm2', 'node', 'npm', 'python', 'python3', 'pip', 'git', 'curl', 'history', 'exit', 'echo', 'uptime', 'date',
]

const HELP = [
  `${A.bold}Simulated terminal${A.reset} — output comes from this environment’s data. Nothing runs on a real machine.`,
  '',
  `${A.bold}Navigation${A.reset}     pwd · ls [-la] [path] · cd <dir> · cat <file> · history · clear · exit`,
  `${A.bold}System${A.reset}         whoami · hostname · uname -a · uptime · date · df -h · free -h · top · nvidia-smi`,
  `${A.bold}Services${A.reset}       systemctl status [service] · journalctl -u <service> -n 20 · docker ps · pm2 list · pm2 logs <name>`,
  `${A.bold}Runtimes${A.reset}       node -v · npm -v · python --version · pip list · git status`,
  `${A.bold}Network${A.reset}        curl localhost:<port>/health`,
  `${A.bold}Changes${A.reset}        systemctl restart|stop|start <service> · pm2 restart <name> · git pull · npm install`,
  note('               (changes affect this session only — use the Projects tab to change a real deployment)'),
  '',
  `Keys: ↑/↓ history · Tab completes commands and paths · Ctrl+L clears · Ctrl+C cancels the line`,
].join('\n')

const DESTRUCTIVE = /^(rm|rmdir|shutdown|reboot|halt|poweroff|init|mkfs(\.\w+)?|dd|fdisk|wipefs|shred)$/
const READ_ONLY_DENIED = `${A.red}Permission denied:${A.reset} QA access is read-only. Only read commands are allowed.`
const SIM_NOTE = note('(simulated: only this terminal session sees the change; use the Projects tab to change the real deployment)')

/** True when the command would change state on the machine. */
function isStateChanging(cmd: string, args: string[]) {
  const sub = args.find((a) => !a.startsWith('-')) ?? ''
  switch (cmd) {
    case 'systemctl':
      return ['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'kill', 'mask', 'daemon-reload'].includes(sub)
    case 'pm2':
      return ['start', 'stop', 'restart', 'reload', 'delete', 'kill', 'flush', 'save'].includes(sub)
    case 'docker':
      return ['start', 'stop', 'restart', 'rm', 'rmi', 'run', 'kill', 'compose', 'pull', 'build', 'exec'].includes(sub)
    case 'git':
      return ['pull', 'push', 'checkout', 'switch', 'reset', 'commit', 'merge', 'rebase', 'stash', 'clean', 'fetch'].includes(sub)
    case 'npm':
      return ['install', 'i', 'ci', 'uninstall', 'update', 'run', 'start', 'exec'].includes(sub)
    case 'pip':
    case 'pip3':
      return ['install', 'uninstall'].includes(sub)
    case 'apt':
    case 'apt-get':
    case 'touch':
    case 'mkdir':
    case 'mv':
    case 'cp':
    case 'chmod':
    case 'chown':
    case 'kill':
    case 'killall':
    case 'pkill':
    case 'nano':
    case 'vi':
    case 'vim':
    case 'tee':
      return true
    default:
      return false
  }
}

/* ---------- tokeniser ---------- */

export function tokenize(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let has = false
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      has = true
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur)
      cur = ''
      has = false
    } else cur += ch
  }
  if (cur || has) out.push(cur)
  return out
}

/* ---------- helpers on the context ---------- */

const depByName = (s: ShellSession, name: string) => s.ctx.deployments.find((d) => d.serviceName === name.replace(/\.service$/, ''))
const projectName = (s: ShellSession, d: Deployment) => s.ctx.projects.find((p) => p.id === d.projectId)?.name ?? d.serviceName
const tier = (s: ShellSession) => COMPUTE_TIERS.find((t) => t.value === s.ctx.env.spec.compute)
const hasGpu = (s: ShellSession) => !!tier(s)?.gpu && s.ctx.env.spec.instance.gpuType !== 'none'
const gpuCount = (s: ShellSession) => Math.max(1, s.ctx.env.spec.gpuCount || s.ctx.env.spec.instance.gpuCount * Math.max(1, s.ctx.env.spec.instanceCount))
const running = (s: ShellSession, d: Deployment) => s.svcState[d.serviceName] === 'running'
const isProcess = (d: Deployment) => !isStatic(d.config)
const sinceOf = (d: Deployment) => new Date(d.lastRun?.finishedAt ?? d.updatedAt)
const host = (s: ShellSession) => hostnameFor(s.ctx.env)
const depForCwd = (s: ShellSession) => s.ctx.deployments.find((d) => s.cwd === `/srv/${d.serviceName}` || s.cwd.startsWith(`/srv/${d.serviceName}/`))

function journalLines(s: ShellSession, d: Deployment, n: number) {
  const pid = pidOf(d.serviceName)
  const prefix = (at: Date) => `${journalStamp(at)} ${host(s)} ${d.serviceName}[${pid}]:`
  const lines: string[] = []
  for (const l of d.lastRun?.log ?? []) {
    const color = l.level === 'ERROR' ? A.red : l.level === 'WARN' ? A.yellow : ''
    lines.push(`${prefix(new Date(l.at))} ${color}${l.text}${color ? A.reset : ''}`)
  }
  const st = s.svcState[d.serviceName]
  if (st === 'running' && isProcess(d)) {
    const start = sinceOf(d).getTime()
    lines.push(`${prefix(new Date(start + 2000))} Listening on 127.0.0.1:${d.config.port}`)
    const paths = [d.config.healthPath, `${d.config.basePath.replace(/\/$/, '')}/v1/chat`, `${d.config.basePath.replace(/\/$/, '')}/v1/sessions`]
    const base = Date.now() - 20 * 45_000
    for (let i = 0; i < 24; i++) {
      const p = paths[i % 3]!
      const ms = 8 + (hash(`${d.serviceName}${i}`) % (p === d.config.healthPath ? 6 : 420))
      lines.push(`${prefix(new Date(base + i * 45_000))} ${p === d.config.healthPath ? 'GET' : 'POST'} ${p} 200 ${ms}ms`)
    }
  } else if (st === 'failed') {
    lines.push(`${prefix(sinceOf(d))} ${A.red}Main process exited, code=exited, status=1/FAILURE${A.reset}`)
  } else if (st === 'stopped') {
    lines.push(`${journalStamp(sinceOf(d))} ${host(s)} systemd[1]: Stopped ${projectName(s, d)} on ${s.ctx.env.spec.name}.`)
  }
  return lines.slice(-n)
}

/* ---------- individual commands ---------- */

function ls(s: ShellSession, args: string[]): string {
  const flags = args.filter((a) => a.startsWith('-')).join('')
  const all = flags.includes('a')
  const long = flags.includes('l')
  const targets = args.filter((a) => !a.startsWith('-'))
  const target = targets[0] ?? '.'
  const path = resolvePath(s.cwd, target, s.home)
  const node = lookup(s.fs, path)
  if (!node) return `ls: cannot access '${target}': No such file or directory`
  if (node.type === 'file') return target
  const names = Object.keys(node.children)
    .filter((n) => all || !n.startsWith('.'))
    .sort((a, b) => a.replace(/^\./, '').localeCompare(b.replace(/^\./, '')))
  const entries = all ? ['.', '..', ...names] : names
  const paint = (n: string) => {
    const child = n === '.' || n === '..' ? node : node.children[n]!
    if (child.type === 'dir') return `${A.blue}${A.bold}${n}${A.reset}`
    if (n.endsWith('.sh')) return `${A.green}${A.bold}${n}${A.reset}`
    return n
  }
  if (!long) return entries.map(paint).join('  ')
  const owner = path.startsWith('/home/') && !path.startsWith('/home/deploy') ? usernameFor(s.ctx.user) : path.startsWith('/etc') || path === '/' ? 'root' : 'deploy'
  const d = new Date(s.ctx.env.createdAt)
  const stamp = `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`
  const rows = entries.map((n) => {
    const child = n === '.' || n === '..' ? node : node.children[n]!
    const isDir = child.type === 'dir'
    const size = isDir ? 4096 : child.content.length
    const perms = isDir ? 'drwxr-xr-x' : n.endsWith('.sh') ? '-rwxr-xr-x' : n === '.env' ? '-rw-------' : '-rw-r--r--'
    return `${perms} ${isDir ? 2 : 1} ${col(owner, 7)} ${col(owner, 7)} ${rcol(size, 6)} ${stamp} ${paint(n)}`
  })
  return [`total ${entries.length * 4}`, ...rows].join('\n')
}

function cat(s: ShellSession, args: string[]): string {
  const files = args.filter((a) => !a.startsWith('-'))
  if (!files.length) return 'cat: missing file operand'
  return files
    .map((f) => {
      const path = resolvePath(s.cwd, f, s.home)
      const node = lookup(s.fs, path)
      if (!node) return `cat: ${f}: No such file or directory`
      if (node.type === 'dir') return `cat: ${f}: Is a directory`
      return maskSecrets(node.content)
    })
    .join('\n')
}

function df(s: ShellSession): string {
  const size = s.ctx.env.spec.storageGb
  const used = Math.min(Math.round(size * 0.85), 14 + s.ctx.deployments.length * 3 + (hasGpu(s) ? 22 : 0) + (s.ctx.env.spec.llms.length + s.ctx.env.spec.asr.length) * 6)
  const pct = Math.round((used / size) * 100)
  const ram = allocationOf(s.ctx.env.spec).ramGb
  return [
    'Filesystem      Size  Used Avail Use% Mounted on',
    `tmpfs           ${col(`${(ram / 20).toFixed(1)}G`, 5)} 1.6M ${col(`${(ram / 20).toFixed(1)}G`, 5)}  1% /run`,
    `/dev/nvme0n1p1  ${col(`${size}G`, 5)} ${rcol(`${used}G`, 4)} ${rcol(`${size - used}G`, 5)} ${rcol(`${pct}%`, 4)} /`,
    `tmpfs           ${col(`${Math.round(ram / 2)}G`, 5)}    0 ${col(`${Math.round(ram / 2)}G`, 5)}  0% /dev/shm`,
    'tmpfs           5.0M     0  5.0M   0% /run/lock',
    '/dev/nvme0n1p15 105M  6.1M   99M   6% /boot/efi',
  ].join('\n')
}

function memory(s: ShellSession) {
  const total = allocationOf(s.ctx.env.spec).ramGb
  const apps = s.ctx.deployments.filter((d) => running(s, d)).reduce((sum, d) => sum + d.usage.ramGb, 0)
  const used = Math.min(total * 0.9, 0.9 + apps + (hasGpu(s) ? 1.4 : 0))
  const cache = Math.min(total - used, total * 0.12)
  return { total, used, cache, free: total - used - cache }
}

function free(s: ShellSession): string {
  const m = memory(s)
  return [
    '               total        used        free      shared  buff/cache   available',
    `Mem:     ${rcol(gib(m.total), 11)} ${rcol(gib(m.used), 11)} ${rcol(gib(m.free), 11)} ${rcol('12Mi', 11)} ${rcol(gib(m.cache), 11)} ${rcol(gib(m.total - m.used), 11)}`,
    `Swap:    ${rcol('0B', 11)} ${rcol('0B', 11)} ${rcol('0B', 11)}`,
  ].join('\n')
}

function uptimeLine(s: ShellSession) {
  const now = new Date()
  const days = Math.max(0, Math.floor((now.getTime() - new Date(s.ctx.env.createdAt).getTime()) / 86400000))
  const busy = s.ctx.deployments.filter((d) => running(s, d)).reduce((sum, d) => sum + d.usage.cpuPct, 0) / 100
  const load = (k: number) => (busy * k + 0.08).toFixed(2)
  return `${hms(now)} up ${days} days,  ${two(now.getUTCHours() % 12)}:${two(now.getUTCMinutes())},  1 user,  load average: ${load(1)}, ${load(0.9)}, ${load(0.85)}`
}

function top(s: ShellSession): string {
  const m = memory(s)
  const vcpu = allocationOf(s.ctx.env.spec).vcpu
  const apps = s.ctx.deployments.filter((d) => running(s, d) && isProcess(d))
  const cpuUsed = apps.reduce((sum, d) => sum + d.usage.cpuPct, 0) / vcpu
  const mib = (gb: number) => (gb * 1024).toFixed(1).padStart(9)
  const rows = [
    ...apps.map((d) => ({ pid: pidOf(d.serviceName), user: 'deploy', cpu: d.usage.cpuPct, ram: d.usage.ramGb, cmd: d.config.runtime === 'python' ? 'python3' : d.config.processManager === 'compose' ? 'docker-proxy' : 'node' })),
    ...(hasGpu(s) && s.ctx.env.spec.llms.length ? [{ pid: 1874, user: 'aic', cpu: 6.3, ram: 3.2, cmd: 'vllm' }] : []),
    { pid: 812, user: 'root', cpu: 0.7, ram: 0.05, cmd: 'nginx' },
    { pid: 1, user: 'root', cpu: 0.0, ram: 0.01, cmd: 'systemd' },
    { pid: 623, user: 'root', cpu: 0.0, ram: 0.02, cmd: 'sshd' },
    { pid: 701, user: 'root', cpu: 0.3, ram: 0.04, cmd: 'aic-agent' },
  ].sort((a, b) => b.cpu - a.cpu)
  return [
    `top - ${uptimeLine(s)}`,
    `Tasks: ${180 + apps.length * 6} total,   1 running, ${179 + apps.length * 6} sleeping,   0 stopped,   0 zombie`,
    `%Cpu(s): ${rcol(cpuUsed.toFixed(1), 4)} us,  1.1 sy,  0.0 ni, ${rcol((100 - cpuUsed - 1.4).toFixed(1), 4)} id,  0.2 wa,  0.0 hi,  0.1 si,  0.0 st`,
    `MiB Mem : ${mib(m.total)} total, ${mib(m.free)} free, ${mib(m.used)} used, ${mib(m.cache)} buff/cache`,
    `MiB Swap:       0.0 total,       0.0 free,       0.0 used. ${mib(m.total - m.used)} avail Mem`,
    '',
    `${A.bold}    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND${A.reset}`,
    ...rows.map((r) => {
      const res = Math.round(r.ram * 1024 * 1024)
      const time = `${Math.floor(r.cpu * 3)}:${two(Math.round(r.cpu * 7) % 60)}.${two(r.pid % 100)}`
      return `${rcol(r.pid, 7)} ${col(r.user, 9)} 20   0 ${rcol(`${Math.round(res * 2.6 / 1024)}m`, 7)} ${rcol(res > 999999 ? `${(res / 1048576).toFixed(1)}g` : res, 6)} ${rcol(Math.round(res / 9), 6)} S ${rcol(r.cpu.toFixed(1), 5)} ${rcol(((r.ram / m.total) * 100).toFixed(1), 5)} ${rcol(time, 9)} ${r.cmd}`
    }),
    '',
    note('(static snapshot — top exits straight away in the simulated terminal)'),
  ].join('\n')
}

const GPU_SPECS: Record<string, { mem: number; cap: number; draw: number; util: number }> = {
  T4: { mem: 15360, cap: 70, draw: 31, util: 24 },
  L4: { mem: 23034, cap: 72, draw: 38, util: 29 },
  A10: { mem: 23028, cap: 150, draw: 62, util: 37 },
  A100: { mem: 81920, cap: 400, draw: 118, util: 41 },
}

function nvidiaSmi(s: ShellSession): string {
  if (!hasGpu(s)) {
    return [
      `${A.red}nvidia-smi: command not found${A.reset}`,
      `This environment has no GPU (${s.ctx.env.spec.instance.name}, CPU only), so there is no NVIDIA driver to query.`,
    ].join('\n')
  }
  const type = s.ctx.env.spec.instance.gpuType === 'none' ? 'A10' : s.ctx.env.spec.instance.gpuType
  const g = GPU_SPECS[type] ?? GPU_SPECS.A10!
  const n = gpuCount(s)
  const models = [...s.ctx.env.spec.llms.map((l) => l.id), ...s.ctx.env.spec.asr].map((id) => s.ctx.catalog.find((c) => c.id === id)).filter((c) => c && c.hosting === 'open-source')
  const perGpu = Math.round(g.mem * (models.length ? 0.38 + 0.12 * Math.min(models.length, 3) : 0.02))
  const now = new Date()
  const line = '+-----------------------------------------+------------------------+----------------------+'
  const cell = (a: string, b: string, c: string) => `| ${col(a, 39)} | ${col(b, 22)} | ${col(c, 20)} |`
  const out = [
    `${DAYS[now.getUTCDay()]} ${MONTHS[now.getUTCMonth()]} ${two(now.getUTCDate())} ${hms(now)} ${now.getUTCFullYear()}`,
    '+-----------------------------------------------------------------------------------------+',
    '| NVIDIA-SMI 550.90.07              Driver Version: 550.90.07      CUDA Version: 12.4     |',
    '|-----------------------------------------+------------------------+----------------------+',
    cell('GPU  Name                 Persistence-M', 'Bus-Id          Disp.A', 'Volatile Uncorr. ECC'),
    cell('Fan  Temp   Perf          Pwr:Usage/Cap', '          Memory-Usage', 'GPU-Util  Compute M.'),
    cell('', '', '              MIG M.'),
    '|=========================================+========================+======================|',
  ]
  for (let i = 0; i < n; i++) {
    const used = i === 0 ? perGpu : Math.round(perGpu * 0.8)
    const util = models.length ? g.util - i * 6 : 0
    out.push(
      cell(`${rcol(i, 3)}  ${col(`NVIDIA ${type}${type === 'A100' ? '-SXM4-80GB' : ''}`, 26)}On`, `${col(`00000000:00:${(0x1e + i).toString(16).toUpperCase()}.0`, 16)} Off`, rcol('0', 20)),
      cell(`N/A   ${41 + i * 2}C    P0  ${rcol(`${g.draw - i * 4}W / ${g.cap}W`, 22)}`, rcol(`${used}MiB / ${g.mem}MiB`, 22), `${rcol(`${util}%`, 8)}     Default`),
      cell('', '', rcol('N/A', 20)),
      line,
    )
  }
  out.push(
    '',
    '+-----------------------------------------------------------------------------------------+',
    '| Processes:                                                                              |',
    '|  GPU   GI   CI        PID   Type   Process name                              GPU Memory |',
    '|        ID   ID                                                               Usage      |',
    '|=========================================================================================|',
  )
  if (!models.length) out.push(`|  ${col('No running processes found', 85)}  |`)
  models.forEach((m, i) => {
    const name = m!.category === 'asr' ? `aic-asr-server --model ${m!.name}` : `vllm serve ${m!.name}`
    out.push(`|  ${rcol(i % n, 4)}   N/A  N/A  ${rcol(1874 + i * 37, 9)}      C   ${col(name.slice(0, 39), 39)} ${rcol(`${Math.round(perGpu / models.length)}MiB`, 10)} |`)
  })
  out.push('+-----------------------------------------------------------------------------------------+')
  return out.join('\n')
}

function dockerPs(s: ShellSession, args: string[]): string {
  const all = args.includes('-a')
  const deps = s.ctx.deployments.filter((d) => d.config.processManager === 'compose' && isProcess(d) && (all || running(s, d)))
  const header = `${col('CONTAINER ID', 14)} ${col('IMAGE', 22)} ${col('COMMAND', 24)} ${col('CREATED', 14)} ${col('STATUS', 26)} ${col('PORTS', 26)} NAMES`
  const rows = deps.map((d) => {
    const c = d.config
    const image = c.runtime === 'node' ? `node:${c.runtimeVersion}-slim` : c.runtime === 'python' ? `python:${c.runtimeVersion}-slim` : `${d.serviceName}:latest`
    const created = ago(new Date(d.createdAt)).replace(' ago', '') + ' ago'
    const up = running(s, d) ? `Up ${ago(sinceOf(d)).replace(' ago', '')} (healthy)` : 'Exited (0) 2 hours ago'
    return `${col(hash(d.serviceName).toString(16).padStart(12, '0').slice(0, 12), 14)} ${col(image, 22)} ${col(JSON.stringify(c.startCmd.slice(0, 19) + (c.startCmd.length > 19 ? '…' : '')), 24)} ${col(created, 14)} ${col(up, 26)} ${col(running(s, d) ? `127.0.0.1:${c.port}->${c.port}/tcp` : '', 26)} ${d.serviceName}`
  })
  const out = [header, ...rows]
  if (!s.ctx.deployments.some((d) => d.config.processManager === 'compose')) out.push(note('(no projects on this environment run under Docker Compose)'))
  return out.join('\n')
}

const BUILTIN_UNITS: Record<string, string> = {
  nginx: 'A high performance web server and a reverse proxy server',
  ssh: 'OpenBSD Secure Shell server',
  'aic-agent': 'AI Sandbox environment agent',
}

function unitStatus(s: ShellSession, name: string): string {
  const svc = name.replace(/\.service$/, '')
  const builtin = BUILTIN_UNITS[svc] ?? (svc === 'docker' && s.ctx.deployments.some((d) => d.config.processManager === 'compose') ? 'Docker Application Container Engine' : undefined)
  const created = new Date(s.ctx.env.createdAt)
  if (builtin) {
    return [
      `${A.green}●${A.reset} ${svc}.service - ${builtin}`,
      `     Loaded: loaded (/lib/systemd/system/${svc}.service; enabled; vendor preset: enabled)`,
      `     Active: ${A.green}${A.bold}active (running)${A.reset} since ${sinceStamp(created)}; ${ago(created)}`,
      `   Main PID: ${svc === 'nginx' ? 812 : svc === 'ssh' ? 623 : 701}`,
    ].join('\n')
  }
  const d = depByName(s, svc)
  if (!d) return `Unit ${svc}.service could not be found.`
  if (isStatic(d.config)) return `Unit ${svc}.service could not be found.\n${note(`(${projectName(s, d)} is a static site served by nginx from /srv/${svc}/dist — try: systemctl status nginx)`)}`
  if (d.config.processManager === 'pm2') return `Unit ${svc}.service could not be found.\n${note(`(${projectName(s, d)} runs under PM2 — try: pm2 list)`)}`
  if (d.config.processManager === 'compose') return `Unit ${svc}.service could not be found.\n${note(`(${projectName(s, d)} runs in Docker Compose — try: docker ps)`)}`
  const st = s.svcState[svc]
  const since = sinceOf(d)
  const ctx = genContext(s.ctx, d)
  const pid = pidOf(svc)
  const dot = st === 'running' ? `${A.green}●${A.reset}` : st === 'failed' ? `${A.red}×${A.reset}` : '○'
  const active =
    st === 'running'
      ? `${A.green}${A.bold}active (running)${A.reset} since ${sinceStamp(since)}; ${ago(since)}`
      : st === 'failed'
        ? `${A.red}${A.bold}failed${A.reset} (Result: exit-code) since ${sinceStamp(since)}; ${ago(since)}`
        : st === 'activating'
          ? `${A.yellow}activating (start)${A.reset} since ${sinceStamp(since)}; ${ago(since)}`
          : `inactive (dead) since ${sinceStamp(since)}; ${ago(since)}`
  const out = [
    `${dot} ${svc}.service - ${ctx.projectName} on ${s.ctx.env.spec.name}`,
    `     Loaded: loaded (/etc/systemd/system/${svc}.service; enabled; vendor preset: enabled)`,
    `     Active: ${active}`,
  ]
  if (st === 'running') {
    out.push(
      `   Main PID: ${pid} (${d.config.runtime === 'python' ? 'python3' : 'node'})`,
      `      Tasks: ${d.config.runtime === 'python' ? 6 : 11} (limit: 76800)`,
      `     Memory: ${d.usage.ramGb.toFixed(1)}G (max: ${d.config.limits.ramGb.toFixed(1)}G)`,
      `        CPU: ${Math.round(d.usage.cpuPct / 10)}h ${(hash(svc) % 59) + 1}min ${(hash(svc) % 60).toString()}.${(hash(svc) % 1000).toString().padStart(3, '0')}s`,
      `     CGroup: /system.slice/${svc}.service`,
      `             └─${pid} ${execStart(ctx)}`,
    )
  } else if (st === 'failed') {
    out.push(`    Process: ${pid} ExecStart=${execStart(ctx)} (code=exited, status=1/FAILURE)`, `   Main PID: ${pid} (code=exited, status=1/FAILURE)`)
  }
  out.push('', ...journalLines(s, d, 6))
  return out.join('\n')
}

function systemctl(s: ShellSession, args: string[]): string {
  const [sub = 'list-units', ...rest] = args.filter((a) => !a.startsWith('-'))
  if (sub === 'status' && rest.length) return rest.map((n) => unitStatus(s, n)).join('\n\n')
  if (sub === 'status' || sub === 'list-units') {
    const units = s.ctx.deployments.filter((d) => d.config.processManager === 'systemd' && isProcess(d))
    const rows = [
      ...units.map((d) => {
        const st = s.svcState[d.serviceName]!
        const [active, subState] = st === 'running' ? ['active', 'running'] : st === 'failed' ? ['failed', 'failed'] : st === 'activating' ? ['activating', 'start'] : ['inactive', 'dead']
        return `  ${col(`${d.serviceName}.service`, 34)} loaded ${col(active, 10)} ${col(subState, 8)} ${projectName(s, d)} on ${s.ctx.env.spec.name}`
      }),
      `  ${col('aic-agent.service', 34)} loaded active     running  ${BUILTIN_UNITS['aic-agent']}`,
      ...(s.ctx.deployments.some((d) => d.config.processManager === 'compose') ? [`  ${col('docker.service', 34)} loaded active     running  Docker Application Container Engine`] : []),
      `  ${col('nginx.service', 34)} loaded active     running  ${BUILTIN_UNITS.nginx}`,
      `  ${col('ssh.service', 34)} loaded active     running  ${BUILTIN_UNITS.ssh}`,
    ]
    return [`  ${col('UNIT', 34)} LOAD   ${col('ACTIVE', 10)} ${col('SUB', 8)} DESCRIPTION`, ...rows, '', `${rows.length} loaded units listed. Pass a name for details: systemctl status <service>`].join('\n')
  }
  if (['start', 'stop', 'restart', 'reload', 'enable', 'disable'].includes(sub)) {
    if (!rest.length) return `Too few arguments.`
    const out: string[] = []
    for (const n of rest) {
      const name = n.replace(/\.service$/, '')
      if (BUILTIN_UNITS[name] || name === 'docker') {
        out.push(note(`(${name} is managed by the platform; left unchanged)`))
        continue
      }
      const d = depByName(s, name)
      if (!d || d.config.processManager !== 'systemd' || !isProcess(d)) {
        out.push(`Failed to ${sub} ${name}.service: Unit ${name}.service not found.`)
        continue
      }
      if (sub === 'stop') s.svcState[name] = 'stopped'
      if (sub === 'start' || sub === 'restart' || sub === 'reload') {
        if (d.status === 'failed' || d.breakBuild) {
          s.svcState[name] = 'failed'
          out.push(`Job for ${name}.service failed because the control process exited with error code.`, `See "systemctl status ${name}.service" and "journalctl -xeu ${name}.service" for details.`)
          continue
        }
        s.svcState[name] = 'running'
      }
      if (sub === 'enable') out.push(`Created symlink /etc/systemd/system/multi-user.target.wants/${name}.service → /etc/systemd/system/${name}.service.`)
    }
    return [...out, SIM_NOTE].join('\n')
  }
  if (sub === 'daemon-reload') return SIM_NOTE
  return `Unknown command verb ${sub}. Supported here: status, list-units, start, stop, restart.`
}

function journalctl(s: ShellSession, args: string[]): string {
  let unit = ''
  let n = 20
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!
    if (a === '-u' || a === '--unit') unit = args[++i] ?? ''
    else if (a.startsWith('--unit=')) unit = a.slice(7)
    else if (a === '-n' || a === '--lines') n = Number(args[++i]) || 20
    else if (/^-n\d+$/.test(a)) n = Number(a.slice(2))
  }
  if (!unit) return 'Pass a unit: journalctl -u <service> -n 20'
  const name = unit.replace(/\.service$/, '')
  const d = depByName(s, name)
  if (!d) return BUILTIN_UNITS[name] ? `${journalStamp(new Date())} ${host(s)} ${name}[812]: (no recent entries)` : `-- No entries --`
  return [`${note(`Logs begin at ${sinceStamp(new Date(s.ctx.env.createdAt))}.`)}`, ...journalLines(s, d, n)].join('\n')
}

function pm2Table(s: ShellSession) {
  const deps = s.ctx.deployments.filter((d) => d.config.processManager === 'pm2' && isProcess(d))
  const w = [4, 26, 9, 5, 10, 7, 10]
  const bar = (l: string, m: string, r: string) => `${l}${w.map((x) => '─'.repeat(x + 2)).join(m)}${r}`
  const row = (cells: (string | number)[], colors: string[] = []) => `│ ${cells.map((c, i) => `${colors[i] ?? ''}${col(c, w[i]!)}${colors[i] ? A.reset : ''}`).join(' │ ')} │`
  const out = [bar('┌', '┬', '┐'), row(['id', 'name', 'mode', '↺', 'status', 'cpu', 'memory']), bar('├', '┼', '┤')]
  deps.forEach((d, i) => {
    const st = s.svcState[d.serviceName]
    const status = st === 'running' ? 'online' : st === 'failed' ? 'errored' : st === 'activating' ? 'launching' : 'stopped'
    out.push(row([i, d.serviceName, 'fork', st === 'failed' ? 15 : 0, status, st === 'running' ? `${d.usage.cpuPct}%` : '0%', st === 'running' ? `${(d.usage.ramGb * 1024).toFixed(1)}mb` : '0b'], ['', '', '', '', st === 'running' ? A.green : A.red]))
  })
  out.push(bar('└', '┴', '┘'))
  if (!deps.length) out.push(note('(no projects on this environment run under PM2)'))
  return out.join('\n')
}

function pm2(s: ShellSession, args: string[]): string {
  const [sub = 'list', ...rest] = args.filter((a) => !a.startsWith('-'))
  if (['list', 'ls', 'status', 'l'].includes(sub)) return pm2Table(s)
  if (sub === 'logs') {
    const lines = Number(args[args.indexOf('--lines') + 1]) || 15
    const deps = s.ctx.deployments.filter((d) => d.config.processManager === 'pm2' && (!rest[0] || d.serviceName === rest[0] || rest[0] === 'all'))
    if (!deps.length) return rest[0] ? `[PM2][ERROR] No process found for "${rest[0]}". Try: pm2 list` : '[PM2] No processes to show logs for.'
    return deps
      .flatMap((d, i) => [
        `${A.dim}/home/deploy/.pm2/logs/${d.serviceName}-out.log last ${lines} lines:${A.reset}`,
        ...journalLines(s, d, lines).map((l) => `${A.green}${i}|${d.serviceName}${A.reset} | ${l.replace(/^.*?\]: /, '')}`),
      ])
      .join('\n')
  }
  if (['start', 'stop', 'restart', 'reload', 'delete'].includes(sub)) {
    const target = rest[0]
    if (!target) return `[PM2][ERROR] Pass a process name: pm2 ${sub} <name>`
    const deps = s.ctx.deployments.filter((d) => d.config.processManager === 'pm2' && (target === 'all' || d.serviceName === target))
    if (!deps.length) return `[PM2][ERROR] Process or Namespace ${target} not found`
    const out: string[] = []
    for (const d of deps) {
      const failing = d.status === 'failed' || !!d.breakBuild
      s.svcState[d.serviceName] = sub === 'stop' || sub === 'delete' ? 'stopped' : failing ? 'failed' : 'running'
      out.push(`[PM2] Applying action ${sub}ProcessId on app [${d.serviceName}](ids: [ 0 ])`, `[PM2] [${d.serviceName}](0) ✓`)
    }
    return [...out, pm2Table(s), SIM_NOTE].join('\n')
  }
  return `[PM2] Supported here: pm2 list, pm2 logs <name>, pm2 restart|stop|start <name>`
}

const NODE_VERSIONS: Record<string, [string, string]> = { '22': ['v22.11.0', '10.9.0'], '20': ['v20.18.0', '10.8.2'], '18': ['v18.20.4', '10.7.0'] }
const PY_VERSIONS: Record<string, string> = { '3.12': 'Python 3.12.7', '3.11': 'Python 3.11.10', '3.10': 'Python 3.10.15' }

function runtimeDep(s: ShellSession, runtime: 'node' | 'python') {
  const here = depForCwd(s)
  if (here?.config.runtime === runtime || (runtime === 'node' && here?.config.runtime === 'static')) return here
  return s.ctx.deployments.find((d) => d.config.runtime === runtime || (runtime === 'node' && d.config.runtime === 'static' && d.config.buildCmd))
}

function nodeVersion(s: ShellSession, which: 'node' | 'npm'): string {
  const d = runtimeDep(s, 'node')
  if (!d) return `Command '${which}' not found. No project on this environment uses Node.js.`
  const v = NODE_VERSIONS[d.config.runtimeVersion || '20'] ?? NODE_VERSIONS['20']!
  return which === 'node' ? v[0] : v[1]
}

function pythonVersion(s: ShellSession, which: string): string {
  const d = runtimeDep(s, 'python')
  if (!d) return which === 'python3' ? 'Python 3.10.12' : `Command 'python' not found, did you mean: command 'python3'`
  return PY_VERSIONS[d.config.runtimeVersion] ?? 'Python 3.11.10'
}

function pipList(s: ShellSession): string {
  const d = runtimeDep(s, 'python')
  const pkgs: [string, string][] = d
    ? [['anyio', '4.6.0'], ['fastapi', '0.115.0'], ['h11', '0.14.0'], ['httpx', '0.27.2'], ['numpy', '1.26.4'], ['pip', '24.2'], ['pydantic', '2.9.2'], ['pydantic_core', '2.23.4'], ['setuptools', '74.1.2'], ['starlette', '0.38.6'], ['uvicorn', '0.30.6']]
    : [['pip', '22.0.2'], ['setuptools', '59.6.0'], ['wheel', '0.37.1']]
  const out = [`${col('Package', 20)} Version`, `${'-'.repeat(20)} ${'-'.repeat(10)}`, ...pkgs.map(([n, v]) => `${col(n, 20)} ${v}`)]
  if (d && !depForCwd(s)) out.unshift(note(`(packages from /srv/${d.serviceName}/.venv — cd there to pick another project)`))
  return out.join('\n')
}

function git(s: ShellSession, args: string[]): string {
  const sub = args[0] ?? ''
  const d = depForCwd(s)
  if (!d || !lookup(s.fs, `/srv/${d.serviceName}/.git`)) return 'fatal: not a git repository (or any of the parent directories): .git'
  const branch = d.config.source.kind === 'git' ? d.config.source.branch : 'main'
  const commit = d.history[d.history.length - 1]?.commit ?? '0000000'
  switch (sub) {
    case 'status':
      return [`On branch ${branch}`, `Your branch is up to date with 'origin/${branch}'.`, '', 'nothing to commit, working tree clean'].join('\n')
    case 'log':
      return d.history
        .slice()
        .reverse()
        .map((h) => `${A.yellow}commit ${h.commit}${'0'.repeat(33)}${A.reset}\nDate:   ${new Date(h.at).toUTCString()}\n\n    ${h.note ?? `Deploy v${h.version}`}\n`)
        .join('\n')
    case 'branch':
      return `* ${A.green}${branch}${A.reset}`
    case 'remote':
      return d.config.source.kind === 'git' ? `origin\t${d.config.source.repoUrl} (fetch)\norigin\t${d.config.source.repoUrl} (push)` : ''
    case 'pull':
      return [`From ${d.config.source.kind === 'git' ? d.config.source.repoUrl : 'origin'}`, ` * branch            ${branch}     -> FETCH_HEAD`, `Already up to date. (HEAD at ${commit})`, SIM_NOTE].join('\n')
    default:
      return sub ? `git ${sub}: not supported in the simulated terminal. Try git status, git log, git pull.` : 'usage: git status | git log | git branch | git remote -v | git pull'
  }
}

function curl(s: ShellSession, args: string[]): string {
  const showHeaders = args.includes('-i') || args.includes('-I') || args.includes('--include')
  const url = args.find((a) => !a.startsWith('-'))
  if (!url) return "curl: try 'curl localhost:<port>/health'"
  const m = url.match(/^(?:https?:\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/)
  if (!m) return `curl: (3) URL using bad/illegal format or missing URL`
  const [, hostName, portStr, path = '/'] = m
  if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(hostName!)) return `curl: (6) Could not resolve host: ${hostName}\n${note('(the simulated terminal only answers requests to localhost)')}`
  const port = Number(portStr ?? 80)
  const refused = `curl: (7) Failed to connect to ${hostName} port ${port} after 0 ms: Connection refused`
  const reply = (status: number, body: string) => {
    const reason: Record<number, string> = { 200: 'OK', 204: 'No Content', 404: 'Not Found', 502: 'Bad Gateway' }
    const head = [`HTTP/1.1 ${status} ${reason[status] ?? ''}`, 'content-type: application/json; charset=utf-8', `content-length: ${body.length}`, `date: ${new Date().toUTCString()}`, '']
    return showHeaders ? [...head, body].join('\n') : body
  }
  if (port === 80) {
    const d = s.ctx.deployments.find((x) => path.startsWith(x.config.basePath.replace(/\/$/, '') || '/') && x.config.basePath !== '/') ?? s.ctx.deployments.find((x) => x.config.basePath === '/')
    if (!d) return reply(404, '<html><body><h1>404 Not Found</h1><hr><center>nginx/1.24.0</center></body></html>')
    if (!running(s, d)) return reply(502, '<html><body><h1>502 Bad Gateway</h1><hr><center>nginx/1.24.0</center></body></html>')
    if (isStatic(d.config)) return reply(200, `<!doctype html><html><head><title>${projectName(s, d)}</title></head><body><div id="root"></div></body></html>`)
  }
  const d = s.ctx.deployments.find((x) => isProcess(x) && x.config.port === port)
  if (!d) return port === 80 ? reply(404, '{"detail":"Not Found"}') : refused
  if (!running(s, d)) return refused
  const rel = port === 80 ? path.slice(d.config.basePath.replace(/\/$/, '').length) || '/' : path
  if (rel === d.config.healthPath || rel === `${d.config.healthPath}/`) {
    const v = d.history[d.history.length - 1]
    const body = JSON.stringify({ status: 'ok', service: d.serviceName, version: v ? `v${v.version}` : 'v1', commit: v?.commit, uptime_s: Math.round((Date.now() - sinceOf(d).getTime()) / 1000) })
    return reply(d.config.healthStatus || 200, body)
  }
  return reply(404, JSON.stringify({ error: 'Not Found', path: rel }))
}

/* ---------- dispatcher ---------- */

export function runCommand(s: ShellSession, raw: string): CommandResult {
  const line = raw.trim()
  if (!line) return { output: '' }
  s.history.push(line)
  if (/[;&|]{1,2}|`|\$\(/.test(line.replace(/'[^']*'|"[^"]*"/g, ''))) {
    if (/\brm\b|\bshutdown\b|\breboot\b/.test(line)) return { output: destructive() }
    return { output: 'Pipes, redirects and chained commands aren’t supported in the simulated terminal. Run one command at a time.' }
  }
  let tokens = tokenize(line)
  let sudo = false
  if (tokens[0] === 'sudo') {
    sudo = true
    tokens = tokens.slice(1)
  }
  const [cmd = '', ...args] = tokens
  if (!cmd) return { output: 'usage: sudo <command>' }
  if (DESTRUCTIVE.test(cmd) || (cmd === 'kill' && args.includes('1')) || line.includes(':(){')) return { output: destructive() }
  if (isStateChanging(cmd, args) && s.readOnly) return { output: READ_ONLY_DENIED }
  const out = (output: string): CommandResult => ({ output: sudo && output ? `${note('[sudo] simulated — no password needed')}\n${output}` : output })

  switch (cmd) {
    case 'help':
      return out(HELP)
    case 'clear':
      return { output: '', clear: true }
    case 'exit':
    case 'logout':
      return { output: 'logout', exit: true }
    case 'whoami':
      return out(sudo ? 'root' : usernameFor(s.ctx.user))
    case 'hostname':
      return out(args.includes('-f') ? envHost(s.ctx.env) : host(s))
    case 'pwd':
      return out(s.cwd)
    case 'echo':
      return out(args.join(' ').replace(/\$HOME/g, s.home).replace(/\$USER/g, usernameFor(s.ctx.user)).replace(/\$PWD/g, s.cwd))
    case 'date':
      return out(new Date().toUTCString().replace('GMT', 'UTC'))
    case 'uptime':
      return out(` ${uptimeLine(s)}`)
    case 'ls':
    case 'll':
      return out(ls(s, cmd === 'll' ? ['-la', ...args] : args))
    case 'cd': {
      const target = args[0] ?? '~'
      const path = resolvePath(s.cwd, target === '-' ? s.home : target, s.home)
      const node = lookup(s.fs, path)
      if (!node) return out(`bash: cd: ${target}: No such file or directory`)
      if (node.type !== 'dir') return out(`bash: cd: ${target}: Not a directory`)
      s.cwd = path
      return out('')
    }
    case 'cat':
      return out(cat(s, args))
    case 'uname':
      return out(args.includes('-a') ? `Linux ${host(s)} 5.15.0-119-generic #129-Ubuntu SMP Fri Aug 2 19:25:20 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux` : args.includes('-r') ? '5.15.0-119-generic' : 'Linux')
    case 'df':
      return out(df(s))
    case 'free':
      return out(free(s))
    case 'top':
    case 'htop':
      return out(top(s))
    case 'nvidia-smi':
      return out(nvidiaSmi(s))
    case 'docker': {
      const sub = args[0]
      if (sub === 'ps') return out(dockerPs(s, args))
      if (sub === 'restart' || sub === 'stop' || sub === 'start') {
        const names = args.slice(1)
        const lines = names.map((n) => {
          const d = s.ctx.deployments.find((x) => x.serviceName === n && x.config.processManager === 'compose')
          if (!d) return `Error response from daemon: No such container: ${n}`
          s.svcState[n] = sub === 'stop' ? 'stopped' : 'running'
          return n
        })
        return out([...lines, SIM_NOTE].join('\n'))
      }
      if (isStateChanging(cmd, args)) return out(SIM_NOTE)
      return out('Supported here: docker ps [-a], docker restart|stop|start <container>')
    }
    case 'systemctl':
      return out(systemctl(s, args))
    case 'journalctl':
      return out(journalctl(s, args))
    case 'pm2':
      return out(pm2(s, args))
    case 'node':
      return out(args[0] === '-v' || args[0] === '--version' ? nodeVersion(s, 'node') : 'Interactive Node.js isn’t available in the simulated terminal. Try node -v.')
    case 'npm':
      if (args[0] === '-v' || args[0] === '--version') return out(nodeVersion(s, 'npm'))
      if (isStateChanging(cmd, args)) return out(depForCwd(s) ? ['', 'up to date, audited 412 packages in 2s', '', '68 packages are looking for funding', '  run `npm fund` for details', '', 'found 0 vulnerabilities', SIM_NOTE].join('\n') : 'npm ERR! enoent Could not read package.json — cd into a project under /srv first.')
      return out('Supported here: npm -v, npm install')
    case 'python':
    case 'python3':
      return out(args[0] === '--version' || args[0] === '-V' ? pythonVersion(s, cmd) : 'Interactive Python isn’t available in the simulated terminal. Try python --version.')
    case 'pip':
    case 'pip3':
      if (args[0] === 'list' || args[0] === 'freeze') return out(pipList(s))
      if (args[0] === '--version' || args[0] === '-V') return out(`pip 24.2 from /usr/lib/python3/dist-packages/pip (${pythonVersion(s, 'python3').toLowerCase()})`)
      if (isStateChanging(cmd, args)) return out([...args.slice(1).filter((a) => !a.startsWith('-')).map((p) => `Requirement already satisfied: ${p}`), SIM_NOTE].join('\n'))
      return out('Supported here: pip list, pip install <package>')
    case 'git':
      return out(git(s, args))
    case 'curl':
      return out(curl(s, args))
    case 'history':
      return out(s.history.map((h, i) => `${rcol(i + 1, 5)}  ${h}`).join('\n'))
    case 'mkdir':
    case 'touch': {
      const names = args.filter((a) => !a.startsWith('-'))
      if (!names.length) return out(`${cmd}: missing operand`)
      for (const n of names) {
        const path = resolvePath(s.cwd, n, s.home)
        const parent = lookup(s.fs, path.split('/').slice(0, -1).join('/') || '/')
        const leaf = path.split('/').pop()!
        if (!parent || parent.type !== 'dir') return out(`${cmd}: cannot create '${n}': No such file or directory`)
        if (!parent.children[leaf]) parent.children[leaf] = cmd === 'mkdir' ? { type: 'dir', children: {} } : { type: 'file', content: '' }
      }
      return out(note('(created in this session only)'))
    }
    default:
      if (isStateChanging(cmd, args)) return out(`${cmd}: ${SIM_NOTE}`)
      return out(`${cmd}: command not supported in simulated terminal — type help`)
  }
}

function destructive() {
  return `${A.yellow}That command could destroy data or take the machine down, so the simulated terminal won’t run it.${A.reset}\nTo stop or terminate the environment, use the actions on the environment page.`
}

/* ---------- completion ---------- */

export function complete(s: ShellSession, buffer: string): { completed: string; options: string[] } {
  const endsWithSpace = /\s$/.test(buffer)
  const tokens = buffer.trimStart().split(/\s+/)
  const word = endsWithSpace ? '' : (tokens[tokens.length - 1] ?? '')
  const isFirst = tokens.length <= 1 && !endsWithSpace
  let candidates: string[]
  if (isFirst) {
    candidates = COMMANDS.filter((c) => c.startsWith(word))
  } else {
    const first = tokens[0] === 'sudo' ? tokens[1] : tokens[0]
    const prev = endsWithSpace ? tokens[tokens.length - 1] : tokens[tokens.length - 2]
    const svcNames = s.ctx.deployments.map((d) => d.serviceName)
    if (first === 'journalctl' && (prev === '-u' || prev === '--unit')) candidates = svcNames.filter((n) => n.startsWith(word))
    else if (first === 'systemctl' && tokens.length >= 3) candidates = [...svcNames, 'nginx', 'ssh', 'aic-agent'].filter((n) => n.startsWith(word))
    else if (first === 'systemctl') candidates = ['status', 'list-units', 'start', 'stop', 'restart'].filter((n) => n.startsWith(word))
    else if (first === 'pm2' && tokens.length >= 3) candidates = s.ctx.deployments.filter((d) => d.config.processManager === 'pm2').map((d) => d.serviceName).filter((n) => n.startsWith(word))
    else if (first === 'pm2') candidates = ['list', 'logs', 'restart', 'stop', 'start'].filter((n) => n.startsWith(word))
    else if (first === 'docker' && tokens.length >= 3) candidates = s.ctx.deployments.filter((d) => d.config.processManager === 'compose').map((d) => d.serviceName).filter((n) => n.startsWith(word))
    else {
      // paths
      const slash = word.lastIndexOf('/')
      const dirPart = slash >= 0 ? word.slice(0, slash + 1) : ''
      const base = slash >= 0 ? word.slice(slash + 1) : word
      const node = lookup(s.fs, resolvePath(s.cwd, dirPart || '.', s.home))
      const onlyDirs = first === 'cd'
      candidates =
        node && node.type === 'dir'
          ? Object.entries(node.children)
              .filter(([n, c]) => n.startsWith(base) && (!onlyDirs || c.type === 'dir') && (base.startsWith('.') || !n.startsWith('.')))
              .map(([n, c]) => `${dirPart}${n}${c.type === 'dir' ? '/' : ''}`)
          : []
    }
  }
  if (!candidates.length) return { completed: buffer, options: [] }
  const prefix = candidates.reduce((acc, c) => {
    let i = 0
    while (i < acc.length && i < c.length && acc[i] === c[i]) i++
    return acc.slice(0, i)
  })
  const head = buffer.slice(0, buffer.length - word.length)
  if (candidates.length === 1) {
    const only = candidates[0]!
    return { completed: `${head}${only}${only.endsWith('/') ? '' : ' '}`, options: [] }
  }
  return { completed: `${head}${prefix.length > word.length ? prefix : word}`, options: candidates.map((c) => c.split('/').filter(Boolean).pop()! + (c.endsWith('/') ? '/' : '')) }
}
