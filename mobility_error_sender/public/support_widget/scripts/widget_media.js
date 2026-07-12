let mediaRecorder = null;
let audioChunks = [];
let currentStream = null;

export const media = {

  /* ---------- Image picker ---------- */

  pickImage() {
    return new Promise(res => {
      const i = document.createElement("input");
      i.type = "file";
      i.accept = "image/*";
      i.onchange = () => res(i.files[0]);
      i.click();
    });
  },

  /* ---------- Start recording ---------- */

  async recordVoice() {

    // If already recording, ignore
    if (mediaRecorder && mediaRecorder.state === "recording") {
      return;
    }

    currentStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    audioChunks = [];

    mediaRecorder = new MediaRecorder(currentStream);

    mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    // Return promise that resolves when stop is called
    return new Promise(resolve => {
      mediaRecorder.onstop = () => {

        const blob = new Blob(audioChunks, { type: "audio/webm" });

        // stop mic hardware (important)
        currentStream?.getTracks().forEach(t => t.stop());

        resolve(blob);
      };

      mediaRecorder.start();
    });
  },

  /* ---------- Stop recording ---------- */

  stopRecording() {
    if (!mediaRecorder) return;

    if (mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    }
  }
};
