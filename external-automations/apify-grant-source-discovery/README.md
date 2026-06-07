# GrantsCopilot Apify Grant-Source Discovery

This Apify Actor searches for UK, EU, and global grant-source pages, formats them for GrantsCopilot, and posts them to:

```text
https://www.grantscopilot.com/api/internal/grant-sources/import
```

## Required Apify secrets / environment variables

Set these on the Actor in Apify Console:

```text
APIFY_TOKEN=<fresh Apify API token>
APP_URL=https://www.grantscopilot.com
INTERNAL_API_SECRET=<same value as production GrantsCopilot INTERNAL_API_SECRET>
```

Do not paste secrets into the Actor source code.

## Recommended schedule

Run daily at 07:20 Europe/London.

## Input

Use the default input unless you want to override search queries:

```json
{
  "maxSources": 20,
  "queries": [
    "UK business grants official funding opportunities",
    "UKRI Innovate UK funding calls startups SMEs",
    "EU funding calls open to UK applicants",
    "European Commission grants calls proposals innovation SMEs",
    "global innovation grant open to UK businesses",
    "foundation grants UK startups technology social impact"
  ]
}
```
