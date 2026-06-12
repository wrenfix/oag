---
name: tweetclaw
description: Use the TweetClaw OpenClaw plugin for approval-gated X/Twitter workflows. Covers installation, runtime checks, credential boundaries, and safe use for tweet search, reply search, posting, media, monitors, webhooks, follower export, user lookup, direct messages, and giveaway draws.
homepage: https://github.com/Xquik-dev/tweetclaw
---

# TweetClaw

Use this skill when a user asks an agent to work with X/Twitter through OpenClaw and wants a structured tool instead of browser automation or copied account state.

## Install

Install the published OpenClaw plugin from npm:

```bash
openclaw plugins install npm:@xquik/tweetclaw
```

Update an existing install with the tracked plugin id:

```bash
openclaw plugins update tweetclaw
```

For reproducible environments, pin a published version:

```bash
openclaw plugins install npm:@xquik/tweetclaw@<version> --pin
```

After installing or updating, inspect the runtime before live work:

```bash
openclaw plugins inspect tweetclaw --runtime --json
openclaw skills info tweetclaw
```

The runtime should expose the free `explore` catalog tool, the optional `tweetclaw` endpoint invoker, a `before_tool_call` approval hook, and the `xtrends` command.

If the skill is visible but the tools are not callable, allow the two TweetClaw tools without replacing the rest of the tool profile:

```bash
openclaw config set tools.alsoAllow '["explore", "tweetclaw"]'
```

## Credential Boundaries

Store credentials in OpenClaw plugin config, never in chat, docs, issue text, source files, screenshots, logs, or copied skill content.

Account-backed mode uses an Xquik API key:

```bash
openclaw config set plugins.entries.tweetclaw.config.apiKey "$XQUIK_API_KEY"
```

Read-only pay-per-use mode uses an MPP signing key:

```bash
openclaw config set plugins.entries.tweetclaw.config.tempoSigningKey "$MPP_SIGNING_KEY"
```

MPP mode is read-only. Do not use it for posting, replies, direct messages, account-backed media, monitors, webhooks, profile changes, or other write-like actions.

## Safe Workflow

1. Use `explore` first to find the exact catalog endpoint for the user's task.
2. Confirm the user owns or is authorized to access any account-scoped data.
3. For paid, private, recurring, extraction, monitor, webhook, or write-like actions, summarize the target, account, requested action, final text or media list when relevant, and scope.
4. Wait for explicit user confirmation before calling `tweetclaw`.
5. Treat approval as one-time only. Ask again when the target, text, account, cost, recurrence, or scope changes.

Never use TweetClaw for spam, harassment, deceptive engagement, impersonation, credential collection, platform evasion, unsolicited bulk messages, or bulk follow, like, retweet, or reply campaigns.

## Common Jobs

Use TweetClaw for:

- Search tweets and search tweet replies
- Look up users and export followers or following
- Post tweets and post tweet replies after approval
- Upload or download media
- Read or send direct messages after approval
- Create monitors and webhooks after approval
- Run giveaway draws from tweet replies
- Check X trends and account status

Do not use TweetClaw for X ads, scheduling future posts, generic analytics dashboards, or browsing X in a browser.

## Documentation

- TweetClaw repository: <https://github.com/Xquik-dev/tweetclaw>
- Xquik docs: <https://docs.xquik.com>
- OpenClaw docs: <https://docs.openclaw.ai>
