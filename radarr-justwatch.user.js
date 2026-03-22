// ==UserScript==
// @name         Radarr JustWatch Streaming Availability
// @namespace    http://tampermonkey.net/
// @version      2.5.0
// @description  Adds a JustWatch streaming availability panel to Radarr movie detail pages
// @author       Dan Berkowitz
// @match        http://localhost:7878/*
// @match        http://127.0.0.1:7878/*
// @match        http://*/*:7878/*
// @match        http://*/radarr/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      apis.justwatch.com
// @connect      images.justwatch.com
// ==/UserScript==

(function () {
  'use strict';

  // --- Config ---

  // Monetization types to show. Remove a type to hide that category entirely.
  // Available: 'FLATRATE' (subscription), 'ADS' (free with ads), 'FREE', 'RENT', 'BUY'
  const INCLUDED_TYPES = ['FLATRATE', 'ADS', 'FREE'];

  // Add provider clearNames here to hide specific services regardless of type.
  // Check the browser console "[JW] Match:" line to see exact names for your region.
  const EXCLUDED_PROVIDERS = [
    'Netflix Standard with Ads',
  ];

  const PANEL_ID = 'jw-streaming-panel';

  // ---------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------
  GM_addStyle(`
    /* Prevent synopsis from being clipped when the Stream On panel is added */
    [class*="MovieDetails-header-"] {
      min-height: 500px !important;
      max-height: none !important;
    }
    #${PANEL_ID} {
      margin-top: 1px;
      padding: 5px 10px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      font-family: inherit;
    }
    #${PANEL_ID} .jw-panel-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 5px;
    }
    #${PANEL_ID} .jw-panel-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.45);
    }
    #${PANEL_ID} .jw-panel-label a {
      color: rgba(255, 255, 255, 0.45);
    }
    #${PANEL_ID} .jw-panel-divider {
      flex: 1;
      height: 1px;
      background: rgba(255, 255, 255, 0.08);
    }
    #${PANEL_ID} .jw-provider-list {
      display: flex;
      flex-wrap: nowrap;
      gap: 10px;
      align-items: flex-start;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
    }
    #${PANEL_ID} .jw-provider-list::-webkit-scrollbar {
      height: 3px;
    }
    #${PANEL_ID} .jw-provider-list::-webkit-scrollbar-track {
      background: transparent;
    }
    #${PANEL_ID} .jw-provider-list::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 2px;
    }
    #${PANEL_ID} .jw-provider-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
      gap: 5px;
      opacity: 0.85;
    }
    #${PANEL_ID} .jw-provider-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      object-fit: cover;
      display: block;
    }
    #${PANEL_ID} .jw-provider-name {
      font-size: 9px;
      color: rgba(255, 255, 255, 0.5);
      text-align: center;
      max-width: 48px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #${PANEL_ID} .jw-status {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.4);
      font-style: italic;
    }
    #${PANEL_ID} .jw-not-available {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.35);
    }
  `);

  // ---------------------------------------------------------------
  // Get movie title from the Radarr page
  // Radarr sets <title> to "Movie Name (2016) - Radarr"
  // ---------------------------------------------------------------
  function getMovieInfo() {
    const pageTitle = document.title || '';
    const match = pageTitle.match(/^(.+?)(?:\s*\((\d{4})\))?\s*-\s*Radarr/i);
    if (!match) return { title: null, year: null };
    return {
      title: match[1].trim(),
      year: match[2] ? parseInt(match[2], 10) : null
    };
  }

  const IMG_BASE = 'https://images.justwatch.com';

  // Single GraphQL query — search by title, return all offers
  function searchTitleGraphQL(title, year, callback) {
    const gql = `query SearchTitles($searchQuery: String!, $country: Country!, $language: Language!) {
      popularTitles(country: $country, first: 10, filter: { searchQuery: $searchQuery, objectTypes: [MOVIE] }) {
        edges {
          node {
            id
            ... on Movie {
              content(country: $country, language: $language) { title originalReleaseYear }
              offers(country: $country, platform: WEB) {
                monetizationType
                package { id clearName icon }
              }
            }
          }
        }
      }
    }`;

    GM_xmlhttpRequest({
      method: 'POST',
      url: 'https://apis.justwatch.com/graphql',
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ query: gql, variables: { searchQuery: title, country: 'US', language: 'en' } }),
      onload: function (response) {
        try {
          const data = JSON.parse(response.responseText);
          const edges = (data.data && data.data.popularTitles && data.data.popularTitles.edges) || [];

          const titleLower = title.toLowerCase();
          let match = null;

          if (year) {
            match = edges.find(e =>
              e.node.content &&
              e.node.content.title.toLowerCase() === titleLower &&
              Math.abs((e.node.content.originalReleaseYear || 0) - year) <= 1
            );
          }
          if (!match) {
            match = edges.find(e => e.node.content && e.node.content.title.toLowerCase() === titleLower);
          }
          if (!match && edges.length > 0) match = edges[0];

          if (!match) { callback([], null); return; }

          const node = match.node;
          const jwUrl = 'https://www.justwatch.com/us/movie/' + node.id.replace('tm', '');

          const seen = new Set();
          const providers = (node.offers || []).filter(o => {
            if (!INCLUDED_TYPES.includes(o.monetizationType)) return false;
            if (EXCLUDED_PROVIDERS.includes(o.package.clearName)) return false;
            if (seen.has(o.package.id)) return false;
            seen.add(o.package.id);
            return true;
          }).map(o => ({
            name: o.package.clearName,
            icon: IMG_BASE + o.package.icon.replace('{profile}', 's100').replace('{format}', 'webp')
          }));

          console.log('[JW] Match:', node.content && node.content.title, '| providers:', providers.length);
          console.log('[JW] provider names:', providers.map(p => `'${p.name}'`).join(', '));
          callback(providers, jwUrl);
        } catch (e) {
          console.error('[JW] GraphQL parse error:', e);
          callback([], null);
        }
      },
      onerror: function (err) {
        console.error('[JW] GraphQL request error:', err);
        callback([], null);
      }
    });
  }

  // ---------------------------------------------------------------
  // Find the anchor element:
  // The last div whose class contains "MovieDetails-details-"
  // ---------------------------------------------------------------
  function findAnchor() {
    const all = document.querySelectorAll('[class*="MovieDetails-details-"]');
    const filtered = Array.from(all).filter(el => el.id !== PANEL_ID && !el.closest('#' + PANEL_ID));
    return filtered.length > 0 ? filtered[filtered.length - 1] : null;
  }

  // ---------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------
  function makeHeader() {
    const header = document.createElement('div');
    header.className = 'jw-panel-header';
    header.innerHTML = `<span class="jw-panel-label"><a href="https://www.justwatch.com/us/" target="_blank">JustWatch</a> Stream On:</span><div class="jw-panel-divider"></div>`;
    return header;
  }

  function removePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) existing.remove();
  }

  function insertAfterAnchor(panel) {
    const anchor = findAnchor();
    if (!anchor) { console.warn('[JW] Anchor element not found'); return false; }
    anchor.parentNode.insertBefore(panel, anchor.nextSibling);
    return true;
  }

  function renderLoading() {
    removePanel();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.appendChild(makeHeader());
    const status = document.createElement('span');
    status.className = 'jw-status';
    status.textContent = 'Checking JustWatch\u2026';
    panel.appendChild(status);
    insertAfterAnchor(panel);
  }

  function renderPanel(providers, jwUrl) {
    removePanel();
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.appendChild(makeHeader());

    const body = document.createElement('div');

    if (!providers || providers.length === 0) {
      body.innerHTML = `<span class="jw-not-available">Not available for streaming in the US</span>`;
    } else {
      const list = document.createElement('div');
      list.className = 'jw-provider-list';

      for (const p of providers) {
        const item = document.createElement('div');
        item.className = 'jw-provider-item';
        item.title = p.name;

        const img = document.createElement('img');
        img.className = 'jw-provider-icon';
        img.src = p.icon;
        img.alt = p.name;
        img.loading = 'lazy';
        item.appendChild(img);

        const label = document.createElement('span');
        label.className = 'jw-provider-name';
        label.textContent = p.name;
        item.appendChild(label);

        list.appendChild(item);
      }

      body.appendChild(list);
    }

    panel.appendChild(body);
    insertAfterAnchor(panel);
  }

  // ---------------------------------------------------------------
  // Main injection logic
  // ---------------------------------------------------------------
  function inject() {
    const anchor = findAnchor();
    if (!anchor) return;

    const next = anchor.nextSibling;
    if (next && next.id === PANEL_ID) return;

    const { title, year } = getMovieInfo();
    if (!title) {
      console.warn('[JW] Could not determine movie title. document.title =', document.title);
      return;
    }

    console.log('[JW] Looking up:', title, year ? `(${year})` : '(no year)');
    renderLoading();

    searchTitleGraphQL(title, year, function (providers, jwUrl) {
      renderPanel(providers, jwUrl);
    });
  }

  // ---------------------------------------------------------------
  // Watch for Radarr's React router navigating to a movie page
  // ---------------------------------------------------------------
  let lastUrl = location.href;
  let injectTimeout = null;

  function scheduleInject() {
    clearTimeout(injectTimeout);
    injectTimeout = setTimeout(inject, 900);
  }

  const observer = new MutationObserver(function () {
    const urlChanged = location.href !== lastUrl;
    if (urlChanged) {
      lastUrl = location.href;
      removePanel();
    }
    const anchor = findAnchor();
    if (anchor && (!document.getElementById(PANEL_ID) || urlChanged)) {
      scheduleInject();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  scheduleInject();

})();
