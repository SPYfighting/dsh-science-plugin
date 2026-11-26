import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Duplex, Transform } from 'node:stream'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ssh2 from '../lib/vendor/ssh2.bundle.cjs'
import { registerSshTools } from '../lib/ssh.js'

const keys = ssh2.utils.generateKeyPairSync('ed25519')
const publicBytes = Buffer.from(keys.public.trim().split(/\s+/)[1], 'base64')
const fingerprint = 'SHA256:' + createHash('sha256').update(publicBytes).digest('base64').replace(/=$/, '')

function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-trust-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  t.after(() => { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous })
  const dir = join(home, 'dsh-science')
  mkdirSync(dir)
  const file = join(dir, 'ssh-profiles.json')
  const tools = {}
  let gate
  registerSshTools({ on: (_, fn) => { gate = fn }, tools: { register: def => { tools[def.name] = def } } })
  const profile = { host: 'fixture.invalid', username: 'test', auth: 'password', credentialsRef: 'DSH_SSH_TEST_UNUSED' }
  const add = pin => tools.sci_ssh_profiles.execute({ action: 'add', name: 'test', profile: { ...profile, hostFingerprint: pin } })
  const probe = () => tools.sci_ssh_probe.execute({ profile: 'test' })
  return { add, probe, gate, file, profile }
}

// Exercise the bundled SSH handshake entirely over local memory streams. The
// fixture offers only the SSH 'none' method and never handles a password.
function transport(t) {
  const log = []
  const server = new ssh2.Server({ hostKeys: [keys.private] }, connection => {
    connection.on('error', () => {})
    connection.on('authentication', auth => auth.method === 'none' ? auth.accept() : auth.reject())
    connection.on('session', (_accept, reject) => reject())
  })
  const original = ssh2.Client.prototype.connect
  const calls = t.mock.method(ssh2.Client.prototype, 'connect', function (cfg) {
    // Model asynchronous delivery like a socket; avoid re-entering SSH key exchange.
    const wire = () => new Transform({ transform(chunk, _, done) { setImmediate(done, null, Buffer.from(chunk)) } })
    const inbound = wire()
    const outbound = wire()
    const client = Duplex.from({ readable: inbound, writable: outbound })
    const peer = Duplex.from({ readable: outbound, writable: inbound })
    t.after(() => { client.destroy(); peer.destroy() })
    server.injectSocket(peer)
    return original.call(this, { ...cfg, sock: client, debug: line => log.push(line), readyTimeout: 2500 })
  })
  return { calls, log }
}

test('legacy profile without a confirmed host key cannot open a transport', async t => {
  const f = fixture(t)
  writeFileSync(f.file, JSON.stringify({ test: f.profile }))
  const { calls } = transport(t)
  await assert.rejects(f.probe(), /可信控制台/)
  assert.equal(calls.mock.callCount(), 0)
  await assert.rejects(f.add('SHA256:invalid'), /主机指纹/)
  assert.deepEqual(JSON.parse(readFileSync(f.file)), { test: f.profile })
})

test('profile approval identifies the endpoint and pin; matching key completes authentication', async t => {
  const f = fixture(t)
  const gate = await f.gate({ name: 'sci_ssh_profiles', arguments: { action: 'add', profile: { ...f.profile, hostFingerprint: fingerprint } } }, () => {})
  assert.equal(gate.kind, 'ask')
  assert.ok(gate.reason.includes('fixture.invalid:22') && gate.reason.includes(fingerprint))
  await f.add(fingerprint + '=')
  assert.equal(JSON.parse(readFileSync(f.file)).test.hostFingerprint, fingerprint)
  const { log } = transport(t)
  await assert.rejects(f.probe(), /channel open failure|rejected|open failed/i) // no SFTP subsystem in fixture
  assert.ok(log.some(line => line.includes('USERAUTH_SUCCESS')), 'trusted handshake reached authenticated state')
})

test('nonmatching host identity rejects before any outgoing authentication request', async t => {
  const f = fixture(t)
  const other = 'SHA256:' + createHash('sha256').update('different trusted key').digest('base64').replace(/=$/, '')
  await f.add(other)
  const { calls, log } = transport(t)
  await assert.rejects(f.probe(), /指纹.*不符/)
  assert.equal(calls.mock.callCount(), 1)
  assert.equal(log.some(line => line.includes('Outbound: Sending USERAUTH_REQUEST')), false)
  assert.equal(JSON.parse(readFileSync(f.file)).test.hostFingerprint, other)
})
