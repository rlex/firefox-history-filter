# Privacy

History Filter does not send data anywhere. It does not make network requests,
collect telemetry, use analytics, or share data with third parties.

## Browser history

The extension requests Firefox's `history` permission so it can remove matching
URLs from local browser history. Matching is performed locally in Firefox.

## Rules and settings

Rules and settings are stored in Firefox storage:

- By default, settings are stored locally on the current Firefox profile.
- If `Sync settings` is enabled, rules and settings are stored in Firefox Sync.
  Sync is handled by Firefox and Mozilla account settings, not by this
  extension.

## Recent removals log

The optional `Recent removals log` setting is disabled by default. If enabled,
the extension stores the last 50 removed URLs, matching rule, and removal time
in local Firefox storage only. These entries are not synced.

Turning the log off stops new entries from being written. Existing entries stay
local until cleared from the settings page.

## Data collection

The extension declares no data collection in its Firefox manifest:

```json
"data_collection_permissions": {
  "required": ["none"]
}
```
