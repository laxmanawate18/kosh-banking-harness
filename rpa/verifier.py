from typing import Dict
from playwright.async_api import Page


async def verify_dom_read_back(page: Page, expected_fields: Dict[str, str]) -> bool:
    for field_id, expected_val in expected_fields.items():
        if not expected_val:
            continue
        loc = page.locator(f"#{field_id}")
        count = await loc.count()
        if count == 0:
            loc = page.locator(f"[name='{field_id}']")
            count = await loc.count()

        if count == 0:
            continue

        tag_name = await loc.first.evaluate("el => el.tagName.toLowerCase()")
        if tag_name == "select":
            actual_val = await loc.first.input_value()
        else:
            actual_val = await loc.first.input_value()

        if actual_val.strip() != expected_val.strip():
            raise ValueError(
                f"Read-back mismatch on field '{field_id}': expected '{expected_val}', found '{actual_val}'"
            )

    return True
