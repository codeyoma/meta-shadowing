# Testing on a phone

Use the same trusted Wi-Fi network on the Mac and phone. Do not expose the development server through router port forwarding or a public tunnel.

1. Find the Mac's Wi-Fi IP with `ipconfig getifaddr en0` (the Wi-Fi interface may differ on another Mac).
2. Stop the existing development server for this checkout before starting another one.
3. With Node 24, replace `<MAC_WIFI_IP>` below with that address:

   ```sh
   DEV_ALLOWED_ORIGINS=<MAC_WIFI_IP> npm run dev:lan
   ```

4. Open `http://<MAC_WIFI_IP>:3000` in Safari or Chrome on the phone, enter the beta password, then sign in with Google. The exact callback for this origin must be configured as described in [learner sign-in](learner-google-login.md). Keep the Mac awake and the server running.

`DEV_ALLOWED_ORIGINS` is an explicit, comma-separated hostname allowlist for Next.js development assets and live reload. Do not use a wildcard or put a protocol or port in it. The IP remains local configuration, not a tracked infrastructure value. If DHCP changes the Mac's address, restart with the new value.

The listener also retains localhost access. The local session-ID fallback uses Web Crypto random bytes, without weakening learner authentication, production cookies, or hosted database policies. Google OAuth still needs an approved callback URL for the origin being used; prefer the approved HTTPS Preview for real-account sign-in.

## What this verifies

LAN HTTP is suitable for responsive layout, login, lesson selection, audio, controls, and local progress. It is not encrypted: use only a trusted private network, and do not perform administrator setup over it.

For HTTPS-only behavior such as Screen Wake Lock and full home-screen/PWA acceptance, use the approved protected HTTPS Preview. Do not disable deployment protection or install a system-wide certificate just to get a green check. A desktop mobile viewport does not replace testing on an actual phone.

If the phone cannot connect, confirm the same Wi-Fi, the current IP, and that the server is still running. Guest-network/client isolation, a VPN, or a firewall can prevent access. Do not disable the firewall; allow only the required app after reviewing the prompt.

References: [Next.js development origins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins), [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts), [Web Crypto random bytes](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/getRandomValues).
