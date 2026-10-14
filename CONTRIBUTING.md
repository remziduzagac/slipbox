# Contributing to slipbox

Thank you for wanting to help. slipbox has one maintainer. Anyone can report a bug, ask a question or suggest an idea.
For now, pull requests come from collaborators only.

Everyone in slipbox's spaces follows the [code of conduct](CODE_OF_CONDUCT.md).

## Reporting a bug

Open an issue with the bug form: <https://github.com/remziduzagac/slipbox/issues/new/choose>. It asks for:

- the version (`slipbox --version`) and how you installed slipbox;
- your operating system and terminal;
- what happened, what you expected, and the steps to make it happen.

The smallest note or folder that shows the bug helps most. [Troubleshooting](docs/manual/troubleshooting.md) may have
the answer already.

## Questions and ideas

Ask a question, or suggest an idea, in Discussions: <https://github.com/remziduzagac/slipbox/discussions>. Issues are
for bugs.

## A vulnerability

Report it privately, as the [security policy](SECURITY.md) says. Never put its details in a public issue, discussion or
pull request.

## Pull requests

Pull requests come from collaborators for now, since one maintainer can't review outside code as well as it deserves.
If you'd like to change something, start a discussion first.

A pull request:

- has a Conventional Commit for its title (`fix(export): …`, `feat(cli): …`, `!` for a breaking change). It becomes the
  subject of the squashed commit;
- makes one change, and updates [the documentation](docs/README.md) and the README where users will see it, and
  [the blueprint](blueprint/README.md) where the design changes;
- has a test that fails without the fix, for a bug fixed, and a test that exercises it, for new behaviour;
- passes `bun run check`, as CI checks again;
- names the agent in a `Co-Authored-By:` trailer, for a commit made with an AI agent.

The maintainer merges it with a squash. [AGENTS.md](AGENTS.md) holds the rules the code keeps, for people and agents
alike.

## Building and testing

The README's [Development](README.md#development) section says how to run slipbox from its source and check a change.
[ARCHITECTURE.md](ARCHITECTURE.md) maps the code, and [the testing design](blueprint/design/testing.md) describes the
tests.
