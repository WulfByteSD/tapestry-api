# Test content MCP locally on Windows

Use the existing API and development database, with a local HTTPS proxy in front
of the API. This guide assumes PowerShell and Docker Desktop with Linux containers
running. Run API commands from the `tapestry-api` directory. No production
credentials or infrastructure changes are needed.

| Service | Local process | URL used by clients |
| --- | --- | --- |
| API, OAuth, and MCP | HTTP port 5000 | `https://localhost:5443` |
| Admin app, when needed | HTTP port 3000 | `https://localhost:3443` |

The MCP endpoint will be
`https://localhost:5443/api/v1/game/content/mcp`.
Setting an HTTPS URL in ENV does **not** enable TLS on Express. The proxy below
provides it; the current MCP validator requires HTTPS even in development.

## 1. Configure the API ENV

Merge these values into `tapestry-api/.env`, replacing any existing definitions
of the same variables rather than adding duplicate keys:

```dotenv
NODE_ENV=development
PORT=5000
CORE_CAP=1

CONTENT_MCP_ENABLED=true
CONTENT_MCP_URL=https://localhost:5443/api/v1/game/content/mcp
CONTENT_MCP_HOSTS=localhost:5443
CONTENT_MCP_ORIGINS=https://localhost:3443
```

Keep the existing development values of `JWT_SECRET`, `MONGO_USER`, `MONGO_PASS`,
`CLUSTER_STRING`, `MONGO_DBNAME`, `REDIS_URL`, and, if used, `REDIS_TOKEN`. Use a
development database containing your active, verified administrator and test
settings. MCP creates its collections in that same database.

MongoDB must be a replica set or a sharded cluster for client/grant registration,
token issuance, proposals, and content mutations. Redis must be reachable for
shared rate limiting. If you do not already have these services, the optional
Docker setup at the end shows how to run them locally.

`CORE_CAP=1` starts one local API worker. The canonical API origin,
`https://localhost:5443`, is added to the Origin allowlist automatically. If you
only test native/command-line clients, you may set `CONTENT_MCP_ORIGINS` to
`https://localhost:5443` instead; it cannot be empty.

Use `localhost` consistently. `127.0.0.1:5443`, `localhost:5000`, an HTTP browser
origin, and a trailing slash in `CONTENT_MCP_URL` do not match this configuration.
OAuth callback URLs belong to client registration, not ENV.

## 2. Start the local HTTPS proxy

The provided [Caddyfile](./Caddyfile.local) forwards HTTPS to the API and optional
admin app. Docker Desktop provides `host.docker.internal` so the container can
reach processes on Windows. See [Docker Desktop networking](https://docs.docker.com/desktop/features/networking/#i-want-to-connect-from-a-container-to-a-service-on-the-host).

First-time setup, from `tapestry-api`:

```powershell
$mcpProxyConfig = (Resolve-Path .\src\modules\game\content\mcp\docs\Caddyfile.local).Path
$mcpProxyArguments = @(
    'run', '-d', '--name', 'tapestry-mcp-https',
    '-p', '127.0.0.1:5443:5443',
    '-p', '127.0.0.1:3443:3443',
    '--mount', "type=bind,source=$mcpProxyConfig,target=/etc/caddy/Caddyfile,readonly",
    '--mount', 'type=volume,source=tapestry-mcp-caddy-data,target=/data',
    '--mount', 'type=volume,source=tapestry-mcp-caddy-config,target=/config',
    'caddy:2'
)
docker @mcpProxyArguments
docker logs tapestry-mcp-https
```

The published proxy ports bind to your computer's loopback interface. Keep the
data volume: it holds this proxy's local certificate authority. On subsequent
sessions, start the existing container with `docker start tapestry-mcp-https`.

### Trust this proxy's local certificate

Caddy generates a local certificate authority. A Docker container cannot
automatically install that authority into Windows. Import **this container's
public root certificate** into your current user's trusted roots so your browser
and Windows HTTP clients accept its HTTPS connections. See
[Caddy local HTTPS](https://caddyserver.com/docs/automatic-https#local-https).

After Caddy has started:

```powershell
$mcpCertificateDirectory = Join-Path $env:LOCALAPPDATA 'Tapestry\McpLocal'
New-Item -ItemType Directory -Force -Path $mcpCertificateDirectory | Out-Null
$mcpRootCertificate = Join-Path $mcpCertificateDirectory 'root.crt'
docker cp tapestry-mcp-https:/data/caddy/pki/authorities/local/root.crt "$mcpRootCertificate"
Import-Certificate -FilePath $mcpRootCertificate -CertStoreLocation Cert:\CurrentUser\Root
```

For a Node-based MCP client, set this in the terminal **before launching the
client**:

```powershell
$env:NODE_EXTRA_CA_CERTS = Join-Path $env:LOCALAPPDATA 'Tapestry\McpLocal\root.crt'
```

Node reads [NODE_EXTRA_CA_CERTS](https://nodejs.org/api/cli.html#node_extra_ca_certsfile)
when its process starts. Adding it through an app's runtime `dotenv.config()`
does not update certificate trust for the already-running Node process.

## 3. Start the API and verify discovery

In an API terminal:

```powershell
npm run dev
```

Wait for the API worker and MongoDB connection messages. In another terminal:

```powershell
Invoke-RestMethod https://localhost:5443/.well-known/oauth-authorization-server
Invoke-RestMethod https://localhost:5443/.well-known/oauth-protected-resource/api/v1/game/content/mcp
curl.exe -i https://localhost:5443/api/v1/game/content/mcp
```

The first two requests should return OAuth metadata. The protected-resource
response must report `https://localhost:5443/api/v1/game/content/mcp` as its
resource. The unauthenticated MCP request should return **401** with a
`WWW-Authenticate: Bearer ...` challenge. That means the endpoint is exposed and
requires authorization; discovery alone does not test database writes or Redis.

## 4. Issue a test agent credential

Follow [the administrator credential workflow](./content-mcp.md#issue-access-to-an-unattended-agent),
using this local endpoint as `BASE`:

```text
https://localhost:5443/api/v1/game/content/mcp
```

1. Sign into the existing development API as an active, verified administrator
   and use that human account's app JWT for `/admin` requests.
2. Register a confidential machine client and save its one-time client secret.
3. Create its grant with an active, verified owner's **Auth ID**, a future expiry,
   existing setting keys, and `read`/`propose` capabilities. Include `settings`
   among the allowed content types when content references settings.
4. Exchange the issued client credential for an MCP access token.

For example, after registration, in PowerShell with the issued values already
assigned to `$mcpClientId` and `$mcpClientSecret`:

```powershell
$mcpResource = 'https://localhost:5443/api/v1/game/content/mcp'
$mcpToken = Invoke-RestMethod -Method Post -Uri "$mcpResource/oauth/token" `
    -ContentType 'application/x-www-form-urlencoded' -Body @{
        grant_type = 'client_credentials'
        client_id = $mcpClientId
        client_secret = $mcpClientSecret
        resource = $mcpResource
        scope = 'read propose'
    }
```

Connect your MCP client to `$mcpResource` with
`Authorization: Bearer <the value of $mcpToken.access_token>`. Call
`content_context`, then `content_search`, then submit a `content_propose` with a
new operation ID. The proposal should appear in the admin proposal list. Review
uses the administrator JWT; MCP access tokens cannot perform admin actions.

For direct content writes, add the relevant `create`/`update` permissions and
`read:draft` to the grant, then request a new token with those scopes. Publishing
or editing a published record additionally needs `publish`. Use existing test
settings and references. Each mutation needs a unique operation ID.

For an interactive client, follow
[interactive registration](./content-mcp.md#approve-an-interactive-ai-application)
instead. Preregister its exact callback URL and a user/client grant before
connecting. HTTP loopback callbacks are allowed when preregistered; the MCP URL
and browser Origin policy still require HTTPS. A hosted external AI service
cannot reach your computer's `localhost`; this setup is for clients running on
your machine.

## 5. Optional admin browser testing

The MCP management screens are described in
[the frontend handoff](./frontend-handoff.md); they are not implemented by this
backend change. To run the existing admin app and develop those screens, set this
public value in `tapestry-frontend/apps/admin/.env.local`:

```dotenv
NEXT_PUBLIC_API_ORIGIN=https://localhost:5443
```

From `tapestry-frontend`, run:

```powershell
$env:NODE_EXTRA_CA_CERTS = Join-Path $env:LOCALAPPDATA 'Tapestry\McpLocal\root.crt'
pnpm dev:admin
```

Open **https://localhost:3443**. Browser requests from `http://localhost:3000`
are rejected on the MCP routes. Restart the frontend after changing its ENV.
Use the app-local MCP adapter described in the handoff: the shared Axios client
adds custom headers that the dedicated MCP CORS policy does not allow.

## Optional: MongoDB and Redis entirely on your computer

Skip this section if the existing development connections work. These commands
create new local containers; ports 27017 and 6379 must be free. They do not
convert or replace an existing MongoDB installation.

```powershell
docker run -d --name tapestry-mcp-mongo -p 127.0.0.1:27017:27017 --mount type=volume,source=tapestry-mcp-mongo-data,target=/data/db mongo:8 --replSet rs0 --bind_ip_all
docker logs tapestry-mcp-mongo
```

Once MongoDB is accepting connections, initiate the single-member replica set
**once**, then check that it has elected a primary:

```powershell
docker exec tapestry-mcp-mongo mongosh --eval "rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"
docker exec tapestry-mcp-mongo mongosh --eval 'db.hello().isWritablePrimary'
```

The second command must return `true`; election may take a few seconds. The
advertised `localhost:27017` address works for this single member and the API
running on your Windows host. MongoDB documents
[replica-set initiation](https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/#initialize-the-replica-set).

Start Redis:

```powershell
docker run -d --name tapestry-mcp-redis -p 127.0.0.1:6379:6379 redis:7-alpine
```

Replace the following values in the API's local `.env`, retaining the MCP ENV
from step 1 and your local app `JWT_SECRET`:

```dotenv
MONGO_USER=
MONGO_PASS=
CLUSTER_STRING=
MONGO_DBNAME=tapestry-mcp-local
REDIS_URL=redis://localhost:6379
REDIS_TOKEN=
```

Blanking the three SRV connection fields selects the app's local
`mongodb://localhost:27017/...` fallback. The database loader does not read a
`MONGO_URI` override. Restart the API after changing these values.

This is a **new, empty database**. Prepare your test accounts, administrator
permissions, and settings through the existing application setup before issuing
MCP credentials. These containers do not seed accounts or grant administrative
access. For an immediate test with existing accounts, keep your development
database connection instead.

## Automated tests without manual HTTPS setup

To run the existing isolated MCP integration tests from `tapestry-api`:

```powershell
npm test -- --runInBand --roots src --testPathPatterns=mcp
```

The tests use a temporary MongoDB replica set and test limiter, and include SDK
machine/interactive smoke tests. They do not use your app database or require the
Caddy setup. The first run may download the MongoDB test binary.

## Common setup failures

| Symptom | Check |
| --- | --- |
| Startup rejects the MCP URL or origins | Exact HTTPS URLs, matching host/port, no path in an origin, no trailing slash in the MCP URL. |
| Proxy returns 502 | API worker is running on 5000; `CORE_CAP=1`; Docker Desktop can reach it. The optional admin upstream needs port 3000. |
| TLS/certificate error | Import this Caddy container's root into Windows; set `NODE_EXTRA_CA_CERTS` before starting Node clients. |
| 403 Host/Origin | Use `localhost:5443` and, for browser admin calls, `https://localhost:3443`. Preserve Host through the proxy. |
| 503 shared limiter unavailable | Check `REDIS_URL`/`REDIS_TOKEN` and Redis reachability. |
| `transactions_required` | MongoDB must have replica-set/sharded support; a standalone MongoDB cannot provision clients or issue tokens. |
| Credential exchange or content access denied | Active client, unexpired grant, active verified owner, matching resource/scope, and all setting/type/shared boundaries. |
| Client tries dynamic registration | Register it through the administrator endpoint first; only preregistered OAuth clients are supported. |
