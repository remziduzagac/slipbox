# Dependency and upkeep proposals

## Dependency execution and packaging

- Assess isolation for parsing, spelling, typesetting and export from actual input exposure, authority and required
  termination guarantees. Assessment agreed in ENG-D12; specific process/sandbox choices remain open.
- Consider optional components or smaller distributions only after inspecting shipped artifacts and reachability.
  No feature removal or packaging change is selected by dependency count alone (ENG-D12).


## Repository upkeep follow-ups

- S1: a reviewed runtime package-set baseline in the dependency gate, derived counts and reasons for additions.
  Accepted as upkeep follow-up; scheduling and implementation belong with repository maintenance.
- S5: audit the site's actual lockfile and trigger on its changes; check build dependency licences without adding
  them to binary notices. Accepted as upkeep follow-up; no parent files changed by ENG.
- S7: optional deduplicated measurements of parser/export closure contributions, startup cost and actual use.
  No dependency replacement selected; any change must respect D184 and the settled-design process in D210.
