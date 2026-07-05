# History Filter

A Firefox WebExtension that removes matching URLs from browser history as soon
as Firefox reports a visit.

Firefox WebExtensions do not provide a pre-history-write filter hook. This
extension listens to `browser.history.onVisited` and immediately calls
`browser.history.deleteUrl()` for matching URLs.

## Screenshot

![screenshot](/screenshots/ui.png?raw=true)

## Rule syntax

Add one rule per line:

```text
example.com
@example.com
*.example.com
**.example.com
example.com:8080
192.168.1.1
[2001:db8::1]
https://example.com/private
*://*.example.com/*secret*
regex:^https://example\.com/(private|tmp)/
```

- `example.com` matches only that hostname.
- `@example.com` matches that hostname and all subdomains.
- `example.com:8080` matches only that hostname on that port.
- `192.168.1.1` matches an IPv4 address. Add `:8080` to limit it to a port.
- `[2001:db8::1]` matches an IPv6 address. Add `:8080` after the closing
  bracket to limit it to a port.
- `*.example.com` matches one subdomain level, such as `a.example.com`.
- `**.example.com` matches any subdomain depth, such as `a.b.example.com`.
- URL-like rules match by prefix unless they contain `*`.
- `regex:` rules match the full URL with a case-insensitive JavaScript regular
  expression.
- Blank lines and lines starting with `#` are ignored.
- The settings page warns about duplicate rules and blocks malformed rules,
  unsupported protocols, invalid ports, and path rules without a scheme.
- Use the `Test URL` field in settings to see which rule matches a URL before
  saving or cleaning history.
- Use `Find matches` to see how many existing history URLs match and which
  rules matched them before confirming deletion.
