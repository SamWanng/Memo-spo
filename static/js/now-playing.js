(function () {
  var endpoint = "https://spotify-now-playing.samwanng.workers.dev/api/now-playing";
  var fastRefreshMs = 45000;
  var slowRefreshMs = 120000;
  var retryAfterErrorMs = 10000;

  var labelPlaying = "正在收听";
  var labelLastPlayed = "上次收听";

  var root = document.getElementById("listening-now");
  if (!root) return;

  var labelEl = root.querySelector(".listening-label");
  var textEl = root.querySelector(".listening-text");
  if (!textEl || !labelEl) return;
  var timerId = null;

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderTrack(prefix, track) {
    var title = track && track.title ? track.title : "Unknown track";
    var artist = track && track.artist ? track.artist : "Unknown artist";
    var label = escapeHtml(title + " - " + artist);
    var safePrefix = prefix ? '<span class="listening-prefix">' + escapeHtml(prefix) + " </span>" : "";

    if (track && track.url) {
      var safeUrl = "#";
      try {
        var parsed = new URL(track.url);
        if (parsed.protocol === "https:") safeUrl = parsed.href;
      } catch (e) {}

      textEl.innerHTML =
        safePrefix +
        '<a href="' + safeUrl + '" target="_blank" rel="noopener noreferrer">' +
        label +
        "</a>";
      return;
    }

    textEl.innerHTML = safePrefix + label;
  }

  function renderIdleFallback() {
    root.dataset.state = "idle";
    labelEl.textContent = labelLastPlayed;
    textEl.textContent = "暂无可用记录";
  }

  function scheduleNextRun(delayMs) {
    if (timerId) window.clearTimeout(timerId);
    timerId = window.setTimeout(refreshNowPlaying, delayMs);
  }

  async function refreshNowPlaying() {
    if (document.hidden) {
      scheduleNextRun(slowRefreshMs);
      return;
    }

    try {
      var controller = new AbortController();
      var timeoutId = window.setTimeout(function () {
        controller.abort();
      }, 8000);

      var response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
      window.clearTimeout(timeoutId);
      if (!response.ok) throw new Error("Request failed");

      var data = await response.json();
      if (data && data.isPlaying && data.track) {
        root.dataset.state = "playing";
        labelEl.textContent = labelPlaying;
        renderTrack("", data.track);
        scheduleNextRun(fastRefreshMs);
        return;
      }

      if (data && data.lastPlayed) {
        root.dataset.state = "idle";
        labelEl.textContent = labelLastPlayed;
        renderTrack("Last played:", data.lastPlayed);
        scheduleNextRun(fastRefreshMs);
        return;
      }

      renderIdleFallback();
      scheduleNextRun(slowRefreshMs);
    } catch (error) {
      renderIdleFallback();
      scheduleNextRun(retryAfterErrorMs);
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) refreshNowPlaying();
  });

  refreshNowPlaying();
})();
