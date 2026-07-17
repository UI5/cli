---
paths:
  - "packages/server/lib/middleware/**/*.js"
---

# Server middleware

Rules that apply to every middleware in `packages/server/lib/middleware/`.

## Use only the built-in Node.js HTTP API

`@ui5/server` runs on Express, but Express is an implementation detail wired up
exclusively in `packages/server/lib/server.js`. Every middleware **MUST** treat
the request and response as plain Node.js `http.IncomingMessage` /
`http.ServerResponse` objects, so the underlying HTTP framework can be swapped
without rewriting any middleware.

### MUST use — sanctioned Node.js surface

This is already the norm across the middleware directory:

- Request: `req.method`, `req.url`, `req.headers`
- Response: `res.setHeader`, `res.getHeader`, `res.writeHead`, `res.statusCode`, `res.end`

### MUST NOT use — Express-specific sugar

- Response: `res.send`, `res.json`, `res.type`, `res.status()`, `res.redirect`, `res.sendFile`, `res.cookie`
- Request: `req.query`, `req.params`, `req.cookies`, `req.get()`, `req.body`

Parse anything you need (query string, body) from the raw Node primitives
(`req.url`, the request stream) instead.

#### Exception: `req.body` after your own body-parser middleware

Reading `req.body` is fine **if you installed the body parser yourself** on your
own router — then `req.body` is the output of a middleware you control, not
Express-injected sugar. `csp.js` does this: it registers
`bodyParser.json(...)` on its router before the handler reads `req.body`.

### Model to imitate

`packages/server/lib/middleware/liveReloadClient.js` is the reference: it serves
its response using only `req.method`, `middlewareUtil.getPathname(req)`,
`res.setHeader`, `res.statusCode`, and `res.end`.
