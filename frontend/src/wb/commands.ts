/**
 * `run` and `refresh` (docs/ARCHITECTURE.md §4.4): node writes that wait for the request they cause.
 *
 * The engine gives no handle on the request a write triggers, so it is recovered from the HTTP event
 * stream: watch the target node's requests (attributed by the registry), make the write, and take the
 * request(s) that start because of it. The request interceptor is synchronous, so such a request has
 * already started when the write returns; one macrotask of grace covers an asynchronous interceptor
 * chain. Once the request settles, a further wait lets the node take the response value (the engine
 * applies it a few microtasks after the interceptor saw it), so a caller that reads the node after
 * `await` sees the new value.
 */
import type { Subscription } from 'rxjs'
import { apiError, httpEvents$, LOCAL_ERROR, type HttpEvent } from '@/api/http'
import type { ApiError } from '@/api/types'
import {
  REFRESH_TRIGGERS,
  type CommandName,
  type CommandPayload,
  type CommandResult,
  type HttpNodeName,
  type NodeName,
  type RefreshableNodeName,
} from './nodes'
import { isStoreLive, nodeSubject, registry, writeNode } from './store'

let nonce = 0

/** A fresh non-null value for trigger and nonce nodes. */
export function nextNonce(): number {
  nonce += 1
  return nonce
}

function macrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function notRunning(): ApiError {
  return apiError(0, 'The store is not running, so the request was not sent.', LOCAL_ERROR.NOT_SENT)
}

// ---------------------------------------------------------------- request watching

interface RequestWatch {
  /** Requests of the node that started since the watch began, in order. */
  readonly started: readonly number[]
  settled(id: number): Promise<HttpEvent>
  close(): void
}

function watchRequests(node: HttpNodeName): RequestWatch {
  const started: number[] = []
  const outcomes = new Map<number, HttpEvent>()
  const waiting = new Map<number, ((event: HttpEvent) => void)[]>()
  const subscription = httpEvents$.subscribe((event) => {
    if (registry.match(event.method, event.url) !== node) return
    if (event.phase === 'start') {
      started.push(event.id)
      return
    }
    // A request that was already in flight when the watch began is not ours.
    if (!started.includes(event.id)) return
    outcomes.set(event.id, event)
    const listeners = waiting.get(event.id)
    waiting.delete(event.id)
    listeners?.forEach((listener) => listener(event))
  })
  return {
    started,
    settled(id) {
      const known = outcomes.get(id)
      if (known) return Promise.resolve(known)
      return new Promise((resolve) => waiting.set(id, [...(waiting.get(id) ?? []), resolve]))
    },
    close: () => subscription.unsubscribe(),
  }
}

/**
 * Resolves once the node holds the value the request settled with (the response body, or `null` for a
 * failure), or at the next macrotask, whichever comes first. The engine applies the value within
 * microtasks, so the macrotask is only a safety net (store stopped, value superseded).
 */
function nodeTook(name: HttpNodeName, event: HttpEvent): Promise<void> {
  const node = nodeSubject(name)
  const expected = event.phase === 'success' ? event.data : null
  return new Promise((resolve) => {
    let done = false
    let subscription: Subscription | null = null
    const finish = (): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      subscription?.unsubscribe()
      resolve()
    }
    const timer = setTimeout(finish, 0)
    subscription = node.subscribe((value) => {
      if (value === expected) finish()
    })
    if (done) subscription.unsubscribe()
  })
}

export interface LoadOutcome {
  /** false when the write made the node send nothing (a required input is missing, e.g. anonymous). */
  sent: boolean
  /** The error of the (last) request, null on success or when nothing was sent. */
  error: ApiError | null
  /** The settle event of the (last) request. */
  event: HttpEvent | null
}

/**
 * Runs `write` and waits for the requests it made `node` send: `first` = the first one only (a command
 * fires exactly one), `all` = every one that started (a trigger may race an earlier load).
 */
async function writeAndSettle(node: HttpNodeName, write: () => void, which: 'first' | 'all'): Promise<LoadOutcome> {
  const watch = watchRequests(node)
  try {
    write()
    if (watch.started.length === 0) await macrotask()
    if (watch.started.length === 0) return { sent: false, error: null, event: null }
    const ids = which === 'first' ? [watch.started[0]] : [...watch.started]
    const events = await Promise.all(ids.map((id) => watch.settled(id)))
    const last = events[events.length - 1]
    await nodeTook(node, last)
    return { sent: true, error: last.phase === 'error' ? last.error : null, event: last }
  } finally {
    watch.close()
  }
}

/** Makes a node write and waits for the load of `node` it causes. Internal to the state layer. */
export function awaitLoad(node: HttpNodeName, write: () => void): Promise<LoadOutcome> {
  if (!isStoreLive()) return Promise.resolve({ sent: false, error: notRunning(), event: null })
  return writeAndSettle(node, write, 'all')
}

// ---------------------------------------------------------------- refresh

/** Refetches a read in place and waits for it. Resolves with the request error, or null. Internal. */
export function reload(name: RefreshableNodeName): Promise<ApiError | null> {
  return awaitLoad(name, () => writeNode(REFRESH_TRIGGERS[name], nextNonce())).then((outcome) => outcome.error)
}

/**
 * Refetches a read node without flashing it to `null` (its refresh nonce has `onUpdate: false`) and
 * resolves once the new value is in the node. Never rejects: a failure is on `useNodeStatus(name)` and
 * the node becomes `null`. Nothing is sent, and it resolves at once, when a required input is missing
 * (e.g. an authenticated read while anonymous).
 */
export function refresh(name: RefreshableNodeName): Promise<void> {
  return reload(name).then(() => undefined)
}

// ---------------------------------------------------------------- run

/** `run(name)` for commands without payload, `run(name, payload)` otherwise. */
export type RunArgs<Name extends CommandName> = [CommandPayload<Name>] extends [void]
  ? []
  : [payload: CommandPayload<Name>]

/**
 * Commands whose payload is cleared once they settle: credentials must not linger in a global,
 * inspectable store, and an uploaded file need not stay in memory. Clearing the payload also resets the
 * result node to `null` (nothing reads these results; `run` returns them).
 */
const CLEARED_AFTER_RUN: ReadonlySet<CommandName> = new Set<CommandName>(['login', 'register', 'resetPassword', 'pictureUpload'])

/** Per command: the tail of its queue (never rejects). */
const queues = new Map<CommandName, Promise<void>>()

async function execute(command: CommandName, args: readonly unknown[]): Promise<unknown> {
  if (!isStoreLive()) throw notRunning()
  const payload = args.length > 0 ? args[0] : nextNonce()
  if (payload === null || payload === undefined) {
    throw apiError(0, `run("${command}") needs a payload.`, LOCAL_ERROR.INVALID)
  }
  const payloadNode = `${command}Payload` as NodeName
  const resultNode = `${command}Result` as HttpNodeName
  let outcome: LoadOutcome
  try {
    // `first`: the payload node feeds only this result node, and calls are serialised, so the first
    // request of the result node after the write is the one this call caused.
    outcome = await writeAndSettle(resultNode, () => writeNode(payloadNode, payload), 'first')
  } finally {
    if (CLEARED_AFTER_RUN.has(command) && isStoreLive()) writeNode(payloadNode, null)
  }
  if (!outcome.event) {
    throw apiError(0, `"${command}" did not send its request (the store is not running).`, LOCAL_ERROR.NOT_SENT)
  }
  if (outcome.event.phase === 'error') throw outcome.event.error ?? apiError(0, 'Request failed.')
  return outcome.event.data
}

/**
 * Sends a command: writes `<command>Payload` and settles with the request of `<command>Result` it
 * causes. Resolves with the response body once the result node holds it; rejects with an `ApiError`.
 * Calls to the same command are serialised (each waits for the previous one to settle).
 */
export function run<Name extends CommandName>(command: Name, ...args: RunArgs<Name>): Promise<CommandResult<Name>> {
  const previous = queues.get(command) ?? Promise.resolve()
  const call = previous.then(() => execute(command, args)) as Promise<CommandResult<Name>>
  const tail = call.then(
    () => undefined,
    () => undefined,
  )
  queues.set(command, tail)
  void tail.then(() => {
    if (queues.get(command) === tail) queues.delete(command)
  })
  return call
}
