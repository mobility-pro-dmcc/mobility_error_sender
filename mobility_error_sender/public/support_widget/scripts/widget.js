import { api } from "./widget_api.js";
import { storage } from "./widget_storage.js";
import { media } from "./widget_media.js";
import { showLoader, hideLoader, createLoader } from "./utils.js";

export function initWidget() {
  const root = window.SupportWidget.root;
  const Template = window.SupportWidget.Template;
  const btn = window.SupportWidget.button;

  const state = {
    open: false,
    view: "widget",
    tickets: [],
    offset: 0,
    loading: false,
    hasMore: true,
    filteredTickets: [],
    filter: "All",
    active: null,
    email: storage.getEmail() || null,
    recorderSession: 0,
    media: {
      file: null,
      image: null,
      audio: null
    }
  };
  const stopIcon = `
    <svg xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="25" height="25"
        fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>`;

  /* ---------------- CLOSE HANDLER ---------------- */

  function attachCloseHandler() {
    const closeBtn = root.querySelector(".sw-close");

    if (!closeBtn) return;

    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleWidget();
    });
  }

  /* ---------------- AUTH ---------------- */

  async function requireEmail() {
    if (state.email) return true;

    const email = prompt("Enter your email");
    if (!email) return false;

    const ok = await api.validateEmail(email);
    if (!ok) {
      alert("Email not found");
      return false;
    }

    storage.setEmail(email);
    state.email = email;
    return true;
  }

  /* ---------------- SCROLLING ---------------- */
  function scrollToBottom() {
    const box = root.querySelector(".sw-conversation");
    if (!box) return;

    // smooth scroll optional
    box.scrollTop = box.scrollHeight;
  }

  /* ---------------- DATA ---------------- */

  async function loadTickets(reset = true) {
    if (state.loading) return;

    state.loading = true;

    if (reset) {
      state.offset = 0;
      state.tickets = [];
    }

    const res = await api.getTickets(state.email, state.offset);

    const newTickets = res?.tickets || [];

    state.tickets = reset
      ? newTickets
      : [...state.tickets, ...newTickets];

    state.offset += newTickets.length;

    state.hasMore = newTickets.length > 0;

    applyFilter();

    state.loading = false;
    showList(false)
  }


  /* ---------------- RENDER ---------------- */

  async function renderView(name, data = {}, animate = true) {
    const html = await Template.use(name, data);
    root.innerHTML = html;
    if (animate) {
      root.classList.add("support-view", "slide-left");

      setTimeout(() => {
        root.classList.remove("slide-left");
      }, 300);
    }

    attachCloseHandler();
  }

  async function showList(animate = false) {
    state.view = "list";

    await renderView("list", {
      name: state.email, 
      tickets: state.filteredTickets,
      filter: state.filter
    }, animate);
    createLoader();
    attachFilters();

    root.querySelectorAll("[data-id]").forEach(el => {
      el.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        showLoader();

        state.active = await api.getTicket(el.dataset.id);
        showTicket(true);

        hideLoader();
      });
    });

    const list = root.querySelector(".sw-ticket-list");

    list?.addEventListener("scroll", async () => {
      if (!state.hasMore || state.loading) return;

      const nearBottom =
        list.scrollTop + list.clientHeight >= list.scrollHeight - 50;

      if (nearBottom) {
        await showList(false);
        await loadTickets(false);
      }
    });

  }

  async function showTicket(animate = false) {

    state.view = "ticket";

    // render empty ticket first
    await renderView("ticket", {
      ticket: {
        ...state.active,
        messages: []   // 👈 important
      }
    }, animate);
    createLoader();
    attachMediaHandlers();

    attachImagePreview();

    root.querySelector(".send-btn")?.addEventListener("click", sendMessage);

    root.querySelector(".sw-back-ticket")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showList(true);
    });

    // now load messages in background
    loadMessages();
  }

  async function loadMessages() {
    showLoader();

    try {

      const data = await api.getTicket(state.active.id);

      // update only messages
      state.active.messages = data.messages;

      // render again WITHOUT animation
      await renderView("ticket", { ticket: state.active }, false);

      attachMediaHandlers();
      attachImagePreview();

      root.querySelector(".send-btn")?.addEventListener("click", sendMessage);

      root.querySelector(".sw-back-ticket")?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showList(true);
      });

      scrollToBottom();
    } finally {
      hideLoader();
    }
  }
  

  /* ---------------- IMAGE PREVIEW ---------------- */
  function attachImagePreview() {
    const lightbox = document.getElementById("sw-lightbox");
    const imgViewer = lightbox.querySelector(".sw-lightbox-img");

    if (root.__imagePreviewAttached) return;
    root.__imagePreviewAttached = true;

    let scale = 1;

    /* ---------- Delegation ---------- */
    root.addEventListener("click", (e) => {
      const img = e.target.closest(".sw-conversation img");
      if (!img) return;

      e.stopPropagation();

      imgViewer.src = img.src;
      scale = 1;
      imgViewer.style.transform = "scale(1)";
      lightbox.classList.add("open");
    });

    /* ---------- Close ---------- */
    lightbox.addEventListener("click", () => {
      lightbox.classList.remove("open");
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        lightbox.classList.remove("open");
      }
    });

    /* ---------- Zoom ---------- */
    imgViewer.addEventListener("wheel", (e) => {
      e.preventDefault();

      scale += e.deltaY * -0.001;
      scale = Math.min(Math.max(1, scale), 5);

      imgViewer.style.transform = `scale(${scale})`;
    });

    /* ---------- Mobile pinch ---------- */
    let startDist = 0;

    imgViewer.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        startDist = getDistance(e.touches);
      }
    });

    imgViewer.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2) {
        const dist = getDistance(e.touches);
        const diff = dist - startDist;

        scale += diff * 0.005;
        scale = Math.min(Math.max(1, scale), 5);

        imgViewer.style.transform = `scale(${scale})`;
        startDist = dist;
      }
    });

    function getDistance(touches) {
      return Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
    }
  }

  /* ---------------- TOGGLE ---------------- */

  async function toggleWidget() {
    createLoader();
    if (!state.open) {
      
      if (!await requireEmail()) return;

      await showList(true);

      await loadTickets();


      btn.style.display = "none";
      root.style.display = "block";


    } else {

      // animate closing
      root.classList.add("slide-right");

      setTimeout(() => {
        root.style.display = "none";
        root.classList.remove("slide-right");
        btn.style.display = "block";
      }, 300);

      state.view = "widget";
    }

    state.open = !state.open;
  }

  /* ---------------- Filter ---------------- */
  function applyFilter() {
    if (state.filter === "All") {
      state.filteredTickets = state.tickets;
    } else {
      state.filteredTickets = state.tickets.filter(
        t => t.status === state.filter
      );
    }
  }

  /* ---------------- Filter UI ---------------- */
  function attachFilters() {
    root.querySelectorAll(".sw-filters button").forEach(btn => {

      btn.addEventListener("click", () => {
        const value = btn.textContent.trim();

        state.filter = value;
        applyFilter();

        // re-render list
        showList();
      });
    });
  }

  /* ---------------- Media Handlers ---------------- */
  function attachMediaHandlers() {
    const attachBtn = root.querySelector("#attach-btn");
    const pictureBtn = root.querySelector("#picture-btn");
    const recorderBtn = root.querySelector("#recorder-btn");

    const fileInput = root.querySelector("#file-input");
    const imageInput = root.querySelector("#image-input");
    const indicator = root.querySelector("#media-indicator");
    const micIcon = recorderBtn?.innerHTML;

    /* ---------- Recorder button state ---------- */
    function updateRecorderButton() {
      if (!recorderBtn) return;

      if (state.recording) {
        recorderBtn.innerHTML = stopIcon;
        recorderBtn.classList.add("recording");
      } else {
        recorderBtn.innerHTML = micIcon;
        recorderBtn.classList.remove("recording");
      }
    }

    /* ---------- Attach any file ---------- */

    attachBtn?.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput?.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;

      state.media.file = file;
      updateIndicator();
    });

    /* ---------- Image picker ---------- */

    pictureBtn?.addEventListener("click", () => {
      imageInput.click();
    });

    imageInput?.addEventListener("change", () => {
      const img = imageInput.files[0];
      if (!img) return;

      state.media.image = img;
      updateIndicator();
    });

    /* ---------- Voice recording ---------- */

    recorderBtn?.addEventListener("click", async () => {

      // STOP recording
      if (state.recording) {
        state.recording = false;

        clearInterval(state.recordingTimer);

        const audio = await media.stopRecording?.();

        if (audio) {
          state.media.audio = audio;
        }

        updateIndicator();
        return;
      }

      // START recording
      const session = ++state.recorderSession;

      state.recording = true;
      updateRecorderButton();
      state.recordingTime = 0;

      updateIndicator();

      state.recordingTimer = setInterval(() => {
        state.recordingTime++;
        updateIndicator();
      }, 1000);

      try {
        const audio = await media.recordVoice();

        if (session !== state.recorderSession) return;

        state.recording = false;
        updateRecorderButton();
        clearInterval(state.recordingTimer);

        if (audio) {
          state.media.audio = audio;
        }

        updateIndicator();

      } catch (e) {
        state.recording = false;
        clearInterval(state.recordingTimer);
        updateIndicator();
      }
    });



    /* ---------- Indicator ---------- */

    function updateIndicator() {
      indicator.innerHTML = "";
      
      if (state.recording) {
        indicator.innerHTML = `
          <div class="media-chip recording">
            🔴 Recording... ${state.recordingTime}s
          </div>
        `;
        return;
      }


      if (state.media.file) {
        indicator.innerHTML += `
          <div class="media-chip">
            📎 ${state.media.file.name}
            <span class="remove-media" data-type="file">✕</span>
          </div>
        `;
      }

      if (state.media.image) {
        indicator.innerHTML += `
          <div class="media-chip">
            📷 Image
            <span class="remove-media" data-type="image">✕</span>
          </div>
        `;
      }

      if (state.media.audio) {
        indicator.innerHTML += `
          <div class="media-chip">
            🎙 Voice
            <span class="remove-media" data-type="audio">✕</span>
          </div>
        `;
      }

      attachRemoveHandlers();
    }


    /* ---------------- Remove media handlers ---------------- */

    function attachRemoveHandlers() {
      root.querySelectorAll(".remove-media").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
  
          const type = btn.dataset.type;
          state.media[type] = null;
          
          if (type === "audio") {
            state.media.audio = null;

            state.recorderSession++;
            state.recording = false;

            clearInterval(state.recordingTimer);
            media.stopRecording?.();

            updateRecorderButton();
          }


          updateIndicator();
        });
      });
    }
  }



  /* ---------------- SEND MESSAGE ---------------- */
  async function sendMessage() {
    const editor = root.querySelector(".editor-area");
    const text = editor?.innerText.trim();
    // console.log("Sending message:", { text, media: state.media });

    const hasMedia =
      state.media.file ||
      state.media.image ||
      state.media.audio;

    // Nothing to send
    if (!text && !hasMedia) return;

    try {
      await api.reply(state.active.id, {
        text: text || null,
        file: state.media.file,
        image: state.media.image,
        audio: state.media.audio
      });

      // Reset after sending
      state.media = { file: null, image: null, audio: null };

      editor.innerText = "";

      state.active = await api.getTicket(state.active.id);
      showTicket();

    } catch (e) {
      console.warn("Offline, queueing message");

      storage.queue({
        ticket: state.active.id,
        text,
        ...state.media
      });
    }
  }

  return {
    toggle: toggleWidget
  };
}
