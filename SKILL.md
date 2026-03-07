# AgentClick Skill Router

Use this file only to route to the right sub-skill.

Base flow:
1. Resolve `AGENTCLICK_URL` or default to `http://localhost:${AGENTCLICK_PORT:-${PORT:-38173}}`.
2. Check `GET /api/health` before creating a session.
3. If the server is not reachable, start AgentClick locally from this repo with `npm run start`, then re-check `GET /api/health`.
4. Create a session with `POST /api/review`.
5. Treat the session as live and monitor `GET /api/sessions/:id/wait`.
6. If status is `rewriting`, update with `PUT /api/sessions/:id/payload` and continue monitoring the same session until completion, timeout, or stop-monitor.

Sub-skills:
- `action_approval` -> `skills/clickui-approve/SKILL.md`
- `code_review` -> `skills/clickui-code/SKILL.md`
- `email_review` -> `skills/clickui-email/SKILL.md`
- `plan_review` -> `skills/clickui-plan/SKILL.md`
- `trajectory_review` -> `skills/clickui-trajectory/SKILL.md`
- `memory_review` and `memory_management` -> `skills/clickui-memory/SKILL.md`

Keyword routing for `UI review`:
- `action`, `approval` -> `action_approval`
- `command`, `shell`, `script`, `diff`, `code` -> `code_review`
- `email`, `draft`, `reply` -> `email_review`
- `plan`, `steps`, `strategy` -> `plan_review`
- `trajectory`, `run log` -> `trajectory_review`
- `memory`, `memory files`, `browse memory` -> `skills/clickui-memory/SKILL.md`
