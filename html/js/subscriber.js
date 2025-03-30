var getChannelsId = setInterval(function () {
  console.log("get_channels");
  let val = { Key: "get_channels" };
  wsSend(val);
}, 1000);

function updateChannels(channels) {
  let channelsEle = document.querySelector("#channels div");
  channelsEle.innerHTML = "";

  if (channels.length > 0) {
    clearInterval(getChannelsId);
    document.getElementById("nochannels").classList.add("hidden");
    // Helper function to assign a rank to each channel
    function getChannelRank(channel) {
      if (/live|original/i.test(channel)) return 1;
      if (/translation|uebersetzung/i.test(channel)) return 2;
      if (/english|englisch/i.test(channel)) return 3;
      return 4;
    }
    // Sort channels by rank
    channels.sort((a, b) => {
      const rankA = getChannelRank(a);
      const rankB = getChannelRank(b);
      return rankA - rankB;
    });

    channels.forEach((channel) => {
      let li = document.createElement("div");
      li.classList.add("mdl-card__actions", "mdl-card--border");

      // Create the button for the channel
      let channelButton = document.createElement("a");
      channelButton.classList.add(
        "button",
        "mdl-button",
        "mdl-button--raised",
        "mdl-js-button",
        "mdl-js-ripple-effect"
      );
      channelButton.id = channel;

      // Set the innerHTML and icon based on the channel name
      if (/live|original/i.test(channel)) {
        channelButton.innerHTML =
          '<i class="material-icons">record_voice_over</i> <i id=btn_original>Original</i>';
      } else if (/translation|uebersetzung/i.test(channel)) {
        channelButton.innerHTML =
          '<i class="material-icons">translate</i> <i id=btn_translation>Translation</i>';
      } else {
        channelButton.innerHTML =
          '<i class="material-icons">music_note</i> ' + channel;
      }

      // Add event listener for the button
      setupChannelButton(channelButton);

      // Append the button to the list item
      li.appendChild(channelButton);

      // Append the list item to the channel list
      channelsEle.appendChild(channelButton);
    });
  }

  translate_text();
}

function closeWS() {
  if (ws) {
    ws.close();
  }
}

function hardReload() {
  // Close the existing PeerConnection
  closeWS();
  window.location.reload(true);
}
function switchChannel(channelId) {
  // Store the new channel
  localStorage.setItem("lab_channel", channelId);

  // Clean up existing connections properly, this will start a new connection
  cleanupConnections();
}

function cleanupConnections() {
  // Close peer connection if it exists
  if (pc) {
    pc.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });
    pc.close();
  }

  // Close WebSocket if it exists
  if (ws) {
    ws.close();
  }

  // Reset audio element
  const audio = document.getElementById("audio");
  if (audio) {
    audio.srcObject = null;
  }
}

function initializeConnection() {
  ws = new WebSocket(ws_uri);
  pc = new RTCPeerConnection({
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
    ],
  });

  setupWebSocketHandlers(ws);
  setupWebRTCHandlers(pc);
  createOffer(pc);
}

function setupWebRTCHandlers(pc) {
  // Single consolidated track handler
  pc.ontrack = function (event) {
    let audio = document.getElementById("audio");

    if (audio) {
      console.log("updating stream");
      audio.srcObject = event.streams[0];
    } else {
      let el = document.createElement(event.track.kind);
      el.srcObject = event.streams[0];
      el.autoplay = true;
      el.playsInline = true;
      el.id = "audio";

      const media_placeholder = document.getElementById("media");
      media_placeholder.innerHTML = "";
      media_placeholder.appendChild(el);
      audio = el;
    }

    setupAudioHandlers(audio); // Moved audio-specific handlers to separate function
  };

  pc.oniceconnectionstatechange = function (e) {
    debug("ICE state:", pc.iceConnectionState);
    switch (pc.iceConnectionState) {
      case "connected":
        document.getElementById("spinner").classList.add("hidden");
        let cb = document.getElementById("connect-button");
        if (cb) {
          cb.classList.remove("hidden");
        }
        break;
      case "failed":
      case "disconnected":
      case "closed":
        // Handle disconnection states
        break;
    }
  };

  pc.onicecandidate = function (e) {
    if (e.candidate && e.candidate.candidate !== "") {
      wsSend({
        Key: "ice_candidate",
        Value: e.candidate,
      });
    }
  };
}

function setupWebSocketHandlers(ws) {
  // Single consolidated message handler
  ws.onmessage = function (e) {
    let wsMsg = JSON.parse(e.data);
    if ("Key" in wsMsg) {
      switch (wsMsg.Key) {
        case "info":
          debug("server info:", wsMsg.Value);
          break;
        case "error":
          error("server error:", wsMsg.Value);
          document.getElementById("channels").classList.add("hidden");
          localStorage.removeItem("channel");
          hardReload();
          break;
        case "sd_answer":
          startSession(wsMsg.Value);
          break;
        case "channels":
          updateChannels(wsMsg.Value);
          break;
        case "session_established":
          document.getElementById("channels").classList.remove("hidden");
          document
            .getElementById("block_buttons_layer")
            .classList.add("hidden");
          document.getElementById("spinner").classList.add("hidden");
          console.log("session_established");
          if (localStorage.getItem("lab_channel")) {
            let params = {
              Channel: localStorage.getItem("lab_channel"),
            };
            document.getElementById(params.Channel).classList.add("playing");
            wsSend({
              Key: "connect_subscriber",
              Value: params,
            });
          }
          break;
        case "ice_candidate":
          pc.addIceCandidate(wsMsg.Value);
          break;

        case "channel_closed":
          error("channel '" + wsMsg.Value + "' closed by server");

          break;
      }
    }
  };

  // Single consolidated close handler
  ws.onclose = function () {
    error("websocket connection closed");
    pc.close();
    document.getElementById("media").classList.add("hidden");
    // Restart connection if websocket was closed
    initializeConnection();
  };

  ws.onopen = function () {
    debug("WS connection open");
  };
}

function createOffer(pc) {
  pc.addTransceiver("audio"); // Move this here from global scope

  return pc
    .createOffer()
    .then((offer) => {
      return pc.setLocalDescription(offer);
    })
    .then(() => {
      wsSend({
        Key: "session_subscriber",
        Value: pc.localDescription,
      });
    })
    .catch((err) => {
      console.error("Error creating offer:", err);
      debug(err);
    });
}

function handleRemoteAnswer(sdp) {
  const answer = new RTCSessionDescription({
    type: "answer",
    sdp: sdp,
  });

  pc.setRemoteDescription(answer).catch((err) => {
    console.error("Error setting remote description:", err);
    debug(err);
  });
}

function handleRemoteCandidate(candidate) {
  pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((err) => {
    console.error("Error adding ICE candidate:", err);
    debug(err);
  });
}

function handleSessionEstablished() {
  document.getElementById("channels").classList.remove("hidden");
  document.getElementById("block_buttons_layer").classList.add("hidden");
  document.getElementById("spinner").classList.add("hidden");

  if (localStorage.getItem("lab_channel")) {
    let params = {
      Channel: localStorage.getItem("lab_channel"),
    };
    document.getElementById(params.Channel).classList.add("playing");
    wsSend({
      Key: "connect_subscriber",
      Value: params,
    });
  }
}

// Modify your channel button click handler
function setupChannelButton(channelButton) {
  channelButton.addEventListener("click", function handleClick() {
    if (this.classList.contains("playing")) {
      const audio = document.getElementById("audio");
      if (audio?.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    } else {
      document.getElementById("play").classList.add("hidden");
      document.getElementById("spinner").classList.remove("hidden");

      // Remove 'playing' class from all channels
      document.querySelectorAll(".playing").forEach((el) => {
        el.classList.remove("playing");
      });

      // Add 'playing' class to this channel
      this.classList.add("playing");

      switchChannel(this.id);
    }
  });
}

function setupAudioHandlers(audio) {
  const playButton = document.getElementById("play");
  playButton.classList.remove("hidden");

  // Visibility change handler
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && audio.paused) {
      hardReload();
    }
  });

  // Audio state handlers
  audio.onended = () => {
    console.log("stream ended, reloading...");
    closeWS();
  };

  audio.onwaiting = () => {
    console.log("waiting for audio data, reloading...");
    closeWS();
  };

  audio.onerror = () => {
    console.log("error loading audio data, reloading...");
    closeWS();
  };

  // Time update handler
  let currentTime = null;
  audio.ontimeupdate = () => {
    let lastTime = currentTime;
    currentTime = Math.floor(audio.currentTime);
    if (currentTime !== lastTime) {
      let hours = Math.floor(currentTime / 3600);
      let minutes = Math.floor((currentTime % 3600) / 60);
      let seconds = currentTime % 60;
      console.log(`${hours}:${minutes}:${seconds}`);
    }
  };

  // Play/Pause button handlers
  playButton.onclick = () => {
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  };

  audio.onplay = () => {
    playButton.innerHTML = '<i class="material-icons">pause</i>';
  };

  audio.onpause = () => {
    playButton.innerHTML = '<i class="material-icons">play_arrow</i>';
  };

  // Initial play button state
  setTimeout(() => {
    if (audio.paused) {
      playButton.innerHTML = '<i class="material-icons">play_arrow</i>';
    }
  }, 500);
}

function setupEventHandlers() {
  // WebSocket event handlers
  ws.onmessage = function (e) {
    // Your existing onmessage handler
    let wsMsg = JSON.parse(e.data);
    if ("Key" in wsMsg) {
      switch (wsMsg.Key) {
        case "info":
          debug("server info:", wsMsg.Value);
          break;
        case "error":
          error("server error:", wsMsg.Value);
          document.getElementById("channels").classList.add("hidden");
          localStorage.removeItem("channel");
          hardReload();
          break;
        case "sd_answer":
          startSession(wsMsg.Value);
          break;
        case "channels":
          updateChannels(wsMsg.Value);
          break;
        case "session_established":
          document.getElementById("channels").classList.remove("hidden");
          document
            .getElementById("block_buttons_layer")
            .classList.add("hidden");
          document.getElementById("spinner").classList.add("hidden");
          console.log("session_established");
          if (localStorage.getItem("lab_channel") !== null || undefined) {
            let params = {};
            params.Channel = localStorage.getItem("lab_channel");
            document.getElementById(params.Channel).classList.add("playing");
            let val = { Key: "connect_subscriber", Value: params };
            wsSend(val);
          }
          break;
        case "ice_candidate":
          pc.addIceCandidate(wsMsg.Value);
          break;
      }
    }
  };

  ws.onopen = function () {
    debug("WS connection open");
  };

  ws.onclose = function () {
    debug("WS connection closed");
  };

  // WebRTC event handlers
  pc.ontrack = function (event) {
    let audio = document.getElementById("audio");

    if (audio) {
      console.log("updating stream");
      audio.srcObject = event.streams[0];
    } else {
      let el = document.createElement(event.track.kind);
      el.srcObject = event.streams[0];
      el.autoplay = true;
      el.playsInline = true;
      el.id = "audio";

      const media_placeholder = document.getElementById("media");
      media_placeholder.innerHTML = "";
      media_placeholder.appendChild(el);
    }
    document.getElementById("play").classList.remove("hidden");
    audio = document.getElementById("audio");

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && audio.paused) {
        hardReload();
      }
    });

    audio.onended = function () {
      console.log("stream ended, reloading...");
      closeWS();
    };
    audio.onwaiting = function () {
      console.log("waiting for audio data, reloading...");
      closeWS();
    };
    audio.onerror = function () {
      console.log("error loading audio data, reloading...");
      closeWS();
    };

    let currentTime = null;
    audio.ontimeupdate = function () {
      let lastTime = currentTime;
      currentTime = Math.floor(audio.currentTime);
      if (currentTime !== lastTime) {
        let hours = Math.floor(currentTime / 3600);
        let minutes = Math.floor((currentTime % 3600) / 60);
        let seconds = currentTime % 60;
        console.log(`${hours}:${minutes}:${seconds}`);
      }
    };

    let playButton = document.getElementById("play");
    playButton.onclick = function () {
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    };

    audio.onplay = function () {
      playButton.innerHTML = '<i class="material-icons">pause</i>';
    };
    audio.onpause = function () {
      playButton.innerHTML = '<i class="material-icons">play_arrow</i>';
    };

    playButton.classList.remove("hidden");
    setTimeout(function () {
      if (audio.paused) {
        playButton.innerHTML = '<i class="material-icons">play_arrow</i>';
      }
    }, 500);
  };

  pc.oniceconnectionstatechange = function (e) {
    debug("ICE state:", pc.iceConnectionState);
    switch (pc.iceConnectionState) {
      case "new":
      case "checking":
      case "failed":
      case "disconnected":
      case "closed":
      case "completed":
        break;
      case "connected":
        document.getElementById("spinner").classList.add("hidden");
        let cb = document.getElementById("connect-button");
        if (cb) {
          cb.classList.remove("hidden");
        }
        break;
      default:
        debug("ice state unknown", e);
        break;
    }
  };
}
initializeConnection();
