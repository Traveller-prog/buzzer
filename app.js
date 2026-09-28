/**
 * FlashBuzzer - Precision Dual Buzzer System
 * Features:
 * - Ultra-low latency event handling with high-resolution performance.now()
 * - Simultaneous press detection window (auto-resets and logs timestamp)
 * - First-to-buzz lock-out & winner declaration
 * - Millisecond-accurate timestamp logging & CSV export
 * - Web Audio API sound synthesis (zero external audio files needed)
 * - Multi-touch support for touchscreens and tablet play
 */

(function () {
  'use strict';

  // --- State ---
  const state = {
    roundNumber: 1,
    status: 'idle', // 'idle' | 'evaluating' | 'locked' | 'tie'
    p1Score: 0,
    p2Score: 0,
    tieThresholdMs: 40,
    soundEnabled: true,
    evalTimer: null,
    autoResetTimer: null,
    firstPressData: null,
    secondPressData: null,
    eventLogs: []
  };

  // --- DOM Elements ---
  const elements = {
    // Stage & Status
    statusStage: document.getElementById('statusStage'),
    statusBadge: document.getElementById('statusBadge'),
    statusMessage: document.getElementById('statusMessage'),
    statusSubdetail: document.getElementById('statusSubdetail'),
    manualResetBtn: document.getElementById('manualResetBtn'),

    // Player 1
    p1Card: document.getElementById('p1Card'),
    p1BuzzerBtn: document.getElementById('p1BuzzerBtn'),
    p1Name: document.getElementById('p1Name'),
    p1Score: document.getElementById('p1Score'),
    p1Timestamp: document.getElementById('p1Timestamp'),
    p1WinnerBadge: document.getElementById('p1WinnerBadge'),
    quickScoreP1: document.getElementById('quickScoreP1'),

    // Player 2
    p2Card: document.getElementById('p2Card'),
    p2BuzzerBtn: document.getElementById('p2BuzzerBtn'),
    p2Name: document.getElementById('p2Name'),
    p2Score: document.getElementById('p2Score'),
    p2Timestamp: document.getElementById('p2Timestamp'),
    p2WinnerBadge: document.getElementById('p2WinnerBadge'),
    quickScoreP2: document.getElementById('quickScoreP2'),

    // Log & Table
    logBody: document.getElementById('logBody'),
    emptyRow: document.getElementById('emptyRow'),
    logCount: document.getElementById('logCount'),
    downloadLogBtn: document.getElementById('downloadLogBtn'),
    clearLogBtn: document.getElementById('clearLogBtn'),

    // Settings & Modal
    tieThresholdInput: document.getElementById('tieThreshold'),
    thresholdValue: document.getElementById('thresholdValue'),
    modalThreshold: document.getElementById('modalThreshold'),
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    helpBtn: document.getElementById('helpBtn'),
    helpModal: document.getElementById('helpModal'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    gotItBtn: document.getElementById('gotItBtn')
  };

  // --- Web Audio API Synthesizer ---
  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!state.soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === 'p1') {
        // Player 1 Winner Chime: Bright Rising Triad
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.06);

          gain.gain.setValueAtTime(0, now + idx * 0.06);
          gain.gain.linearRampToValueAtTime(0.3, now + idx * 0.06 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.06);
          osc.stop(now + idx * 0.06 + 0.36);
        });
      } else if (type === 'p2') {
        // Player 2 Winner Chime: Energetic Neon Synth
        const notes = [587.33, 739.99, 880.00, 1174.66]; // D5, F#5, A5, D6
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + idx * 0.06);

          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(2200, now);

          gain.gain.setValueAtTime(0, now + idx * 0.06);
          gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.06 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + idx * 0.06);
          osc.stop(now + idx * 0.06 + 0.36);
        });
      } else if (type === 'tie') {
        // Tie Sound: Clashing Buzz / Discordant alert followed by warning wobble
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc1.frequency.setValueAtTime(320, now);
        osc2.frequency.setValueAtTime(336, now); // 16Hz dissonance beat

        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.46);
        osc2.stop(now + 0.46);

        // Auto-reset chirp
        setTimeout(() => {
          if (!audioCtx) return;
          const osc3 = ctx.createOscillator();
          const gain3 = ctx.createGain();
          osc3.type = 'sine';
          osc3.frequency.setValueAtTime(800, ctx.currentTime);
          osc3.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.15);
          gain3.gain.setValueAtTime(0.2, ctx.currentTime);
          gain3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
          osc3.connect(gain3);
          gain3.connect(ctx.destination);
          osc3.start();
          osc3.stop(ctx.currentTime + 0.16);
        }, 300);
      } else if (type === 'reset') {
        // Quick Reset Pip
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
      }
    } catch (e) {
      console.warn('Audio synthesis failed:', e);
    }
  }

  // --- Timestamp Formatter ---
  function getFormattedTimestamp(dateObj = new Date()) {
    const hours = String(dateObj.getHours()).padStart(2, '0');
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const seconds = String(dateObj.getSeconds()).padStart(2, '0');
    const millis = String(dateObj.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${millis}`;
  }

  function getFullDateTimeString(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day} ${getFormattedTimestamp(dateObj)}`;
  }

  // --- Core Buzzer Trigger Logic ---
  function triggerBuzzer(player) {
    // If system is already locked or currently resetting from a tie, ignore
    if (state.status === 'locked' || state.status === 'tie') {
      return;
    }

    const perfTime = performance.now();
    const wallDate = new Date();
    const formattedTime = getFormattedTimestamp(wallDate);

    // Visual press down state
    const btnEl = player === 'p1' ? elements.p1BuzzerBtn : elements.p2BuzzerBtn;
    btnEl.classList.add('is-pressed');
    setTimeout(() => btnEl.classList.remove('is-pressed'), 120);

    // Scenario 1: First buzzer press
    if (state.status === 'idle') {
      state.status = 'evaluating';
      state.firstPressData = {
        player: player,
        perfTime: perfTime,
        wallDate: wallDate,
        formattedTime: formattedTime
      };

      // Update immediate timestamp display for that player
      if (player === 'p1') {
        elements.p1Timestamp.textContent = formattedTime;
      } else {
        elements.p2Timestamp.textContent = formattedTime;
      }

      // Schedule window to check if opponent presses simultaneously
      state.evalTimer = setTimeout(() => {
        finalizeSoleWinner();
      }, state.tieThresholdMs);

      return;
    }

    // Scenario 2: Second buzzer press within evaluating window
    if (state.status === 'evaluating') {
      // Check if it's the OTHER player
      if (player !== state.firstPressData.player) {
        state.secondPressData = {
          player: player,
          perfTime: perfTime,
          wallDate: wallDate,
          formattedTime: formattedTime
        };

        const timeDiff = Math.abs(state.secondPressData.perfTime - state.firstPressData.perfTime);

        // Check if within tie threshold
        if (timeDiff <= state.tieThresholdMs) {
          clearTimeout(state.evalTimer);
          handleSimultaneousTie(timeDiff);
        } else {
          // Exceeded window, first player wins
          finalizeSoleWinner();
        }
      }
    }
  }

  // --- Handle Sole Winner ---
  function finalizeSoleWinner() {
    state.status = 'locked';
    const winnerData = state.firstPressData;
    const winner = winnerData.player;
    const winnerName = winner === 'p1' ? elements.p1Name.value.trim() : elements.p2Name.value.trim();
    const opponentName = winner === 'p1' ? elements.p2Name.value.trim() : elements.p1Name.value.trim();

    // Increment score
    if (winner === 'p1') {
      state.p1Score++;
      elements.p1Score.textContent = state.p1Score;
      elements.quickScoreP1.textContent = `P1: ${state.p1Score}`;
    } else {
      state.p2Score++;
      elements.p2Score.textContent = state.p2Score;
      elements.quickScoreP2.textContent = `P2: ${state.p2Score}`;
    }

    // Stage update
    elements.statusStage.className = `status-stage state-${winner}-won`;
    elements.statusBadge.textContent = `${winner.toUpperCase()} FIRST!`;
    elements.statusMessage.innerHTML = `<span>🏆</span> ${winnerName} gets to answer!`;
    elements.statusSubdetail.innerHTML = `First buzzer registered at <strong style="color:#fff">${winnerData.formattedTime}</strong> &bull; Press <kbd>Space</kbd> or Reset to continue`;

    // Cards update
    if (winner === 'p1') {
      elements.p1Card.classList.add('is-winner');
      elements.p2Card.classList.add('is-locked');
      elements.p1Timestamp.textContent = winnerData.formattedTime;
    } else {
      elements.p2Card.classList.add('is-winner');
      elements.p1Card.classList.add('is-locked');
      elements.p2Timestamp.textContent = winnerData.formattedTime;
    }

    // Play Sound
    playSound(winner);

    // Log Event
    addLogEntry({
      round: state.roundNumber++,
      resultType: winner,
      winnerName: winnerName,
      timestamp: winnerData.wallDate,
      delta: 'First Buzz',
      details: `${winnerName} locked out ${opponentName} first`
    });
  }

  // --- Handle Simultaneous Tie & Auto-Reset ---
  function handleSimultaneousTie(deltaMs) {
    state.status = 'tie';
    const roundedDelta = deltaMs.toFixed(1);
    const p1Date = state.firstPressData.player === 'p1' ? state.firstPressData.wallDate : state.secondPressData.wallDate;
    const p2Date = state.firstPressData.player === 'p2' ? state.firstPressData.wallDate : state.secondPressData.wallDate;

    // Display timestamps on both cards
    elements.p1Timestamp.textContent = getFormattedTimestamp(p1Date);
    elements.p2Timestamp.textContent = getFormattedTimestamp(p2Date);

    // Stage update
    elements.statusStage.className = 'status-stage state-tie';
    elements.statusBadge.textContent = 'SIMULTANEOUS BUZZ';
    elements.statusMessage.innerHTML = '<span>⚡</span> Both Buzzed at Once! Resetting...';
    elements.statusSubdetail.innerHTML = `Timing gap was only <strong>${roundedDelta}ms</strong> (Threshold: ${state.tieThresholdMs}ms) &bull; Resetting buzzer...`;

    // Visual indicators
    elements.p1Card.classList.add('is-winner');
    elements.p2Card.classList.add('is-winner');

    // Play tie sound
    playSound('tie');

    // Log the Tie Event with exact timestamps noted
    addLogEntry({
      round: state.roundNumber++,
      resultType: 'tie',
      winnerName: 'Simultaneous Tie',
      timestamp: new Date(),
      delta: `&plusmn;${roundedDelta} ms`,
      details: `Both pressed simultaneously (${elements.p1Name.value.trim()} & ${elements.p2Name.value.trim()}) &bull; Auto-reset`
    });

    // Auto-Reset after 1.4 seconds countdown
    clearTimeout(state.autoResetTimer);
    let countdown = 1;
    const interval = setInterval(() => {
      if (state.status !== 'tie') {
        clearInterval(interval);
        return;
      }
      elements.statusSubdetail.innerHTML = `Simultaneous press noted &bull; Auto-resetting in <strong>${countdown}s</strong>...`;
      countdown--;
    }, 500);

    state.autoResetTimer = setTimeout(() => {
      clearInterval(interval);
      if (state.status === 'tie') {
        resetBuzzer(false); // Clean reset
      }
    }, 1400);
  }

  // --- Reset System ---
  function resetBuzzer(playSoundEffect = true) {
    clearTimeout(state.evalTimer);
    clearTimeout(state.autoResetTimer);

    state.status = 'idle';
    state.firstPressData = null;
    state.secondPressData = null;

    // Reset visual classes
    elements.statusStage.className = 'status-stage';
    elements.statusBadge.textContent = 'READY';
    elements.statusMessage.textContent = 'Press Your Buzzer First to Answer!';
    elements.statusSubdetail.innerHTML = `Simultaneous press auto-resets &bull; Press <kbd>Space</kbd> to manual reset`;

    elements.p1Card.className = 'player-column player-1-side';
    elements.p2Card.className = 'player-column player-2-side';

    elements.p1Timestamp.textContent = '--:--:--.---';
    elements.p2Timestamp.textContent = '--:--:--.---';

    if (playSoundEffect) {
      playSound('reset');
    }
  }

  // --- Logging System ---
  function addLogEntry(data) {
    state.eventLogs.unshift(data);

    if (elements.emptyRow) {
      elements.emptyRow.style.display = 'none';
    }

    elements.logCount.textContent = `${state.eventLogs.length} event${state.eventLogs.length === 1 ? '' : 's'}`;

    const tr = document.createElement('tr');
    tr.style.animation = 'pop-in 0.25s ease-out';

    let badgeClass = 'badge-tag ';
    let badgeText = '';

    if (data.resultType === 'p1') {
      badgeClass += 'badge-p1';
      badgeText = `⚡ ${data.winnerName}`;
    } else if (data.resultType === 'p2') {
      badgeClass += 'badge-p2';
      badgeText = `🔥 ${data.winnerName}`;
    } else {
      badgeClass += 'badge-tie';
      badgeText = '⚡ Tie (Reset)';
    }

    const formattedWallTime = getFullDateTimeString(data.timestamp);

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight:700">#${data.round}</td>
      <td><span class="${badgeClass}">${badgeText}</span></td>
      <td class="table-time">${formattedWallTime}</td>
      <td class="table-delta">${data.delta}</td>
      <td>${data.details}</td>
    `;

    elements.logBody.insertBefore(tr, elements.logBody.firstChild);
  }

  function clearLogs() {
    if (state.eventLogs.length === 0) return;
    state.eventLogs = [];
    elements.logBody.innerHTML = '';
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'empty-row';
    emptyRow.id = 'emptyRow';
    emptyRow.innerHTML = '<td colspan="5">No buzzer events yet. Press a buzzer button or keyboard key to begin!</td>';
    elements.logBody.appendChild(emptyRow);
    elements.logCount.textContent = '0 events';
  }

  function exportCSV() {
    if (state.eventLogs.length === 0) {
      alert('No logged events to export yet. Take a few buzzes first!');
      return;
    }

    let csvContent = 'data:text/csv;charset=utf-8,';
    csvContent += 'Round,Winner/Outcome,Timestamp,Delta,Details\n';

    state.eventLogs.forEach(row => {
      const line = [
        row.round,
        `"${row.winnerName}"`,
        `"${getFullDateTimeString(row.timestamp)}"`,
        `"${row.delta.replace('&plusmn;', '±')}"`,
        `"${row.details.replace(/&bull;/g, '-').replace(/"/g, '""')}"`
      ].join(',');
      csvContent += line + '\n';
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `buzzer_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --- Event Listeners ---

  // 1. Pointer Down for Buzzers (Supports true simultaneous multi-touch on mobile/tablet screens)
  function attachBuzzerPointerListener(buttonEl, player) {
    buttonEl.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      // Unlock Web Audio context on user gesture
      getAudioContext();
      triggerBuzzer(player);
    });
  }

  attachBuzzerPointerListener(elements.p1BuzzerBtn, 'p1');
  attachBuzzerPointerListener(elements.p2BuzzerBtn, 'p2');

  // 2. Keyboard Shortcuts
  window.addEventListener('keydown', function (e) {
    // If typing in player name inputs, do not trigger buzzers
    if (e.target.tagName === 'INPUT') {
      if (e.key === 'Enter') {
        e.target.blur();
      }
      return;
    }

    const key = e.key.toLowerCase();

    // Player 1 Keys: 'a', 'q', or ArrowLeft
    if (key === 'a' || key === 'q' || e.key === 'ArrowLeft') {
      e.preventDefault();
      triggerBuzzer('p1');
    }
    // Player 2 Keys: 'l', 'p', or ArrowRight
    else if (key === 'l' || key === 'p' || e.key === 'ArrowRight') {
      e.preventDefault();
      triggerBuzzer('p2');
    }
    // Reset Keys: Space or 'r'
    else if (key === ' ' || key === 'r') {
      e.preventDefault();
      resetBuzzer(true);
    }
  });

  // 3. Reset Button
  elements.manualResetBtn.addEventListener('click', function () {
    resetBuzzer(true);
  });

  // 4. Threshold Slider
  elements.tieThresholdInput.addEventListener('input', function (e) {
    const val = parseInt(e.target.value, 10);
    state.tieThresholdMs = val;
    elements.thresholdValue.textContent = `${val}ms`;
    if (elements.modalThreshold) {
      elements.modalThreshold.textContent = `${val}ms`;
    }
  });

  // 5. Sound Toggle
  elements.soundToggleBtn.addEventListener('click', function () {
    state.soundEnabled = !state.soundEnabled;
    const icon = elements.soundToggleBtn.querySelector('.btn-icon');
    const label = elements.soundToggleBtn.querySelector('.btn-label');

    if (state.soundEnabled) {
      icon.textContent = '🔊';
      label.textContent = 'Sound ON';
      elements.soundToggleBtn.style.opacity = '1';
      playSound('reset');
    } else {
      icon.textContent = '🔇';
      label.textContent = 'Muted';
      elements.soundToggleBtn.style.opacity = '0.7';
    }
  });

  // 6. Help Modal Handlers
  function openHelpModal() {
    if (!elements.helpModal) return;
    elements.helpModal.removeAttribute('hidden');
    elements.helpModal.classList.add('is-active');
    elements.helpModal.style.display = 'flex';
  }

  function closeHelpModal() {
    if (!elements.helpModal) return;
    elements.helpModal.setAttribute('hidden', '');
    elements.helpModal.classList.remove('is-active');
    elements.helpModal.style.display = 'none';
  }

  if (elements.helpBtn) {
    elements.helpBtn.addEventListener('click', openHelpModal);
  }

  if (elements.closeModalBtn) {
    elements.closeModalBtn.addEventListener('click', closeHelpModal);
  }

  if (elements.gotItBtn) {
    elements.gotItBtn.addEventListener('click', closeHelpModal);
  }

  if (elements.helpModal) {
    elements.helpModal.addEventListener('click', function (e) {
      if (e.target === elements.helpModal) {
        closeHelpModal();
      }
    });
  }

  // Escape key to dismiss modal
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      closeHelpModal();
    }
  });

  // 7. CSV Export & Clear Log
  elements.downloadLogBtn.addEventListener('click', exportCSV);
  elements.clearLogBtn.addEventListener('click', function () {
    if (confirm('Clear all logged buzzer events?')) {
      clearLogs();
    }
  });

  // Ensure modal is cleanly hidden on boot
  closeHelpModal();

  // Initialize
  console.log('⚡ FlashBuzzer loaded successfully. Ready for players!');
})();
