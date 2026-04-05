# Tapestry API repository instructions

This repository follows a modular backend architecture.

Core request flow:

- Routes define HTTP endpoints and wire middleware
- Services handle HTTP orchestration and response shaping
- Handlers contain business logic, for the core work of the request

Rules:

- Do not place business logic directly in routes
- Do not overload services with logic that belongs in handlers
- Reuse existing module patterns before introducing new abstractions
- Keep module boundaries clean and intentional
- When adding new behavior, decide explicitly whether it belongs in:
  - route layer
  - service layer
  - handler layer
  - model/data layer
  - shared utility or middleware
- Prefer consistency with neighboring module code over clever new patterns
- Avoid duplicate implementations across modules when a shared abstraction is warranted
