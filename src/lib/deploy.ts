import type {
  CatalogItem,
  Deployment,
  DeploymentConfig,
  DeploymentStatus,
  DeployStepKey,
  Environment,
  ProcessManager,
  Project,
  Runtime,
  Tenant,
  User,
} from '@/data/types'
import { allocationOf } from './quota'
import { capabilityConnectionVars, capabilityPackages, effectiveCapabilities, missingServices, type EffectiveCapability } from './capabilities'
import { slugify } from './utils'

/* ---------- labels and presets ---------- */

export const RUNTIMES: { value: Runtime; label: string; versions: string[] }[] = [
  { value: 'node', label: 'Node.js', versions: ['22', '20', '18'] },
  { value: 'python', label: 'Python', versions: ['3.12', '3.11', '3.10'] },
  { value: 'docker', label: 'Docker', versions: [] },
  { value: 'static', label: 'Static site', versions: [] },
]
export const runtimeLabel = (r: Runtime, version?: string) => {
  const meta = RUNTIMES.find((x) => x.value === r)!
  return version && meta.versions.length ? `${meta.label} ${version}` : meta.label
}

export const PROCESS_MANAGERS: { value: ProcessManager; label: string; file: string }[] = [
  { value: 'systemd', label: 'systemd service', file: 'systemd unit' },
  { value: 'pm2', label: 'PM2', file: 'PM2 ecosystem file' },
  { value: 'compose', label: 'Docker Compose', file: 'docker-compose.yml' },
]
export const pmLabel = (p: ProcessManager) => PROCESS_MANAGERS.find((x) => x.value === p)!.label

export const DEPLOYMENT_STATUS_LABELS: Record<DeploymentStatus, string> = {
  not_deployed: 'Not deployed',
  deploying: 'Deploying',
  running: 'Running',
  failed: 'Failed',
  stopped: 'Stopped',
}

export const STEP_LABELS: Record<DeployStepKey, string> = {
  connect: 'Connect to the environment',
  runtime: 'Install the runtime',
  clone: 'Fetch the source',
  env: 'Set environment variables',
  install: 'Install dependencies',
  build: 'Build',
  pre: 'Run pre-deploy commands',
  service: 'Create the service',
  start: 'Enable and start the service',
  nginx: 'Configure the Nginx route',
  health: 'Health check',
  post: 'Run post-deploy commands',
  logs: 'View logs',
}
export const STEP_ORDER: DeployStepKey[] = ['connect', 'runtime', 'clone', 'env', 'install', 'build', 'pre', 'service', 'start', 'nginx', 'health', 'post', 'logs']

type Preset = Pick<DeploymentConfig, 'runtimeVersion' | 'installCmd' | 'buildCmd' | 'startCmd' | 'processManager' | 'healthPath'>

export const RUNTIME_PRESETS: Record<Runtime, Preset> = {
  node: { runtimeVersion: '20', installCmd: 'npm ci', buildCmd: 'npm run build', startCmd: 'node dist/server.js', processManager: 'systemd', healthPath: '/health' },
  python: { runtimeVersion: '3.11', installCmd: 'pip install -r requirements.txt', buildCmd: '', startCmd: 'uvicorn app.main:app --host 127.0.0.1 --port 8000', processManager: 'systemd', healthPath: '/health' },
  docker: { runtimeVersion: '', installCmd: '', buildCmd: 'docker build -t app:latest .', startCmd: '', processManager: 'compose', healthPath: '/health' },
  static: { runtimeVersion: '', installCmd: 'npm ci', buildCmd: 'npm run build', startCmd: '', processManager: 'systemd', healthPath: '/' },
}

/** Static sites are files served by Nginx: no process, no port. */
export const isStatic = (cfg: Pick<DeploymentConfig, 'runtime'>) => cfg.runtime === 'static'

/** Applies a runtime's defaults while keeping what doesn't depend on the runtime. */
export function switchRuntime(cfg: DeploymentConfig, runtime: Runtime): DeploymentConfig {
  const p = RUNTIME_PRESETS[runtime]
  return { ...cfg, runtime, ...p, startCmd: runtime === 'python' ? p.startCmd.replace('8000', String(cfg.port || 8000)) : p.startCmd }
}

/* ---------- names and hosts ---------- */

export const serviceNameFor = (project: Pick<Project, 'name'>) => slugify(project.name).slice(0, 40) || 'app'

/** The environment's own host name, e.g. tutor.slk-101.aicommons.example. */
export function envHost(env: Environment) {
  let host = 'env.aicommons.example'
  try {
    host = new URL(env.endpoint).hostname
  } catch {
    /* keep the fallback */
  }
  return `${env.id.replace(/^env-/, '')}.${host}`
}

const trimSlash = (p: string) => (p === '/' ? '' : p.replace(/\/+$/, ''))

export function deploymentUrl(cfg: DeploymentConfig, env: Environment) {
  return `https://${cfg.domain.trim() || envHost(env)}${trimSlash(cfg.basePath) || '/'}`
}

/* ---------- defaults ---------- */

const MODEL_CATEGORIES = new Set(['llm', 'asr'])

export function nextFreePort(siblings: Pick<Deployment, 'config'>[], start = 3000) {
  const used = new Set(siblings.map((d) => d.config.port))
  let p = start
  while (used.has(p)) p += 1
  return p
}

export function defaultConfig(project: Project, siblings: Deployment[], catalog: CatalogItem[]): DeploymentConfig {
  const slug = serviceNameFor(project)
  const runtime = project.defaultRuntime ?? 'node'
  const preset = RUNTIME_PRESETS[runtime]
  const port = isStatic({ runtime }) ? 0 : nextFreePort(siblings, runtime === 'python' ? 8000 : 3000)
  return {
    runtime,
    ...preset,
    runtimeVersion: project.defaultRuntimeVersion || preset.runtimeVersion,
    startCmd: runtime === 'python' ? preset.startCmd.replace('8000', String(port)) : preset.startCmd,
    source: { kind: 'git', repoUrl: project.repoUrl || `https://github.com/example-org/${slug}.git`, branch: project.defaultBranch || 'main' },
    port,
    basePath: `/${slug}`,
    domain: '',
    env: runtime === 'node' ? [{ key: 'NODE_ENV', value: 'production' }] : [],
    healthStatus: 200,
    limits: { vcpu: 1, ramGb: 2 },
    dependencies: defaultDependencies(project, catalog),
    preDeployCmd: '',
    postDeployCmd: '',
    serviceAccess: {},
    capabilityChoice: {},
  }
}

/** The models (LLM, speech) a project uses, from its capabilities: what it needs on an environment by default. */
export function defaultDependencies(project: Pick<Project, 'capabilityIds'>, catalog: CatalogItem[]) {
  return project.capabilityIds.filter((id) => MODEL_CATEGORIES.has(catalog.find((c) => c.id === id)?.category ?? '')).slice(0, 2)
}

/* ---------- environment capacity ---------- */

export interface Capacity {
  vcpu: number
  ramGb: number
}

export function envCapacity(env: Environment): Capacity {
  const a = allocationOf(env.spec)
  return { vcpu: a.vcpu, ramGb: a.ramGb }
}

export function limitsUsed(deps: Pick<Deployment, 'config'>[]): Capacity {
  return deps.reduce((s, d) => ({ vcpu: s.vcpu + d.config.limits.vcpu, ramGb: s.ramGb + d.config.limits.ramGb }), { vcpu: 0, ramGb: 0 })
}

/** How much more vCPU/RAM the environment would need to fit `extra` on top of what's reserved, or null if it fits. */
export function capacityShortfall(env: Environment, deps: Pick<Deployment, 'config'>[], extra: Capacity): Capacity | null {
  const cap = envCapacity(env)
  const used = limitsUsed(deps)
  const short = { vcpu: Math.max(0, used.vcpu + extra.vcpu - cap.vcpu), ramGb: Math.max(0, used.ramGb + extra.ramGb - cap.ramGb) }
  return short.vcpu > 0 || short.ramGb > 0 ? short : null
}

export function shortfallText(s: Capacity) {
  const parts = [s.vcpu > 0 ? `${s.vcpu} vCPU` : '', s.ramGb > 0 ? `${s.ramGb} GB RAM` : ''].filter(Boolean)
  return parts.join(' and ')
}

/* ---------- dependencies ---------- */

/** Catalog items attached to an environment (models, speech, environment-level capabilities). */
export function attachedItemIds(env: Environment) {
  return [...env.spec.llms.map((l) => l.id), ...env.spec.asr, ...env.capabilities.map((c) => c.itemId)]
}

export function missingDependencies(env: Environment, cfg: Pick<DeploymentConfig, 'dependencies'>) {
  const have = new Set(attachedItemIds(env))
  return cfg.dependencies.filter((id) => !have.has(id))
}

/* ---------- validation ---------- */

export type ConfigField = 'repoUrl' | 'branch' | 'fileName' | 'startCmd' | 'port' | 'basePath' | 'domain' | 'env' | 'healthPath' | 'healthStatus' | 'limits' | 'runtimeVersion'
export type ConfigErrors = Partial<Record<ConfigField, string>>

const GIT_URL = /^(https:\/\/[\w.-]+(:\d+)?\/[\w.~/-]+?(\.git)?|git@[\w.-]+:[\w.~/-]+\.git)$/
const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i
const ENV_KEY = /^[A-Z_][A-Z0-9_]*$/

export interface ValidationContext {
  env: Environment
  /** The other deployments on the same environment. */
  siblings: Deployment[]
  projectName: (projectId: string) => string
}

export function validateConfig(cfg: DeploymentConfig, ctx: ValidationContext): ConfigErrors {
  const e: ConfigErrors = {}
  const meta = RUNTIMES.find((r) => r.value === cfg.runtime)!
  if (meta.versions.length && !cfg.runtimeVersion) e.runtimeVersion = `Choose a ${meta.label} version.`

  if (cfg.source.kind === 'git') {
    if (!GIT_URL.test(cfg.source.repoUrl.trim())) e.repoUrl = 'Enter a Git URL such as https://github.com/org/repo.git or git@github.com:org/repo.git.'
    if (!cfg.source.branch.trim()) e.branch = 'Enter the branch to deploy, for example main.'
    else if (/\s|\.\.|^-/.test(cfg.source.branch)) e.branch = 'Branch names can’t contain spaces or “..”.'
  } else if (!cfg.source.fileName) e.fileName = 'Choose a build archive (.zip or .tar.gz) to upload.'

  if (!isStatic(cfg)) {
    if (cfg.runtime !== 'docker' && !cfg.startCmd.trim()) e.startCmd = 'Enter the command that starts the service, for example node dist/server.js.'
    if (!Number.isInteger(cfg.port) || cfg.port < 1024 || cfg.port > 65535) e.port = 'Use a port between 1024 and 65535.'
    else {
      const clash = ctx.siblings.find((d) => !isStatic(d.config) && d.config.port === cfg.port)
      if (clash) e.port = `Port ${cfg.port} is already used by ${ctx.projectName(clash.projectId)} on this environment. Choose another port, such as ${nextFreePort(ctx.siblings, cfg.port)}.`
    }
  }

  const base = cfg.basePath.trim()
  if (!/^\/[\w\-/.]*$/.test(base)) e.basePath = 'Start the base path with “/”, for example /api.'
  else {
    const host = cfg.domain.trim().toLowerCase()
    const clash = ctx.siblings.find((d) => d.config.domain.trim().toLowerCase() === host && trimSlash(d.config.basePath) === trimSlash(base))
    if (clash) e.basePath = `${ctx.projectName(clash.projectId)} already serves ${base} on this host. Choose another base path or a different domain.`
  }
  if (cfg.domain.trim() && !DOMAIN.test(cfg.domain.trim())) e.domain = 'Enter a domain such as tutor.shikshalokam.org, without https://.'

  const keys = cfg.env.map((v) => v.key.trim())
  const badKey = keys.find((k) => !ENV_KEY.test(k))
  const dup = keys.find((k, i) => keys.indexOf(k) !== i)
  if (badKey !== undefined) e.env = `“${badKey || '(empty)'}” isn’t a valid variable name. Use capitals, digits and underscores, for example DATABASE_URL.`
  else if (dup) e.env = `${dup} is set twice. Keep one.`

  if (!cfg.healthPath.startsWith('/')) e.healthPath = 'Start the health check path with “/”, for example /health.'
  if (!Number.isInteger(cfg.healthStatus) || cfg.healthStatus < 100 || cfg.healthStatus > 599) e.healthStatus = 'Use an HTTP status between 100 and 599.'

  if (!(cfg.limits.vcpu > 0) || !(cfg.limits.ramGb > 0)) e.limits = 'Give the project at least some CPU and RAM.'
  else {
    const short = capacityShortfall(ctx.env, ctx.siblings, cfg.limits)
    if (short) {
      const cap = envCapacity(ctx.env)
      e.limits = `These limits need ${shortfallText(short)} more than this environment has (${cap.vcpu} vCPU, ${cap.ramGb} GB RAM shared by all its projects). Lower the limits or request an upgrade.`
    }
  }
  return e
}

/* ---------- generated files ---------- */

export interface GenContext {
  dep: Pick<Deployment, 'serviceName' | 'projectId'> & { config: DeploymentConfig }
  env: Environment
  projectName: string
  catalog: CatalogItem[]
  /** The project's own capabilities; with them, library packages and service connection variables are added automatically. */
  project?: Pick<Project, 'capabilityIds' | 'capabilityVersions'>
}

/** Effective capabilities for a generated deployment (project + environment). */
export function genCapabilities(ctx: GenContext): EffectiveCapability[] {
  if (!ctx.project) return []
  return effectiveCapabilities(ctx.project, ctx.env, ctx.catalog, ctx.dep.config.capabilityChoice)
}

/** `${NAME}` references to organisation keys in a value. */
export const keyRefs = (value: string) => [...value.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g)].map((m) => m[1]!)
export const isKeyRef = (value: string) => /^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value.trim())
/** Shown in place of a key's value everywhere it appears. */
export const maskValue = (value: string) => (keyRefs(value).length ? value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, '••••••••') : value)

const dir = (svc: string) => `/srv/${svc}`
const versionLabel = (v: string) => (v.includes('.') ? v : `${v}`)

/** Variables the platform adds: port, environment endpoint and the attached models this project uses. */
export function platformVars(ctx: GenContext): { key: string; value: string }[] {
  const c = ctx.dep.config
  const vars: { key: string; value: string }[] = []
  if (!isStatic(c)) vars.push({ key: 'PORT', value: String(c.port) })
  if (c.dependencies.length) {
    vars.push({ key: 'AIC_ENDPOINT', value: ctx.env.endpoint })
    for (const id of c.dependencies) {
      const item = ctx.catalog.find((x) => x.id === id)
      if (item) vars.push({ key: `AIC_${item.category === 'asr' ? 'ASR' : item.category === 'llm' ? 'MODEL' : 'CAP'}_${slugify(item.name).replace(/-/g, '_').toUpperCase()}`, value: item.version })
    }
  }
  for (const v of capabilityConnectionVars(genCapabilities(ctx), envHost(ctx.env), c.serviceAccess)) if (!vars.some((x) => x.key === v.key)) vars.push(v)
  return vars
}

export function allVars(ctx: GenContext) {
  const own = ctx.dep.config.env.filter((v) => v.key.trim())
  const ownKeys = new Set(own.map((v) => v.key))
  return [...platformVars(ctx).filter((v) => !ownKeys.has(v.key)), ...own]
}

/** Variables written into the service definition; key references go to .env instead so they never appear in unit files. */
const inlineVars = (ctx: GenContext) => allVars(ctx).filter((v) => !keyRefs(v.value).length)
/** Variables that reference organisation keys, written to .env. */
export const secretVars = (ctx: GenContext) => allVars(ctx).filter((v) => keyRefs(v.value).length)

const PY_BINS = new Set(['python', 'python3', 'uvicorn', 'gunicorn', 'hypercorn', 'flask', 'fastapi', 'celery', 'pip'])

/** The ExecStart line: Python commands run from the virtualenv, Node commands through nvm-exec. */
export function execStart(ctx: GenContext) {
  const c = ctx.dep.config
  const cmd = c.startCmd.trim()
  const first = cmd.split(/\s+/)[0] ?? ''
  if (cmd.startsWith('/')) return cmd
  if (c.runtime === 'python' && PY_BINS.has(first)) return `${dir(ctx.dep.serviceName)}/.venv/bin/${cmd}`
  if (c.runtime === 'node') return `/home/deploy/.nvm/nvm-exec ${cmd}`
  if (first === 'docker') return `/usr/bin/${cmd}`
  return `/usr/bin/env ${cmd}`
}

const cpuQuota = (vcpu: number) => `${Math.round(vcpu * 100)}%`
const quoteEnv = (v: string) => (/[\s"\\]/.test(v) ? `"${v.replace(/(["\\])/g, '\\$1')}"` : v)

export function systemdUnit(ctx: GenContext) {
  const c = ctx.dep.config
  const svc = ctx.dep.serviceName
  const vars = inlineVars(ctx)
  return [
    '[Unit]',
    `Description=${ctx.projectName} on ${ctx.env.spec.name}`,
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    'User=deploy',
    `WorkingDirectory=${dir(svc)}`,
    ...(c.runtime === 'node' ? [`Environment=NODE_VERSION=${c.runtimeVersion}`] : []),
    ...vars.map((v) => `Environment=${quoteEnv(`${v.key}=${v.value}`)}`),
    `EnvironmentFile=-${dir(svc)}/.env`,
    `ExecStart=${execStart(ctx)}`,
    'Restart=on-failure',
    'RestartSec=5',
    `CPUQuota=${cpuQuota(c.limits.vcpu)}`,
    `MemoryMax=${c.limits.ramGb}G`,
    'StandardOutput=journal',
    'StandardError=journal',
    `SyslogIdentifier=${svc}`,
    '',
    '[Install]',
    'WantedBy=multi-user.target',
  ].join('\n')
}

export function pm2Ecosystem(ctx: GenContext) {
  const c = ctx.dep.config
  const svc = ctx.dep.serviceName
  const tokens = c.startCmd.trim().split(/\s+/)
  const [first = '', ...rest] = tokens
  let script = first
  let args = rest.join(' ')
  let interpreter = `'none'`
  if (c.runtime === 'node' && first === 'node' && rest[0]) {
    script = rest[0]
    args = rest.slice(1).join(' ')
    interpreter = `'node'`
  } else if (c.runtime === 'python' && PY_BINS.has(first)) {
    script = `${dir(svc)}/.venv/bin/${first}`
  }
  const vars = inlineVars(ctx)
  return [
    'module.exports = {',
    '  apps: [',
    '    {',
    `      name: '${svc}',`,
    `      cwd: '${dir(svc)}',`,
    `      script: '${script}',`,
    ...(args ? [`      args: '${args.replace(/'/g, "\\'")}',`] : []),
    `      interpreter: ${interpreter},`,
    '      instances: 1,',
    '      autorestart: true,',
    `      max_memory_restart: '${c.limits.ramGb}G',`,
    '      env: {',
    ...vars.map((v) => `        ${v.key}: '${v.value.replace(/'/g, "\\'")}',`),
    '      },',
    '    },',
    '  ],',
    '}',
  ].join('\n')
}

export function composeFile(ctx: GenContext) {
  const c = ctx.dep.config
  const svc = ctx.dep.serviceName
  const vars = inlineVars(ctx)
  const startsWithDocker = /^docker\s/.test(c.startCmd.trim())
  const image = c.runtime === 'node' ? `node:${c.runtimeVersion}-slim` : c.runtime === 'python' ? `python:${c.runtimeVersion}-slim` : `${svc}:latest`
  const health = `curl -fsS -o /dev/null http://localhost:${c.port}${c.healthPath} || exit 1`
  return [
    'services:',
    `  ${svc}:`,
    ...(c.runtime === 'docker' ? ['    build: .', `    image: ${image}`] : [`    image: ${image}`, '    working_dir: /app', '    volumes:', `      - ${dir(svc)}:/app`]),
    `    container_name: ${svc}`,
    ...(c.startCmd.trim() && !startsWithDocker ? [`    command: ${JSON.stringify(c.runtime === 'python' && PY_BINS.has(c.startCmd.split(/\s+/)[0]!) ? `sh -c "pip install -q -r requirements.txt && ${c.startCmd.trim()}"` : c.startCmd.trim())}`] : []),
    '    ports:',
    `      - "127.0.0.1:${c.port}:${c.port}"`,
    ...(vars.length ? ['    environment:', ...vars.map((v) => `      ${v.key}: ${JSON.stringify(v.value)}`)] : []),
    '    env_file:',
    '      - path: .env',
    '        required: false',
    '    restart: unless-stopped',
    '    deploy:',
    '      resources:',
    '        limits:',
    `          cpus: "${c.limits.vcpu}"`,
    `          memory: ${c.limits.ramGb}G`,
    '    healthcheck:',
    `      test: ["CMD-SHELL", ${JSON.stringify(health)}]`,
    '      interval: 30s',
    '      timeout: 5s',
    '      retries: 3',
  ].join('\n')
}

/** Where the static build output lives, guessed from the build command. */
const staticOut = (svc: string) => `${dir(svc)}/dist`

export function nginxBlock(ctx: GenContext) {
  const c = ctx.dep.config
  const svc = ctx.dep.serviceName
  const host = c.domain.trim() || envHost(ctx.env)
  const base = trimSlash(c.basePath)
  const loc = base || '/'
  const location = isStatic(c)
    ? [
        `    location ${base ? `${base}/` : '/'} {`,
        `        alias ${staticOut(svc)}/;`,
        `        try_files $uri $uri/ ${base}/index.html;`,
        '        expires 1h;',
        '    }',
      ]
    : [
        `    location ${base ? `${base}/` : '/'} {`,
        `        proxy_pass http://127.0.0.1:${c.port}/;`,
        '        proxy_http_version 1.1;',
        '        proxy_set_header Host $host;',
        '        proxy_set_header X-Real-IP $remote_addr;',
        '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;',
        '        proxy_set_header X-Forwarded-Proto $scheme;',
        `        proxy_set_header X-Forwarded-Prefix ${loc};`,
        '        proxy_set_header Upgrade $http_upgrade;',
        '        proxy_set_header Connection "upgrade";',
        '        proxy_read_timeout 60s;',
        '    }',
      ]
  return [
    `# ${ctx.projectName} · ${loc}`,
    `# Projects on the same host share this server block; each adds its own location.`,
    'server {',
    '    listen 80;',
    `    server_name ${host};`,
    '',
    `    access_log /var/log/nginx/${svc}.access.log;`,
    `    error_log  /var/log/nginx/${svc}.error.log;`,
    '',
    ...(base ? [`    location = ${base} { return 301 ${base}/; }`, ''] : []),
    ...location,
    '}',
  ].join('\n')
}

/* ---------- deployment guide ---------- */

export interface GuideStep {
  /** 1-based position, shown in the guide and deploy.sh. */
  key: string
  step: DeployStepKey
  title: string
  body: string
  code: string
  codeLabel: string
  /** What goes into deploy.sh for this step; empty to leave it out. */
  script: string
}

export function serviceFile(ctx: GenContext): { label: string; path: string; content: string } | null {
  const c = ctx.dep.config
  const svc = ctx.dep.serviceName
  if (isStatic(c)) return null
  if (c.processManager === 'pm2') return { label: 'PM2 ecosystem file', path: `${dir(svc)}/ecosystem.config.js`, content: pm2Ecosystem(ctx) }
  if (c.processManager === 'compose') return { label: 'docker-compose.yml', path: `${dir(svc)}/docker-compose.yml`, content: composeFile(ctx) }
  return { label: 'systemd unit', path: `/etc/systemd/system/${svc}.service`, content: systemdUnit(ctx) }
}

export function guideSteps(ctx: GenContext): GuideStep[] {
  const c = ctx.dep.config
  const svc = ctx.dep.serviceName
  const host = envHost(ctx.env)
  const d = dir(svc)
  const steps: GuideStep[] = []
  const add = (s: Omit<GuideStep, 'key' | 'step' | 'script'> & { script?: string }) => steps.push({ key: String(steps.length + 1), step: STEP_ORDER[steps.length]!, script: s.script ?? s.code, ...s })

  add({
    title: 'Connect to the environment',
    body: `Sign in as the deploy user. Your SSH key is added when you join the project.`,
    code: `ssh deploy@${host}`,
    codeLabel: 'Shell · your computer',
    script: '',
  })

  const needsNode = c.runtime === 'node' || (c.runtime === 'static' && /\b(npm|yarn|pnpm|npx)\b/.test(`${c.installCmd} ${c.buildCmd}`))
  const runtimeLines =
    c.runtime === 'python'
      ? [`sudo apt-get update`, `sudo apt-get install -y python${versionLabel(c.runtimeVersion)} python${versionLabel(c.runtimeVersion)}-venv nginx`]
      : c.runtime === 'docker' || c.processManager === 'compose'
        ? ['sudo apt-get update', 'sudo apt-get install -y docker.io docker-compose-v2 nginx', 'sudo usermod -aG docker deploy']
        : [
            'sudo apt-get update && sudo apt-get install -y nginx',
            ...(needsNode
              ? ['curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash', 'source ~/.nvm/nvm.sh', `nvm install ${c.runtime === 'node' ? c.runtimeVersion : '20'}`, `nvm alias default ${c.runtime === 'node' ? c.runtimeVersion : '20'}`]
              : []),
          ]
  if (c.processManager === 'pm2' && !isStatic(c)) {
    if (!needsNode) runtimeLines.push('curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash', 'source ~/.nvm/nvm.sh', 'nvm install 20')
    runtimeLines.push('npm install -g pm2')
  }
  add({
    title: 'Install the runtime',
    body: `${runtimeLabel(c.runtime, c.runtimeVersion)}${c.processManager === 'pm2' && !isStatic(c) ? ', PM2' : ''} and Nginx. Skip anything already installed.`,
    code: runtimeLines.join('\n'),
    codeLabel: 'Shell · environment',
  })

  add(
    c.source.kind === 'git'
      ? {
          title: 'Clone the repository',
          body: `Check out ${c.source.branch} into ${d}.`,
          code: [`sudo mkdir -p ${d} && sudo chown deploy:deploy ${d}`, `git clone --branch ${c.source.branch} ${c.source.repoUrl} ${d} || git -C ${d} pull --ff-only`, `cd ${d}`, `git checkout ${c.source.branch}`].join('\n'),
          codeLabel: 'Shell · environment',
        }
      : {
          title: 'Upload the build',
          body: `Copy ${c.source.fileName} to the environment and unpack it into ${d}.`,
          code: [`scp ${c.source.fileName} deploy@${host}:/tmp/`, `sudo mkdir -p ${d} && sudo chown deploy:deploy ${d}`, c.source.fileName.endsWith('.zip') ? `unzip -o /tmp/${c.source.fileName} -d ${d}` : `tar -xzf /tmp/${c.source.fileName} -C ${d}`, `cd ${d}`].join('\n'),
          codeLabel: 'Shell · your computer, then environment',
          script: [`sudo mkdir -p ${d} && sudo chown deploy:deploy ${d}`, c.source.fileName.endsWith('.zip') ? `unzip -o /tmp/${c.source.fileName} -d ${d}` : `tar -xzf /tmp/${c.source.fileName} -C ${d}`, `cd ${d}`].join('\n'),
        },
  )

  const all = allVars(ctx)
  const secrets = secretVars(ctx)
  const envLines = all.map((v) => `${v.key}=${v.value}`)
  add({
    title: 'Set environment variables',
    body: all.length
      ? `Writes ${d}/.env (readable by the deploy user only). ${secrets.length ? `Keys (${secrets.map((v) => v.key).join(', ')}) are filled in from your organisation’s connected keys; values stay masked.` : ''} Capability connection variables are added automatically.`
      : 'This project sets no environment variables.',
    code: all.length ? [`cat > ${d}/.env <<EOF`, ...all.map((v) => `${v.key}=${maskValue(v.value)}`), 'EOF', `chmod 600 ${d}/.env`].join('\n') : '# no environment variables',
    codeLabel: `${d}/.env`,
    script: all.length ? [`cat > ${d}/.env <<EOF`, ...envLines, 'EOF', `chmod 600 ${d}/.env`].join('\n') : '',
  })

  const packages = capabilityPackages(genCapabilities(ctx), c.runtime)
  const install = [c.installCmd.trim(), packages.length ? (c.runtime === 'python' ? `pip install ${packages.join(' ')}` : `npm install --no-save ${packages.join(' ')}`) : ''].filter(Boolean).join('\n')
  add({
    title: 'Install dependencies',
    body: install ? `Runs in ${d}.${packages.length ? ` Libraries from this project’s capabilities are added: ${packages.join(', ')}.` : ''}` : 'Nothing to install for this project.',
    code:
      c.runtime === 'python'
        ? [`python${versionLabel(c.runtimeVersion)} -m venv .venv`, 'source .venv/bin/activate', install || '# no install command'].join('\n')
        : install || '# no install command',
    codeLabel: 'Shell · environment',
  })

  const build = c.buildCmd.trim()
  add({
    title: 'Build',
    body: build ? (isStatic(c) ? `Produces the static files Nginx serves from ${staticOut(svc)}.` : 'Compile the project before starting it.') : 'This project has no build step.',
    code: build || '# no build step',
    codeLabel: 'Shell · environment',
  })

  const pre = c.preDeployCmd.trim()
  add({
    title: 'Run pre-deploy commands',
    body: pre ? 'Runs before the service starts, for example database migrations.' : 'No pre-deploy commands.',
    code: pre || '# no pre-deploy commands',
    codeLabel: 'Shell · environment',
    script: pre,
  })

  const file = serviceFile(ctx)
  add(
    file
      ? {
          title: `Create the service`,
          body: `Save this ${file.label} as ${file.path}. It starts the project with: ${c.startCmd.trim() || 'the image’s default command'}.`,
          code: file.content,
          codeLabel: file.path,
          script: `${file.path.startsWith('/etc') ? 'sudo ' : ''}tee ${file.path} > /dev/null <<'EOF'\n${file.content}\nEOF`,
        }
      : {
          title: 'Create the service',
          body: 'Static sites need no service: Nginx serves the built files directly.',
          code: '# not needed for a static site',
          codeLabel: 'Note',
          script: '',
        },
  )

  add({
    title: 'Enable and start the service',
    body: isStatic(c) ? 'Nothing to start; the Nginx route below makes the site live.' : 'Starts now and again after every reboot.',
    code: isStatic(c)
      ? '# nothing to start for a static site'
      : c.processManager === 'pm2'
        ? [`pm2 start ${d}/ecosystem.config.js`, 'pm2 save', 'sudo env PATH=$PATH pm2 startup systemd -u deploy --hp /home/deploy'].join('\n')
        : c.processManager === 'compose'
          ? [`cd ${d}`, ...(c.runtime === 'docker' ? ['docker compose build'] : []), 'docker compose up -d'].join('\n')
          : ['sudo systemctl daemon-reload', `sudo systemctl enable --now ${svc}`, `systemctl status ${svc} --no-pager`].join('\n'),
    codeLabel: 'Shell · environment',
  })

  const block = nginxBlock(ctx)
  add({
    title: 'Configure the Nginx route',
    body: `Serves ${deploymentUrl(c, ctx.env)}. Save as /etc/nginx/sites-available/${svc}.conf, enable it and reload Nginx.`,
    code: block,
    codeLabel: `/etc/nginx/sites-available/${svc}.conf`,
    script: [`sudo tee /etc/nginx/sites-available/${svc}.conf > /dev/null <<'EOF'\n${block}\nEOF`, `sudo ln -sf /etc/nginx/sites-available/${svc}.conf /etc/nginx/sites-enabled/${svc}.conf`, 'sudo nginx -t && sudo systemctl reload nginx'].join('\n'),
  })

  const base = trimSlash(c.basePath)
  add({
    title: 'Health check',
    body: `Expect HTTP ${c.healthStatus}.`,
    code: [
      ...(isStatic(c) ? [] : [`curl -s -o /dev/null -w "%{http_code}\\n" http://127.0.0.1:${c.port}${c.healthPath}`]),
      `curl -s -o /dev/null -w "%{http_code}\\n" -H "Host: ${c.domain.trim() || host}" http://127.0.0.1${base}${c.healthPath}`,
    ].join('\n'),
    codeLabel: 'Shell · environment',
    script: [
      ...(isStatic(c) ? [] : [`test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:${c.port}${c.healthPath})" = "${c.healthStatus}"`]),
      `test "$(curl -s -o /dev/null -w '%{http_code}' -H 'Host: ${c.domain.trim() || host}' http://127.0.0.1${base}${c.healthPath})" = "${c.healthStatus}"`,
      `echo "${ctx.projectName} is healthy"`,
    ].join('\n'),
  })

  const post = c.postDeployCmd.trim()
  add({
    title: 'Run post-deploy commands',
    body: post ? 'Runs once the health check passes, for example warming a cache.' : 'No post-deploy commands.',
    code: post || '# no post-deploy commands',
    codeLabel: 'Shell · environment',
    script: post,
  })

  add({
    title: 'View logs',
    body: 'Follow the logs while you test.',
    code: isStatic(c)
      ? `sudo tail -f /var/log/nginx/${svc}.access.log /var/log/nginx/${svc}.error.log`
      : c.processManager === 'pm2'
        ? `pm2 logs ${svc}`
        : c.processManager === 'compose'
          ? `cd ${d} && docker compose logs -f ${svc}`
          : `journalctl -u ${svc} -f`,
    codeLabel: 'Shell · environment',
    script: '',
  })
  return steps
}

export function deployScript(ctx: GenContext) {
  const steps = guideSteps(ctx)
  return [
    '#!/usr/bin/env bash',
    `# deploy.sh · ${ctx.projectName} on ${ctx.env.spec.name}`,
    `# Generated by AI Sandbox. Run on the environment as the deploy user: bash deploy.sh`,
    'set -euo pipefail',
    '',
    ...steps.flatMap((s) => [`# ${s.key}. ${s.title}`, s.script ? s.script : `# (skipped in the script) ${s.code.split('\n')[0]}`, '']),
  ].join('\n')
}

/* ---------- simulated run ---------- */

export interface SimStep {
  key: DeployStepKey
  skipped?: boolean
  lines: string[]
  /** Set when this step fails; the run stops here. */
  error?: string
}

/** The seeded misconfigured project's build error. */
export const SEEDED_BUILD_ERROR =
  'Build failed: app/main.py imports app.scoring, but app/scoring.py isn’t on the branch being deployed. Switch to the branch that has it (release/2.3), or fix the import, then redeploy.'

export function simulateSteps(ctx: GenContext & { breakBuild?: boolean; commit: string }): SimStep[] {
  const c = ctx.dep.config
  const svc = ctx.dep.serviceName
  const host = envHost(ctx.env)
  const out: SimStep[] = []
  out.push({ key: 'connect', lines: [`$ ssh deploy@${host}`, `Connected to ${host} (${ctx.env.spec.instance.name})`] })
  out.push({
    key: 'runtime',
    lines:
      c.runtime === 'node'
        ? [`$ nvm install ${c.runtimeVersion}`, `v${c.runtimeVersion}.18.1 is already installed.`, `Now using node v${c.runtimeVersion}.18.1 (npm v10.8.2)`]
        : c.runtime === 'python'
          ? [`$ python${c.runtimeVersion} --version`, `Python ${c.runtimeVersion}.10`]
          : c.runtime === 'docker'
            ? ['$ docker --version', 'Docker version 27.3.1, build ce12230']
            : ['$ nginx -v', 'nginx version: nginx/1.24.0 (Ubuntu)'],
  })
  out.push({
    key: 'clone',
    lines:
      c.source.kind === 'git'
        ? [`$ git fetch origin ${c.source.branch}`, `$ git checkout ${c.source.branch}`, `HEAD is now at ${ctx.commit} Merge pull request from ${c.source.branch}`]
        : [`$ tar -xzf /tmp/${c.source.fileName} -C /srv/${svc}`, `Unpacked ${c.source.fileName}`],
  })
  const vars = allVars(ctx)
  out.push(
    vars.length
      ? { key: 'env', lines: [`Wrote /srv/${svc}/.env (${vars.length} variable${vars.length === 1 ? '' : 's'})`, ...vars.map((v) => `  ${v.key}=${keyRefs(v.value).length ? '••••••••' : v.value}`)] }
      : { key: 'env', skipped: true, lines: ['No environment variables; skipped.'] },
  )
  const packages = capabilityPackages(genCapabilities(ctx), c.runtime)
  out.push(
    c.installCmd.trim()
      ? {
          key: 'install',
          lines:
            c.runtime === 'python'
              ? [`$ ${c.installCmd}`, 'Collecting fastapi==0.115.4', 'Collecting uvicorn[standard]==0.32.0', 'Successfully installed 38 packages', ...(packages.length ? [`$ pip install ${packages.join(' ')}`, `Successfully installed ${packages.join(' ')}`] : [])]
              : [`$ ${c.installCmd}`, 'added 412 packages, and audited 413 packages in 9s', 'found 0 vulnerabilities', ...(packages.length ? [`$ npm install --no-save ${packages.join(' ')}`, `added ${packages.length * 7} packages in 3s`] : [])],
        }
      : { key: 'install', skipped: true, lines: ['No install command; skipped.'] },
  )
  if (!c.buildCmd.trim()) out.push({ key: 'build', skipped: true, lines: ['No build command; skipped.'] })
  else if (ctx.breakBuild)
    out.push({
      key: 'build',
      lines: [
        `$ ${c.buildCmd}`,
        "Listing 'app'...",
        "Compiling 'app/main.py'...",
        'Traceback (most recent call last):',
        '  File "app/main.py", line 6, in <module>',
        '    from app.scoring import score_reading',
        "ModuleNotFoundError: No module named 'app.scoring'",
        'Process exited with code 1',
      ],
      error: SEEDED_BUILD_ERROR,
    })
  else
    out.push({
      key: 'build',
      lines:
        c.runtime === 'python'
          ? [`$ ${c.buildCmd}`, "Listing 'app'...", 'Compiled 14 files']
          : c.runtime === 'docker'
            ? [`$ ${c.buildCmd}`, '[+] Building 41.2s (12/12) FINISHED', `=> naming to docker.io/library/${svc}:latest`]
            : [`$ ${c.buildCmd}`, '> build', isStatic(c) ? '✓ 214 modules transformed. dist/ written in 6.1s' : 'Compiled 86 files to dist/ in 4.3s'],
    })
  out.push(c.preDeployCmd.trim() ? { key: 'pre', lines: [`$ ${c.preDeployCmd.trim()}`, 'Done.'] } : { key: 'pre', skipped: true, lines: ['No pre-deploy commands; skipped.'] })
  const file = serviceFile(ctx)
  if (!file) {
    out.push({ key: 'service', skipped: true, lines: ['Static site: no service needed.'] })
    out.push({ key: 'start', skipped: true, lines: ['Static site: nothing to start.'] })
  } else {
    out.push({ key: 'service', lines: [`Wrote ${file.path}`, ...(c.processManager === 'systemd' ? [`ExecStart=${execStart(ctx)}`] : [])] })
    out.push({
      key: 'start',
      lines:
        c.processManager === 'pm2'
          ? [`$ pm2 start ecosystem.config.js`, `[PM2] App [${svc}] launched (1 instances)`]
          : c.processManager === 'compose'
            ? ['$ docker compose up -d', `Container ${svc}  Started`]
            : [`$ sudo systemctl enable --now ${svc}`, `Created symlink /etc/systemd/system/multi-user.target.wants/${svc}.service`, `● ${svc}.service - active (running)`],
    })
  }
  out.push({ key: 'nginx', lines: [`Wrote /etc/nginx/sites-available/${svc}.conf`, '$ sudo nginx -t', 'nginx: configuration file /etc/nginx/nginx.conf test is successful', '$ sudo systemctl reload nginx'] })
  out.push({ key: 'health', lines: [`$ curl ${deploymentUrl(c, ctx.env).replace(/\/$/, '')}${c.healthPath}`, `HTTP ${c.healthStatus} in 38 ms`] })
  out.push(c.postDeployCmd.trim() ? { key: 'post', lines: [`$ ${c.postDeployCmd.trim()}`, 'Done.'] } : { key: 'post', skipped: true, lines: ['No post-deploy commands; skipped.'] })
  out.push({
    key: 'logs',
    lines: [
      isStatic(c) ? `$ sudo tail -n 3 /var/log/nginx/${svc}.access.log` : c.processManager === 'pm2' ? `$ pm2 logs ${svc} --lines 3 --nostream` : c.processManager === 'compose' ? `$ docker compose logs --tail 3 ${svc}` : `$ journalctl -u ${svc} -n 3 --no-pager`,
      isStatic(c) ? '127.0.0.1 - - "GET / HTTP/1.1" 200 1543' : `Listening on 127.0.0.1:${c.port}`,
    ],
  })
  return out
}

export const fakeCommit = () => Math.random().toString(16).slice(2, 9)

/* ---------- pre-deploy checklist ---------- */

export type CheckKey = 'env_active' | 'port_free' | 'resources' | 'keys' | 'capabilities'

export interface PreDeployCheck {
  key: CheckKey
  label: string
  ok: boolean
  /** Errors block deploying; warnings can be overridden. */
  severity: 'error' | 'warning'
  detail: string
}

export interface CheckContext extends GenContext {
  siblings: Deployment[]
  tenant: Pick<Tenant, 'connectedKeys'> | undefined
  projectNameOf: (projectId: string) => string
}

/** Key names referenced by the configuration that the organisation hasn't connected. */
export function missingKeys(cfg: Pick<DeploymentConfig, 'env'>, tenant: Pick<Tenant, 'connectedKeys'> | undefined) {
  const have = new Set(tenant?.connectedKeys ?? [])
  return [...new Set(cfg.env.flatMap((v) => keyRefs(v.value)))].filter((k) => !have.has(k))
}

export function preDeployChecks(ctx: CheckContext): PreDeployCheck[] {
  const c = ctx.dep.config
  const env = ctx.env
  const errors = validateConfig(c, { env, siblings: ctx.siblings, projectName: ctx.projectNameOf })
  const cap = envCapacity(env)
  const short = capacityShortfall(env, ctx.siblings, c.limits)
  const keys = missingKeys(c, ctx.tenant)
  const caps = genCapabilities(ctx)
  const conflicts = caps.filter((x) => x.conflict)
  const missing = ctx.project ? missingServices(ctx.project, env, ctx.catalog, c.serviceAccess) : []
  const models = missingDependencies(env, c).map((id) => ctx.catalog.find((x) => x.id === id)?.name ?? id)
  const capProblems = [
    ...conflicts.map((x) => `${x.item.name}: project uses ${x.conflict!.project}, environment has ${x.conflict!.environment}`),
    ...missing.map((m) => `${m.name} is missing on this environment`),
    ...models.map((m) => `${m} isn’t attached to this environment`),
  ]
  return [
    {
      key: 'env_active',
      label: 'Environment is Active',
      ok: env.status === 'active',
      severity: 'error',
      detail: env.status === 'active' ? `“${env.spec.name}” is running.` : `“${env.spec.name}” is ${env.status.replace('_', ' ')}. Start it before deploying.`,
    },
    {
      key: 'port_free',
      label: 'Port is free',
      ok: !errors.port,
      severity: 'error',
      detail: isStatic(c) ? 'Static site: no port needed.' : (errors.port ?? `Port ${c.port} isn’t used by any other project on this environment.`),
    },
    {
      key: 'resources',
      label: 'Resources are sufficient',
      ok: !short,
      severity: 'error',
      detail: short
        ? `Needs ${shortfallText(short)} more than this environment has (${cap.vcpu} vCPU, ${cap.ramGb} GB RAM shared by all its projects). Lower the limits or request an upgrade.`
        : `${c.limits.vcpu} vCPU and ${c.limits.ramGb} GB RAM fit within ${cap.vcpu} vCPU and ${cap.ramGb} GB RAM.`,
    },
    {
      key: 'keys',
      label: 'Required keys are connected',
      ok: !keys.length,
      severity: 'warning',
      detail: keys.length
        ? `${keys.join(', ')} ${keys.length === 1 ? 'isn’t' : 'aren’t'} connected for your organisation. The service may fail when it uses ${keys.length === 1 ? 'it' : 'them'}.`
        : (() => {
            const used = [...new Set(c.env.flatMap((v) => keyRefs(v.value)))]
            return used.length ? `${used.join(', ')} ${used.length === 1 ? 'is' : 'are'} connected.` : 'This configuration references no keys.'
          })(),
    },
    {
      key: 'capabilities',
      label: 'Capabilities have no conflicts or missing services',
      ok: !capProblems.length,
      severity: 'error',
      detail: capProblems.length ? capProblems.join('. ') + '.' : caps.length ? `${caps.length} capabilit${caps.length === 1 ? 'y' : 'ies'} resolved.` : 'No capabilities to check.',
    },
  ]
}

/** True when every check passes, or every failing check is a warning the user overrode. */
export const checksPass = (checks: PreDeployCheck[], overrides: CheckKey[] = []) => checks.every((c) => c.ok || (c.severity === 'warning' && overrides.includes(c.key)))

/* ---------- permissions ---------- */

/** Add or remove projects: the environment owner, its Tenant Admin, or the Super Admin. */
export function canManageEnvProjects(user: Pick<User, 'id' | 'role' | 'tenantId'>, env: Pick<Environment, 'ownerId' | 'tenantId'>) {
  if (user.role === 'super_admin') return true
  if (user.tenantId !== env.tenantId) return false
  return user.role === 'tenant_admin' || user.id === env.ownerId
}

/** Configure and deploy one project: anyone who can manage the environment, plus the project's owner and editors. */
export function canOperateDeployment(
  user: Pick<User, 'id' | 'role' | 'tenantId'>,
  env: Pick<Environment, 'ownerId' | 'tenantId'>,
  project: Pick<Project, 'memberIds' | 'memberAccess' | 'ownerId'> | undefined,
) {
  if (canManageEnvProjects(user, env)) return true
  if (user.role !== 'user' || user.tenantId !== env.tenantId || !project) return false
  return project.ownerId === user.id || (project.memberIds.includes(user.id) && project.memberAccess[user.id] === 'editor')
}
