# Copyright (c) 2025, Ahmed Zaytoon and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

from mobility_error_sender.boot import publish_support_settings


class desk365(Document):
	def on_update(self):
		# new page loads: drop the per-user boot cache that carries the settings
		frappe.cache.delete_key("bootinfo")
		# already-open tabs: push the new settings to them live
		publish_support_settings(self)
