var audioTrack;
var mediaRecorder;
var recordedChunks = [];
var silenceStart = null;
var recording = false;
var stopAfterMinutesSilence = 1;
var reconnectTimeout = null;
var connectionLostTime = null;
var channelName = "";
var wasRecording = false;
var micEnabled = true;

// Add a debug function
var debug = function (...args) {
  console.log(...args);
};

function reconnect() {
  // Store current settings before reload
  const currentSettings = {
    channel: channelName,
    micEnabled: audioTrack ? audioTrack.enabled : false,
    wasRecording: recording,
  };

  // Store settings in localStorage for persistence
  localStorage.setItem("babelcast_settings", JSON.stringify(currentSettings));

  // Reload the page
  window.location.reload(false);
}

document.getElementById("reload").addEventListener("click", reconnect);

document.getElementById("microphone").addEventListener("click", function () {
  toggleMic();
});

document.getElementById("record").addEventListener("click", function () {
  toggleRecording();
});

var toggleMic = function () {
  let micEle = document.getElementById("microphone");
  micEle.classList.toggle("icon-mute");
  micEle.classList.toggle("icon-mic");
  micEle.classList.toggle("on");
  audioTrack.enabled = micEle.classList.contains("icon-mic");
  micEnabled = audioTrack.enabled;
};

var toggleRecording = function () {
  debug("toggleRecording called, current recording state:", recording);
  if (recording) {
    stopRecording();
  } else {
    startRecording();
  }
};

var startRecording = function () {
  debug("startRecording called");
  if (!mediaRecorder) {
    debug("Error: mediaRecorder not initialized");
    return;
  }

  try {
    recordedChunks = [];
    mediaRecorder.start();
    recording = true;
    document.getElementById("record").innerText = "Stop Recording";
    debug("Recording started successfully");
  } catch (error) {
    debug("Error starting recording:", error);
  }
};

var stopRecording = function () {
  debug("stopRecording called");
  if (!mediaRecorder) {
    debug("Error: mediaRecorder not initialized");
    return;
  }

  try {
    mediaRecorder.stop();
    recording = false;
    document.getElementById("record").innerText = "Record";
    debug("Recording stopped successfully");
  } catch (error) {
    debug("Error stopping recording:", error);
  }
};

var handleDataAvailable = function (event) {
  debug("handleDataAvailable called, data size:", event.data.size);
  if (event.data.size > 0) {
    recordedChunks.push(event.data);
    debug("Chunk added, total chunks:", recordedChunks.length);
  }
};

var handleStop = function () {
  debug("handleStop called");
  try {
    var blob = new Blob(recordedChunks, {
      type: "audio/webm",
    });
    debug("Blob created, size:", blob.size);
    sendBlob(blob);
  } catch (error) {
    debug("Error creating blob:", error);
  }
};

var sendBlob = function (blob) {
  debug("sendBlob called, blob size:", blob.size);
  let date = new Date();
  let filename = `recording_${date.toISOString().slice(0, 10)}_${
    date.getHours() < 10 ? "0" + date.getHours() : date.getHours()
  }_${
    date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()
  }.webm`;
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);

  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }, 0);
};

// Function to connect to a channel
var connectToChannel = function (channel) {
  if (!channel) return;

  document.getElementById("output").classList.remove("hidden");
  document.getElementById("input-form").classList.add("hidden");

  // Store these for potential reconnection
  channelName = channel;

  let params = {
    Channel: channelName,
  };

  let val = { Key: "connect_publisher", Value: params };
  wsSend(val);
  document.getElementById("subtitle").innerText = params.Channel;
  console.log(`Connected to channel: ${params.Channel}`);
};

document.getElementById("input-form").addEventListener("submit", function (e) {
  e.preventDefault();

  // Get values from form
  channelName = document.getElementById("channel").value;

  connectToChannel(channelName);
});

// Function to restore settings after page reload or reconnection
var restoreSettings = function () {
  const savedSettings = localStorage.getItem("babelcast_settings");
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings);

      // Pre-fill form fields if we're still on the form
      if (
        document.getElementById("input-form").classList.contains("hidden") ===
        false
      ) {
        if (settings.channel) {
          document.getElementById("channel").value = settings.channel;
        }
      }

      // Remember these for when the connection is established
      channelName = settings.channel || "";
      wasRecording = settings.wasRecording || false;
      micEnabled = settings.micEnabled || true;

      // Clear the settings to prevent unexpected auto-connections on manual page refreshes
      localStorage.removeItem("babelcast_settings");

      return settings;
    } catch (error) {
      debug("Error restoring settings:", error);
    }
  }
  return null;
};

ws.onmessage = function (e) {
  let wsMsg = JSON.parse(e.data);
  if ("Key" in wsMsg) {
    switch (wsMsg.Key) {
      case "info":
        debug("server info", wsMsg.Value);
        break;
      case "error":
        error("server error", wsMsg.Value);
        document.getElementById("output").classList.add("hidden");
        document.getElementById("input-form").classList.remove("hidden");
        // attempt to reconnect
        reconnect();
        break;
      case "sd_answer":
        startSession(wsMsg.Value);
        break;
      case "ice_candidate":
        pc.addIceCandidate(wsMsg.Value);
        break;
      case "password_required":
        document.getElementById("password-form").classList.remove("hidden");
        break;
    }
  }
};

ws.onclose = function () {
  error("websocket connection closed");
  debug("ws: connection closed");
  if (audioTrack) {
    audioTrack.stop();
  }
  pc.close();
  // attempt to reconnect
  reconnect();
};

//
// -------- WebRTC ------------
//

const constraints = (window.constraints = {
  audio: {
    channels: 1,
    autoGainControl: true,
    echoCancellation: false,
    noiseSuppression: false,
  },
  video: false,
});

try {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  window.audioContext = new AudioContext();
} catch (e) {
  alert("Web Audio API not supported.");
}

const signalMeter = document.querySelector("#microphone-meter meter");

navigator.mediaDevices
  .getUserMedia(constraints)
  .then((stream) => {
    audioTrack = stream.getAudioTracks()[0];
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // Restore settings if available
    const settings = restoreSettings();

    // Set initial mic state
    if (settings && typeof settings.micEnabled !== "undefined") {
      audioTrack.enabled = settings.micEnabled;
      if (settings.micEnabled) {
        let micEle = document.getElementById("microphone");
        micEle.classList.remove("icon-mute");
        micEle.classList.add("icon-mic");
        micEle.classList.add("on");
      }
    } else {
      // Default is muted
      audioTrack.enabled = true;
    }

    micEnabled = audioTrack.enabled;

    const soundMeter = new SoundMeter(window.audioContext);
    soundMeter.connectToSource(stream, function (e) {
      if (e) {
        alert(e);
        return;
      }

      try {
        mediaRecorder = new MediaRecorder(stream);
        debug(
          "MediaRecorder initialized with mimeType:",
          mediaRecorder.mimeType
        );

        mediaRecorder.ondataavailable = handleDataAvailable;
        mediaRecorder.onstop = handleStop;
        mediaRecorder.onerror = (event) => debug("MediaRecorder error:", event);

        debug("MediaRecorder event handlers set up");

        // If we have restored settings and we should be recording, start recording
        if (settings && settings.wasRecording) {
          // Delay starting recording to ensure everything is ready
          setTimeout(startRecording, 1000);
        }
      } catch (error) {
        debug("Error setting up MediaRecorder:", error);
      }

      // make the meter value relative to a sliding max
      let max = 0.0;
      setInterval(() => {
        let val = soundMeter.instant.toFixed(2);
        if (val > max) {
          max = val;
        }
        if (max > 0) {
          val = val / max;
        }
        signalMeter.value = val;

        // Check for silence
        if (val < 0.03 && recording) {
          if (!silenceStart) {
            silenceStart = Date.now();
          } else if (
            Date.now() - silenceStart >
            stopAfterMinutesSilence * 60 * 1000
          ) {
            stopRecording();
            startRecording();
            silenceStart = null;
          }
        } else {
          silenceStart = null;
        }
      }, 50);
    });

    let f = () => {
      debug("webrtc: create offer");
      pc.createOffer()
        .then((d) => {
          debug("webrtc: set local description");
          pc.setLocalDescription(d);
          let val = { Key: "session_publisher", Value: d };
          wsSend(val);
        })
        .catch(debug);
    };
    // create offer if WS is ready, otherwise queue
    ws.readyState == WebSocket.OPEN ? f() : onWSReady.push(f);

    // Auto-connect to channel if we have settings
    if (settings && settings.channel) {
      // First wait for connection to be established
      const checkConnectionState = setInterval(() => {
        if (
          pc.iceConnectionState === "connected" ||
          pc.iceConnectionState === "completed"
        ) {
          clearInterval(checkConnectionState);

          // Auto-fill form and submit if needed
          if (
            document
              .getElementById("input-form")
              .classList.contains("hidden") === false
          ) {
            document.getElementById("channel").value = settings.channel;

            // Connect to the channel
            connectToChannel(settings.channel);
          }
        }
      }, 500);

      // Set a timeout to clear the interval after 10 seconds if connection isn't established
      setTimeout(() => {
        clearInterval(checkConnectionState);
      }, 10000);
    }
  })
  .catch(debug);
