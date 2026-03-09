# Contributing to AgentClick

Thank you for your interest in contributing!

## Getting Started

```bash
git clone https://github.com/agentlayer-io/AgentClick.git
cd AgentClick
npm install
npm run dev
```

- Server runs at `http://localhost:38173`
- Web UI runs at `http://localhost:5173`

## How to Contribute

1. Fork the repository
2. Create a branch: `git checkout -b feat/your-feature`
3. Make your changes
4. Test locally with `npm run dev`
5. Build to verify: `npm run build`
6. Submit a pull request

## Commit Style

Keep commits atomic — one thing per commit. Use a short prefix:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `chore:` maintenance (deps, build, version bumps)

## Project Structure

```
packages/
  server/   Express API server (TypeScript)
  web/      React + Vite frontend (TypeScript + Tailwind)
skills/
  clickui-approve/      Action approval skill
  clickui-code/         Code review skill
  clickui-email/        Email live session skill
  clickui-plan/         Plan review skill
  clickui-trajectory/   Trajectory review skill
  clickui-memory/       Memory review skill
```

## Skill Development

Each skill lives in `skills/<name>/SKILL.md`. If you add or modify a skill, make sure it works for both local (Claude Code, Codex) and Docker (OpenClaw) environments. See existing skills for the polling pattern.

## Reporting Issues

Open an issue at [github.com/agentlayer-io/AgentClick/issues](https://github.com/agentlayer-io/AgentClick/issues) with steps to reproduce and your environment details.
