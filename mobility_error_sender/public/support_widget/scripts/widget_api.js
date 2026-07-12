export const api = {

  async call(method, args = {}) {

    const SW = window.SupportWidget;

    /* ---------------- DEV MODE ---------------- */

    if (SW?.developerMode) {

      console.log("API Call:", method, args);

      try {
        // dynamically load test_api.js once
        if (!SW.__mockApi) {
          SW.__mockApi = await import(
            SW.resolve("scripts/test_api.js")
          );
        }

        const fnName = method.split(".").pop();
        const fn = SW.__mockApi[fnName];

        if (typeof fn !== "function") {
          throw new Error(`Mock API method '${fnName}' not found`);
        }

        const result = await fn(args);
        console.log("API Response:", result);
        return result;

      } catch (err) {
        console.error("Mock API error:", err);
        throw err;
      }
    }

    /* ---------------- FRAPPE MODE ---------------- */

    return new Promise((resolve, reject) => {
      frappe.call({
        method,
        args,
        callback: r => resolve(r.message),
        error: err => reject(err)
      });
    });
  },

  validateEmail(email) {
    return this.call(
      "mobility_error_sender.api.validate_email",
      { email }
    );
  },

  getTickets(email, offset = 0) {
    return this.call(
      "mobility_error_sender.api.get_tickets",
      { email, offset }
    );
  },

  getTicket(id) {
    return this.call(
      "mobility_error_sender.api.get_ticket",
      { id }
    );
  },

  createTicket(data) {
    return this.call(
      "mobility_error_sender.api.create_ticket",
      data
    );
  },

  reply(id, data) {
    const SW = window.SupportWidget;

    // DEV MODE
    if (SW?.developerMode) {
      return this.call(
        "mobility_error_sender.api.reply_ticket",
        { id, ...data }
      );
    }

    // PRODUCTION
    const formData = new FormData();

    formData.append("method", "mobility_error_sender.api.reply_ticket");
    formData.append("id", id);

    if (data.text) formData.append("text", data.text);
    if (data.file) formData.append("file", data.file);
    if (data.image) formData.append("image", data.image);
    if (data.audio) formData.append("audio", data.audio);

    return fetch("/api/method/mobility_error_sender.api.reply_ticket", {
      method: "POST",
      body: formData,
      credentials: "include"
    }).then(r => r.json()).then(r => r.message);
  }

};
