# Running the receipt model on a home server

Receipt scanning sends a photo from the Cloudflare Worker to a llama.cpp server. This guide sets that server up on a spare laptop, keeps it running without a terminal, and moves the public hostname to it. Nothing in this file is secret: the key, tunnel credentials and Access token live only on the machine and in Cloudflare.

```
phone or browser -> Worker (checks the user) -> Cloudflare Access (service token)
  -> Cloudflare Tunnel -> llama-server on 127.0.0.1:8080 (API key)
```

The laptop opens no ports and needs no router changes. It only makes an outbound connection to Cloudflare.

## Is it safe that this repository is public?

Yes, because nothing here is a credential. A hostname is not a secret. Access control does not depend on anyone not knowing it:

1. **The tunnel only routes one path**, `/v1/chat/completions`. Everything else returns 404 at Cloudflare.
2. **Cloudflare Access** rejects every request that lacks the worker's service token, before it reaches the laptop.
3. **llama-server needs an API key** as a second layer, and listens on `127.0.0.1` only.
4. **The worker decides who may scan**: only users the admin enabled, with per-user and global rate limits.
5. **The model can only emit one JSON object** in a fixed shape, and the worker validates it again.

Keep these out of the repository and chat logs: the API key, the tunnel credentials file (`~/.cloudflared/<id>.json`), the Access client secret, and the admin email. The worker reads them from Cloudflare secrets.

## 1. Prepare the laptop

- Use a wired connection if you can, and set the machine to never sleep on power:
  - macOS: System Settings > Battery > Options, turn on "Prevent automatic sleeping on power adapter when the display is off", or run `sudo pmset -c sleep 0`. With the lid closed it also needs power and an external display or `sudo pmset -a disablesleep 1`.
  - Linux: `sudo systemctl mask sleep.target suspend.target hibernate.target`, and set `HandleLidSwitchExternalPower=ignore` in `/etc/systemd/logind.conf`.
- Turn on full-disk encryption and a screen lock. The API key and tunnel credentials sit on this disk.
- Give it a stable name and keep the system updated.

The model needs roughly 6 to 8 GB of free memory for a 9B model at Q4. A 16 GB machine is comfortable. Scans take about 15 to 40 seconds on Apple silicon, and much longer on an old CPU.

## 2. Install llama.cpp and get the model

macOS:

```bash
brew install llama.cpp cloudflared
```

Linux: install a release build of llama.cpp from its GitHub releases (or build it), and install `cloudflared` from Cloudflare's package repository.

The model used so far is `Jackrong/DeepSeek-V4-Pro-Qwen3.5-9B-MTP-GGUF:Q4_K_M`. Any multimodal GGUF that can read images works. Run it once by hand to download it and check it fits in memory:

```bash
llama-server -hf Jackrong/DeepSeek-V4-Pro-Qwen3.5-9B-MTP-GGUF:Q4_K_M --host 127.0.0.1 --port 8080
```

Stop it again with Ctrl-C once it says it is listening.

## 3. Create the API key

Copy the existing key from the old machine if you want the worker's `LLAMA_KEY` secret to stay as it is. Otherwise make a new one and update the secret in step 7.

```bash
mkdir -p ~/.config/mealcost && umask 077
openssl rand -hex 32 | tr -d '\n' > ~/.config/mealcost/llama.key
chmod 600 ~/.config/mealcost/llama.key
```

## 4. Run the model as a background service

Create `~/.local/bin/llama-service.sh` and make it executable (`chmod 755`). Adjust the paths to where `llama-server` is installed (`which llama-server`):

```bash
#!/bin/bash
# The grep drops the harmless "unused tensor ... ignoring" warnings this model prints at load.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
llama-server -hf Jackrong/DeepSeek-V4-Pro-Qwen3.5-9B-MTP-GGUF:Q4_K_M \
  --host 127.0.0.1 --port 8080 --api-key "$(cat "$HOME/.config/mealcost/llama.key")" 2>&1 \
  | grep --line-buffered -v "has unused tensor"
```

### macOS (launchd)

Save as `~/Library/LaunchAgents/com.mealcost.llama.plist`, replacing `YOU` with the account name:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.mealcost.llama</string>
  <key>ProgramArguments</key><array><string>/Users/YOU/.local/bin/llama-service.sh</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/Users/YOU/Library/Logs/llama/llama.log</string>
  <key>StandardErrorPath</key><string>/Users/YOU/Library/Logs/llama/llama.log</string>
</dict></plist>
```

```bash
mkdir -p ~/Library/Logs/llama
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.mealcost.llama.plist
```

A LaunchAgent starts when that user logs in. For a headless server, turn on automatic login for the account, or run it as a LaunchDaemon instead.

- Logs: `tail -f ~/Library/Logs/llama/llama.log`
- Restart: `launchctl kickstart -k gui/$(id -u)/com.mealcost.llama`
- Stop: `launchctl bootout gui/$(id -u)/com.mealcost.llama`

### Linux (systemd)

Save as `~/.config/systemd/user/llama.service`:

```ini
[Unit]
Description=Meal cost receipt model
After=network-online.target

[Service]
ExecStart=%h/.local/bin/llama-service.sh
Restart=always

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload && systemctl --user enable --now llama
sudo loginctl enable-linger $USER      # keep it running without a login
journalctl --user -u llama -f           # logs
```

## 5. Move the tunnel to the laptop

A tunnel's credentials identify one tunnel, so make a new tunnel on the laptop and point the same hostname at it. That keeps `LLAMA_URL` and the Access application unchanged.

```bash
cloudflared tunnel login                 # opens a browser, pick the coachleonidas.com zone
cloudflared tunnel create llama-home
```

Note the tunnel ID it prints. Create `~/.cloudflared/llama-config.yml`, replacing the ID and `YOU`:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /Users/YOU/.cloudflared/<TUNNEL-ID>.json

ingress:
  - hostname: llama.coachleonidas.com
    path: ^/v1/chat/completions$
    service: http://127.0.0.1:8080
  - service: http_status:404
```

Point the hostname at the new tunnel. Use the ID, not the name, and `--config` so a default tunnel in `config.yml` is not picked up by mistake:

```bash
cloudflared --config ~/.cloudflared/llama-config.yml tunnel route dns --overwrite-dns <TUNNEL-ID> llama.coachleonidas.com
```

Run it as a service the same way as the model. On macOS, a second LaunchAgent `com.mealcost.llama-tunnel` with these arguments: `/opt/homebrew/bin/cloudflared --config /Users/YOU/.cloudflared/llama-config.yml tunnel run llama-home`, logging to `~/Library/Logs/llama/tunnel.log`. On Linux, `cloudflared --config ... tunnel run llama-home` in a second systemd user unit.

## 6. Check it before switching off the old machine

```bash
KEY=$(cat ~/.config/mealcost/llama.key)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $KEY" http://127.0.0.1:8080/v1/models            # 200
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $KEY" https://llama.coachleonidas.com/v1/models   # 404 (path is not routed)
curl -s -o /dev/null -w "%{http_code}\n" -X POST -d '{}' https://llama.coachleonidas.com/v1/chat/completions         # 403 (Access blocks it)
```

Then sign in to the site as an allowed user and scan a receipt from Foods. When it works, stop and remove the old machine's two services, and delete the old tunnel with `cloudflared tunnel delete llama` on that machine.

## 7. Worker secrets

If you reused the same hostname and key, nothing changes. Otherwise, from a checkout of this repository:

```bash
npx wrangler secret put LLAMA_KEY      # paste the contents of llama.key
npx wrangler secret put LLAMA_URL      # https://llama.coachleonidas.com
```

The Access service token (`CF_ACCESS_ID` and `CF_ACCESS_SECRET`) belongs to the hostname, not the machine. It expires one year after creation; to renew it, create a new token in Cloudflare Zero Trust under Access > Service auth, add it to the "Meal cost worker only" policy, and update both secrets with `wrangler secret put`.

## Rotating the key

```bash
openssl rand -hex 32 | tr -d '\n' > ~/.config/mealcost/llama.key
launchctl kickstart -k gui/$(id -u)/com.mealcost.llama     # or: systemctl --user restart llama
npx wrangler secret put LLAMA_KEY
```

## Troubleshooting

| Symptom in the app | Likely cause |
| --- | --- |
| "The receipt model is offline right now" | The laptop is asleep or offline, the tunnel is not running, or Access rejected the worker (check the secrets and token expiry). |
| "Receipt scanning failed. Try again." | Key mismatch between `LLAMA_KEY` and the key file, or the model is still loading. |
| "Receipt scanning is not set up on the server" | `LLAMA_URL` is not set on the worker. |
| "You have scanned a lot of receipts lately" | The rate limit: 8 an hour, 30 a day per user. |
| `Invalid API Key` in the model log | Someone or something called the model without the key. Expected for probes. |

Check the tunnel with `cloudflared tunnel info llama-home` and the log files above.
