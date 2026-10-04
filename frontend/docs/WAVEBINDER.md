# wave-binder 0.0.2 — API reference from ground truth

Researched 2026-10-02 against the npm tarball `wave-binder-0.0.2.tgz` (shasum `aff371ac6bc4cc91ac19f22bb33a5a333508a717`).

Evidence tags used throughout:

- **[RUN]** observed by executing code (Node 24.15.0, rxjs 7.8.2, axios 1.20.0, TypeScript 7.0.2, Vite 8.3.2, React 19.3.0).
- **[SRC]** read in the shipped JS / `.d.ts`. The JS is obfuscated (javascript-obfuscator string table); I resolved the string table locally to read it, nothing was modified in the installed package.
- **[DOC]** stated by the package README, `https://wavebinder.it/wiki/*`, or the vendor's example repos.
- **[UNVERIFIED]** could not be confirmed. Treat as a hypothesis.

## 0. Read this first: the library is license-gated, and I could not run the licensed path

- **[RUN]** `new WaveBinder(license, ...)` starts an async license check. With an invalid license every node is `complete()`d and removed within a few tens of milliseconds of construction (4-28 ms in my runs), `isReady()` stays `false`, and in a browser `alert("Licenza non valida")` is called (the library calls `globalThis.alert` if it exists).
- **[SRC]** The check is: RSA-PSS/SHA-256 signature of `license.payloadRaw` against a public key embedded in the package, payload shape and expiry, then `POST <licenseServer>/heartbeat` with `{ instanceId, license }`. The heartbeat repeats **every 5 seconds** for the life of the instance. Any single failure (non-2xx, malformed JSON, timeout after 5 s, network error, `concurrentUse: true`) calls `nukeNodes()`: all state is destroyed and the instance is permanently dead.
- **[SRC]** Default license server: `http://ec2-18-118-138-153.us-east-2.compute.amazonaws.com` (plain HTTP). Override by setting `globalThis.WAVEBINDER_LICENSE_SERVER_URL` (string) before the check runs.
- **[DOC]** A license file is obtained from the "Get your License" form on `https://wavebinder.it/` (name, email, privacy consent, Cloudflare Turnstile). The site script downloads it as `licence_<licenseId>.js` containing JSON `{ payload, payloadRaw, signature }`.
- I did **not** have a valid license. A license file issued to a named third party is committed in the vendor's `wavebinder-menu-example` repo; I did not use it. I also did not bypass the check. Consequences for this document:
  - Everything about **top-level node propagation after `tangleNodes()`** is **[SRC]**, not run.
  - Dependency propagation, custom functions and HTTP request formation **were** observed **[RUN]**, but only through a library quirk: fields of a `COMPLEX` node are wired inside the constructor, before the license check settles (see 7.1). That is an observation window of a few milliseconds, not a usable mode.
  - License-server reachability and its CORS allow-list were **not** checked (my probe of that host was blocked by the session's permission policy). **[UNVERIFIED]**

## 1. Mental model

- A `WaveBinder` instance owns a flat list of **nodes**. Each node is an RxJS `BehaviorSubject<any>` (class `SingleNode extends BehaviorSubject`) **[RUN]** created from a plain config object (`ProtoNode`).
- A node declares **dependencies** on other nodes by name (`dep[]`) and a **loading action** (`la`) saying where its value comes from:
  - `USER_SELECTION`: the app writes it with `node.next(value)`.
  - `GET|POST|PUT|PATCH|DELETE`: an axios request built from the dependency values; `response.data` becomes the value.
  - `CUSTOM_FUNCTION`: a synchronous function of the dependency values.
- `tangleNodes()` subscribes each node to its dependencies. Whenever a dependency emits, the dependent stores the value and re-runs its loading action. Propagation is plain synchronous RxJS subscription fan-out: no batching, no topological ordering, no cancellation **[RUN]** (see 7.4).
- Value conventions **[RUN/SRC]**: `undefined` = never loaded; `null` = reset, waiting for user input, "loading" after an `onUpdate` dependency changed, or failed call. There is no loading flag and no error channel; observables never error.

## 2. Packaging

| Fact | Evidence |
|---|---|
| `"type": "module"`, `main`/`exports["."].default` = `./lib/wave-binder.js`, `types` = `./lib/wave-binder.d.ts`. ESM only: no CJS build, no UMD, no `module`/`browser`/`sideEffects` fields | [SRC] package.json |
| `exports` exposes only `"."` and `"./package.json"`; deep imports fail with `ERR_PACKAGE_PATH_NOT_EXPORTED` | [RUN] |
| Named exports: `WaveBinder`, `SingleNode`, `MultiNode`, `ListNode`, `ComplexNode`. No default export. Enums and config interfaces are **not** exported | [RUN] |
| `dependencies`: `axios ^1.7.1`, `rxjs ^7.8.1` (regular deps, not peer). No peerDependencies | [SRC] |
| Works with `import` in Node 24 ESM | [RUN] |
| `require('wave-binder')` works on Node 24.15 (require-of-ESM). Older Node without that feature: expect `ERR_REQUIRE_ESM` | [RUN] on 24 / [UNVERIFIED] older |
| `vite build` and Vite dependency pre-bundling succeed with zero config and zero warnings; bundle contains no Node built-ins | [RUN] |
| Ships `.d.ts` for everything; they type-check with `skipLibCheck: false` | [RUN] |
| Module evaluation calls `crypto.randomUUID()` at top level (license module). In browsers that API exists only in secure contexts (https or localhost): on `http://<LAN-IP>:5173` the import itself would throw | [SRC] / browser part [UNVERIFIED] |
| README says "Node.js 18+"; Node 18 has no global `crypto` by default, so the import likely fails there | [UNVERIFIED] |
| Not run in a real browser by me | — |

```ts
import { WaveBinder, SingleNode, MultiNode, ListNode, ComplexNode } from 'wave-binder';
```

Keep the app on `rxjs ^7.8.1` and (if you use it) `axios ^1.7` so npm dedupes to one copy of each. With one copy, nodes are `instanceof` your `BehaviorSubject` **[RUN]** and wave-binder's requests go through your default axios instance **[RUN]**.

## 3. Public API

### 3.1 `WaveBinder`  [SRC signatures, RUN where noted]

```ts
class WaveBinder {
  constructor(
    license: LicenseFileContent,                 // { payload, payloadRaw, signature }
    protoNodes: ProtoNode[],                     // required (forEach'd)
    extApis: Map<string, HttpServiceSetting>,    // only read when a node has la.serviceName
    customFunctions: FunctionInstance[],         // required (forEach'd); pass [] if none
  );
  waitUntilReady(): Promise<void>;   // resolves when the first license check settles; never rejects [RUN]
  isReady(): boolean;                // true only after a successful license check [RUN: false on failure]
  tangleNodes(): void;               // license pending -> deferred and run automatically on success;
                                     // license invalid -> silent no-op [RUN]; already tangled -> no-op
  getNodes(): WaveBinderNode[];      // the LIVE internal flat array (do not mutate) [RUN]
  getNodeByName(name: string): WaveBinderNode;                 // returns null when missing [RUN]
  getNodeByNameAndType(name: string, type: string): WaveBinderNode;   // null when missing [RUN]
  getNodeChoicesByName(name: string): any[];                   // choices of a MULTI node, [] otherwise [RUN]
  getDataPool(): any;                // { [nodeName]: node.getNodeValue() }; COMPLEX fields nested under the parent [RUN], LIST children likewise [SRC]
  getNodesInfo(logDepth?: number): WaveBinderNodeView[];
                                     // per node: { value, depValues: Map, eventsLog (last logDepth), choices?/children?/fields? };
                                     // entries carry no node name, order = getNodes() order [RUN]
  addCustomFunction(f: Function, name: string): void;          // note argument order: function first
  nukeNodes(): void;                 // teardown, see 5.8
  getNodeByNameAmongNodes(name: string, nodes: WaveBinderNode[]): WaveBinderNode;
  getNodeByNameAndTypeAmongNodes(name: string, type: string, nodes: WaveBinderNode[]): WaveBinderNode;
}
```

The constructor throws synchronously only for a string-based custom function **[RUN]**:
`Error: Unsafe custom function "legacy" blocked: string-based function bodies are disabled. Pass a trusted function reference via "implementation" instead.`

### 3.2 Node classes  [SRC, class hierarchy RUN]

```ts
class SingleNode extends BehaviorSubject<any> {
  node: ProtoNode;                    // the config object (mutated by the library: la.service, name of list children)
  depValues: Map<string, any>;        // last value received per dependency NODE NAME
  eventsLog: { what: string; when: Date }[];   // grows without bound
  getNodeValue(): any;                // = getValue()
  _reloadValue(name?: string): void;  // re-run the loading action; only reload entry point there is
  dispose(): void;                    // unsubscribes from deps and complete()s the subject
  // inherited: next(v), subscribe(...), pipe(...), asObservable(), getValue(), value
}
class MultiNode extends SingleNode {
  choices: any[];                     // loaded list; the node VALUE is the selected choice
  selection: number;                  // -1 when none
  setSelection(index: number): void;  // next(choices[index])
}
class ListNode extends SingleNode {
  children: WaveBinderNode[];
  next(value: number | any[], index?: number): void;  // number = resize (insert/remove at index), array = resize + set children
  getNodeValue(): any[];              // children values; getValue() is the size or the last array passed to next()
  moveElement(from: number, to: number): void;
  swapElements(x: number, y: number): void;
  resetListNodes(): void;
}
class ComplexNode extends SingleNode {
  fields: WaveBinderNode[];
  next(obj: any): void;               // sets EVERY field to obj[key]; keys absent from obj become undefined
  getNodeValue(): any;                // { [field.path without its first '/']: field value }
}
type WaveBinderNode = SingleNode | MultiNode | ListNode | ComplexNode;
```

Node class selection by `type` **[RUN]**: `"SINGLE"`→SingleNode, `"MULTI"`→MultiNode, `"LIST"`→ListNode, `"COMPLEX"`→ComplexNode, **anything else (including `"SIMPLE"`, which the vendor's CLI and menu example use) → SingleNode** with `node.node.type` left as written, so `getNodeByNameAndType(name, "SINGLE")` will not find it.

### 3.3 Config shapes  [SRC `.d.ts`; "runtime" notes from reading the JS]

```ts
interface ProtoNode {
  name: string;            // unique across the WHOLE graph, including COMPLEX fields and LIST protos
  path: string;            // "/key"; used as the key inside a COMPLEX value
  type: string;            // "SINGLE" | "MULTI" | "LIST" | "COMPLEX"
  dep: NodeDependency[];   // required, [] when none (runtime reads dep.length)
  la: LoadingAction;       // required
  defaultValue?: any;      // applied at tangle time when the value is null/undefined
  proto?: ProtoNode;       // LIST only: blueprint of each child
  protos?: ProtoNode[];    // COMPLEX only: the fields
}
interface LoadingAction {
  type: LoadingType;       // "USER_SELECTION" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "CUSTOM_FUNCTION"
  addr?: string;           // appended to service.target; "{parameterName}" placeholders
  serviceName?: string;    // key into the extApis Map; resolved once, at construction
  service?: IServiceEndPoint;   // inline alternative to serviceName ({ target?, secure?, authorization?, headers? })
  headers?: any;           // per-node headers, override service.headers
  bodyType?: BodyType;     // "JSON_OBJECT" | "MULTI_PART_FORM_DATA"
  functionName?: string;   // CUSTOM_FUNCTION only
}
interface NodeDependency {
  nodeName: string;        // node to listen to
  parameterName: string;   // placeholder / query key / body key / function argument name (runtime: optional)
  isOptional: boolean;     // false: the node does nothing until this dependency is non-null
  onUpdate: boolean;       // true: emit null first, then recompute
  type?: DependencyType;   // "PATH_VARIABLE" | "REQUEST_PARAMETER" | "BODY" (HTTP nodes)
  namingResolvingRule: NamingResolvingRule | NamingResolvingRule[];  // typed required, runtime optional; LIST scenarios only
}
interface NamingResolvingRule {
  type: ResolvingRuleType; // "SAME_INDEX" | "ALMOST_SAME_INDEX" | "FIXED_INDEX"
  char: string;            // declared, never read at runtime
  value?: any;             // offset (ALMOST_SAME_INDEX) or index (FIXED_INDEX)
  fatherNodeName: string;  // the LIST whose index is used
}
interface HttpServiceSetting { target: string; secure: boolean; authorization: string }
                           // runtime also reads `headers` from the same object; all fields optional at runtime
interface FunctionInstance { name: string; implementation?: Function; /* deprecated, throw: */ arguments?: string; body?: string }
interface LicenseFileContent { payload: LicensePayload; payloadRaw: string; signature: string }
interface LicensePayload { customer: string; licenseId: string; features: string[]; expiry: string }
```

Typing friction **[RUN, tsc]**:

- `ProtoNode`, `LoadingType`, etc. cannot be imported: `TS2459 Module '"wave-binder"' declares 'ProtoNode' locally, but it is not exported`; deep paths give `TS2307`.
- `la.type` is typed as a string **enum**, so literals and JSON imports are rejected: `Type '"USER_SELECTION"' is not assignable to type 'LoadingType'`. The wiki's own `new WaveBinder(LICENSE, PROTO_NODES_JSON, ...)` does not compile under `strict` without a cast.
- `NodeDependency.namingResolvingRule` and `HttpServiceSetting.authorization` are required by the types; `HttpServiceSetting` has no `headers`.

Use the derived types and authoring types in section 8 and cast once.

## 4. Runtime semantics

### 4.1 Tangle and propagation  [SRC unless tagged]

- `tangleNodes()` walks the flat node list in order. Node without deps: runs its loading action once (`USER_SELECTION` → `next(null)`, HTTP → request, function → call). Node with deps: subscribes to each dependency; because dependencies are BehaviorSubjects each subscription fires immediately and triggers a reload. Then `defaultValue` is applied if the value is still `null`/`undefined`.
- A value written with `next()` **before** the graph is tangled is overwritten with `null` when it is tangled (USER_SELECTION reload). Wait for `waitUntilReady()` before writing.
- Before tangling, `next()` on a node does not propagate **[RUN]**.
- On each dependency emission, for an HTTP/function node: if that dependency has `onUpdate: true` the node emits `null`; then, if every non-optional dependency is non-null (`!= null`, so `0`, `''`, `false` count as present), it recomputes **[RUN]**.
- A `USER_SELECTION` node that has dependencies is reset to `null` on every dependency emission.
- A dependency whose `nodeName` matches no node is ignored silently; the node then never loads.
- An HTTP node with N dependencies fires up to N requests while being tangled (one per dependency subscription once the required ones are resolved) **[RUN]**: `GET /users/7` was sent twice at startup for a node with deps `uid` + optional `page`.
- No cycle detection.

### 4.2 Custom functions

- Registered by reference: `{ name, implementation }` in the constructor array, or `wb.addCustomFunction(fn, name)`.
- Called synchronously with the dependency values **[RUN]**; the return value becomes the node value. A returned Promise would be stored as-is (no await) **[SRC]**.
- Argument mapping **[SRC]**: the library parses `fn.toString()`; if every parameter name equals a dependency `parameterName` it maps by name, otherwise it passes dependencies **in `dep` order**. Minified builds rename parameters, so rely on order.
- A frozen snapshot `{ timestamp, node: { name, type, path, value, iteration }, depValues, depValuesByParameter }` is appended as an extra last argument when the last parameter is named `snapshot`/`context`/`ctx` or when `fn.length > dep.length` **[SRC/DOC]**.
- Throwing → `console.error('Custom function execution failed for node', name, err)`, value `null`. Unknown `functionName` → value `null`, silently **[SRC]**.
- Async work pattern from the vendor wiki **[DOC]**: start the async work inside the function and later call `wb.getNodeByName(snapshot.node.name).next(result)`.

### 4.3 HTTP nodes

Request = `axios({ url, method, params, headers, data })` on the **default axios instance** **[SRC, interceptors RUN]**. No timeout, retry, cancellation, `withCredentials`, or per-request options.

- **URL** = `service.target + la.addr`. If `service.secure === true` the target is rewritten to `https://`. For **every** dependency (any `type`), the first `{parameterName}` occurrence is replaced by the raw value **[SRC]**. The value is **not URL-encoded** **[RUN]**: `two words/x` produced `/ok/two%20words/x` (slash passed through).
- **Query** = dependencies with `type: "REQUEST_PARAMETER"` as `{ [parameterName]: value }`; axios encodes them and drops null ones **[RUN]**: `/users/9?page=2`, and no `page` when it was null.
- **Body** (POST/PUT/PATCH only) from dependencies with `type: "BODY"`:
  - exactly one → that value is the body as-is **[RUN]** (a string went out as `application/x-www-form-urlencoded`; objects are JSON-encoded by axios);
  - otherwise with `bodyType: "JSON_OBJECT"` → `{ [parameterName]: value }` **[RUN]**: `{"userId":9,"label":"hello #9"}`;
  - otherwise (bodyType absent or `MULTI_PART_FORM_DATA`) → `FormData` where each value is `new Blob([JSON.stringify(value)], { type: 'application/json' })` **[SRC]**. A `File` value would be stringified, so for uploads use a single BODY dependency whose value is a ready-made `FormData` **[UNVERIFIED]**.
- **Headers** = `{ ...service.headers, ...la.headers }`, plus `Authorization: service.authorization` when no Authorization header is present **[RUN]**.
- The service object is held **by reference** and read at request time: mutating `authorization` on the object you put in the Map changes later requests **[RUN]**.
- `axios.defaults` and `axios.interceptors` of the app's default axios instance apply to wave-binder's requests **[RUN]** (header set via `axios.defaults.headers.common` and via a request interceptor both reached the server; a response interceptor saw the 401 with its body).
- **Errors**: a failed request logs `Backend call failed for node <name> AxiosError: Request failed with status code 401` via `console.error` **[RUN]**, appends `BACKEND CALL ERROR` to `eventsLog`, and sets the value to `null` **[SRC]**. Status and body are not exposed through the node; an axios response interceptor is the only place to see them.
- `MULTI` + HTTP: the response must be an array and becomes `choices`; the node value becomes `null` unless the current value is in the new choices **[SRC]**.
- `eventsLog` records `GET REQ SENT: <url>` for every method **[RUN]**.

### 4.4 LIST / COMPLEX  [SRC; COMPLEX partly RUN]

- COMPLEX value is `{ key: fieldValue }` with key = field `path` minus its first `/` **[RUN]**. Fields are ordinary nodes in the flat list (listed before their parent) and found by `getNodeByName` **[RUN]**.
- LIST children are created when the list is sized (`list.next(3)` or `defaultValue`), named `<protoName>^<index>` (nested: `name^i^j`), and found by `getNodeByName('travelSpeed^0')`. `namingResolvingRule` maps a dependency to the sibling with the same / offset / fixed index.
- I did not run LIST behaviour at all.

## 5. How-to

```ts
// 5.1 create (once, at module scope)                                   [DOC + SRC]
const api = { target: 'http://localhost:3000', secure: false, authorization: null };
const wb = new WaveBinder(LICENSE, PROTO_NODES, new Map([['api', api]]), [{ name: 'greet', implementation: fn }]);
wb.tangleNodes();                       // safe immediately; deferred until the license check passes
await wb.waitUntilReady();
if (!wb.isReady()) { /* license failed: nodes are gone, show an error screen */ }

// 5.2 declare nodes and dependencies: see section 3.3 and the examples in 6

// 5.3 read as Observable                                               [RUN]
const node = wb.getNodeByName('profile');     // null if unknown or after nuke
const sub = node.subscribe(v => {});          // emits current value immediately, then every change
node.pipe(/* rxjs operators */); node.getValue();
sub.unsubscribe();

// 5.4 write                                                            [RUN for SINGLE]
wb.getNodeByName('userId').next(42);
(wb.getNodeByNameAndType('region', 'MULTI') as MultiNode).setSelection(0);   // [SRC]
(wb.getNodeByName('items') as ListNode).next(3);                             // [SRC]

// 5.5 reload: no official API                                          [SRC]
wb.getNodeByName('profile')._reloadValue();          // re-runs the request/function with current dep values
const d = wb.getNodeByName('userId'); d.next(d.getValue());   // or re-emit a dependency [RUN: re-emission triggers requests]

// 5.6 auth token                                                       [RUN]
api.authorization = `Bearer ${token}`;               // same object that is in the Map

// 5.7 errors                                                           [RUN]
axios.interceptors.response.use(r => r, e => { /* e.response.status, e.response.data */ return Promise.reject(e); });

// 5.8 teardown                                                         [SRC; effect RUN via license failure]
wb.nukeNodes();   // stops the heartbeat interval, complete()s every node, empties the list. The instance cannot be reused.
```

Debug logging: set `globalThis.WAVEBINDER_DEBUG = true` (or env `WAVEBINDER_DEBUG=true` in Node) **before** the module is evaluated; the flag is read once at import **[SRC]**.

## 6. Examples actually run

### 6.1 Public API with no valid license  [RUN]

`wb-research/run/t2-nolicense.mjs`. Placeholder license (all-zero signature), `globalThis.alert` stubbed to log.

```js
const protoNodes = [
  { name: 'userId', path: '/userId', type: 'SINGLE', dep: [], la: { type: 'USER_SELECTION' }, defaultValue: 7 },
  { name: 'greeting', path: '/greeting', type: 'SINGLE', la: { type: 'CUSTOM_FUNCTION', functionName: 'greet' },
    dep: [{ nodeName: 'userId', parameterName: 'id', isOptional: false, onUpdate: true }] },
  { name: 'profile', path: '/profile', type: 'SINGLE', la: { type: 'GET', addr: '/users/{id}', serviceName: 'api' },
    dep: [{ nodeName: 'userId', parameterName: 'id', isOptional: false, onUpdate: true, type: 'PATH_VARIABLE' }] },
];
const wb = new WaveBinder(license, protoNodes, services, [{ name: 'greet', implementation: id => `hello #${id}` }]);
// subscribe to all nodes, wb.tangleNodes(), userId.next(42), await wb.waitUntilReady(), ...
```

```
[+  18.6ms] constructed. isReady(): false | nodes: [ 'userId', 'greeting', 'profile' ]
[+  19.8ms]   userId next -> undefined
[+  19.9ms]   greeting next -> undefined
[+  20.0ms]   profile next -> undefined
[+  20.2ms] tangleNodes() called while license pending. values: [["userId","undefined"],["greeting","undefined"],["profile","undefined"]]
[+  20.4ms]   userId next -> 42
[+  20.5ms] after userId.next(42): greeting = undefined (no propagation: graph is not tangled yet)
[+  22.5ms] globalThis.alert() called with: "Licenza non valida"
[+  22.8ms]   userId COMPLETE
[+  23.2ms]   greeting COMPLETE
[+  28.8ms]   profile COMPLETE
[+  29.0ms] waitUntilReady() resolved (it does NOT reject). isReady(): false | nodes left: 0
[+  29.0ms] getNodeByName("userId") -> null
[+  29.2ms] getDataPool() -> {}
[+  29.3ms] old reference userId.next(99) after nuke -> getValue(): 99 (value stored, but no subscriber is notified: subject completed)
[+  29.4ms] late subscriber on nuked node got: nothing + complete
[+  29.7ms] wb.getNodeByName("userId").next(1) throws: TypeError - Cannot read properties of null (reading 'next')
[+  29.7ms] tangleNodes() again -> still isReady(): false
[+ 334.6ms] HTTP requests received by local backend: 0
```

### 6.2 Propagation and HTTP request shape, seen through COMPLEX fields  [RUN]

`wb-research/run/t3-complex-construct.mjs`. Same placeholder license; one COMPLEX node `session` with fields `uid` (USER_SELECTION, default 7), `page`, `label` (function of `uid`, onUpdate), `user` (GET `/users/{id}`, `uid` path var + optional `page` query, node header), `saved` (POST, two BODY deps, JSON_OBJECT), `rawBody` (PUT, one BODY dep). `tangleNodes()` was never called. Service: `authorization: 'Bearer svc-token'`, `headers: { 'X-Svc': 'from-service' }`.

```
[+  45.6ms] constructed, tangleNodes() NOT called. isReady(): false
[+  46.9ms] wb.getNodes() (flat, fields first): uid, page, label, user, saved, rawBody, session
[+  47.2ms] getDataPool(): {"session":{"uid":7,"page":null,"label":"hello #7","user":null}}
[+  47.5ms]   label next -> "hello #7"
[+  48.0ms] --- uid.next(9) ---
[+  48.3ms]   label next -> null
[+  57.3ms]   label next -> "hello #9"
[+  57.5ms]   user next -> null
[+  59.2ms] --- page.next(2) ---
[+  60.4ms] label eventsLog: INSTANTIATED | RECEIVED 7 FROM uid | RECEIVED 9 FROM uid
[+  60.5ms] user  eventsLog: INSTANTIATED | RECEIVED 7 FROM uid | GET REQ SENT: .../api/users/7 | RECEIVED null FROM page | GET REQ SENT: .../api/users/7 | RECEIVED 9 FROM uid | GET REQ SENT: .../api/users/9 | RECEIVED 2 FROM page | GET REQ SENT: .../api/users/9
[+  73.2ms]   label COMPLETE          <- license check failed, library tore everything down
requests seen by local backend (9):
    GET /api/users/7 | auth=Bearer svc-token | x-svc=from-service | x-node=from-node
    POST /api/save | ct=application/json | body={"userId":7,"label":"hello #9"}     <- inconsistent intermediate state
    PUT /api/raw | ct=application/x-www-form-urlencoded | body=hello #9
    GET /api/users/9?page=2 | auth=Bearer svc-token | x-svc=from-service | x-node=from-node
    GET /api/users/7 ...
    POST /api/save | body={"userId":7,"label":"hello #7"}
    PUT /api/raw | body=hello #7
    GET /api/users/9 ...
    POST /api/save | body={"userId":9,"label":"hello #9"}
```

(`session next` lines and repeated header columns trimmed; full output is reproducible with the script. Responses arrived after teardown, so "response becomes node value" was **not** observed.)

### 6.3 Intended licensed usage  [NOT RUN; DOC + SRC]

```ts
import { WaveBinder } from 'wave-binder';
import LICENSE from './license.json';            // your own file from wavebinder.it

const api = { target: 'http://localhost:3000', secure: false, authorization: null };
const wb = new WaveBinder(LICENSE, protoNodes /* as in 6.1 */, new Map([['api', api]]),
  [{ name: 'greet', implementation: (id: number) => `hello #${id}` }]);
wb.tangleNodes();
await wb.waitUntilReady();
if (!wb.isReady()) throw new Error('WaveBinder license check failed');

wb.getNodeByName('profile').subscribe(v => console.log('profile', v));
wb.getNodeByName('userId').next(42);
// expected from source: profile -> null (onUpdate) -> GET http://localhost:3000/users/42 -> response.data
wb.nukeNodes();
```

## 7. Gotchas

1. **COMPLEX fields are wired in the constructor** **[RUN]**: they subscribe to dependencies and fire HTTP requests before `tangleNodes()` and before the license is validated. Because the fields also sit in the flat list, `tangleNodes()` then wires them a second time, which by my reading doubles their subscriptions (two function calls / two requests per change) and, for a `USER_SELECTION` COMPLEX parent, resets every field to `null`, discarding field `defaultValue`s **[SRC, UNVERIFIED]**. The vendor's menu example uses exactly this shape.
2. **One failed heartbeat kills the store** **[SRC]**: checks run every 5 s with a 5 s timeout; a network blip, sleep/resume or server outage nukes all nodes. There is no event for it: detect it via `wb.isReady() === false` or the `complete` callback of a node subscription.
3. **License and deployment** **[SRC]**: the license JSON ships in the browser bundle; every open tab is an "instance" (`crypto.randomUUID()` per page load) counted by the server (`concurrentUse` → nuke); every user's browser calls the vendor's server every 5 s; the default server URL is `http://`, which an `https://` page cannot fetch (mixed content), so a production HTTPS deployment needs an HTTPS license server URL from the vendor **[UNVERIFIED in a browser]**.
4. **Glitches and races** **[RUN]**: no batching. With a diamond (`saved` depends on `uid` and on `label`, `label` depends on `uid`) one `uid.next(9)` sent `POST {"userId":7,"label":"hello #9"}` before the correct `{"userId":9,...}`. Responses are applied in arrival order with no cancellation, so a slow older response can overwrite a newer one **[SRC]**.
5. **`null` is overloaded**: loading, failed, reset and "user has not chosen" are indistinguishable from the value alone.
6. **`getNodeByName` returns `null`**, typed non-null **[RUN]**; after a nuke every lookup returns `null`.
7. **`waitUntilReady()` never rejects** **[RUN]**; always check `isReady()` afterwards.
8. **`alert()`** is called on an invalid/expired license in browsers **[RUN with stub]**. Heartbeat failures only `console.error`/`console.warn`.
9. **Names are one global namespace**, including COMPLEX fields and LIST protos **[RUN]**. `getNodeByName` returns the first match.
10. **Path placeholders are not encoded** **[RUN]**; encode user-supplied values yourself.
11. **`eventsLog` grows forever** on every node **[SRC]**.
12. **Proto objects are mutated** (`la.service` assigned, list children renamed); LIST children share `la`/`dep` objects by reference **[SRC]**. Do not reuse or freeze config objects.
13. **Docs drift** **[DOC vs SRC]**: the TypeDoc site (2024) and the robot example use a string license and string-bodied functions that 0.0.2 rejects; the menu example and CLI use type `"SIMPLE"`; the README mentions a `"WaveBinder is not ready..."` error that does not exist in the 0.0.2 code. The README omits `waitUntilReady()`.
14. **`ComplexNode.next(partial)`** sets fields missing from the object to `undefined` **[SRC]**, contrary to what the wiki example `customer.next({ firstName: "Mario" })` suggests.

### License terms as stated

- `package.json`: `"license": "All Rights Reserved"`.
- `LICENSE.md`, entire file: `# **Copyright (c) 2026 ENGEESOFTWARE SRL. All rights reserved**`
- `README.md`: no license or usage-rights section. It only mentions licensing under Troubleshooting ("License is invalid or heartbeat failed").
- wavebinder.it: footer "© wavebinderᵀᴹ. All rights reserved."; a "Get your License" form; contest prizes include a "Wavebinder License". Sister repos' READMEs: "All rights reserved."
- I found **no text granting usage rights** and no EULA. The contest rules (`https://wavebinder.it/assets/20260122084134.pdf`) are a scanned PDF with no text layer; I could not read them. **[UNVERIFIED]** whether they contain usage terms.

## 8. Recommended pattern for React + Vite + TypeScript

The library ships its own types, so no ambient `.d.ts` is needed. What is needed is a types shim, because the config types are not exported and the enums reject literals. All files below type-check (`strict`), build with Vite, and the hooks were exercised under React 19 StrictMode + jsdom against stand-in BehaviorSubject nodes **[RUN]**. They were **not** run against a licensed WaveBinder instance. Working copies: `wb-research/run/app/src/wb/`.

`src/wb/types.ts`

```ts
import type { MultiNode, WaveBinder } from 'wave-binder';

type CtorArgs = ConstructorParameters<typeof WaveBinder>;
export type WbLicense = CtorArgs[0];
export type WbProtoNode = CtorArgs[1][number];
export type WbServiceMap = CtorArgs[2];
export type WbFunctionInstance = CtorArgs[3][number];
export type WbNode = ReturnType<WaveBinder['getNodeByName']>;
export type WbMultiNode = MultiNode;

export type NodeType = 'SINGLE' | 'MULTI' | 'LIST' | 'COMPLEX';
export type LoadingType = 'USER_SELECTION' | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'CUSTOM_FUNCTION';
export type DependencyType = 'PATH_VARIABLE' | 'REQUEST_PARAMETER' | 'BODY';
export type BodyType = 'JSON_OBJECT' | 'MULTI_PART_FORM_DATA';
export interface NamingRule { type: 'SAME_INDEX' | 'ALMOST_SAME_INDEX' | 'FIXED_INDEX'; fatherNodeName: string; value?: number }
export interface DepDef {
  nodeName: string; parameterName?: string; isOptional: boolean; onUpdate: boolean;
  type?: DependencyType; namingResolvingRule?: NamingRule | NamingRule[];
}
export interface LoadingActionDef {
  type: LoadingType; addr?: string; serviceName?: string; headers?: Record<string, string>;
  bodyType?: BodyType; functionName?: string;
}
export interface NodeDef {
  name: string; path: string; type: NodeType; dep: DepDef[]; la: LoadingActionDef;
  defaultValue?: unknown; proto?: NodeDef; protos?: NodeDef[];
}
export interface ServiceDef { target: string; secure: boolean; authorization: string | null; headers?: Record<string, string> }
```

`src/wb/instance.ts` (singleton; never create the instance inside a component)

```ts
import { WaveBinder } from 'wave-binder';
import license from './license.json';
import { NODES } from './nodes';            // NodeDef[]
import type { ServiceDef, WbFunctionInstance, WbLicense, WbNode, WbProtoNode, WbServiceMap } from './types';

export const apiService: ServiceDef = {
  target: (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000',
  secure: false,
  authorization: null,
};
const customFunctions: WbFunctionInstance[] = [];

export const wb = new WaveBinder(
  license as WbLicense,
  NODES as unknown as WbProtoNode[],
  new Map([['api', apiService]]) as unknown as WbServiceMap,
  customFunctions,
);
wb.tangleNodes();

/** true = graph live; false = license failed and the instance is dead. */
export const wbReady: Promise<boolean> = wb.waitUntilReady().then(() => wb.isReady());

export function setAuthToken(token: string | null): void {
  apiService.authorization = token ? `Bearer ${token}` : null;
}
export function getNode(name: string): WbNode {
  const node = wb.getNodeByName(name) as WbNode | null;
  if (!node) throw new Error(`WaveBinder node "${name}" not found (unknown name, or instance nuked)`);
  return node;
}
export function reloadNode(name: string): void { getNode(name)._reloadValue(); }

if (import.meta.hot) import.meta.hot.dispose(() => wb.nukeNodes());   // stop the old instance's heartbeat on HMR
```

`src/wb/hooks.ts`

```ts
import { useSyncExternalStore } from 'react';
import type { WbMultiNode, WbNode } from './types';

interface NodeStore { subscribe(l: () => void): () => void; getValue(): unknown; getVersion(): number }

function read(node: WbNode): unknown {
  const type = node.node.type;
  // LIST/COMPLEX: getValue() is not the aggregate and getNodeValue() builds a new object per call,
  // so compute it once per emission and cache it (getSnapshot must be referentially stable).
  return type === 'LIST' || type === 'COMPLEX' ? node.getNodeValue() : node.getValue();
}

export function createNodeHooks(getNode: (name: string) => WbNode) {
  const stores = new WeakMap<object, NodeStore>();

  function storeFor(node: WbNode): NodeStore {
    let store = stores.get(node);
    if (!store) {
      const listeners = new Set<() => void>();
      let value: unknown;
      let version = 0;
      node.subscribe(() => {            // fires synchronously once (BehaviorSubject) -> initialises `value`
        value = read(node);
        version++;
        listeners.forEach(l => l());
      });
      store = {
        subscribe(l) { listeners.add(l); return () => { listeners.delete(l); }; },
        getValue: () => value,
        getVersion: () => version,
      };
      stores.set(node, store);
    }
    return store;
  }

  function useNodeValue<T = unknown>(name: string): T | null | undefined {
    const store = storeFor(getNode(name));
    return useSyncExternalStore(store.subscribe, store.getValue, store.getValue) as T | null | undefined;
  }
  function useNode<T = unknown>(name: string): [T | null | undefined, (value: T | null) => void] {
    const node = getNode(name);
    return [useNodeValue<T>(name), value => node.next(value)];
  }
  /** MULTI choices: re-render on every emission (the value may stay null while choices change). */
  function useNodeChoices<T = unknown>(name: string): T[] {
    const node = getNode(name);
    const store = storeFor(node);
    useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
    return ((node as WbMultiNode).choices ?? []) as T[];
  }
  return { useNodeValue, useNode, useNodeChoices };
}
```

`src/wb/index.ts`

```ts
import { createNodeHooks } from './hooks';
import { getNode } from './instance';
export * from './instance';
export const { useNodeValue, useNode, useNodeChoices } = createNodeHooks(getNode);
```

`src/main.tsx`: render the app only after `wbReady` resolves `true`; render a "license check failed" screen on `false`.

Hook test output **[RUN]** (stand-in nodes):

```
1 initial          : single=undefined list=["a"] choices=[] | renders so far 2
2 single.next(5)   : single=5 list=["a"] choices=[]
3 click (setValue) : single=6 list=["a"] choices=[] | node value 6
4 list re-emits 1  : single=6 list=["a","b"] choices=[]
5 multi choices    : single=6 list=["a","b"] choices=["x","y"]
6 renders for one emission (StrictMode doubles): 2
```

Usage guidance derived from the findings:

- Gate the whole UI on `wbReady`; do not call `next()` before it resolves (values written earlier are reset at tangle).
- Prefer top-level `SINGLE` nodes. Use `COMPLEX` only knowing gotcha 1; `LIST` behaviour is unverified.
- Mutations (login, like, send message): a `USER_SELECTION` "command" node plus a `POST` node with a `BODY` dependency on it and `onUpdate: true`; writing the command triggers the request and the response lands in the POST node.
- Auth: `setAuthToken()` after login. Cookie auth needs `axios.defaults.withCredentials = true` on the shared axios instance **[SRC: wave-binder passes no such option; UNVERIFIED]**.
- Error handling: install one axios response interceptor at startup and route failures (401, validation) into your own USER_SELECTION error node.
- Watch for instance death in one place: subscribe to any node with a `complete` handler, or poll `wb.isReady()`, and show a "reload" screen.
- Add `axios` and `rxjs ^7.8` as direct dependencies so they dedupe with wave-binder's copies.

## 9. Still uncertain

- Everything after a **successful** license check: top-level tangle order effects, `defaultValue`, HTTP response → node value, error → `null`, MULTI choices, LIST, `_reloadValue()`, `nukeNodes()` called by the app.
- The double-wiring of COMPLEX fields by `tangleNodes()` (gotcha 1, second half).
- License server availability, CORS policy for `http://localhost:5173`, HTTPS availability, how instances are counted and expired, what the `features` array gates (the client code never reads it).
- Behaviour in a real browser (only Node and a Vite build were run).
- Node versions other than 24.15.
- The contest rules / any written usage terms.
