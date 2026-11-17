import frappe


def execute():
    """Store the defaults of the new desk365 settings: a Single's unsaved Check
    field reads as 0, which would silently turn the error button off."""
    defaults = {
        "show_on_errors": 1,
        "show_on_messages": 0,
        "screenshot_method": "Browser Capture",
    }
    stored = frappe.db.get_singles_dict("desk365")
    for field, value in defaults.items():
        if stored.get(field) is None:
            frappe.db.set_single_value("desk365", field, value)
    frappe.cache.delete_key("bootinfo")
