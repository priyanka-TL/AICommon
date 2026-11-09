import type { CatalogItem, Deployment, Environment, InfraProvider, Project, Region, User } from '@/data/types'
import { allVars, deployScript, envHost, isStatic, nginxBlock, serviceFile, type GenContext } from '@/lib/deploy'
import { slugify } from '@/lib/utils'

export type FsNode = { type: 'dir'; children: Record<string, FsNode> } | { type: 'file'; content: string; size?: number }

export interface ShellContext {
  user: User
  env: Environment
  provider?: InfraProvider
  region?: Region
  deployments: Deployment[]
  projects: Project[]
  catalog: CatalogItem[]
}

export const MASK = '••••••••'
const SECRET_KEY = /(KEY|SECRET|TOKEN|PASS|PWD|CREDENTIAL|DSN|DATABASE_URL|AUTH)/i

/** Masks `KEY=value`, `KEY: value` and `Environment=KEY=value` lines whose key looks secret. */
export function maskSecrets(text: string) {
  return text
    .split('\n')
    .map((line) =>
      line
        .replace(/^(\s*(?:Environment=)?"?)([A-Za-z_][A-Za-z0-9_]*)(=)(.*?)("?)$/, (m, pre, key, eq, _v, post) => (SECRET_KEY.test(key) ? `${pre}${key}${eq}${MASK}${post}` : m))
        .replace(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(:\s*)(['"]?).+?\4(,?)$/, (m, pre, key, sep, q, comma) => (SECRET_KEY.test(key) ? `${pre}${key}${sep}${q}${MASK}${q}${comma}` : m)),
    )
    .join('\n')
}

export const usernameFor = (user: User) => slugify(user.name.split(' ')[0] ?? user.name) || 'deploy'
export const hostnameFor = (env: Environment) => slugify(env.spec.name) || env.id

export const genContext = (ctx: ShellContext, dep: Deployment): GenContext => ({
  dep,
  env: ctx.env,
  projectName: ctx.projects.find((p) => p.id === dep.projectId)?.name ?? dep.serviceName,
  catalog: ctx.catalog,
})

const dir = (children: Record<string, FsNode> = {}): FsNode => ({ type: 'dir', children })
const file = (content: string): FsNode => ({ type: 'file', content })

function projectFiles(ctx: ShellContext, dep: Deployment): Record<string, FsNode> {
  const g = genContext(ctx, dep)
  const c = dep.config
  const out: Record<string, FsNode> = {
    ...(c.source.kind === 'git' ? { '.git': dir({ HEAD: file(`ref: refs/heads/${c.source.branch}\n`), config: file(`[remote "origin"]\n\turl = ${c.source.repoUrl}\n`) }) } : {}),
    'deploy.sh': file(deployScript(g)),
    '.env': file(
      ['# Managed by AI Sandbox · values are masked in the simulated terminal', ...allVars(g).map((v) => `${v.key}=${v.key === 'PORT' ? v.value : MASK}`)].join('\n'),
    ),
  }
  const svc = serviceFile(g)
  if (svc && svc.path.startsWith(`/srv/${dep.serviceName}/`)) out[svc.path.split('/').pop()!] = file(svc.content)
  if (c.runtime === 'node' || c.runtime === 'static') {
    out['package.json'] = file(
      JSON.stringify(
        {
          name: dep.serviceName,
          version: `1.${dep.history.length}.0`,
          private: true,
          scripts: { ...(c.buildCmd ? { build: c.buildCmd.replace(/^npm run /, '') } : {}), ...(c.startCmd ? { start: c.startCmd } : {}) },
          engines: c.runtimeVersion ? { node: `>=${c.runtimeVersion}` } : undefined,
        },
        null,
        2,
      ),
    )
    out['node_modules'] = dir()
    out['src'] = dir({ 'index.ts': file('// source omitted in the simulated terminal\n') })
    if (c.buildCmd) out['dist'] = dir({ [isStatic(c) ? 'index.html' : 'server.js']: file('// build output\n') })
  } else if (c.runtime === 'python') {
    out['requirements.txt'] = file(['fastapi==0.115.0', 'uvicorn[standard]==0.30.6', 'httpx==0.27.2', 'pydantic==2.9.2', 'numpy==1.26.4'].join('\n'))
    out['app'] = dir({ 'main.py': file('# source omitted in the simulated terminal\n'), '__init__.py': file('') })
    out['.venv'] = dir({ bin: dir() })
  } else if (c.runtime === 'docker') {
    out['Dockerfile'] = file(['FROM python:3.11-slim', 'WORKDIR /app', 'COPY . .', 'RUN pip install -r requirements.txt', `EXPOSE ${c.port}`, `CMD ${JSON.stringify(c.startCmd.split(/\s+/))}`].join('\n'))
  }
  out['README.md'] = file(`# ${g.projectName}\n\nDeployed by AI Sandbox to ${ctx.env.spec.name}.\n`)
  return out
}

export function buildFs(ctx: ShellContext): FsNode {
  const user = usernameFor(ctx.user)
  const srv: Record<string, FsNode> = {}
  const units: Record<string, FsNode> = {}
  const sites: Record<string, FsNode> = {}
  for (const dep of ctx.deployments) {
    srv[dep.serviceName] = dir(projectFiles(ctx, dep))
    const g = genContext(ctx, dep)
    const svc = serviceFile(g)
    if (svc && svc.path.startsWith('/etc/systemd/system/')) units[`${dep.serviceName}.service`] = file(svc.content)
    sites[`${dep.serviceName}.conf`] = file(nginxBlock(g))
  }
  const host = hostnameFor(ctx.env)
  return dir({
    home: dir({
      [user]: dir({
        '.bashrc': file(`# ~/.bashrc\nexport PS1='\\u@\\h:\\w\\$ '\nalias ll='ls -la'\n`),
        '.profile': file('# ~/.profile\n'),
        'README.txt': file(`Welcome to ${ctx.env.spec.name}.\nProjects deployed here live under /srv. Service files are in /etc/systemd/system.\n`),
      }),
      deploy: dir(),
    }),
    srv: dir(srv),
    etc: dir({
      hostname: file(host),
      hosts: file(`127.0.0.1 localhost\n127.0.1.1 ${host} ${envHost(ctx.env)}\n`),
      'os-release': file('PRETTY_NAME="Ubuntu 22.04.4 LTS"\nNAME="Ubuntu"\nVERSION_ID="22.04"\nVERSION="22.04.4 LTS (Jammy Jellyfish)"\nID=ubuntu\n'),
      systemd: dir({ system: dir(units) }),
      nginx: dir({ 'nginx.conf': file('user www-data;\nworker_processes auto;\ninclude /etc/nginx/sites-enabled/*;\n'), 'sites-enabled': dir(sites) }),
    }),
    var: dir({ log: dir({ nginx: dir(), syslog: file('(log output omitted)\n') }) }),
    tmp: dir(),
    usr: dir({ bin: dir(), local: dir() }),
    opt: dir(),
  })
}

/* ---------- path helpers ---------- */

export function homeOf(ctx: ShellContext) {
  return `/home/${usernameFor(ctx.user)}`
}

export function resolvePath(cwd: string, input: string, home: string) {
  let p = input.trim()
  if (!p || p === '~') return home
  if (p.startsWith('~/')) p = `${home}/${p.slice(2)}`
  const parts = (p.startsWith('/') ? p : `${cwd}/${p}`).split('/')
  const stack: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return `/${stack.join('/')}`
}

export function lookup(root: FsNode, path: string): FsNode | null {
  let node: FsNode = root
  for (const part of path.split('/').filter(Boolean)) {
    if (node.type !== 'dir') return null
    const next: FsNode | undefined = node.children[part]
    if (!next) return null
    node = next
  }
  return node
}

export const displayPath = (path: string, home: string) => (path === home ? '~' : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path)
