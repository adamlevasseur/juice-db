import { Client } from 'ssh2'
import type { ClientChannel } from 'ssh2'
import { createServer, type Server, type Socket } from 'node:net'
import { readFileSync } from 'node:fs'
import { execFile, spawn } from 'node:child_process'
import { Duplex } from 'node:stream'
import type { ConnectionConfig, SshHop } from './types'

const CONTAINER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/
const HOST_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/
const EXEC_TIMEOUT_MS = 10000
const MAX_STDERR_BYTES = 4096

export class SshHopError extends Error {
  constructor(
    public hopIndex: number,
    public hopHost: string,
    cause: unknown
  ) {
    const reason = cause instanceof Error ? cause.message : String(cause)
    super(`SSH hop ${hopIndex + 1} (${hopHost}): ${reason}`)
    this.name = 'SshHopError'
  }
}

interface Tunnel {
  server: Server
  clients: Client[]
  localPort: number
  alive: boolean
  lastRelayError: string | null
}

const tunnels = new Map<string, Tunnel>()
const pending = new Map<string, Promise<{ host: string; port: number }>>()

export function ensureTunnel(
  key: string,
  config: ConnectionConfig
): Promise<{ host: string; port: number } | null> {
  if (!config.sshHops || config.sshHops.length === 0) return Promise.resolve(null)

  const existing = tunnels.get(key)
  if (existing && existing.alive) return Promise.resolve({ host: '127.0.0.1', port: existing.localPort })

  const inflight = pending.get(key)
  if (inflight) return inflight

  const setup = (existing ? closeTunnel(key) : Promise.resolve())
    .then(() => setupTunnel(key, config))
    .finally(() => pending.delete(key))
  pending.set(key, setup)
  return setup
}

export function isTunnelAlive(key: string): boolean {
  return tunnels.get(key)?.alive ?? false
}

export function consumeRelayError(key: string): string | null {
  const tunnel = tunnels.get(key)
  if (!tunnel) return null
  const err = tunnel.lastRelayError
  tunnel.lastRelayError = null
  return err
}

export async function closeTunnel(key: string): Promise<void> {
  const tunnel = tunnels.get(key)
  if (!tunnel) return
  tunnels.delete(key)
  await new Promise<void>((resolve) => tunnel.server.close(() => resolve()))
  for (const client of tunnel.clients) client.end()
}

export async function closeAllTunnels(): Promise<void> {
  await Promise.all([...tunnels.keys()].map((key) => closeTunnel(key)))
}

async function setupTunnel(
  key: string,
  config: ConnectionConfig
): Promise<{ host: string; port: number }> {
  const hops = config.sshHops!
  validateRelayTarget(config)

  const clients = await connectHopChain(hops)

  const tunnel: Tunnel = { server: null as unknown as Server, clients, localPort: 0, alive: true, lastRelayError: null }

  const markDead = () => {
    tunnel.alive = false
  }
  for (const client of clients) {
    client.on('close', markDead)
    client.on('error', markDead)
  }

  const lastClient = clients[clients.length - 1]
  const server = createServer((socket: Socket) => {
    handleIncoming(tunnel, lastClient, config, socket)
  })
  tunnel.server = server

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to allocate local tunnel port')
  tunnel.localPort = address.port

  tunnels.set(key, tunnel)
  return { host: '127.0.0.1', port: tunnel.localPort }
}

async function connectHopChain(hops: SshHop[]): Promise<Client[]> {
  const clients: Client[] = []
  try {
    for (let i = 0; i < hops.length; i++) {
      const hop = hops[i]
      const client = new Client()
      const sock = hop.proxyCommand
        ? await spawnProxyCommand(hop.proxyCommand, hop.host, hop.port)
        : i === 0
          ? undefined
          : await forwardThrough(clients[i - 1], hop)
      try {
        await connectHop(client, hop, sock)
      } catch (err) {
        throw new SshHopError(i, hop.host, err)
      }
      clients.push(client)
    }
    return clients
  } catch (err) {
    for (let i = clients.length - 1; i >= 0; i--) clients[i].end()
    throw err
  }
}

function forwardThrough(prevClient: Client, nextHop: SshHop): Promise<ClientChannel> {
  return new Promise((resolve, reject) => {
    prevClient.forwardOut('127.0.0.1', 0, nextHop.host, nextHop.port, (err, stream) => {
      if (err) reject(err)
      else resolve(stream)
    })
  })
}

/** Runs an ssh ProxyCommand-style local command and exposes its stdio as a single duplex
 *  transport, e.g. for "cloudflared access ssh --hostname %h" style Cloudflare Access tunnels. */
function spawnProxyCommand(template: string, host: string, port: number): Promise<Duplex> {
  const command = template.replace(/%h/g, host).replace(/%p/g, String(port))
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'pipe'] })

    let stderrBuf = ''
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBuf.length < MAX_STDERR_BYTES) stderrBuf += chunk.toString('utf-8')
    })

    let settled = false
    child.once('error', (err) => {
      if (settled) return
      settled = true
      reject(new Error(`ProxyCommand failed to start: ${err.message}`))
    })
    child.once('exit', (code) => {
      if (settled) return
      settled = true
      reject(new Error(`ProxyCommand exited early (code ${code}): ${stderrBuf.trim() || command}`))
    })

    // Give the process a brief window to fail fast (bad command, ENOENT, immediate auth
    // rejection) before handing it off — after this, failures surface via the duplex's
    // own 'error'/'close' events once ssh2 is using it as the connection's socket.
    setImmediate(() => {
      if (settled) return
      settled = true
      const duplex = Duplex.from({ readable: child.stdout, writable: child.stdin })
      duplex.once('close', () => child.kill())
      resolve(duplex)
    })
  })
}

async function connectHop(client: Client, hop: SshHop, sock?: ClientChannel | Duplex): Promise<void> {
  const authOpts = await buildAuthOptions(hop.auth)
  await new Promise<void>((resolve, reject) => {
    client.on('ready', () => resolve())
    client.on('error', reject)
    client.connect({
      host: hop.host,
      port: hop.port,
      username: hop.username,
      readyTimeout: EXEC_TIMEOUT_MS,
      sock,
      ...authOpts
    })
  })
}

async function buildAuthOptions(
  auth: SshHop['auth']
): Promise<{ password?: string; privateKey?: Buffer; passphrase?: string; agent?: string }> {
  switch (auth.method) {
    case 'password':
      return { password: auth.password }
    case 'privateKey': {
      let privateKey: Buffer
      try {
        privateKey = readFileSync(auth.privateKeyPath)
      } catch {
        throw new Error(`Private key file not found: ${auth.privateKeyPath}`)
      }
      return { privateKey, passphrase: auth.passphrase }
    }
    case 'agent': {
      const sock = await resolveAgentSock()
      if (!sock) {
        throw new Error(
          'SSH agent not available — SSH_AUTH_SOCK is not set. Try launching from a terminal, or use "Private Key" auth instead.'
        )
      }
      return { agent: sock }
    }
  }
}

function resolveAgentSock(): Promise<string | null> {
  if (process.env.SSH_AUTH_SOCK) return Promise.resolve(process.env.SSH_AUTH_SOCK)
  if (process.platform !== 'darwin') return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile('launchctl', ['getenv', 'SSH_AUTH_SOCK'], (err, stdout) => {
      const value = stdout?.trim()
      resolve(!err && value ? value : null)
    })
  })
}

function validateRelayTarget(config: ConnectionConfig): void {
  if (!config.dockerContainer || !CONTAINER_NAME_RE.test(config.dockerContainer)) {
    throw new Error(`Invalid or missing docker container name: ${config.dockerContainer ?? ''}`)
  }
  if (!HOST_RE.test(config.host)) {
    throw new Error(`Invalid relay host: ${config.host}`)
  }
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error(`Invalid relay port: ${config.port}`)
  }
}

function buildRelayCommand(config: ConnectionConfig): string {
  const container = config.dockerContainer!
  const inner = `exec 3<>/dev/tcp/${config.host}/${config.port} && cat <&3 & cat >&3; wait`
  const quotedInner = `'${inner.replace(/'/g, `'\\''`)}'`
  return `docker exec -i ${container} bash -c ${quotedInner}`
}

function handleIncoming(tunnel: Tunnel, client: Client, config: ConnectionConfig, socket: Socket): void {
  if (!tunnel.alive) {
    socket.destroy()
    return
  }

  const cmd = buildRelayCommand(config)
  let settled = false
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    socket.destroy(new Error('Timed out establishing docker exec relay'))
  }, EXEC_TIMEOUT_MS)

  client.exec(cmd, (err, stream: ClientChannel) => {
    if (settled) {
      if (!err) stream.close()
      return
    }
    settled = true
    clearTimeout(timer)

    if (err) {
      tunnel.lastRelayError = err.message
      socket.destroy()
      return
    }

    let gotData = false
    let stderrBuf = ''

    stream.on('data', () => {
      gotData = true
    })
    stream.stderr.on('data', (chunk: Buffer) => {
      if (stderrBuf.length < MAX_STDERR_BYTES) stderrBuf += chunk.toString('utf-8')
    })

    stream.on('close', (code: number | null) => {
      if (!gotData && (code !== 0 || stderrBuf.trim())) {
        tunnel.lastRelayError = stderrBuf.trim() || `Relay process exited with code ${code}`
      }
      socket.destroy()
    })
    stream.on('error', () => socket.destroy())

    socket.on('close', () => stream.close())
    socket.on('error', () => stream.close())

    socket.pipe(stream)
    stream.pipe(socket)
  })
}
