# Traceability — gsnv-paint

Every requirement below has a parent need, planned design owner, verification procedure, introduction phase, full-verification phase, and explicit status. Design names are conceptual module names in the module map; a module may be implemented by multiple bricks. Procedures and pass assertions are defined in `requirements.json` and `02-REQUIREMENTS.md`.

`phase` is introduction/ownership; `verificationPhase` is the earliest planned phase that can execute the complete requirement procedure. A phase gate requires passing completed-brick and integration-seam checks. Broad requirements remain UNTESTED until the entire procedure passes; there is no partial PASS. Later integrations recheck shared behavior. Lifecycle inspections recur at relevant phase gates.

Writing a procedure establishes planned coverage only. It does not demonstrate a working capability. Statuses below reflect recorded verification evidence. A PASS for a specification or license inspection does not certify any runtime behavior.

| Need | Requirement | Introduced | Full verification | Design owner | Verification | Method | Status |
|---|---|---:|---:|---|---|---|---|
| N-002 | SYS-001 | 0 | 5 | AppShell | V-SYS-001 | I | UNTESTED |
| N-002 | SYS-002 | 1 | 4 | AppShell | V-SYS-002 | T | UNTESTED |
| N-007 | SYS-003 | 0 | 0 | Distribution | V-SYS-003 | I | UNTESTED |
| N-007 | SYS-004 | 0 | 0 | Distribution | V-SYS-004 | I | UNTESTED |
| N-007 | SYS-005 | 0 | 0 | Distribution | V-SYS-005 | I | PASS |
| N-001 | SYS-006 | 1 | 4 | Distribution | V-SYS-006 | T | UNTESTED |
| N-001 | SYS-007 | 1 | 5 | Distribution | V-SYS-007 | T | UNTESTED |
| N-001 | SYS-008 | 1 | 4 | Distribution | V-SYS-008 | T | UNTESTED |
| N-001 | SYS-009 | 1 | 4 | Distribution | V-SYS-009 | T | UNTESTED |
| N-001 | SYS-010 | 5 | 5 | Distribution | V-SYS-010 | T | UNTESTED |
| N-007 | SYS-011 | 5 | 5 | AppShell | V-SYS-011 | I | UNTESTED |
| N-007 | SYS-012 | 5 | 5 | AppShell | V-SYS-012 | T | UNTESTED |
| N-002 | SYS-013 | 1 | 4 | AppShell | V-SYS-013 | T | UNTESTED |
| N-002 | SYS-014 | 1 | 4 | AppShell | V-SYS-014 | T | UNTESTED |
| N-007 | SYS-015 | 0 | 4 | Architecture | V-SYS-015 | I | UNTESTED |
| N-007 | SYS-016 | 0 | 4 | Architecture | V-SYS-016 | I | UNTESTED |
| N-002 | CTL-001 | 1 | 4 | AppShell | V-CTL-001 | T | UNTESTED |
| N-002 | CTL-002 | 1 | 1 | AppShell | V-CTL-002 | T | UNTESTED |
| N-002 | CTL-003 | 1 | 4 | AppShell | V-CTL-003 | T | UNTESTED |
| N-002 | CTL-004 | 1 | 4 | AppShell | V-CTL-004 | T | UNTESTED |
| N-002 | CTL-005 | 1 | 4 | AppShell | V-CTL-005 | T | UNTESTED |
| N-002 | CTL-006 | 1 | 4 | AppShell | V-CTL-006 | T | UNTESTED |
| N-002 | CTL-007 | 1 | 4 | AppShell | V-CTL-007 | T | UNTESTED |
| N-002 | CTL-008 | 1 | 4 | AppShell | V-CTL-008 | T | UNTESTED |
| N-002 | CTL-009 | 1 | 4 | AppShell | V-CTL-009 | T | UNTESTED |
| N-002 | CTL-010 | 1 | 4 | AppShell | V-CTL-010 | T | UNTESTED |
| N-002 | CTL-011 | 1 | 4 | AppShell | V-CTL-011 | T | UNTESTED |
| N-002 | CTL-012 | 1 | 4 | AppShell | V-CTL-012 | T | UNTESTED |
| N-002 | CTL-013 | 1 | 4 | AppShell | V-CTL-013 | T | UNTESTED |
| N-002 | CTL-014 | 1 | 4 | AppShell | V-CTL-014 | T | UNTESTED |
| N-002 | CTL-015 | 1 | 4 | AppShell | V-CTL-015 | T | UNTESTED |
| N-002 | CTL-016 | 1 | 1 | AppShell | V-CTL-016 | T | UNTESTED |
| N-002 | CTL-017 | 1 | 4 | AppShell | V-CTL-017 | T | UNTESTED |
| N-002 | CTL-018 | 1 | 4 | AppShell | V-CTL-018 | T | UNTESTED |
| N-002 | CTL-019 | 1 | 4 | AppShell | V-CTL-019 | T | UNTESTED |
| N-002 | CTL-020 | 1 | 4 | CommandHistory | V-CTL-020 | T | UNTESTED |
| N-002 | CTL-021 | 1 | 1 | CommandHistory | V-CTL-021 | T | UNTESTED |
| N-002 | CTL-022 | 1 | 4 | CommandHistory | V-CTL-022 | T | UNTESTED |
| N-002 | CTL-023 | 1 | 4 | CommandHistory | V-CTL-023 | T | UNTESTED |
| N-002 | CTL-024 | 1 | 4 | CommandHistory | V-CTL-024 | T | UNTESTED |
| N-001 | CTL-025 | 1 | 4 | ProjectPersistence | V-CTL-025 | T | UNTESTED |
| N-001 | CTL-026 | 1 | 1 | ProjectPersistence | V-CTL-026 | T | UNTESTED |
| N-001 | CTL-027 | 1 | 1 | ProjectPersistence | V-CTL-027 | T | UNTESTED |
| N-001 | CTL-028 | 1 | 1 | ProjectPersistence | V-CTL-028 | T | UNTESTED |
| N-001 | CTL-029 | 1 | 4 | ProjectPersistence | V-CTL-029 | T | UNTESTED |
| N-001 | CTL-030 | 1 | 4 | ProjectPersistence | V-CTL-030 | T | UNTESTED |
| N-003 | CAD-001 | 2 | 2 | CADKernel | V-CAD-001 | I | UNTESTED |
| N-003 | CAD-002 | 2 | 2 | CADKernel | V-CAD-002 | I | UNTESTED |
| N-003 | CAD-003 | 2 | 2 | CADKernel | V-CAD-003 | I | UNTESTED |
| N-003 | CAD-004 | 2 | 2 | CADKernel | V-CAD-004 | T | UNTESTED |
| N-003 | CAD-005 | 2 | 2 | CADKernel | V-CAD-005 | T | UNTESTED |
| N-003 | CAD-006 | 2 | 2 | CADKernel | V-CAD-006 | I | PASS |
| N-003 | CAD-007 | 2 | 2 | CADModel | V-CAD-007 | T | UNTESTED |
| N-003 | CAD-008 | 2 | 2 | CADModel | V-CAD-008 | T | UNTESTED |
| N-003 | CAD-009 | 2 | 2 | CADModel | V-CAD-009 | T | UNTESTED |
| N-003 | CAD-010 | 2 | 2 | CADModel | V-CAD-010 | T | UNTESTED |
| N-003 | CAD-011 | 2 | 2 | CADModel | V-CAD-011 | T | UNTESTED |
| N-003 | CAD-012 | 2 | 2 | CADModel | V-CAD-012 | T | UNTESTED |
| N-003 | CAD-013 | 2 | 2 | CADModel | V-CAD-013 | T | UNTESTED |
| N-003 | CAD-014 | 2 | 2 | CADModel | V-CAD-014 | T | UNTESTED |
| N-003 | CAD-015 | 2 | 2 | CADModel | V-CAD-015 | T | UNTESTED |
| N-003 | CAD-016 | 2 | 2 | CADModel | V-CAD-016 | T | UNTESTED |
| N-003 | CAD-017 | 2 | 2 | CADModel | V-CAD-017 | T | UNTESTED |
| N-003 | CAD-018 | 2 | 2 | CADModel | V-CAD-018 | T | UNTESTED |
| N-003 | CAD-019 | 2 | 2 | CADModel | V-CAD-019 | T | UNTESTED |
| N-003 | CAD-020 | 2 | 2 | CADSketch | V-CAD-020 | T | UNTESTED |
| N-003 | CAD-021 | 2 | 2 | CADSketch | V-CAD-021 | T | UNTESTED |
| N-003 | CAD-022 | 2 | 2 | CADSketch | V-CAD-022 | T | UNTESTED |
| N-003 | CAD-023 | 2 | 2 | CADSketch | V-CAD-023 | T | UNTESTED |
| N-003 | CAD-024 | 2 | 2 | CADSketch | V-CAD-024 | T | UNTESTED |
| N-003 | CAD-025 | 2 | 2 | CADSketch | V-CAD-025 | T | UNTESTED |
| N-003 | CAD-026 | 2 | 2 | CADSketch | V-CAD-026 | T | UNTESTED |
| N-003 | CAD-027 | 2 | 2 | CADSketch | V-CAD-027 | T | UNTESTED |
| N-003 | CAD-028 | 2 | 2 | CADSketch | V-CAD-028 | T | UNTESTED |
| N-003 | CAD-029 | 2 | 2 | CADSketch | V-CAD-029 | T | UNTESTED |
| N-003 | CAD-030 | 2 | 2 | CADSketch | V-CAD-030 | T | UNTESTED |
| N-003 | CAD-031 | 2 | 2 | CADSketch | V-CAD-031 | T | UNTESTED |
| N-003 | CAD-032 | 2 | 2 | CADSketch | V-CAD-032 | T | UNTESTED |
| N-003 | CAD-033 | 2 | 2 | CADSketch | V-CAD-033 | T | UNTESTED |
| N-003 | CAD-034 | 2 | 2 | CADSketch | V-CAD-034 | T | UNTESTED |
| N-003 | CAD-035 | 2 | 2 | CADSketch | V-CAD-035 | T | UNTESTED |
| N-003 | CAD-036 | 2 | 2 | CADSketch | V-CAD-036 | T | UNTESTED |
| N-003 | CAD-037 | 2 | 2 | CADSketch | V-CAD-037 | T | UNTESTED |
| N-003 | CAD-038 | 2 | 2 | CADSketch | V-CAD-038 | T | UNTESTED |
| N-003 | CAD-039 | 2 | 2 | CADSketch | V-CAD-039 | T | UNTESTED |
| N-003 | CAD-040 | 2 | 2 | CADSketch | V-CAD-040 | T | UNTESTED |
| N-003 | CAD-041 | 2 | 2 | CADSketch | V-CAD-041 | T | UNTESTED |
| N-003 | CAD-042 | 2 | 2 | CADSketch | V-CAD-042 | T | UNTESTED |
| N-003 | CAD-043 | 2 | 2 | CADSketch | V-CAD-043 | T | UNTESTED |
| N-003 | CAD-044 | 2 | 2 | CADSketch | V-CAD-044 | T | UNTESTED |
| N-003 | CAD-045 | 2 | 2 | CADSketch | V-CAD-045 | T | UNTESTED |
| N-003 | CAD-046 | 2 | 2 | CADSketch | V-CAD-046 | T | UNTESTED |
| N-003 | CAD-047 | 2 | 2 | CADSketch | V-CAD-047 | T | UNTESTED |
| N-003 | CAD-048 | 2 | 2 | CADSketch | V-CAD-048 | T | UNTESTED |
| N-003 | CAD-049 | 2 | 2 | CADSketch | V-CAD-049 | T | UNTESTED |
| N-003 | CAD-050 | 2 | 2 | CADSketch | V-CAD-050 | T | UNTESTED |
| N-003 | CAD-051 | 2 | 2 | CADSketch | V-CAD-051 | T | UNTESTED |
| N-003 | CAD-052 | 2 | 2 | CADSketch | V-CAD-052 | T | UNTESTED |
| N-003 | CAD-053 | 2 | 2 | CADSketch | V-CAD-053 | T | UNTESTED |
| N-003 | CAD-054 | 2 | 2 | CADSketch | V-CAD-054 | T | UNTESTED |
| N-003 | CAD-055 | 2 | 2 | CADSketch | V-CAD-055 | T | UNTESTED |
| N-003 | CAD-056 | 2 | 2 | CADSketch | V-CAD-056 | T | UNTESTED |
| N-003 | CAD-057 | 2 | 2 | CADSketch | V-CAD-057 | T | UNTESTED |
| N-003 | CAD-058 | 2 | 2 | CADSketch | V-CAD-058 | T | UNTESTED |
| N-003 | CAD-059 | 2 | 2 | CADSketch | V-CAD-059 | T | UNTESTED |
| N-003 | CAD-060 | 2 | 2 | CADSketch | V-CAD-060 | T | UNTESTED |
| N-003 | CAD-061 | 2 | 2 | CADSketch | V-CAD-061 | T | UNTESTED |
| N-003 | CAD-062 | 2 | 2 | CADSketch | V-CAD-062 | T | UNTESTED |
| N-003 | CAD-063 | 2 | 2 | CADKernel | V-CAD-063 | T | UNTESTED |
| N-003 | CAD-064 | 2 | 2 | CADKernel | V-CAD-064 | T | UNTESTED |
| N-003 | CAD-065 | 2 | 2 | CADKernel | V-CAD-065 | T | UNTESTED |
| N-003 | CAD-066 | 2 | 2 | CADKernel | V-CAD-066 | T | UNTESTED |
| N-003 | CAD-067 | 2 | 2 | CADKernel | V-CAD-067 | T | UNTESTED |
| N-003 | CAD-068 | 2 | 2 | CADKernel | V-CAD-068 | T | UNTESTED |
| N-003 | CAD-069 | 2 | 2 | CADKernel | V-CAD-069 | T | UNTESTED |
| N-003 | CAD-070 | 2 | 2 | CADKernel | V-CAD-070 | T | UNTESTED |
| N-003 | CAD-071 | 2 | 2 | CADKernel | V-CAD-071 | T | UNTESTED |
| N-003 | CAD-072 | 2 | 2 | CADKernel | V-CAD-072 | T | UNTESTED |
| N-003 | CAD-073 | 2 | 2 | CADKernel | V-CAD-073 | T | UNTESTED |
| N-003 | CAD-074 | 2 | 2 | CADKernel | V-CAD-074 | T | UNTESTED |
| N-003 | CAD-075 | 2 | 2 | CADKernel | V-CAD-075 | T | UNTESTED |
| N-003 | CAD-076 | 2 | 2 | CADKernel | V-CAD-076 | T | UNTESTED |
| N-003 | CAD-077 | 2 | 2 | CADKernel | V-CAD-077 | T | UNTESTED |
| N-003 | CAD-078 | 2 | 2 | CADKernel | V-CAD-078 | T | UNTESTED |
| N-003 | CAD-079 | 2 | 2 | CADKernel | V-CAD-079 | T | UNTESTED |
| N-003 | CAD-080 | 2 | 2 | CADKernel | V-CAD-080 | T | UNTESTED |
| N-003 | CAD-081 | 2 | 2 | CADKernel | V-CAD-081 | T | UNTESTED |
| N-003 | CAD-082 | 2 | 2 | CADModel | V-CAD-082 | T | UNTESTED |
| N-003 | CAD-083 | 2 | 2 | CADModel | V-CAD-083 | T | UNTESTED |
| N-003 | CAD-084 | 2 | 2 | CADModel | V-CAD-084 | T | UNTESTED |
| N-003 | CAD-085 | 2 | 2 | CADModel | V-CAD-085 | T | UNTESTED |
| N-003 | CAD-086 | 2 | 2 | CADViewport | V-CAD-086 | T | UNTESTED |
| N-003 | CAD-087 | 2 | 2 | CADViewport | V-CAD-087 | T | UNTESTED |
| N-003 | CAD-088 | 2 | 2 | CADViewport | V-CAD-088 | T | UNTESTED |
| N-003 | CAD-089 | 2 | 2 | CADViewport | V-CAD-089 | T | UNTESTED |
| N-003 | CAD-090 | 2 | 2 | CADViewport | V-CAD-090 | T | UNTESTED |
| N-003 | CAD-091 | 2 | 2 | CADViewport | V-CAD-091 | T | UNTESTED |
| N-003 | CAD-092 | 2 | 2 | CADViewport | V-CAD-092 | T | UNTESTED |
| N-003 | CAD-093 | 2 | 2 | CADViewport | V-CAD-093 | T | UNTESTED |
| N-003 | CAD-094 | 2 | 2 | CADViewport | V-CAD-094 | T | UNTESTED |
| N-003 | CAD-095 | 2 | 2 | CADViewport | V-CAD-095 | T | UNTESTED |
| N-003 | CAD-096 | 2 | 2 | CADViewport | V-CAD-096 | T | UNTESTED |
| N-003 | CAD-097 | 2 | 2 | CADViewport | V-CAD-097 | T | UNTESTED |
| N-003 | CAD-098 | 2 | 2 | CADViewport | V-CAD-098 | T | UNTESTED |
| N-003 | CAD-099 | 2 | 2 | CADViewport | V-CAD-099 | T | UNTESTED |
| N-003 | CAD-100 | 2 | 2 | CADViewport | V-CAD-100 | T | UNTESTED |
| N-003 | CAD-101 | 2 | 2 | CADViewport | V-CAD-101 | T | UNTESTED |
| N-003 | CAD-102 | 2 | 2 | CADViewport | V-CAD-102 | T | UNTESTED |
| N-003 | CAD-103 | 2 | 2 | CADViewport | V-CAD-103 | T | UNTESTED |
| N-003 | CAD-104 | 2 | 2 | CADViewport | V-CAD-104 | T | UNTESTED |
| N-003 | CAD-105 | 2 | 2 | CADViewport | V-CAD-105 | T | UNTESTED |
| N-003 | CAD-106 | 2 | 2 | CADKernel | V-CAD-106 | T | UNTESTED |
| N-003 | CAD-107 | 2 | 2 | CADKernel | V-CAD-107 | T | UNTESTED |
| N-003 | CAD-108 | 2 | 2 | CADKernel | V-CAD-108 | T | UNTESTED |
| N-003 | CAD-109 | 2 | 2 | CADKernel | V-CAD-109 | T | UNTESTED |
| N-003 | CAD-110 | 2 | 2 | CADKernel | V-CAD-110 | T | UNTESTED |
| N-003 | CAD-111 | 2 | 2 | CADKernel | V-CAD-111 | T | UNTESTED |
| N-003 | CAD-112 | 2 | 2 | CADKernel | V-CAD-112 | T | UNTESTED |
| N-003 | CAD-113 | 2 | 2 | CADExchange | V-CAD-113 | T | UNTESTED |
| N-003 | CAD-114 | 2 | 2 | CADExchange | V-CAD-114 | T | UNTESTED |
| N-003 | CAD-115 | 2 | 2 | CADExchange | V-CAD-115 | T | UNTESTED |
| N-003 | CAD-116 | 2 | 2 | CADExchange | V-CAD-116 | T | UNTESTED |
| N-003 | CAD-117 | 2 | 2 | CADExchange | V-CAD-117 | T | UNTESTED |
| N-003 | CAD-118 | 2 | 2 | CADExchange | V-CAD-118 | T | UNTESTED |
| N-003 | CAD-119 | 2 | 2 | CADExchange | V-CAD-119 | T | UNTESTED |
| N-003 | CAD-120 | 2 | 2 | CADExchange | V-CAD-120 | T | UNTESTED |
| N-003 | CAD-121 | 2 | 2 | CADExchange | V-CAD-121 | T | UNTESTED |
| N-003 | CAD-122 | 2 | 2 | CADKernel | V-CAD-122 | T | UNTESTED |
| N-003 | CAD-123 | 2 | 2 | CADKernel | V-CAD-123 | T | UNTESTED |
| N-003 | CAD-124 | 2 | 2 | CADKernel | V-CAD-124 | T | UNTESTED |
| N-004 | IMG-001 | 3 | 3 | ImageDocument | V-IMG-001 | T | UNTESTED |
| N-004 | IMG-002 | 3 | 3 | ImageDocument | V-IMG-002 | T | UNTESTED |
| N-004 | IMG-003 | 3 | 3 | ImageDocument | V-IMG-003 | T | UNTESTED |
| N-004 | IMG-004 | 3 | 3 | ImageDocument | V-IMG-004 | T | UNTESTED |
| N-004 | IMG-005 | 3 | 3 | ImageDocument | V-IMG-005 | T | UNTESTED |
| N-004 | IMG-006 | 3 | 3 | ImageDocument | V-IMG-006 | T | UNTESTED |
| N-004 | IMG-007 | 3 | 3 | ImageDocument | V-IMG-007 | T | UNTESTED |
| N-004 | IMG-008 | 3 | 3 | ImageDocument | V-IMG-008 | T | UNTESTED |
| N-004 | IMG-009 | 3 | 3 | ImageDocument | V-IMG-009 | T | UNTESTED |
| N-004 | IMG-010 | 3 | 3 | ImageDocument | V-IMG-010 | T | UNTESTED |
| N-004 | IMG-011 | 3 | 3 | ImageDocument | V-IMG-011 | T | UNTESTED |
| N-004 | IMG-012 | 3 | 3 | ImageDocument | V-IMG-012 | T | UNTESTED |
| N-004 | IMG-013 | 3 | 3 | ImageViewport | V-IMG-013 | T | UNTESTED |
| N-004 | IMG-014 | 3 | 3 | ImageViewport | V-IMG-014 | T | UNTESTED |
| N-004 | IMG-015 | 3 | 3 | ImageViewport | V-IMG-015 | T | UNTESTED |
| N-004 | IMG-016 | 3 | 3 | ImageViewport | V-IMG-016 | T | UNTESTED |
| N-004 | IMG-017 | 3 | 3 | ImageViewport | V-IMG-017 | T | UNTESTED |
| N-004 | IMG-018 | 3 | 3 | ImageViewport | V-IMG-018 | T | UNTESTED |
| N-004 | IMG-019 | 3 | 3 | ImagePixels | V-IMG-019 | T | UNTESTED |
| N-004 | IMG-020 | 3 | 3 | ImagePixels | V-IMG-020 | T | UNTESTED |
| N-004 | IMG-021 | 3 | 3 | ImagePixels | V-IMG-021 | T | UNTESTED |
| N-004 | IMG-022 | 3 | 3 | ImagePixels | V-IMG-022 | T | UNTESTED |
| N-004 | IMG-023 | 3 | 3 | ImagePixels | V-IMG-023 | T | UNTESTED |
| N-004 | IMG-024 | 3 | 3 | ImagePixels | V-IMG-024 | T | UNTESTED |
| N-004 | IMG-025 | 3 | 3 | ImagePixels | V-IMG-025 | T | UNTESTED |
| N-004 | IMG-026 | 3 | 3 | ImagePixels | V-IMG-026 | T | UNTESTED |
| N-004 | IMG-027 | 3 | 3 | ImagePixels | V-IMG-027 | T | UNTESTED |
| N-004 | IMG-028 | 3 | 3 | ImagePixels | V-IMG-028 | T | UNTESTED |
| N-004 | IMG-029 | 3 | 3 | ImagePixels | V-IMG-029 | T | UNTESTED |
| N-004 | IMG-030 | 3 | 3 | ImagePixels | V-IMG-030 | T | UNTESTED |
| N-004 | IMG-031 | 3 | 3 | ImagePixels | V-IMG-031 | T | UNTESTED |
| N-004 | IMG-032 | 3 | 3 | ImagePixels | V-IMG-032 | T | UNTESTED |
| N-004 | IMG-033 | 3 | 3 | ImagePixels | V-IMG-033 | T | UNTESTED |
| N-004 | IMG-034 | 3 | 3 | ImagePixels | V-IMG-034 | T | UNTESTED |
| N-004 | IMG-035 | 3 | 3 | ImageDocument | V-IMG-035 | T | UNTESTED |
| N-004 | IMG-036 | 3 | 3 | ImageDocument | V-IMG-036 | T | UNTESTED |
| N-004 | IMG-037 | 3 | 3 | ImageDocument | V-IMG-037 | T | UNTESTED |
| N-004 | IMG-038 | 3 | 3 | ImageDocument | V-IMG-038 | T | UNTESTED |
| N-004 | IMG-039 | 3 | 3 | ImageViewport | V-IMG-039 | T | UNTESTED |
| N-004 | IMG-040 | 3 | 3 | ImageViewport | V-IMG-040 | T | UNTESTED |
| N-004 | IMG-041 | 3 | 3 | ImageViewport | V-IMG-041 | T | UNTESTED |
| N-004 | IMG-042 | 3 | 3 | ImageViewport | V-IMG-042 | T | UNTESTED |
| N-004 | IMG-043 | 3 | 3 | ImageViewport | V-IMG-043 | T | UNTESTED |
| N-004 | IMG-044 | 3 | 3 | ImageViewport | V-IMG-044 | T | UNTESTED |
| N-004 | IMG-045 | 3 | 3 | ImageViewport | V-IMG-045 | T | UNTESTED |
| N-004 | IMG-046 | 3 | 3 | ImageViewport | V-IMG-046 | T | UNTESTED |
| N-004 | IMG-047 | 3 | 3 | ImagePixels | V-IMG-047 | T | UNTESTED |
| N-004 | IMG-048 | 3 | 3 | ImagePixels | V-IMG-048 | T | UNTESTED |
| N-004 | IMG-049 | 3 | 3 | ImagePixels | V-IMG-049 | T | UNTESTED |
| N-004 | IMG-050 | 3 | 3 | ImagePixels | V-IMG-050 | T | UNTESTED |
| N-004 | IMG-051 | 3 | 3 | ImagePixels | V-IMG-051 | T | UNTESTED |
| N-004 | IMG-052 | 3 | 3 | ImagePixels | V-IMG-052 | T | UNTESTED |
| N-004 | IMG-053 | 3 | 3 | ImagePixels | V-IMG-053 | T | UNTESTED |
| N-004 | IMG-054 | 3 | 3 | ImagePixels | V-IMG-054 | T | UNTESTED |
| N-004 | IMG-055 | 3 | 3 | ImagePixels | V-IMG-055 | T | UNTESTED |
| N-004 | IMG-056 | 3 | 3 | ImagePixels | V-IMG-056 | T | UNTESTED |
| N-004 | IMG-057 | 3 | 3 | ImagePixels | V-IMG-057 | T | UNTESTED |
| N-004 | IMG-058 | 3 | 3 | ImagePixels | V-IMG-058 | T | UNTESTED |
| N-004 | IMG-059 | 3 | 3 | ImagePixels | V-IMG-059 | T | UNTESTED |
| N-004 | IMG-060 | 3 | 3 | ImagePixels | V-IMG-060 | T | UNTESTED |
| N-004 | IMG-061 | 3 | 3 | ImagePixels | V-IMG-061 | T | UNTESTED |
| N-004 | IMG-062 | 3 | 3 | ImagePixels | V-IMG-062 | T | UNTESTED |
| N-004 | IMG-063 | 3 | 3 | ImagePixels | V-IMG-063 | T | UNTESTED |
| N-004 | IMG-064 | 3 | 3 | ImagePixels | V-IMG-064 | T | UNTESTED |
| N-004 | IMG-065 | 3 | 3 | ImagePixels | V-IMG-065 | T | UNTESTED |
| N-004 | IMG-066 | 3 | 3 | ImagePixels | V-IMG-066 | T | UNTESTED |
| N-004 | IMG-067 | 3 | 3 | ImagePixels | V-IMG-067 | T | UNTESTED |
| N-004 | IMG-068 | 3 | 3 | ImagePixels | V-IMG-068 | T | UNTESTED |
| N-004 | IMG-069 | 3 | 3 | ImageDocument | V-IMG-069 | T | UNTESTED |
| N-004 | IMG-070 | 3 | 3 | ImageDocument | V-IMG-070 | T | UNTESTED |
| N-004 | IMG-071 | 3 | 3 | ImageDocument | V-IMG-071 | T | UNTESTED |
| N-004 | IMG-072 | 3 | 3 | ImageDocument | V-IMG-072 | T | UNTESTED |
| N-004 | IMG-073 | 3 | 3 | ImageDocument | V-IMG-073 | T | UNTESTED |
| N-004 | IMG-074 | 3 | 3 | ImageDocument | V-IMG-074 | T | UNTESTED |
| N-004 | IMG-075 | 3 | 3 | ImageDocument | V-IMG-075 | T | UNTESTED |
| N-004 | IMG-076 | 3 | 3 | ImageDocument | V-IMG-076 | T | UNTESTED |
| N-004 | IMG-077 | 3 | 3 | ImageDocument | V-IMG-077 | T | UNTESTED |
| N-004 | IMG-078 | 3 | 3 | ImageDocument | V-IMG-078 | T | UNTESTED |
| N-004 | IMG-079 | 3 | 3 | ImageDocument | V-IMG-079 | T | UNTESTED |
| N-004 | IMG-080 | 3 | 3 | ImagePixels | V-IMG-080 | T | UNTESTED |
| N-004 | IMG-081 | 3 | 3 | ImagePixels | V-IMG-081 | T | UNTESTED |
| N-004 | IMG-082 | 3 | 3 | ImagePixels | V-IMG-082 | T | UNTESTED |
| N-004 | IMG-083 | 3 | 3 | ImagePixels | V-IMG-083 | T | UNTESTED |
| N-004 | IMG-084 | 3 | 3 | ImagePixels | V-IMG-084 | T | UNTESTED |
| N-004 | IMG-085 | 3 | 3 | ImagePixels | V-IMG-085 | T | UNTESTED |
| N-004 | IMG-086 | 3 | 3 | ImagePixels | V-IMG-086 | T | UNTESTED |
| N-004 | IMG-087 | 3 | 3 | ImagePixels | V-IMG-087 | T | UNTESTED |
| N-004 | IMG-088 | 3 | 3 | ImagePixels | V-IMG-088 | T | UNTESTED |
| N-004 | IMG-089 | 3 | 3 | ImagePixels | V-IMG-089 | T | UNTESTED |
| N-004 | IMG-090 | 3 | 3 | ImagePixels | V-IMG-090 | T | UNTESTED |
| N-004 | IMG-091 | 3 | 3 | ImagePixels | V-IMG-091 | T | UNTESTED |
| N-004 | IMG-092 | 3 | 3 | ImagePixels | V-IMG-092 | T | UNTESTED |
| N-004 | IMG-093 | 3 | 3 | ImagePixels | V-IMG-093 | T | UNTESTED |
| N-004 | IMG-094 | 3 | 3 | ImagePixels | V-IMG-094 | T | UNTESTED |
| N-004 | IMG-095 | 3 | 3 | ImagePixels | V-IMG-095 | T | UNTESTED |
| N-004 | IMG-096 | 3 | 3 | ImagePixels | V-IMG-096 | T | UNTESTED |
| N-004 | IMG-097 | 3 | 3 | ImagePixels | V-IMG-097 | T | UNTESTED |
| N-004 | IMG-098 | 3 | 3 | ImagePixels | V-IMG-098 | T | UNTESTED |
| N-004 | IMG-099 | 3 | 3 | ImagePixels | V-IMG-099 | T | UNTESTED |
| N-004 | IMG-100 | 3 | 3 | ImagePixels | V-IMG-100 | T | UNTESTED |
| N-004 | IMG-101 | 3 | 3 | ImagePixels | V-IMG-101 | T | UNTESTED |
| N-004 | IMG-102 | 3 | 3 | ImagePixels | V-IMG-102 | T | UNTESTED |
| N-004 | IMG-103 | 3 | 3 | ImagePixels | V-IMG-103 | T | UNTESTED |
| N-004 | IMG-104 | 3 | 3 | ImagePixels | V-IMG-104 | T | UNTESTED |
| N-005 | VID-001 | 4 | 4 | VideoTimeline | V-VID-001 | T | UNTESTED |
| N-005 | VID-002 | 4 | 4 | VideoTimeline | V-VID-002 | T | UNTESTED |
| N-005 | VID-003 | 4 | 4 | VideoMedia | V-VID-003 | T | UNTESTED |
| N-005 | VID-004 | 4 | 4 | VideoMedia | V-VID-004 | T | UNTESTED |
| N-005 | VID-005 | 4 | 4 | VideoMedia | V-VID-005 | T | UNTESTED |
| N-005 | VID-006 | 4 | 4 | VideoMedia | V-VID-006 | T | UNTESTED |
| N-005 | VID-007 | 4 | 4 | VideoMedia | V-VID-007 | T | UNTESTED |
| N-005 | VID-008 | 4 | 4 | VideoMedia | V-VID-008 | T | UNTESTED |
| N-005 | VID-009 | 4 | 4 | VideoTimeline | V-VID-009 | T | UNTESTED |
| N-005 | VID-010 | 4 | 4 | VideoTimeline | V-VID-010 | T | UNTESTED |
| N-005 | VID-011 | 4 | 4 | VideoTimeline | V-VID-011 | T | UNTESTED |
| N-005 | VID-012 | 4 | 4 | VideoTimeline | V-VID-012 | T | UNTESTED |
| N-005 | VID-013 | 4 | 4 | VideoTimeline | V-VID-013 | T | UNTESTED |
| N-005 | VID-014 | 4 | 4 | VideoTimeline | V-VID-014 | T | UNTESTED |
| N-005 | VID-015 | 4 | 4 | VideoTimeline | V-VID-015 | T | UNTESTED |
| N-005 | VID-016 | 4 | 4 | VideoTimeline | V-VID-016 | T | UNTESTED |
| N-005 | VID-017 | 4 | 4 | VideoTimeline | V-VID-017 | T | UNTESTED |
| N-005 | VID-018 | 4 | 4 | VideoTimeline | V-VID-018 | T | UNTESTED |
| N-005 | VID-019 | 4 | 4 | VideoTimeline | V-VID-019 | T | UNTESTED |
| N-005 | VID-020 | 4 | 4 | VideoTimeline | V-VID-020 | T | UNTESTED |
| N-005 | VID-021 | 4 | 4 | VideoTimeline | V-VID-021 | T | UNTESTED |
| N-005 | VID-022 | 4 | 4 | VideoTimeline | V-VID-022 | T | UNTESTED |
| N-005 | VID-023 | 4 | 4 | VideoTimeline | V-VID-023 | T | UNTESTED |
| N-005 | VID-024 | 4 | 4 | VideoTimeline | V-VID-024 | T | UNTESTED |
| N-005 | VID-025 | 4 | 4 | VideoTimeline | V-VID-025 | T | UNTESTED |
| N-005 | VID-026 | 4 | 4 | VideoTimeline | V-VID-026 | T | UNTESTED |
| N-005 | VID-027 | 4 | 4 | VideoTimeline | V-VID-027 | T | UNTESTED |
| N-005 | VID-028 | 4 | 4 | VideoTimeline | V-VID-028 | T | UNTESTED |
| N-005 | VID-029 | 4 | 4 | VideoTimeline | V-VID-029 | T | UNTESTED |
| N-005 | VID-030 | 4 | 4 | VideoTimeline | V-VID-030 | T | UNTESTED |
| N-005 | VID-031 | 4 | 4 | VideoTimeline | V-VID-031 | T | UNTESTED |
| N-005 | VID-032 | 4 | 4 | VideoTimeline | V-VID-032 | T | UNTESTED |
| N-005 | VID-033 | 4 | 4 | VideoTimeline | V-VID-033 | T | UNTESTED |
| N-005 | VID-034 | 4 | 4 | VideoTimeline | V-VID-034 | T | UNTESTED |
| N-005 | VID-035 | 4 | 4 | VideoTimeline | V-VID-035 | T | UNTESTED |
| N-005 | VID-036 | 4 | 4 | VideoTimeline | V-VID-036 | T | UNTESTED |
| N-005 | VID-037 | 4 | 4 | VideoTimeline | V-VID-037 | T | UNTESTED |
| N-005 | VID-038 | 4 | 4 | VideoTimeline | V-VID-038 | T | UNTESTED |
| N-005 | VID-039 | 4 | 4 | VideoTimeline | V-VID-039 | T | UNTESTED |
| N-005 | VID-040 | 4 | 4 | VideoTimeline | V-VID-040 | T | UNTESTED |
| N-005 | VID-041 | 4 | 4 | VideoTimeline | V-VID-041 | T | UNTESTED |
| N-005 | VID-042 | 4 | 4 | VideoTimeline | V-VID-042 | T | UNTESTED |
| N-005 | VID-043 | 4 | 4 | VideoTimeline | V-VID-043 | T | UNTESTED |
| N-005 | VID-044 | 4 | 4 | VideoPreviewExport | V-VID-044 | T | UNTESTED |
| N-005 | VID-045 | 4 | 4 | VideoPreviewExport | V-VID-045 | T | UNTESTED |
| N-005 | VID-046 | 4 | 4 | VideoPreviewExport | V-VID-046 | T | UNTESTED |
| N-005 | VID-047 | 4 | 4 | VideoPreviewExport | V-VID-047 | T | UNTESTED |
| N-005 | VID-048 | 4 | 4 | VideoPreviewExport | V-VID-048 | T | UNTESTED |
| N-005 | VID-049 | 4 | 4 | VideoTimeline | V-VID-049 | T | UNTESTED |
| N-005 | VID-050 | 4 | 4 | VideoTimeline | V-VID-050 | T | UNTESTED |
| N-005 | VID-051 | 4 | 4 | VideoTimeline | V-VID-051 | T | UNTESTED |
| N-005 | VID-052 | 4 | 4 | VideoTimeline | V-VID-052 | T | UNTESTED |
| N-005 | VID-053 | 4 | 4 | VideoTimeline | V-VID-053 | T | UNTESTED |
| N-005 | VID-054 | 4 | 4 | VideoPreviewExport | V-VID-054 | T | UNTESTED |
| N-005 | VID-055 | 4 | 4 | VideoPreviewExport | V-VID-055 | T | UNTESTED |
| N-005 | VID-056 | 4 | 4 | VideoPreviewExport | V-VID-056 | T | UNTESTED |
| N-005 | VID-057 | 4 | 4 | VideoPreviewExport | V-VID-057 | T | UNTESTED |
| N-005 | VID-058 | 4 | 4 | VideoPreviewExport | V-VID-058 | T | UNTESTED |
| N-005 | VID-059 | 4 | 4 | VideoPreviewExport | V-VID-059 | T | UNTESTED |
| N-005 | VID-060 | 4 | 4 | VideoPreviewExport | V-VID-060 | T | UNTESTED |
| N-005 | VID-061 | 4 | 4 | VideoPreviewExport | V-VID-061 | T | UNTESTED |
| N-005 | VID-062 | 4 | 4 | VideoPreviewExport | V-VID-062 | T | UNTESTED |
| N-005 | VID-063 | 4 | 4 | VideoPreviewExport | V-VID-063 | T | UNTESTED |
| N-005 | VID-064 | 4 | 4 | VideoPreviewExport | V-VID-064 | T | UNTESTED |
| N-005 | VID-065 | 4 | 4 | VideoPreviewExport | V-VID-065 | T | UNTESTED |
| N-005 | VID-066 | 4 | 4 | VideoPreviewExport | V-VID-066 | T | UNTESTED |
| N-005 | VID-067 | 4 | 4 | VideoPreviewExport | V-VID-067 | T | UNTESTED |
| N-005 | VID-068 | 4 | 4 | VideoPreviewExport | V-VID-068 | T | UNTESTED |
| N-005 | VID-069 | 4 | 4 | VideoPreviewExport | V-VID-069 | T | UNTESTED |
| N-005 | VID-070 | 4 | 4 | VideoPreviewExport | V-VID-070 | T | UNTESTED |
| N-005 | VID-071 | 4 | 4 | VideoPreviewExport | V-VID-071 | T | UNTESTED |
| N-005 | VID-072 | 4 | 4 | VideoPreviewExport | V-VID-072 | T | UNTESTED |
| N-005 | VID-073 | 4 | 4 | VideoPreviewExport | V-VID-073 | T | UNTESTED |
| N-006 | XWS-001 | 5 | 5 | WorkspaceBridge | V-XWS-001 | T | UNTESTED |
| N-006 | XWS-002 | 5 | 5 | WorkspaceBridge | V-XWS-002 | T | UNTESTED |
| N-006 | XWS-003 | 5 | 5 | WorkspaceBridge | V-XWS-003 | T | UNTESTED |
| N-003 | PERF-001 | 2 | 2 | CADViewport | V-PERF-001 | T | UNTESTED |
| N-003 | PERF-002 | 2 | 2 | CADKernel | V-PERF-002 | T | UNTESTED |
| N-004 | PERF-003 | 3 | 3 | ImageViewport | V-PERF-003 | T | UNTESTED |
| N-005 | PERF-004 | 4 | 4 | VideoPreviewExport | V-PERF-004 | T | UNTESTED |
| N-007 | REL-001 | 0 | 0 | Architecture | V-REL-001 | I | UNTESTED |
| N-007 | REL-002 | 0 | 0 | Architecture | V-REL-002 | I | UNTESTED |
| N-007 | REL-003 | 0 | 0 | Architecture | V-REL-003 | I | UNTESTED |
| N-007 | REL-004 | 0 | 0 | Architecture | V-REL-004 | I | UNTESTED |
| N-007 | REL-005 | 0 | 0 | Distribution | V-REL-005 | I | UNTESTED |
| N-007 | REL-006 | 1 | 1 | AppShell | V-REL-006 | I | UNTESTED |
| N-007 | REL-007 | 2 | 2 | CADKernel | V-REL-007 | I | UNTESTED |
| N-007 | REL-008 | 3 | 3 | ImageDocument | V-REL-008 | I | UNTESTED |
| N-007 | REL-009 | 4 | 4 | VideoTimeline | V-REL-009 | I | UNTESTED |
| N-007 | REL-010 | 5 | 5 | Distribution | V-REL-010 | I | UNTESTED |
| N-007 | REL-011 | 0 | 0 | Distribution | V-REL-011 | I | UNTESTED |
| N-007 | REL-012 | 0 | 0 | Distribution | V-REL-012 | I | UNTESTED |
| N-007 | REL-013 | 0 | 0 | Distribution | V-REL-013 | I | UNTESTED |
| N-007 | REL-014 | 0 | 0 | Distribution | V-REL-014 | I | UNTESTED |
| N-007 | REL-015 | 0 | 0 | Distribution | V-REL-015 | I | UNTESTED |
| N-007 | REL-016 | 1 | 5 | AppShell | V-REL-016 | I | UNTESTED |
| N-007 | REL-017 | 1 | 5 | AppShell | V-REL-017 | I | UNTESTED |
| N-007 | REL-018 | 1 | 5 | AppShell | V-REL-018 | I | UNTESTED |
| N-007 | REL-019 | 5 | 5 | Distribution | V-REL-019 | I | UNTESTED |
| N-007 | REL-020 | 5 | 5 | Distribution | V-REL-020 | I | UNTESTED |
| N-007 | REL-021 | 5 | 5 | Distribution | V-REL-021 | I | UNTESTED |
| N-007 | REL-022 | 5 | 5 | Distribution | V-REL-022 | I | UNTESTED |
| N-007 | REL-023 | 0 | 0 | Distribution | V-REL-023 | I | PASS |
| N-007 | REL-024 | 5 | 5 | Distribution | V-REL-024 | I | UNTESTED |
| N-007 | REL-025 | 0 | 0 | Distribution | V-REL-025 | I | UNTESTED |
| N-007 | REL-026 | 0 | 0 | Distribution | V-REL-026 | I | UNTESTED |
| N-007 | REL-027 | 0 | 0 | Distribution | V-REL-027 | I | UNTESTED |
| N-007 | REL-028 | 0 | 0 | Architecture | V-REL-028 | I | PASS |
| N-007 | REL-029 | 0 | 4 | Architecture | V-REL-029 | I | UNTESTED |
| N-007 | REL-030 | 2 | 2 | Architecture | V-REL-030 | I | UNTESTED |
| N-007 | REL-031 | 3 | 3 | Architecture | V-REL-031 | I | UNTESTED |
| N-007 | REL-032 | 4 | 4 | Architecture | V-REL-032 | I | UNTESTED |

## Coverage totals

| Family | Requirements | PASS | FAIL | UNTESTED |
|---|---:|---:|---:|---:|
| SYS | 16 | 0 | 0 | 16 |
| CTL | 30 | 0 | 0 | 30 |
| CAD | 124 | 0 | 0 | 124 |
| IMG | 104 | 0 | 0 | 104 |
| VID | 73 | 0 | 0 | 73 |
| XWS | 3 | 0 | 0 | 3 |
| PERF | 4 | 0 | 0 | 4 |
| REL | 32 | 0 | 0 | 32 |
| **Total** | **386** | **0** | **0** | **386** |

## Need-to-requirement closure

| Need | Mapped requirements |
|---|---:|
| N-001 | 11 |
| N-002 | 28 |
| N-003 | 126 |
| N-004 | 105 |
| N-005 | 74 |
| N-006 | 3 |
| N-007 | 39 |

## Open items

- No requirement has a missing need, procedure, method, or conceptual design owner in this authored baseline. Mechanical consistency checking is separate from capability verification.
- The module-map owner must bind these conceptual owner names to final map IDs before implementation; aliases must not create unowned requirements.
- Performance fixture/hardware and the visible-brush-lag threshold remain verification-contract open items.
- Every product requirement remains untested. Future reports must preserve FAIL and UNTESTED entries instead of reducing the list to passing checks.
