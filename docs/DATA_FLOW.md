# What is sent, and where

Read this before pointing a game at a SplitTime server, and before running one.

## The paths

```
Player's PC (FH6) ──UDP, unencrypted, one-way──▶ server IP : that player's port
                                                        │
                                                 SplitTime process ──▶ SQLite file on the server
                                                        ▲
Player's browser ──HTTPS──▶ operator's web server ──HTTP──┘
                            (login, TLS)

SplitTime process ──HTTPS──▶ GitHub (car names and route catalogue, about daily; can be turned off)
```

## Telemetry: game to server

| | |
|---|---|
| Sent by | The game itself, once Data Out is switched on |
| Sent to | The IP address and port the player typed into the game |
| Protocol | UDP. No encryption, no login, no reply from the server |
| When | Every rendered frame while driving, **including free roam**. Nothing in menus, pause or photo mode |
| Rate | The game's frame rate: 60 packets/s at 60 fps, 120–140 at high PC frame rates |
| Volume | 324 bytes per packet, about 20–45 kB/s upstream |

**What each packet contains:** engine speed, acceleration, velocity, orientation,
per-wheel suspension, slip and temperature, the car's model number, class,
performance index and drivetrain, position in the game world, speed, power,
torque, boost, fuel, lap times, lap number, race position, throttle, brake,
clutch, handbrake, gear and steering.

**What it does not contain:** gamertag, account or platform identity, tune or
assist settings, the route or event name, other players' cars, chat, anything
from outside the game.

**What the server learns besides the packet:** the public IP address the
packets came from, as with any internet traffic. SplitTime records it with the
session as supporting evidence. The port, not the address, decides which driver
a session belongs to.

**Who else can see it:** anyone on the network path can read or forge the
packets, because UDP is unencrypted and unauthenticated. The content is game
telemetry only.

## What the server keeps

- **Kept:** raw packets for sessions containing completed laps or timed runs,
  plus derived laps, routes and flags (until deleted). For recognized events
  abandoned before a completed lap, retain a **minimal incomplete-attempt
  summary** only; raw packets need not be retained indefinitely.
- **Not kept:** free-roam sessions and raw buffers discarded from attempts
  without completed laps. These packets can still arrive and be stored
  temporarily before event classification is settled.
- Deleting a session on the site removes its packets and laps.

## Web: browser to server

SplitTime serves plain HTTP on a local address and has no login of its own. The
operator's web server puts TLS and access control in front of it. Anyone who
gets through that can view, edit flags, reprocess and delete recordings for
both drivers.

## Outbound from the server

| Call | Purpose | Off switch |
|---|---|---|
| GitHub raw content, about once a day | Updated car-name list and official route catalogue from the LapScope project | `LS_OFFLINE=1` (upstream name; may be renamed) |
| GitHub API from the **browser** | LapScope's "new release available" check | To be removed in M2; it would point users at the wrong project |

No telemetry, lap data or driver information is sent anywhere by SplitTime.

## What each person should know

- **A driver** is sending game telemetry, unencrypted, to an IP address run by
  the operator, whenever they drive with Data Out on. Turning Data Out off
  stops it.
- **A driver** learns the server's public IP address, because they type it into
  the game.
- **The operator** is opening UDP ports on a public address and storing both
  drivers' recordings.
