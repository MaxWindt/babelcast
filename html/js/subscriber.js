var getChannelsId = setInterval(function () {
  console.log("get_channels");
  let val = { Key: "get_channels" };
  wsSend(val);
}, 1000);
document.getElementById("play").addEventListener("click", function () {
  const audio = document.getElementById("audio");
  if (audio) {
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }
});
function initializeSubscriber() {
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
            '<i class="material-icons">language</i> ' + channel;
        }

        // Add event listener
        channelButton.addEventListener("click", function () {
          channelClick(this);
        });

        // Append the button to the channel list
        channelsEle.appendChild(channelButton);
      });
    }

    translate_text();
  }

  function channelClick(buttonElement) {
    if (buttonElement.classList.contains("playing")) {
      const audio = document.getElementById("audio");
      if (audio) {
        if (audio.paused) {
          audio.play();
        } else {
          audio.pause();
        }
      }
    } else {
      document.getElementById("play").classList.add("hidden");
      document.getElementById("spinner").classList.remove("hidden");

      // Remove 'playing' class from all channels
      document.querySelectorAll(".playing").forEach((el) => {
        el.classList.remove("playing");
      });

      // Add 'playing' class to this channel
      buttonElement.classList.add("playing");

      // Connect to the selected channel
      let params = {};
      params.Channel = buttonElement.id;

      // Store the channel selection
      localStorage.setItem("lab_channel", params.Channel);

      // Clean up existing connections properly, this will start a new connection
      cleanupConnections();
    }
  }

  function cleanupConnections() {
    // Close any existing audio tracks
    const audio = document.getElementById("audio");
    if (audio) {
      audio.pause();
      audio.srcObject = null;
    }
    closeWS();
  }

  function closeWS() {
    if (ws) {
      ws.close();
    }
  }

  function hardReload() {
    // Close the existing connections
    closeWS();
    window.location.reload(true);
  }

  ws.onmessage = function (e) {
    let wsMsg = JSON.parse(e.data);
    if ("Key" in wsMsg) {
      switch (wsMsg.Key) {
        case "info":
          debug("server info: " + wsMsg.Value);
          break;
        case "error":
          error("server error:", wsMsg.Value);
          document.getElementById("channels").classList.add("hidden");
          localStorage.removeItem("lab_channel");
          hardReload();
          break;
        case "sd_answer":
          startSession(wsMsg.Value);
          break;
        case "channels":
          updateChannels(wsMsg.Value);
          break;
        case "session_received": // Wait for confirmation from server
          document.getElementById("channels").classList.remove("hidden");
          document
            .getElementById("block_buttons_layer")
            .classList.add("hidden");
          document.getElementById("spinner").classList.add("hidden");
          // Auto-connect to the previously selected channel if available
          if (localStorage.getItem("lab_channel")) {
            var params = {
              Channel: localStorage.getItem("lab_channel"),
            };
            // Wait for the channel element to be available before adding the class and connecting
            const waitForElement = setInterval(() => {
              const channelElement = document.getElementById(params.Channel);
              if (channelElement) {
                channelElement.classList.add("playing");
                wsSend({
                  Key: "connect_subscriber",
                  Value: params,
                });
                clearInterval(waitForElement);
              }
            }, 100);
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

  ws.onclose = function () {
    console.log("websocket connection closed, restarting...");
    pc.close();
    document.getElementById("media").classList.add("hidden");
    clearInterval(getChannelsId);
    initializeCommon();
    initializeSubscriber();
  };

  //
  // -------- WebRTC ------------
  //

  pc.ontrack = function (event) {
    debug("webrtc: ontrack");

    let audio;
    const mediaContainer = document.getElementById("media");

    // Clear the media container if needed
    if (mediaContainer.innerHTML.trim() !== "") {
      mediaContainer.innerHTML = "";
    }

    // Create a new audio element
    audio = document.createElement("audio");
    audio.id = "audio";
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    audio.playsInline = true;

    // Add the audio element to the page
    mediaContainer.appendChild(audio);

    // Setup audio event handlers
    setupAudioHandlers(audio);

    // Show the media container and play button
    mediaContainer.classList.remove("hidden");
    document.getElementById("play").classList.remove("hidden");
  };

  function setupAudioHandlers(audio) {
    const playButton = document.getElementById("play");

    // Visibility change handler
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && audio.paused) {
        // Try to play when coming back to page
        audio.play().catch((err) => {
          console.error("Failed to play audio:", err);
        });
      }
    });

    // Audio state handlers
    audio.onended = function () {
      console.log("stream ended");
      playButton.innerHTML = '<span class="material-icons">refresh</span>';
      playButton.onclick = function () {
        window.location.reload();
      };
    };

    audio.onwaiting = function () {
      console.log("waiting for audio data");
      document.getElementById("spinner").classList.remove("hidden");
    };

    audio.oncanplaythrough = function () {
      document.getElementById("spinner").classList.add("hidden");
    };

    audio.onerror = function () {
      console.log("error loading audio data");
      playButton.innerHTML = "error";
    };

    // Play/Pause button handlers
    audio.onplay = function () {
      playButton.innerHTML = '<i class="material-icons">pause</i>';
    };

    audio.onpause = function () {
      playButton.innerHTML = '<i class="material-icons">play_arrow</i>';
    };

    // Set initial button state
    playButton.innerHTML = '<i class="material-icons">play_arrow</i>';
  }

  pc.addTransceiver("audio");

  let f = () => {
    debug("webrtc: create offer");
    pc.createOffer()
      .then((d) => {
        debug("webrtc: set local description");
        pc.setLocalDescription(d);
        let val = { Key: "session_subscriber", Value: d };
        wsSend(val);
      })
      .catch(debug);
  };

  // Create offer if WS is ready, otherwise queue
  ws.readyState == WebSocket.OPEN ? f() : onWSReady.push(f);
}

// Call the initialization function
initializeSubscriber();
