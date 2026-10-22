// The public site's frame browser (https://halden-ridge.invalid/pipeline/nightjar).
// It calls the API described in software/nightjar/openapi.json.

const API = "/v2";

/** Fetch a night's frames and list them. */
async function loadNight(night) {
  const res = await fetch(`${API}/nights/${night}/frames`);
  return res.ok ? res.json() : [];
}

class FrameList {
  constructor(element) {
    this.element = element;
  }

  render(frames) {
    this.element.innerHTML = frames
      .map((f) => `<li>${f.id} — ${f.telescope}, ${f.exposureS} s</li>`)
      .join("");
  }
}

const help = `
Pick a night to list its frames.
Calibration frames are hidden.
`;

export { loadNight, FrameList, help };
