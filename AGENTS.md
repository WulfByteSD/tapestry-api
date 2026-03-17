# Tapestry API Guide

This repository is the backend source of truth for the Tapestry application.

## Purpose

The API supports the Tapestry ecosystem, including:

- player-facing character and campaign functionality
- storyweaver/admin tools
- shared game data and content
- system behavior that should remain consistent across frontend apps

The API should reflect Tapestry canon where mechanics or terminology matter.

## Canon Context

Relevant local docs live at:

- `../pdfs/`

When backend behavior touches mechanics, content rules, or naming, consult the canon docs first.

Priority:

1. `../pdfs/Rules And Rulings Guide.pdf`
2. `../pdfs/Tapestry Players Guide V1.pdf`
3. `../pdfs/The Unwoven - Adversary System.pdf`
4. other module/setting docs as needed

If an implementation detail would drift away from canon, do not silently invent a substitute. Preserve canon and explain the mismatch.

## API Design Expectations

- Keep the API as the backend source of truth.
- Prefer explicit, stable contracts over clever abstractions.
- Favor predictable DTOs, schemas, and response shapes.
- Avoid leaking temporary frontend assumptions into backend models.
- Preserve backwards compatibility unless the task explicitly allows breaking changes.

## Scope Discipline

- Prefer minimal, targeted changes.
- Avoid broad refactors unless requested.
- Do not change shared models or contracts casually.
- If a change impacts multiple routes, services, or schemas, explain the blast radius before proceeding.

## Safety Rules

- Do not modify env handling, auth, dependency versions, infra config, or deployment behavior unless explicitly asked.
- Do not rename public endpoints or shared payload fields without clear need.
- Do not remove fields or validation rules unless the task requires it.

## Data and Validation

- Be conservative with schema changes.
- Prefer additive changes over destructive ones.
- If migrations or seed updates are required, state that clearly.
- Preserve data integrity over convenience.

## Frontend Awareness

This API serves multiple frontend surfaces.
A backend change may affect:

- storyweaver/admin tools
- player experience
- shared packages/types/clients in the frontend monorepo

When modifying contracts, consider downstream effects.

## Working Style

- State assumptions, then proceed if risk is low.
- Ask for clarification only when the change would:
  - alter architecture,
  - break clients,
  - affect auth/security,
  - or require canon interpretation.

## Output Style

For each task:

- explain the changed files
- note contract implications
- mention migration or seed implications if any
- flag any frontend follow-up that may be needed
