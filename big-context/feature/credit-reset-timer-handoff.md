# Credit indicator reset timer

The Planet View OpenRouter credit indicator now shows an always-visible `Key resets in …` countdown below the allowance bar, including while collapsed. Its tooltip shows the local reset date/time and clarifies that account credits and provider limits also affect model availability.

The main process derives a fixed reset timestamp from the provider-reported key cadence: daily at midnight UTC, weekly on Monday at midnight UTC, monthly on the first at midnight UTC. Source: https://openrouter.ai/docs/api/api-reference/api-keys/create-keys . Unlimited, unknown and non-resetting allowances never get an invented countdown. A stale snapshot retains its original deadline and is marked last known; reaching zero requests a usage refresh without assuming funds or model availability. Provider backoff still applies.

The display ticks once per second while the window is focused and visible. It does not poll the provider once per second. Existing minute polling, focus refresh, key isolation and error behavior remain intact. Restart Electron for the additive usage snapshot field.

Verification: 10 focused deterministic tests pass, including UTC/leap-day/year boundaries, missing reset data and countdown expiry. Strict TypeScript and production build pass. The affected Electron smoke passes, including the countdown while collapsed, visible advancement, narrow layout, provider errors and restart; results are recorded under ignored `test-results/usage-monitor.json` using synthetic transport.
