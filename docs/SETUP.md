# Running a SplitTime server

For someone with a running Linux server who knows their way around it. This is
the generic guide. A worked example behind an existing gateway is in
[hosting/test-hensler-work.md](hosting/test-hensler-work.md).

Nothing here has been run yet. Correct this file as the build proves or
disproves each step. Commands assume Debian or Ubuntu.

Read [DATA_FLOW.md](DATA_FLOW.md) first: you are opening UDP ports on a public
address and storing other people's recordings.

## What you need

- A server with a **public IPv4 address that does not change**. The game takes
  an IP address, not a hostname.
- Two free UDP ports above 1024 and **outside 5200–5300**. Defaults: 9999 and
  10000.
- A web server or gateway you already run, to provide HTTPS and a login.
  SplitTime has neither.

## A. Accounts (root)

*Assumed already done on the owner's system.*

```sh
# runs the service and owns the recordings (not needed if you use a container)
sudo useradd --system --create-home --home-dir /var/lib/splittime --shell /usr/sbin/nologin splittime

# an account for a coding agent, if you use one
sudo useradd --create-home --shell /bin/bash agent
sudo passwd -l agent             # no password login; use `sudo -iu agent`
```

Checks for the agent account:

- `id agent` shows no `sudo`, `wheel`, `adm` or `docker` group. The docker
  group is root-equivalent.
- `sudo -l -U agent` reports that it may not run sudo.
- Other home directories are not world-readable: `chmod 750 /home/<you>`.
- It has its own model API key and either no git push credentials or a token
  limited to this one repository.
- It tests on spare ports (HTTP 8100, UDP 19999 and 20000), never the live ones.

Many coding agents have no permission system of their own. The Unix account is
then the only containment, which is why these checks matter.

## B. Firewall (root)

Open the two UDP ports and nothing else.

```sh
sudo ufw allow 9999/udp
sudo ufw allow 10000/udp
```

Pitfalls:

- **Two firewalls.** Most hosting providers have their own in front of the
  server. Open the ports in both.
- **UDP, not TCP.** A rule that says only `9999` may default to TCP.
- **A CDN or tunnel in front of your site does not carry this.** Cloudflare and
  similar proxy web traffic only. The game must be given the server's own
  address, which also reveals it to the drivers.
- **Docker ignores ufw.** A container's published ports are opened by Docker's
  own rules whatever ufw says.
- **firewalld:** `firewall-cmd --permanent --add-port=9999/udp`, the same for
  10000, then `--reload`.
- Never expose the app's HTTP port (8000) to the internet.

Verify from outside once the service is running:

```sh
sudo ss -ulnp | grep -E ':(9999|10000)\b'       # is it listening
sudo tcpdump -ni any udp port 9999              # leave running
# from another machine:
head -c 324 /dev/zero | nc -u -w1 <server-ip> 9999
```

Seen by tcpdump but not by the app: host firewall. Not seen by tcpdump:
provider firewall or routing.

## C. Run it

Either way the app listens for HTTP on port 8000 and UDP on the driver ports.
Driver names and ports are set by environment variables to be named in WP-002.

### Option 1: container

Upstream ships a `Dockerfile` and `docker-compose.yml`. Publish the two UDP
ports. Publish HTTP to loopback only, or not at all if your proxy is on the
same Docker network.

```yaml
    ports:
      - "127.0.0.1:8000:8000"
      - "9999:9999/udp"
      - "10000:10000/udp"
    volumes:
      - ./data:/app/data
```

### Option 2: plain process

Checkout and virtualenv under `/opt/splittime`, data in `/var/lib/splittime`.

`/etc/systemd/system/splittime.service`:

```ini
[Unit]
Description=SplitTime
After=network-online.target
Wants=network-online.target

[Service]
User=splittime
WorkingDirectory=/opt/splittime
Environment=DATA_DIR=/var/lib/splittime
ExecStart=/opt/splittime/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/splittime
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload && sudo systemctl enable --now splittime
journalctl -u splittime -f
```

Needs a recent Python 3 and git (upstream does not pin a version; the tested
one is recorded here in WP-001). `python3-venv` is a separate package on Debian
and Ubuntu.

## D. Web server (root)

Proxy to the app and require a login. The app can delete recordings and has no
authentication of its own.

nginx:

```nginx
location / {
    auth_basic "SplitTime";
    auth_basic_user_file /etc/nginx/splittime.htpasswd;
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

Caddy:

```
splittime.example.com {
    basic_auth {
        alice <hash from `caddy hash-password`>
        bob   <hash>
    }
    reverse_proxy 127.0.0.1:8000
}
```

Pitfalls:

- The app rejects requests whose `Host` it does not recognise. Add the public
  hostname to its allowed-hosts setting (`LS_ALLOWED_HOSTS` upstream).
- **Serving under a path** such as `/splittime/` needs the URL-prefix support
  planned for WP-003. Until then use a hostname of its own.
- The upgrade headers are needed for the WebSocket.
- On SELinux systems nginx needs `setsebool -P httpd_can_network_connect 1`.
- Confirm `curl http://<server-ip>:8000/` from outside fails.

## E. Drivers

Send each driver [GAME_SETUP.md](GAME_SETUP.md), the server IP address and
their port.

## F. Housekeeping

- Keep the clock synchronised (`timedatectl` shows `System clock synchronized:
  yes`).
- Watch free disk space on the data directory. At high PC frame rates an hour
  of recorded events is about 160 MB.
- Back up the data directory with the service stopped, or with
  `sqlite3 telemetry.db ".backup"`.
