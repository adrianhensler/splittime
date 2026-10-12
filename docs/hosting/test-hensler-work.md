# Reference deployment: test.hensler.work

**This is the owner's personal hosting, not part of SplitTime.** It shows one
way to run the software behind an existing gateway. For the generic guide see
[../SETUP.md](../SETUP.md). Nothing here has been applied yet; it is the plan
for milestone M2.

## The gateway

`/opt/prod/test.hensler.work` is a Docker Compose stack. Caddy listens on host
port 8081 and is reached only through a Cloudflare Tunnel, which terminates
HTTPS. Every service is gated by `forward_auth` to the gateway's auth API. The
procedure for adding a service is that repo's `ADDING_SERVICES.md`.

## Two separate paths

| Traffic | Path |
|---|---|
| Web | Browser → Cloudflare → tunnel → Caddy `:8081` → `splittime:8000` on the compose network |
| Telemetry | Game → **this server's public IPv4**, UDP 9999 or 10000 → published container port |

The tunnel carries HTTP only, so telemetry cannot use it. Consequences:

- These are the first inbound ports this deployment opens.
- The other driver is given the server's real IP address, which Cloudflare
  otherwise hides.
- `test.hensler.work` resolves to Cloudflare, not to this server. The game
  needs the IP address, not the hostname.

## Steps

### 1. Compose service

Add to the gateway's `docker-compose.yml`, built from a checkout of this repo:

```yaml
  splittime:
    build: /path/to/splittime
    container_name: test-splittime
    restart: unless-stopped
    environment:
      - DATA_DIR=/app/data
      - LS_ALLOWED_HOSTS=test.hensler.work
      # driver names and ports: variable names fixed in M1
      # URL prefix /splittime: variable name fixed in M2
    networks:
      - test-hensler-network
    expose:
      - "8000"
    ports:
      - "9999:9999/udp"
      - "10000:10000/udp"
    volumes:
      - splittime-data:/app/data
```

and `splittime-data:` under `volumes:`. HTTP port 8000 is exposed to the compose
network only, never published to the host.

### 2. Caddy route

Inside the `:80` block, modelled on the existing gated services:

```caddyfile
    handle /splittime/* {
        forward_auth api:8000 {
            uri /api/auth/caddy-gate?service=splittime
            header_up Authorization "Bearer {http.request.cookie.session_token}"
        }

        uri strip_prefix /splittime
        reverse_proxy splittime:8000 {
            header_up Host {host}
            header_up Upgrade {http.request.header.Upgrade}
            header_up Connection {http.request.header.Connection}
        }
    }
```

Check how existing services order `uri strip_prefix` and `forward_auth`; the
Caddyfile's `/autism/*` block has a comment on why order matters.

### 3. Dashboard and access

Per `ADDING_SERVICES.md`: add the card in `frontend/dashboard.html` and the URL
mapping in `frontend/assets/dashboard.js`. Grant both drivers the `splittime`
service in the gateway's user admin.

### 4. Firewalls (root)

- Docker publishes ports by writing its own firewall rules, which bypass ufw.
  Publishing the two UDP ports opens them on the host without a ufw rule.
- The hosting provider's firewall, if one is in front of this server, still
  needs UDP 9999 and 10000 opened.
- Confirm nothing else became reachable.

### 5. Verify

```sh
docker compose ps splittime
sudo ss -ulnp | grep -E ':(9999|10000)\b'
sudo tcpdump -ni any udp port 9999            # then drive, or send a test packet from outside
curl -s -o /dev/null -w '%{http_code}\n' https://test.hensler.work/splittime/   # expect a redirect to login when signed out
```

## Things to confirm during M2

| Item | Why |
|---|---|
| The app works under `/splittime/` | Upstream pages call absolute `/api/...` and `/ws/live`, which collide with the gateway's own `/api/*`. The app must be made prefix-aware first (ADR 16). |
| Source address seen inside the container | Depending on Docker's proxy mode, the app may see the bridge address instead of the driver's real IP. Identity uses the port, so this only affects the evidence field. |
| WebSocket through Cloudflare and Caddy | Only matters if the live view is kept. |
| The gateway's `/api/*` rule is matched before or after `/splittime/*` | A request to `/splittime/api/...` must reach SplitTime, not the gateway API. |

## Unrelated observation

On 2026-10-12 the `demando` web terminal was listening on `0.0.0.0:7681` on
this host. If no firewall blocks that port, it is reachable without the login
gate. Worth checking from outside.
