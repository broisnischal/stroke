// The worker protocol, driven directly.
//
// The host matches every reply to the call that asked for it, so a reply that
// forgets to echo `reqId` is a reply nobody is waiting for: the call sits there
// until its timeout and the plugin is reported as failed to load. That is
// exactly the bug this file exists to catch, which is why the last test asserts
// the rule for every message rather than one at a time.
import { describe, it, expect, beforeEach } from 'vitest'

/** @type {any[]} */
let posted = []
/** @type {any} */
let fakeSelf

// The worker module installs itself on `self` at import time, so the stub has to
// be in place first.
posted = []
fakeSelf = { postMessage: (/** @type {any} */ m) => posted.push(m) }
// @ts-ignore - standing in for a WorkerGlobalScope
globalThis.self = fakeSelf
globalThis.self.fetch = () => Promise.resolve('should be sealed')
await import('./plugin-worker.js')

/** @param {any} msg */
function send(msg) {
  fakeSelf.onmessage({ data: msg })
  return posted[posted.length - 1]
}

const PLUGIN = `
  module.exports = {
    appliesTo(type, name) { return name === 'score' },
    format(value, ctx) {
      if (typeof value !== 'number') return null
      return { display: String(value * 2), title: ctx.name, badge: { bg: '#000', fg: '#fff' } }
    },
  }
`

beforeEach(() => {
  posted = []
})

describe('plugin worker', () => {
  it('loads a CommonJS plugin and reports ready with the request id', () => {
    const reply = send({ t: 'load', reqId: 1, code: PLUGIN, config: {} })
    expect(reply).toEqual({ t: 'ready', reqId: 1, hasAppliesTo: true })
  })

  it('takes the network globals away before the plugin runs', () => {
    send({ t: 'load', reqId: 2, code: PLUGIN, config: {} })
    expect(fakeSelf.fetch).toBeUndefined()
    expect(fakeSelf.WebSocket).toBeUndefined()
    expect(fakeSelf.XMLHttpRequest).toBeUndefined()
    expect(fakeSelf.importScripts).toBeUndefined()
  })

  it('answers appliesTo per column', () => {
    send({ t: 'load', reqId: 3, code: PLUGIN, config: {} })
    const reply = send({
      t: 'applies',
      reqId: 4,
      columns: [{ type: 'int4', name: 'score' }, { type: 'text', name: 'email' }],
    })
    expect(reply).toEqual({ t: 'applies', reqId: 4, applies: [true, false] })
  })

  it('formats a batch and sanitizes what comes back', () => {
    send({ t: 'load', reqId: 5, code: PLUGIN, config: {} })
    const reply = send({ t: 'format', reqId: 6, type: 'int4', name: 'score', values: [21, 'nope', null] })
    expect(reply.t).toBe('format')
    expect(reply.reqId).toBe(6)
    expect(reply.directives).toEqual([
      { display: '42', title: 'score', badge: { bg: '#000', fg: '#fff' } },
      null,
      null,
    ])
  })

  it('reports a plugin with no format function instead of loading it', () => {
    const reply = send({ t: 'load', reqId: 7, code: 'module.exports = { nope: true }', config: {} })
    expect(reply.t).toBe('error')
    expect(reply.reqId).toBe(7)
    expect(reply.message).toMatch(/format/)
  })

  it('reports a syntax error in the plugin rather than throwing past the host', () => {
    const reply = send({ t: 'load', reqId: 8, code: 'module.exports = {', config: {} })
    expect(reply.t).toBe('error')
    expect(reply.reqId).toBe(8)
  })

  it('survives a format that throws, and leaves that one cell plain', () => {
    send({ t: 'load', reqId: 9, code: 'module.exports = { format(v) { if (v === 2) throw new Error("boom"); return { display: "ok" } } }', config: {} })
    const reply = send({ t: 'format', reqId: 10, type: 'int4', name: 'n', values: [1, 2, 3] })
    expect(reply.directives).toEqual([{ display: 'ok' }, null, { display: 'ok' }])
  })

  it('echoes the request id on every reply that answers a call', () => {
    send({ t: 'load', reqId: 100, code: PLUGIN, config: {} })
    send({ t: 'applies', reqId: 101, columns: [{ type: 'int4', name: 'score' }] })
    send({ t: 'format', reqId: 102, type: 'int4', name: 'score', values: [1] })
    send({ t: 'load', reqId: 103, code: 'module.exports = {}', config: {} })
    const answers = posted.filter((m) => m.t !== 'log')
    expect(answers.length).toBe(4)
    for (const m of answers) expect(typeof m.reqId).toBe('number')
  })
})
