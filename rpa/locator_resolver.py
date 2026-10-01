from typing import Dict, Optional
from playwright.async_api import Locator, Page
from rpa.models import SelectorStrategy


async def resolve_locator(page: Page, target: Dict[str, SelectorStrategy], timeout_ms: int = 1500) -> Locator:
    strategies_order = ["primary", "fallback_1", "fallback_2", "fallback_3"]

    for strat_key in strategies_order:
        if strat_key not in target:
            continue
        spec = target[strat_key]
        try:
            loc: Optional[Locator] = None
            if spec.strategy == "id":
                loc = page.locator(f"#{spec.value}")
            elif spec.strategy == "name":
                loc = page.locator(f"[name='{spec.value}']")
            elif spec.strategy == "css":
                loc = page.locator(spec.value)
            elif spec.strategy == "label_text":
                loc = page.get_by_label(spec.value)

            if loc is not None:
                await loc.first.wait_for(state="attached", timeout=timeout_ms)
                return loc.first
        except Exception:
            continue

    raise LookupError(f"All selector strategies failed for target: {list(target.keys())}")
