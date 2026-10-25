# ASI requirements

## ADDED: distribution / agent skill lifecycle

Installing and upgrading installs or refreshes the matching bundled skill for detected Claude Code and Codex
configurations. Automatic writes can be skipped by flag or environment. Existing identical skills are unchanged;
foreign and linked skills are preserved and reported. Uninstall previews and removes recognized skill files,
leaving foreign and linked files alone. Install, refresh, skip and preservation have focused tests.
