# Game setup (each driver)

One-time. The operator gives you two things: the **server IP address** and
**your port**. Each driver has a different port.

## Steps

1. In Forza Horizon 6 open **Settings → HUD and Gameplay**.
2. Set **Data Out** to **On**.
3. Set **Data Out IP Address** to the server IP address.
4. Set **Data Out IP Port** to your port.
5. Drive an event. About 15 seconds after it ends it appears on the site.

That is all. There is nothing to press while playing.

## Check it works

- Drive one Rivals lap, wait 15 seconds, open the site. A session with your
  name and one lap should be there.
- Nothing there: confirm the IP and port, then ask the operator whether packets
  are arriving. They can see that directly.

## PC notes

- **One destination only.** Data Out sends to a single address. If SimHub, a
  wheel dashboard, a motion rig or another telemetry tool already uses it, that
  tool stops receiving when you change the address. Some tools can forward a
  copy; set that tool to forward to the server instead.
- **Never use a port from 5200 to 5300.** The game uses those itself.
- **Packet rate follows your frame rate.** An uncapped 140 fps sends more than
  twice the data of 60 fps. This is fine; it only affects storage on the server.
- **Firewall.** Outbound UDP is allowed by default on Windows. A strict
  third-party firewall may need a rule for the game.
- **No router changes.** The traffic is outbound.
- Game updates sometimes reset settings. If sessions stop appearing, check Data
  Out is still on.

## What you are sharing

Car telemetry, your position in the game world and lap times, sent unencrypted
to the server whenever you are driving with Data Out on, free roam included.
Free roam is discarded; events are stored. No gamertag or account details are
sent. Full detail: [DATA_FLOW.md](DATA_FLOW.md). To stop, turn Data Out off.
