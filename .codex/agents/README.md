# Codex Agents

Put project-local Codex agent definitions here when this repo has Claude agents to convert.

Conversion rule:

- Claude agents live in `.claude/agents/*.md`.
- Codex agents live here as `.toml`.
- Convert the Claude agent body into a `developer_instructions` TOML field.
- Keep long reusable project rules in `AGENTS.md`; agent TOML files should only contain role-specific behavior.

There are currently no `.claude/agents/` files in this repo to convert.
