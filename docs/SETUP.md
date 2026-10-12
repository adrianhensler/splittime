# Host setup

For someone with a running Linux server who knows their way around it. Root is
needed for parts A to D only. Commands assume Debian or Ubuntu; adjust for
other distributions. Nothing here has been run yet; correct this file as the
build proves or disproves each step.

## A. Accounts (root)

Two accounts keep the coding agent away from live data.

```sh
# runs the service and owns the recordings
sudo useradd --system --create-home --home-dir /var/lib/splittime --shell /usr/sbin/nologin splittime

# the coding agent's account
sudo useradd --create-home --shell /bin/bash pi-agent
sudo passwd -l pi-agent          # no password login; use `sudo -iu pi-agent`
```

Checks:

- `id pi-agent` shows no `sudo`, `wheel`, `adm` or `docker` group. The docker
  group is root-equivalent.
- Other home directories are not world-readable: `chmod 750 /home/<you>`.
- `sudo -l -U pi-agent` reports that it may not run sudo.
- On a development machine one account can do both jobs. Never do that on the
  server holding real recordings.

## B. Firewall (root)

Open the two UDP ports. Nothing else is new: the web app is reached through
the existing web server.

```sh
sudo ufw allow 9999/udp
sudo ufw allow 10000/udp
```

Pitfalls:

- **Two firewalls.** Most cloud providers have their own (security group,
  cloud firewall) in front of the host. Open the ports in both.
- **UDP, not TCP.** A rule that says only `9999` may default to TCP.
- **IPv4.** Give the game the server's IPv4 address.
- **Never use ports 5200–5300.** The game binds its own socket there.
- **Docker ignores ufw.** If Docker runs on this host, its published ports
  bypass ufw rules. SplitTime does not use Docker.
- **firewalld hosts:** `firewall-cmd --permanent --add-port=9999/udp`, same for
  10000, then `--reload`.
- Do not open the app's HTTP port (8000). It must stay on loopback.

Verify from outside the server once the service is running:

```sh
sudo ss -ulnp | grep -E ':(9999|10000)\b'       # is it listening
sudo tcpdump -ni any udp port 9999              # leave running
# from another machine:
head -c 324 /dev/zero | nc -u -w1 <server-ip> 9999
```

A packet seen by tcpdump but not by the app is a host firewall problem. A
packet not seen by tcpdump is a provider firewall or routing problem.

## C. Service (root, once the app exists)

Install the checkout and a virtualenv under `/opt/splittime`, owned by root and
readable by `splittime`. Data lives in `/var/lib/splittime`.

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

Driver names and ports are set by environment variables whose names will be
fixed in M1; add them here then.

## D. Web server (root)

Add a site or location to the existing web server that proxies to
`http://127.0.0.1:8000` and requires a login. The app has no authentication of
its own and can delete recordings.

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

- The app rejects requests whose `Host` it does not recognise. The public
  hostname must be added to its allowed-hosts setting (`LS_ALLOWED_HOSTS`
  upstream; may be renamed).
- The upgrade headers are needed for the WebSocket.
- On SELinux systems nginx needs `setsebool -P httpd_can_network_connect 1`.
- Confirm `curl http://<server-ip>:8000/` from outside fails.

## E. Coding agent (as pi-agent)

```sh
sudo -iu pi-agent
git clone <repo-url> ~/splittime && cd ~/splittime
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```

- Install pi from its own README. The npm package was
  `@mariozechner/pi-coding-agent` and now appears as
  `@earendil-works/pi-coding-agent`; check which is current. Install it under
  the agent's home (`npm config set prefix ~/.local`), not system-wide with
  sudo.
- pi reads `AGENTS.md` from the working directory.
- Put the model API key in the agent's own environment only.
- Git access: either no push credentials at all (the owner pushes), or a
  fine-grained token limited to this one repository. Never the owner's main
  token.
- The agent runs the app on spare ports for testing, for example HTTP 8100 and
  UDP 19999 and 20000, so it never collides with the live service.
- Needs a recent Python 3 and git (upstream does not pin a version; record the tested one at M0). `python3-venv` is a separate package on
  Debian and Ubuntu and needs root to install.

## F. Game (each driver)

Settings → HUD and Gameplay → Data Out:

- Data Out: On
- IP address: the server's public IPv4
- Port: that driver's assigned port

Notes:

- The game sends only while driving, so nothing arrives in menus.
- The setting takes an IP address. If the server's address changes, both
  drivers must update it.
- No router port forwarding is needed at home; the traffic is outbound.
- Two drivers behind one home connection work, because the ports differ.
- A recorded event appears on the site about 15 seconds after it ends.

## G. Housekeeping

- Keep the clock synchronised (`timedatectl` shows `System clock synchronized:
  yes`).
- Watch free disk space on `/var/lib/splittime`.
- Back up `/var/lib/splittime` while the service is stopped, or with
  `sqlite3 telemetry.db ".backup"`.
