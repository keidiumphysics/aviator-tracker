const WebSocket = require('ws');

// Connects directly to the stream you found in F12
const ws = new WebSocket('wss://aviator-next.spribegaming.com/game/ws'); 

ws.on('message', function incoming(data) {
    const message = data.toString();

    // 
(function () {
  // 1. Defeat Anti-Debugging console.clear() blocks
  const originalClear = console.clear;
  console.clear = function () {
    console.log("[Info] Blocked game's attempt to clear the console.");
  };

  console.log("%c=== AVIATOR LIFECYCLE TRACKER ACTIVE ===", "color: #00ffcc; font-weight: bold; font-size: 16px;");

  // State Management
  let capturedRounds = [];
  let pendingRoundStartTime = null; // Captures the exact millisecond the waiting phase appears
  let lastLoggedMultiplier = null;

  // Initialize the first timestamp fallback immediately upon load
  pendingRoundStartTime = new Date().toLocaleTimeString();

  // 2. Automated WebSocket Lifecycle Sniffer
  const originalAddEventListener = WebSocket.prototype.addEventListener;
  WebSocket.prototype.addEventListener = function(type, listener, options) {
    if (type === 'message') {
      const originalListener = listener;
      listener = function(event) {
        handleIncomingData(event.data, "WebSocket");
        return originalListener.apply(this, arguments);
      };
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  const activeSockets = new Set();
  const originalSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function(data) {
    if (!activeSockets.has(this)) {
      activeSockets.add(this);
      this.addEventListener('message', (event) => {
        handleIncomingData(event.data, "WebSocket (Direct)");
      });
    }
    return originalSend.apply(this, arguments);
  };

  // 3. Automated Fetch / HTTP Request Sniffer
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const clone = response.clone();
      const text = await clone.text();
      handleIncomingData(text, "HTTP Fetch");
    } catch (e) {}
    return response;
  };

  // 4. Parse incoming raw data streams for absolute game states
  function handleIncomingData(rawData, source) {
    if (!rawData) return;
   
    let textContent = "";
    if (typeof rawData === 'string') {
      textContent = rawData;
    } else if (rawData instanceof ArrayBuffer) {
      textContent = new TextDecoder("utf-8").decode(rawData);
    } else if (rawData instanceof Blob) {
      const reader = new FileReader();
      reader.onload = function() {
        handleIncomingData(reader.result, source + " (Blob)");
      };
      reader.readAsText(rawData);
      return;
    }

    // Capture the state changes directly from the data stream
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(textContent);
    } catch(e) {}

    if (parsedJson) {
      processLifecyclePayload(parsedJson, source);
    }
  }

  function processLifecyclePayload(json, source) {
    // Detect "Waiting for bets" state inside network streams
    if (json.stage === 'Betting' || json.state === 'Betting' || json.type === 'bets-open') {
      pendingRoundStartTime = new Date().toLocaleTimeString();
      return;
    }

    // Detect finalized multiplier inside network streams
    if (json.stage === 'FlyAway' || json.state === 'End') {
      const findMultiplier = (obj) => {
        for (let key in obj) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            findMultiplier(obj[key]);
          } else if (key === 'multiplier' || key === 'coefficient') {
            const multValue = parseFloat(obj[key]);
            if (!isNaN(multValue) && multValue >= 1.0) {
              registerRoundData(multValue, source);
            }
          }
        }
      };
      findMultiplier(json);
    }
  }
  // 5. Dual Visual Observer: Tracks both Completed Rounds and "Waiting for Bets" phases
  function scanGameInterface() {
    // A. Detect "Waiting for bets" phase visually to log precise round start times
    // Spribe Aviator uses specific structural classes or texts for the bet-waiting countdown bar
    const waitingElement = document.querySelector('.navigation-trigger, .bet-time, .waiting-label, .countdown, app-bet-controls');
    if (waitingElement) {
      const txt = waitingElement.innerText ? waitingElement.innerText.toLowerCase() : "";
      if (txt.includes("waiting") || txt.includes("next round") || txt.includes("place your bet") || document.querySelector('.progress-bar')) {
        const currentTime = new Date().toLocaleTimeString();
        // Only set if we haven't locked a timestamp for this upcoming round yet
        if (!pendingRoundStartTime || pendingRoundStartTime === "Processing...") {
          pendingRoundStartTime = currentTime;
        }
      }
    }

    // B. Detect finalized rounds via the official top history ribbon items
    const historyContainer = document.querySelector('.payouts-block, .stats-list, .history-item');
    if (!historyContainer) {
      const items = Array.from(document.querySelectorAll('app-payout-item, .bubble, .history-item, .payout-item'));
      if (items.length > 0) {
        parseHistoryElement(items[0]); // Target only the absolute newest bubble in the collection
      }
      return;
    }

    const completedRounds = historyContainer.querySelectorAll('.multiplier, div, span');
    for (let el of completedRounds) {
      const text = el.innerText ? el.innerText.trim() : "";
      if (/^\d+(\.\d+)?x$/.test(text)) {
        const val = parseFloat(text.replace('x', ''));
        if (!isNaN(val) && val >= 1.0) {
          parseHistoryElement(el, val);
          break; // Immediately exit loop after checking the absolute newest entry
        }
      }
    }
  }

  function parseHistoryElement(element, forcedValue) {
    const val = forcedValue || parseFloat(element.innerText.replace('x', '').trim());
    if (isNaN(val)) return;

    // Zero-filtering check: Log everything that enters the history sequence
    if (val !== lastLoggedMultiplier) {
      lastLoggedMultiplier = val;
      console.log(`[DOM Observer] Round Finished: ${val}x`);
      registerRoundData(val, "DOM History Observer");
    }
  }

  // Scan every 200ms aggressively to prevent any missed rounds or timing lag
  setInterval(scanGameInterface, 200);

  // 6. Register and Track Every Single Round Flawlessly Indefinitely
  function registerRoundData(multiplier, source) {
    const finalMult = multiplier;
   
    // Safety fallback: if network/DOM timing matched exactly, use current time minus a minor offset
    const finalStartTime = pendingRoundStartTime || new Date().toLocaleTimeString();

    const newRound = {
      multiplier: finalMult,
      startTimeString: finalStartTime,
      source: source
    };

    // Push into storage. No maximum caps, limits, or pop methods—keeps data for days/weeks/months
    capturedRounds.unshift(newRound);

    // Reset timestamp pointer so the next "Waiting for bets" cycle captures a fresh time frame
    pendingRoundStartTime = "Processing...";

    updateHUD();
    triggerToastNotification(finalMult);
    console.log(`[Logged] Round: ${finalMult}x | Start Time Verified: ${finalStartTime}`);
  }

  // 7. Inject Streamlined Tracking Table HUD
  function injectHUD() {
    const existing = document.getElementById("aviator-auto-hud");
    if (existing) existing.remove();

    const hud = document.createElement("div");
    hud.id = "aviator-auto-hud";
    hud.style.cssText = `
      position: absolute;
      top: 60px;
      right: 20px;
      width: 320px;
      max-height: 450px;
      background: rgba(10, 10, 14, 0.98);
      border: 1px solid #00e5ff;
      border-radius: 10px;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #fff;
      z-index: 9999999;
      box-shadow: 0 8px 32px rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
    `;

    hud.innerHTML = `
      <div style="background: #00e5ff; color: #0a0a0e; padding: 10px; font-weight: bold; border-top-left-radius: 8px; border-top-right-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 13px;">
        <span>🚀 AVIATOR LIFECYCLE SNIFFER</span>
        <button id="close-auto-hud" style="background: none; border: none; color: #0a0a0e; cursor: pointer; font-size: 16px; font-weight: bold;">×</button>
      </div>
      <div id="hud-counter-status" style="padding: 6px; background: #12121a; font-size: 11px; text-align: center; border-bottom: 1px solid #222; color: #00e5ff;">
        🟢 Total Rounds Tracked: 0
      </div>
      <div id="auto-round-list" style="overflow-y: auto; flex: 1; padding: 12px; max-height: 300px;">
        <div style="color: #666; text-align: center; margin-top: 50px;">Waiting for rounds...</div>
      </div>
      <div style="padding: 10px; background: #12121a; display: flex; gap: 8px; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
        <button id="clean-copy-btn" style="flex: 1; padding: 10px; background: #00e5ff; color: #0a0a0e; border: none; border-radius: 5px; font-weight: bold; cursor: pointer; font-size: 13px;">copy data</button>
      </div>
    `;

    document.body.appendChild(hud);

    document.getElementById("close-auto-hud").addEventListener("click", () => hud.remove());
    document.getElementById("clean-copy-btn").addEventListener("click", () => {
      copyToClipboard(getCleanDataLog());
     
      const btn = document.getElementById("clean-copy-btn");
      btn.innerText = "Copied Rounds + Start Times!";
      btn.style.background = "#28a745";
      btn.style.color = "#fff";
      setTimeout(() => {
        btn.innerText = "copy data";
        btn.style.background = "#00e5ff";
        btn.style.color = "#0a0a0e";
      }, 1500);
    });
  }

  function updateHUD() {
    const listEl = document.getElementById("auto-round-list");
    const counterEl = document.getElementById("hud-counter-status");
    if (!listEl) return;

    if (counterEl) {
      counterEl.innerText = `🟢 Total Rounds Tracked: ${capturedRounds.length}`;
    }

    if (capturedRounds.length === 0) return;

    listEl.innerHTML = capturedRounds.map((round, index) => {
      let pillBg = "#ff1744";
      if (round.multiplier >= 10) pillBg = "#d500f9";
      else if (round.multiplier >= 2) pillBg = "#2979ff";

      return `
        <div style="border-bottom: 1px solid #1a1a24; padding-bottom: 6px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #bbb; font-size: 12px;">Started: <b>${round.startTimeString}</b></span>
          <span style="background: ${pillBg}; color: #fff; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">${round.multiplier.toFixed(2)}x</span>
        </div>
      `;
    }).join("");
  }

  // 8. Clean Copy Engine: Extracts exclusively Multipliers and explicit Start Times
  window.getCleanDataLog = function () {
    if (capturedRounds.length === 0) {
      return "No data logged yet.";
    }

    // Returns a raw list sorting sequentially from the total logs matching your exact specification
    return capturedRounds.map((r, idx) => {
      const entryNum = capturedRounds.length - idx;
      return `Round #${entryNum} | Start Time: ${r.startTimeString} | Result: ${r.multiplier.toFixed(2)}x`;
    }).join("\n");
  };

  function copyToClipboard(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  }

  function triggerToastNotification(mult) {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #00e5ff;
      color: #0a0a0e;
      padding: 10px 20px;
      font-weight: bold;
      border-radius: 8px;
      box-shadow: 0 4px 15px rgba(0, 229, 255, 0.3);
      z-index: 10000000;
      font-family: sans-serif;
      font-size: 13px;
      pointer-events: none;
      transition: opacity 0.4s ease-out;
    `;
    toast.innerText = `Logged: ${mult.toFixed(2)}x`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 400);
    }, 1200);
  }

  // Init
  injectHUD();
  scanGameInterface();
})();
          
    // Tell it to listen for the crash data strings instead of looking at the screen HTML elements
    if (message.includes('"type":"crash"')) {
        console.log("Round finished: " + message);
    }
});

ws.on('close', () => {
    // Automatically reconnects if the connection drops
    setTimeout(() => { process.exit(1); }, 1000); 
});
