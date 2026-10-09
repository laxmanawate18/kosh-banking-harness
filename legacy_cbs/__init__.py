"""A legacy core banking system (mock) with no API: Kosh reaches it only through its screens, driven by the RPA robot.

It has its own database (LEGACY_CBS_DATABASE_URL; in production its own database and DB user), its own operators and its
own maker-checker rule, and it listens only inside the container (127.0.0.1). Nothing in Kosh imports `legacy_cbs.store`
or `legacy_cbs.app`; Kosh may only start the server (`legacy_cbs.server`). tests/test_legacy_cbs.py checks that.
"""
