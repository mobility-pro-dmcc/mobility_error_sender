/* ---------------- MOCK DATABASE ---------------- */

let ticketsDB = [
  {
    id: "TCK-1001",
    title: "Login issue",
    status: "Open",
    number: "TCK-1001",
    messages: [
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" },
      { type: "user", content: "I can't log in.", time: "10:00 AM" },
      { type: "agent", content: "We are checking this.", time: "10:05 AM" }
    ]
  },
  {
    id: "TCK-1002",
    title: "Payment failed",
    status: "Closed",
    number: "TCK-1002",
    messages: [
      { type: "user", content: "My payment failed.", time: "09:00 AM" },
      { type: "agent", content: "Issue resolved.", time: "09:20 AM" }
    ]
  }
];

/* ---------------- HELPERS ---------------- */

function delay(ms = 300) {
  return new Promise(res => setTimeout(res, ms));
}

function nowTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

/* ---------------- API METHODS ---------------- */

export async function validate_email({ email }) {
  await delay();
  return typeof email === "string" && email.includes("@");
}

export async function get_tickets() {
  await delay();

  return {
    tickets: ticketsDB.map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      number: t.number
    }))
  };
}

export async function get_ticket({ id }) {
  await delay();

  const ticket = ticketsDB.find(t => t.id === id);

  if (!ticket) {
    throw new Error("Ticket not found");
  }

  return ticket;
}

export async function create_ticket({ subject, body }) {
  await delay();

  const id = "TCK-" + (1000 + ticketsDB.length + 1);

  const newTicket = {
    id,
    number: id,
    title: subject,
    status: "Open",
    messages: [
      {
        type: "user",
        content: body,
        time: nowTime()
      }
    ]
  };

  ticketsDB.unshift(newTicket);

  return newTicket;
}


/* ---------------- REPLY WITH MEDIA ---------------- */

export async function reply_ticket({ id, text, file, image, audio }) {
  await delay();

  const ticket = ticketsDB.find(t => t.id === id);
  if (!ticket) throw new Error("Ticket not found");

  /* -------- TEXT -------- */

  if (text) {
    ticket.messages.push({
      type: "user",
      content: text,
      time: nowTime()
    });
  }

  /* -------- IMAGE -------- */

  if (image) {
    const url = URL.createObjectURL(image);

    ticket.messages.push({
      type: "user",
      content: `<img src="${url}" style="max-width:150px;border-radius:8px;" />`,
      time: nowTime()
    });
  }

  /* -------- FILE -------- */

  if (file) {
    ticket.messages.push({
      type: "user",
      content: `📎 ${file.name}`,
      time: nowTime()
    });
  }

  /* -------- AUDIO -------- */

  if (audio) {
    const url = URL.createObjectURL(audio);

    ticket.messages.push({
      type: "user",
      content: `
        <audio controls style="max-width:200px">
          <source src="${url}">
        </audio>
      `,
      time: nowTime()
    });
  }

  return true;
}