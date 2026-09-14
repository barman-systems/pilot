# DABBIR Repository Hygiene Policy

## Purpose
Keep GitHub work queues small, intentional, and attributable. Open items are active work or real blockers, not storage.

## Pull requests
- Target: no more than 3 concurrent human-authored PRs unless an incident requires a temporary exception.
- Every human PR must have one explicit objective and a concrete next action.
- Superseded, duplicate, abandoned, or bot-generated routine version-update PRs are closed instead of parked.
- Trust-root changes under `.github/` remain subject to repository security review; hygiene is not permission to bypass gates.
- Dependency version maintenance is done deliberately in a maintenance window. Dependabot security updates remain separate from routine version churn.

## Issues
Open Issues represent active work or a real blocker with a next action. Evidence-only history belongs in the canonical issue or documentation instead of spawning a new issue for every observation.

Use these operational states in issue/PR descriptions or labels where available:
- NOW: active execution.
- BLOCKED: cannot advance until a named condition changes.
- READY: evidence complete and ready for the next governed action.

An open item without a next action is not an active queue item: close it or move it to backlog/project tracking.

## Daily invariant
Repository cleanup is preventive, not a daily manual sweep. Automation must not be allowed to refill the execution queue with routine maintenance noise.
