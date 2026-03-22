# Radarr JustWatch Streaming Availability

A Tampermonkey userscript that adds a **Stream On** panel to Radarr movie detail pages, showing which streaming services currently have the movie available in your region.

![Tampermonkey](https://img.shields.io/badge/Tampermonkey-00485B?style=flat&logo=tampermonkey&logoColor=white)
![JustWatch](https://img.shields.io/badge/Powered%20by-JustWatch-FFD700?style=flat)

---

## What it does

When you open a movie in Radarr, the script queries JustWatch and injects a small panel above the movie details showing provider icons for every service currently streaming that title. Subscription, free, and ad-supported services are all shown by default. Rent and buy options are hidden.

---

## Requirements

- [Tampermonkey](https://www.tampermonkey.net/) installed in your browser
- Radarr accessible via a browser (tested on Firefox with Tampermonkey)

---

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. Open the [raw script file](../../raw/main/radarr-justwatch.user.js)
3. Tampermonkey will detect the `.user.js` extension and prompt you to install — click **Install**

---

## Setup

By default the script matches these URL patterns:

```
http://localhost:7878/*
http://127.0.0.1:7878/*
http://*/*:7878/*
http://*/radarr/*
```

If your Radarr runs on a different port or address, open the script in the Tampermonkey editor and add your own `@match` line, for example:

```js
// @match        http://192.168.1.100:7878/*
```

---

## Configuration

All options are at the top of the script file.

### `INCLUDED_TYPES`

Controls which monetization categories are shown. Remove a type to hide that category entirely.

```js
const INCLUDED_TYPES = ['FLATRATE', 'ADS', 'FREE'];
```

| Value | Description |
|-------|-------------|
| `FLATRATE` | Subscription services (Netflix, Max, Disney+, etc.) |
| `ADS` | Free with ads (Tubi, Roku Channel, Xumo Play, etc.) |
| `FREE` | Completely free (Kanopy, Hoopla, Plex, etc.) |
| `RENT` | Rental (hidden by default) |
| `BUY` | Purchase (hidden by default) |

### `EXCLUDED_PROVIDERS`

Hides specific services by name regardless of type. Useful for hiding duplicate tiers like ad-supported variants of services you already subscribe to.

```js
const EXCLUDED_PROVIDERS = [
  'Netflix Standard with Ads',
];
```

To find the exact name of a provider, open your browser console on any Radarr movie page and look for the `[JW] provider names:` log line — it lists every provider found for that title.

---

## Region

The script defaults to **United States** (`en_US`). JustWatch availability is region-specific, so results reflect US streaming availability.

To change region, find this line in the GraphQL query variables and update the `country` and `language` values:

```js
variables: { searchQuery: title, country: 'US', language: 'en' }
```

Supported locales are listed in the [JustWatch API docs](https://apis.justwatch.com/docs/api/#locales).

---

## How it works

The script uses a `MutationObserver` to detect when Radarr's React app navigates to a movie detail page. It extracts the title and year from the page `<title>` tag, queries the JustWatch GraphQL API, and injects a panel with provider icons below the movie details section.

---

## Notes

- Streaming availability data comes from JustWatch and may occasionally lag behind actual availability
- The JustWatch GraphQL API is unofficial and undocumented — if the script stops working after a JustWatch update, the API is the most likely cause
- The script does not track, collect, or transmit any data about your Radarr library
- Mostly (99%) built using Claude

---

## License

MIT
