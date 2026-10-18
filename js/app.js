/**
 * TNPSC Group 4 Quiz Application Logic
 * Premium Edition - 100 Questions Interactive Test Engine
 */

(function () {
  "use strict";

  // Data Source
  const QUESTIONS = window.TNPSC_QUESTIONS || [];
  const TOTAL_QUESTIONS = QUESTIONS.length;
  const STORAGE_KEY = "tnpsc_6th_t1_quiz_100_v1";
  const BOOKMARKS_KEY = "tnpsc_6th_t1_bookmarks_v1";
  const THEME_KEY = "tnpsc_theme";

  // Application State
  let userAnswers = {}; // { qId: selectedOptionIndex }
  let bookmarkedIds = new Set();
  let activeFilter = "all";
  let timerSeconds = 0;
  let timerInterval = null;
  let timerRunning = true;

  // Sound Engine (using Web Audio API for zero-dependency offline audio)
  let audioCtx = null;
  function playSound(type) {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      if (type === "correct") {
        // Cheerful ascending major chime
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.16); // G5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === "wrong") {
        // Soft low double-buzz
        osc.type = "triangle";
        osc.frequency.setValueAtTime(220, now); // A3
        osc.frequency.setValueAtTime(180, now + 0.1);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      }
    } catch (e) {
      // Audio might be blocked or unsupported; silent fallback
    }
  }

  // Load Saved Data from LocalStorage
  function loadSavedState() {
    try {
      const savedAns = localStorage.getItem(STORAGE_KEY);
      if (savedAns) userAnswers = JSON.parse(savedAns);

      const savedBm = localStorage.getItem(BOOKMARKS_KEY);
      if (savedBm) bookmarkedIds = new Set(JSON.parse(savedBm));
    } catch (e) {
      console.warn("Storage load error:", e);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userAnswers));
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...bookmarkedIds]));
    } catch (e) {
      console.warn("Storage save error:", e);
    }
  }

  // DOM Elements
  const qListEl = document.getElementById("questions-list");
  const noResultsEl = document.getElementById("no-results");
  const statAnsweredEl = document.getElementById("stat-answered");
  const statCorrectEl = document.getElementById("stat-correct");
  const statWrongEl = document.getElementById("stat-wrong");
  const statScoreEl = document.getElementById("stat-score");
  const progCorrectEl = document.getElementById("prog-correct");
  const progWrongEl = document.getElementById("prog-wrong");
  const countUnansweredEl = document.getElementById("count-unanswered");
  const countWrongEl = document.getElementById("count-wrong");
  const countCorrectEl = document.getElementById("count-correct");
  const countBookmarkEl = document.getElementById("count-bookmark");
  const paletteModal = document.getElementById("palette-modal");
  const paletteGrid = document.getElementById("palette-grid");
  const timerTextEl = document.getElementById("timer-text");
  const toastContainer = document.getElementById("toast-container");

  // Escape HTML utility
  function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Toast Notification
  function showToast(message, icon = "ℹ️") {
    if (!toastContainer) return;
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  // Render All Questions
  function renderQuestions() {
    if (!qListEl) return;
    qListEl.innerHTML = "";
    const letters = ["A", "B", "C", "D", "E"];

    QUESTIONS.forEach((q) => {
      const card = document.createElement("div");
      card.className = "question-card";
      card.id = "q-card-" + q.id;
      card.dataset.id = q.id;

      const hasAnswered = userAnswers.hasOwnProperty(q.id);
      const userSel = hasAnswered ? userAnswers[q.id] : null;
      const isCorrect = hasAnswered && userSel === q.correct;
      const isBookmarked = bookmarkedIds.has(q.id);

      if (hasAnswered) {
        card.classList.add(isCorrect ? "answered-correct" : "answered-wrong");
      }

      // Top Row (Question ID, Topic Badge, Bookmark, Status)
      const topRow = document.createElement("div");
      topRow.className = "q-top-row";
      topRow.innerHTML = `
        <div class="q-tags-left">
          <span class="q-number-pill">வினா ${q.id} / ${TOTAL_QUESTIONS}</span>
          ${q.badge ? `<span class="q-category-tag">${escapeHtml(q.badge)}</span>` : ""}
        </div>
        <div class="q-top-right">
          <button class="bookmark-btn ${isBookmarked ? "active" : ""}" id="bm-${q.id}" title="${isBookmarked ? "புக்மார்க்கை நீக்கு" : "புக்மார்க் செய்க"}">
            ${isBookmarked ? "★" : "☆"}
          </button>
          <span class="q-status-chip ${hasAnswered ? (isCorrect ? "correct" : "wrong") : ""}" id="badge-${q.id}">
            ${hasAnswered ? (isCorrect ? "✓ சரியானது" : "✕ தவறானது") : ""}
          </span>
        </div>
      `;
      card.appendChild(topRow);

      // Bookmark Button Event
      const bmBtn = topRow.querySelector(`#bm-${q.id}`);
      bmBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleBookmark(q.id);
      });

      // Question Body
      const bodyEl = document.createElement("div");
      bodyEl.className = "q-body-container";
      bodyEl.innerHTML = q.body_html || escapeHtml(q.body);
      card.appendChild(bodyEl);

      // Options Grid
      const optionsContainer = document.createElement("div");
      optionsContainer.className = "options-grid";
      optionsContainer.id = "options-" + q.id;

      q.options.forEach((optText, optIdx) => {
        const optBtn = document.createElement("div");
        optBtn.className = "opt-btn";
        optBtn.id = `opt-${q.id}-${optIdx}`;
        optBtn.setAttribute("role", "button");
        optBtn.setAttribute("tabindex", "0");

        let optClass = "";
        let optIcon = "";

        if (hasAnswered) {
          if (optIdx === q.correct) {
            optClass = "is-correct";
            optIcon = "✓";
          } else if (optIdx === userSel) {
            optClass = "is-wrong";
            optIcon = "✕";
          }
        }

        if (optClass) optBtn.classList.add(optClass);

        optBtn.innerHTML = `
          <span class="opt-key-circle">(${letters[optIdx]})</span>
          <span class="opt-text">${escapeHtml(optText)}</span>
          <span class="opt-status-icon">${optIcon}</span>
        `;

        optBtn.setAttribute("aria-label", `வினா ${q.id}, விருப்பம் ${letters[optIdx]}: ${optText}`);
        optBtn.addEventListener("click", (e) => {
          e.preventDefault();
          selectAnswer(q.id, optIdx);
        });
        optBtn.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectAnswer(q.id, optIdx);
          }
        });

        optionsContainer.appendChild(optBtn);
      });
      card.appendChild(optionsContainer);

      // Feedback Box (Appears directly below options)
      const feedbackBox = document.createElement("div");
      feedbackBox.className = "feedback-box";
      feedbackBox.id = "feedback-" + q.id;

      if (hasAnswered) {
        renderFeedback(feedbackBox, q, userSel);
      }

      card.appendChild(feedbackBox);

      // Question Navigation Footer (Previous, Next, and Submit on Q100)
      const navFooter = document.createElement("div");
      navFooter.className = "q-nav-footer";

      if (q.id > 1) {
        const prevBtn = document.createElement("button");
        prevBtn.type = "button";
        prevBtn.className = "btn-q-nav btn-q-prev";
        prevBtn.innerHTML = `← முந்தைய வினா (${q.id - 1})`;
        prevBtn.setAttribute("aria-label", `முந்தைய வினா ${q.id - 1}`);
        prevBtn.addEventListener("click", () => jumpTo(q.id - 1));
        navFooter.appendChild(prevBtn);
      } else {
        const emptySpan = document.createElement("span");
        emptySpan.className = "q-nav-placeholder";
        navFooter.appendChild(emptySpan);
      }

      if (q.id < TOTAL_QUESTIONS) {
        const nextBtn = document.createElement("button");
        nextBtn.type = "button";
        nextBtn.className = "btn-q-nav btn-q-next";
        nextBtn.innerHTML = `அடுத்த வினா (${q.id + 1}) →`;
        nextBtn.setAttribute("aria-label", `அடுத்த வினா ${q.id + 1}`);
        nextBtn.addEventListener("click", () => jumpTo(q.id + 1));
        navFooter.appendChild(nextBtn);
      } else {
        const submitBtn = document.createElement("button");
        submitBtn.type = "button";
        submitBtn.className = "btn-q-submit";
        submitBtn.id = "submit-test-btn";
        submitBtn.innerHTML = `✨ தேர்வைச் சமர்ப்பிக்கவும் (Submit Test)`;
        submitBtn.setAttribute("aria-label", "தேர்வைச் சமர்ப்பிக்கவும்");
        submitBtn.addEventListener("click", validateAndInitiateSubmit);
        navFooter.appendChild(submitBtn);
      }

      card.appendChild(navFooter);
      qListEl.appendChild(card);
    });

    updateStats();
    applyFilter();
    renderPalette();
  }

  // Render Feedback Box content
  function renderFeedback(feedbackBox, q, userSel) {
    const isCorrect = userSel === q.correct;
    const letters = ["A", "B", "C", "D", "E"];
    const correctLetter = letters[q.correct];
    const correctText = q.options[q.correct];

    feedbackBox.className = "feedback-box " + (isCorrect ? "show-correct correct-feedback" : "show-wrong wrong-feedback");
    feedbackBox.style.display = "block";

    let html = "";
    if (isCorrect) {
      html += `
        <div class="feedback-headline correct-head">
          <span>✓</span> <span>மிகச்சரியான விடை! வாழ்த்துகள்!</span>
        </div>
      `;
    } else {
      const userLetter = letters[userSel];
      const userText = q.options[userSel];
      html += `
        <div class="feedback-headline wrong-head">
          <span>❌</span> <span>தவறான விடை!</span>
        </div>
        <div class="feedback-comparison">
          <div class="feedback-user-row">
            <span class="pill-badge-wrong">உங்கள் தேர்வு:</span>
            <span class="user-choice-text">(${userLetter}) ${escapeHtml(userText)}</span>
          </div>
          <div class="feedback-correct-row">
            <span class="pill-badge-correct">சரியான விடை:</span>
            <span class="correct-choice-text">(${correctLetter}) ${escapeHtml(correctText)}</span>
          </div>
        </div>
      `;
    }

    if (q.explanation && q.explanation.trim()) {
      html += `
        <div class="feedback-expl-section">
          <div class="expl-title">💡 <b>முழுமையான விளக்கம்:</b></div>
          <div class="expl-body">${escapeHtml(q.explanation)}</div>
        </div>
      `;
    }

    feedbackBox.innerHTML = html;
  }

  // Answer Selection Handler
  function selectAnswer(qId, optIdx) {
    userAnswers[qId] = optIdx;
    saveState();

    const q = QUESTIONS.find((item) => item.id === qId);
    if (!q) return;

    const isCorrect = optIdx === q.correct;
    playSound(isCorrect ? "correct" : "wrong");

    const card = document.getElementById("q-card-" + qId);
    const badge = document.getElementById("badge-" + qId);
    const feedbackBox = document.getElementById("feedback-" + qId);

    if (card) {
      card.classList.remove("answered-correct", "answered-wrong");
      card.classList.add(isCorrect ? "answered-correct" : "answered-wrong");
    }

    if (badge) {
      badge.className = "q-status-chip " + (isCorrect ? "correct" : "wrong");
      badge.textContent = isCorrect ? "✓ சரியானது" : "✕ தவறானது";
    }

    // Update option buttons
    for (let i = 0; i < 5; i++) {
      const btn = document.getElementById(`opt-${qId}-${i}`);
      if (!btn) continue;
      btn.classList.remove("is-correct", "is-wrong");
      const icon = btn.querySelector(".opt-status-icon");
      if (icon) icon.textContent = "";

      if (i === q.correct) {
        btn.classList.add("is-correct");
        if (icon) icon.textContent = "✓";
      } else if (i === optIdx) {
        btn.classList.add("is-wrong");
        if (icon) icon.textContent = "✕";
      }
    }

    // Render feedback card below options
    if (feedbackBox) {
      renderFeedback(feedbackBox, q, optIdx);
    }

    updateStats();
    renderPaletteCell(qId);

    // Reapply filter if viewing specific category tab
    if (activeFilter !== "all") {
      applyFilter();
    }
  }

  // Toggle Bookmark
  function toggleBookmark(qId) {
    const bmBtn = document.getElementById(`bm-${qId}`);
    if (bookmarkedIds.has(qId)) {
      bookmarkedIds.delete(qId);
      if (bmBtn) {
        bmBtn.classList.remove("active");
        bmBtn.textContent = "☆";
        bmBtn.title = "புக்மார்க் செய்க";
      }
      showToast(`வினா ${qId} புக்மார்க்கிலிருந்து நீக்கப்பட்டது`, "☆");
    } else {
      bookmarkedIds.add(qId);
      if (bmBtn) {
        bmBtn.classList.add("active");
        bmBtn.textContent = "★";
        bmBtn.title = "புக்மார்க்கை நீக்கு";
      }
      showToast(`வினா ${qId} புக்மார்க் செய்யப்பட்டது`, "★");
    }
    saveState();
    updateStats();
    renderPaletteCell(qId);

    if (activeFilter === "bookmark") {
      applyFilter();
    }
  }

  // Side Drawer Elements
  const sideDrawer = document.getElementById("side-drawer");
  const drawerBackdrop = document.getElementById("drawer-backdrop");
  const openDrawerBtn = document.getElementById("open-drawer-btn");
  const floatingSideToggle = document.getElementById("floating-side-toggle");
  const closeDrawerBtn = document.getElementById("close-drawer-btn");

  function openDrawer() {
    if (sideDrawer) sideDrawer.classList.add("open");
    if (drawerBackdrop) drawerBackdrop.classList.add("open");
    document.body.classList.add("drawer-open");
  }

  function closeDrawer() {
    if (sideDrawer) sideDrawer.classList.remove("open");
    if (drawerBackdrop) drawerBackdrop.classList.remove("open");
    document.body.classList.remove("drawer-open");
  }

  if (openDrawerBtn) openDrawerBtn.addEventListener("click", openDrawer);
  if (floatingSideToggle) floatingSideToggle.addEventListener("click", openDrawer);
  if (closeDrawerBtn) closeDrawerBtn.addEventListener("click", closeDrawer);
  if (drawerBackdrop) drawerBackdrop.addEventListener("click", closeDrawer);

  // Update Statistics & Progress Bar
  function updateStats() {
    let correct = 0;
    let wrong = 0;

    QUESTIONS.forEach((q) => {
      if (userAnswers.hasOwnProperty(q.id)) {
        if (userAnswers[q.id] === q.correct) {
          correct++;
        } else {
          wrong++;
        }
      }
    });

    const answered = correct + wrong;
    const unanswered = TOTAL_QUESTIONS - answered;
    const pct = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    if (statAnsweredEl) statAnsweredEl.textContent = answered;
    if (statCorrectEl) statCorrectEl.textContent = correct;
    if (statWrongEl) statWrongEl.textContent = wrong;
    if (statScoreEl) statScoreEl.textContent = pct + "%";

    // Topbar & mobile compact mirror counters
    const topAnsweredEl = document.getElementById("top-answered");
    const topCorrectEl = document.getElementById("top-correct");
    const topWrongEl = document.getElementById("top-wrong");
    if (topAnsweredEl) topAnsweredEl.textContent = answered;
    if (topCorrectEl) topCorrectEl.textContent = correct;
    if (topWrongEl) topWrongEl.textContent = wrong;

    const mobAnsweredEl = document.getElementById("mob-answered");
    if (mobAnsweredEl) mobAnsweredEl.textContent = answered;

    const mobProgCorrect = document.getElementById("mob-prog-correct");
    if (mobProgCorrect) mobProgCorrect.style.width = (correct / TOTAL_QUESTIONS) * 100 + "%";
    const mobProgWrong = document.getElementById("mob-prog-wrong");
    if (mobProgWrong) mobProgWrong.style.width = (wrong / TOTAL_QUESTIONS) * 100 + "%";

    if (progCorrectEl) progCorrectEl.style.width = (correct / TOTAL_QUESTIONS) * 100 + "%";
    if (progWrongEl) progWrongEl.style.width = (wrong / TOTAL_QUESTIONS) * 100 + "%";

    if (countUnansweredEl) countUnansweredEl.textContent = unanswered;
    if (countWrongEl) countWrongEl.textContent = wrong;
    if (countCorrectEl) countCorrectEl.textContent = correct;
    if (countBookmarkEl) countBookmarkEl.textContent = bookmarkedIds.size;
  }

  // Filter System
  function applyFilter() {
    let visibleCount = 0;

    QUESTIONS.forEach((q) => {
      const card = document.getElementById("q-card-" + q.id);
      if (!card) return;

      const hasAnswered = userAnswers.hasOwnProperty(q.id);
      const isCorrect = hasAnswered && userAnswers[q.id] === q.correct;
      const isBm = bookmarkedIds.has(q.id);

      let show = false;
      if (activeFilter === "all") {
        show = true;
      } else if (activeFilter === "unanswered") {
        show = !hasAnswered;
      } else if (activeFilter === "wrong") {
        show = hasAnswered && !isCorrect;
      } else if (activeFilter === "correct") {
        show = hasAnswered && isCorrect;
      } else if (activeFilter === "bookmark") {
        show = isBm;
      }

      card.style.display = show ? "block" : "none";
      if (show) visibleCount++;
    });

    if (noResultsEl) {
      noResultsEl.style.display = visibleCount === 0 ? "block" : "none";
    }
  }

  // Filter Tabs Event Listeners
  document.querySelectorAll(".tab-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      applyFilter();
    });
  });

  // Jump To Question
  function jumpTo(num) {
    if (num >= 1 && num <= TOTAL_QUESTIONS) {
      if (activeFilter !== "all") {
        const allBtn = document.querySelector('[data-filter="all"]');
        if (allBtn) allBtn.click();
      }
      closeDrawer();
      const target = document.getElementById("q-card-" + num);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.style.transition = "box-shadow 0.3s ease, border-color 0.3s ease";
        target.style.borderColor = "var(--primary)";
        target.style.boxShadow = "0 0 0 3px var(--primary-border)";
        setTimeout(() => {
          target.style.borderColor = "";
          target.style.boxShadow = "";
        }, 1800);
      }
    } else {
      alert(`தயவுசெய்து 1 முதல் ${TOTAL_QUESTIONS} வரை உள்ள வினா எண்ணை உள்ளிடவும்.`);
    }
  }

  const jumpInput = document.getElementById("jump-input");
  const jumpBtn = document.getElementById("jump-btn");
  if (jumpBtn && jumpInput) {
    jumpBtn.addEventListener("click", () => {
      const num = parseInt(jumpInput.value.trim(), 10);
      jumpTo(num);
    });
    jumpInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const num = parseInt(jumpInput.value.trim(), 10);
        jumpTo(num);
      }
    });
  }

  // =========================================================================
  // Question Palette (1-100 Modal)
  // =========================================================================
  function renderPalette() {
    if (!paletteGrid) return;
    paletteGrid.innerHTML = "";

    QUESTIONS.forEach((q) => {
      const cell = document.createElement("button");
      cell.className = "palette-cell";
      cell.id = "pal-" + q.id;
      cell.textContent = q.id;

      renderPaletteCellState(cell, q.id);

      cell.addEventListener("click", () => {
        closePalette();
        jumpTo(q.id);
      });

      paletteGrid.appendChild(cell);
    });
  }

  function renderPaletteCellState(cell, qId) {
    const q = QUESTIONS.find((item) => item.id === qId);
    if (!q) return;

    cell.classList.remove("is-correct", "is-wrong", "is-bookmarked");
    const hasAnswered = userAnswers.hasOwnProperty(qId);

    if (hasAnswered) {
      if (userAnswers[qId] === q.correct) {
        cell.classList.add("is-correct");
      } else {
        cell.classList.add("is-wrong");
      }
    }
    if (bookmarkedIds.has(qId)) {
      cell.classList.add("is-bookmarked");
    }
  }

  function renderPaletteCell(qId) {
    const cell = document.getElementById("pal-" + qId);
    if (cell) {
      renderPaletteCellState(cell, qId);
    }
  }

  function openPalette() {
    closeDrawer();
    if (paletteModal) paletteModal.classList.add("open");
  }

  function closePalette() {
    if (paletteModal) paletteModal.classList.remove("open");
  }

  const openPaletteBtn = document.getElementById("open-palette-btn");
  const closePaletteBtn = document.getElementById("close-palette-btn");
  if (openPaletteBtn) openPaletteBtn.addEventListener("click", openPalette);
  if (closePaletteBtn) closePaletteBtn.addEventListener("click", closePalette);
  if (paletteModal) {
    paletteModal.addEventListener("click", (e) => {
      if (e.target === paletteModal) closePalette();
    });
  }

  // =========================================================================
  // Reset / Restart ("மறுதொடக்கம்") - In-App Confirmation Modal & Full Wipe
  // =========================================================================
  const resetModal = document.getElementById("reset-modal");
  const modalCancelReset = document.getElementById("modal-cancel-reset");
  const modalConfirmReset = document.getElementById("modal-confirm-reset");

  function openResetModal() {
    closeDrawer();
    if (resetModal) {
      resetModal.classList.add("open");
    } else {
      // Fallback to window.confirm if modal element not found
      if (window.confirm("⚠️ எச்சரிக்கை: தேர்வை மீண்டும் முதலிலிருந்து தொடங்க விரும்புகிறீர்களா?\n\nநீங்கள் அளித்த அனைத்து விடைகளும் அழிக்கப்படும்.")) {
        executeFullReset();
      }
    }
  }

  function closeResetModal() {
    if (resetModal) {
      resetModal.classList.remove("open");
    }
  }

  function executeFullReset() {
    closeResetModal();

    // Reset submission state
    isSubmitting = false;
    const btnFinal = document.getElementById("btn-final-submit");
    if (btnFinal) {
      btnFinal.disabled = false;
      btnFinal.innerHTML = `<span>✨</span> இறுதியாகச் சமர்ப்பி (Submit Final Answers)`;
    }

    // Stop fireworks if active
    stopFireworks();

    // 1. Wipe in-memory state
    userAnswers = {};
    bookmarkedIds = new Set();
    activeFilter = "all";
    timerSeconds = 0;
    timerRunning = true;

    // 2. Wipe specific quiz-session keys in storage (preserve unrelated app keys)
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(BOOKMARKS_KEY);
      localStorage.removeItem("tnpsc_6th_t1_submitted_v1");
    } catch (e) {
      console.warn("Error clearing storage:", e);
    }

    // 3. Reset Active Filter Tab in UI
    document.querySelectorAll(".tab-pill").forEach((b) => b.classList.remove("active"));
    const allTab = document.querySelector('[data-filter="all"]');
    if (allTab) allTab.classList.add("active");

    // 4. Reset Jump Input
    if (jumpInput) jumpInput.value = "";

    // 5. Reset Timer Display
    if (timerTextEl) timerTextEl.textContent = "00:00:00";
    const topTimerEl = document.getElementById("top-timer");
    if (topTimerEl) topTimerEl.textContent = "00:00:00";
    const mobTimerEl = document.getElementById("mob-timer");
    if (mobTimerEl) mobTimerEl.textContent = "00:00:00";

    // 6. Restore quiz layout (hide results screen, show questions list and dashboard)
    const resultsScreen = document.getElementById("results-screen");
    const questionsList = document.getElementById("questions-list");
    const dashboard = document.querySelector(".quiz-dashboard");
    const evalCard = document.querySelector(".eval-card");

    if (resultsScreen) resultsScreen.style.display = "none";
    if (questionsList) questionsList.style.display = "block";
    if (dashboard) dashboard.style.display = "block";
    if (evalCard) evalCard.style.display = "block";

    // 7. Re-render entire quiz cleanly
    renderQuestions();
    updateStats();
    applyFilter();
    renderPalette();

    // 8. Restart Timer
    startTimer();

    // 9. Smooth scroll to the very top (Question 1)
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // 10. Highlight Q1 to confirm clean start
    setTimeout(() => {
      const q1 = document.getElementById("q-card-1");
      if (q1) {
        q1.style.transition = "box-shadow 0.4s ease, border-color 0.4s ease";
        q1.style.borderColor = "var(--primary)";
        q1.style.boxShadow = "0 0 0 4px var(--primary-border)";
        setTimeout(() => {
          q1.style.borderColor = "";
          q1.style.boxShadow = "";
        }, 1800);
      }
    }, 250);

    // 11. Toast confirmation
    showToast("தேர்வு வெற்றிகரமாக மறுதொடக்கம் செய்யப்பட்டது! வினா 1-லிருந்து தொடங்கலாம்.", "🔄");
  }

  const resetBtn = document.getElementById("reset-btn");
  if (resetBtn) resetBtn.addEventListener("click", openResetModal);
  if (modalCancelReset) modalCancelReset.addEventListener("click", closeResetModal);
  if (modalConfirmReset) modalConfirmReset.addEventListener("click", executeFullReset);
  if (resetModal) {
    resetModal.addEventListener("click", (e) => {
      if (e.target === resetModal) closeResetModal();
    });
  }

  // =========================================================================
  // Final Submission & Unanswered Validation
  // =========================================================================
  let isSubmitting = false;

  const unansweredModal = document.getElementById("unanswered-modal");
  const closeUnansweredBtn = document.getElementById("close-unanswered-btn");
  const btnGotoUnanswered = document.getElementById("btn-goto-unanswered");
  const btnReviewUnansweredPalette = document.getElementById("btn-review-unanswered-palette");

  const confirmSubmitModal = document.getElementById("confirm-submit-modal");
  const closeConfirmBtn = document.getElementById("close-confirm-btn");
  const btnCancelSubmit = document.getElementById("btn-cancel-submit");
  const btnFinalSubmit = document.getElementById("btn-final-submit");

  function openUnansweredModal(unansweredCount, answeredCount) {
    closePalette();
    closeResetModal();
    const warnCountEl = document.getElementById("warn-unanswered-count");
    const warnAnsEl = document.getElementById("warn-answered-count");
    const warnMissEl = document.getElementById("warn-missing-count");
    if (warnCountEl) warnCountEl.textContent = unansweredCount;
    if (warnAnsEl) warnAnsEl.textContent = answeredCount;
    if (warnMissEl) warnMissEl.textContent = unansweredCount;
    if (unansweredModal) unansweredModal.classList.add("open");
  }

  function closeUnansweredModal() {
    if (unansweredModal) unansweredModal.classList.remove("open");
  }

  function openConfirmSubmitModal() {
    closePalette();
    closeResetModal();
    if (confirmSubmitModal) confirmSubmitModal.classList.add("open");
  }

  function closeConfirmSubmitModal() {
    if (confirmSubmitModal) confirmSubmitModal.classList.remove("open");
  }

  function validateAndInitiateSubmit() {
    if (isSubmitting) return;

    // Check Question count integrity
    if (TOTAL_QUESTIONS !== 100) {
      alert(`எச்சரிக்கை: வினாத்தாள் தரவு பிழை! 100 வினாக்களுக்குப் பதிலாக ${TOTAL_QUESTIONS} வினாக்கள் மட்டுமே உள்ளன.`);
      return;
    }

    const unansweredList = QUESTIONS.filter((q) => !userAnswers.hasOwnProperty(q.id));
    const answeredCount = Object.keys(userAnswers).length;
    const unansweredCount = unansweredList.length;

    if (unansweredCount > 0) {
      // Unanswered Validation: Block submission and prompt user with Option A and B
      openUnansweredModal(unansweredCount, answeredCount);
    } else {
      // All 100 questions answered: show polished confirmation modal
      openConfirmSubmitModal();
    }
  }

  // Option A: Navigate to the first unanswered question
  if (btnGotoUnanswered) {
    btnGotoUnanswered.addEventListener("click", () => {
      closeUnansweredModal();
      const unansweredList = QUESTIONS.filter((q) => !userAnswers.hasOwnProperty(q.id));
      if (unansweredList.length > 0) {
        jumpTo(unansweredList[0].id);
        showToast(`வினா ${unansweredList[0].id}-க்கு விடையளிக்கவில்லை. தயவுசெய்து விடையளிக்கவும்.`, "⚠️");
      }
    });
  }

  // Option B: Open question palette highlighting unanswered
  if (btnReviewUnansweredPalette) {
    btnReviewUnansweredPalette.addEventListener("click", () => {
      closeUnansweredModal();
      openPalette();
    });
  }

  if (closeUnansweredBtn) closeUnansweredBtn.addEventListener("click", closeUnansweredModal);
  if (unansweredModal) {
    unansweredModal.addEventListener("click", (e) => {
      if (e.target === unansweredModal) closeUnansweredModal();
    });
  }

  // Confirm Submit Handlers
  if (closeConfirmBtn) closeConfirmBtn.addEventListener("click", closeConfirmSubmitModal);
  if (btnCancelSubmit) btnCancelSubmit.addEventListener("click", closeConfirmSubmitModal);
  if (btnFinalSubmit) btnFinalSubmit.addEventListener("click", finalizeSubmission);
  if (confirmSubmitModal) {
    confirmSubmitModal.addEventListener("click", (e) => {
      if (e.target === confirmSubmitModal) closeConfirmSubmitModal();
    });
  }

  // Question Palette Submit button
  const paletteSubmitBtn = document.getElementById("palette-submit-btn");
  if (paletteSubmitBtn) {
    paletteSubmitBtn.addEventListener("click", () => {
      closePalette();
      validateAndInitiateSubmit();
    });
  }

  // Finalize Submission
  function finalizeSubmission() {
    if (isSubmitting) return;
    isSubmitting = true;

    if (btnFinalSubmit) {
      btnFinalSubmit.disabled = true;
      btnFinalSubmit.textContent = "மதிப்பீடு செய்யப்படுகிறது...";
    }

    closeConfirmSubmitModal();

    // 1. Stop Exam Timer
    timerRunning = false;
    if (timerInterval) clearInterval(timerInterval);
    const finalTimeStr = formatTime(timerSeconds);

    // 2. Calculate Exact Results
    let correct = 0;
    let wrong = 0;
    QUESTIONS.forEach((q) => {
      if (userAnswers[q.id] === q.correct) {
        correct++;
      } else {
        wrong++;
      }
    });

    const total = TOTAL_QUESTIONS;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const wrongPct = 100 - accuracy;

    // 3. Save completed attempt safely
    try {
      const attempt = {
        score: correct,
        total: total,
        accuracy: accuracy,
        timeSpent: timerSeconds,
        timeFormatted: finalTimeStr,
        submittedAt: new Date().toISOString()
      };
      localStorage.setItem("tnpsc_6th_t1_completed_attempt_v1", JSON.stringify(attempt));
      localStorage.setItem("tnpsc_6th_t1_submitted_v1", "true");
    } catch (e) {
      console.warn("Error saving completed attempt:", e);
    }

    // 4. Populate Results Screen DOM
    const resTotal = document.getElementById("res-stat-total");
    const resAns = document.getElementById("res-stat-answered");
    const resCorr = document.getElementById("res-stat-correct");
    const resWrn = document.getElementById("res-stat-wrong");
    const resUnans = document.getElementById("res-stat-unanswered");
    const resAcc = document.getElementById("res-accuracy");
    const resTime = document.getElementById("res-time-taken");
    const resPctCorr = document.getElementById("res-pct-correct");
    const resPctWrn = document.getElementById("res-pct-wrong");
    const resBarCorr = document.getElementById("res-bar-correct");
    const resBarWrn = document.getElementById("res-bar-wrong");
    const resFeedback = document.getElementById("res-feedback-msg");

    if (resTotal) resTotal.textContent = total;
    if (resAns) resAns.textContent = total;
    if (resCorr) resCorr.textContent = correct;
    if (resWrn) resWrn.textContent = wrong;
    if (resUnans) resUnans.textContent = "0";
    if (resAcc) resAcc.textContent = accuracy + "%";
    if (resTime) resTime.textContent = finalTimeStr;
    if (resPctCorr) resPctCorr.textContent = accuracy + "%";
    if (resPctWrn) resPctWrn.textContent = wrongPct + "%";
    if (resBarCorr) resBarCorr.style.width = accuracy + "%";
    if (resBarWrn) resBarWrn.style.width = wrongPct + "%";

    if (resFeedback) {
      if (correct >= 95) {
        resFeedback.textContent = "🏆 அசாத்திய சாதனை! நீங்கள் மாநில அளவில் முதலிடம் (Rank 1) பெறக்கூடிய மிகச்சிறந்த தயாரிப்பில் உள்ளீர்கள்! வாழ்த்துகள்!";
      } else if (correct >= 85) {
        resFeedback.textContent = "🌟 மிகச்சிறப்பான முன்னேற்றம்! TNPSC Group 4 தேர்வில் எளிதில் அரசுப் பணி பெறக்கூடிய தகுதி. தவறவிட்ட சில வினாக்களை மறுபார்வை செய்யுங்கள்.";
      } else if (correct >= 70) {
        resFeedback.textContent = "👍 நல்ல முயற்சி! இன்னும் கொஞ்சம் தீவிரமாகப் படித்தால் 95+ மதிப்பெண்களை நிச்சயம் அடையலாம்.";
      } else {
        resFeedback.textContent = "📖 மீண்டும் தீவிரப் பயிற்சி தேவை. கீழே உள்ள விரிவான அரசுப் பாடப்புத்தக விளக்கக் குறிப்புகளைப் படித்துப் புரிந்து கொண்டு மீண்டும் தேர்வு எழுதுங்கள்.";
      }
    }

    // 5. Hide questions list, dashboard, eval card
    const questionsList = document.getElementById("questions-list");
    const dashboard = document.querySelector(".quiz-dashboard");
    const evalCard = document.querySelector(".eval-card");
    const resultsScreen = document.getElementById("results-screen");

    if (questionsList) questionsList.style.display = "none";
    if (dashboard) dashboard.style.display = "none";
    if (evalCard) evalCard.style.display = "none";
    if (resultsScreen) resultsScreen.style.display = "block";

    // 6. Smooth Scroll to Top
    window.scrollTo({ top: 0, behavior: "smooth" });

    // 7. Animated Score Counter
    animateScoreCounter(correct, 1400);

    // 8. Fireworks Celebration
    startFireworks(7500);

    // 9. Render Question-Wise Detailed Review
    renderQuestionWiseReview();
  }

  // =========================================================================
  // Animated Score Counter
  // =========================================================================
  function animateScoreCounter(targetScore, duration = 1400) {
    const el = document.getElementById("res-score-number");
    if (!el) return;
    const start = 0;
    const startTime = performance.now();

    function update(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (targetScore - start) * ease);
      el.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      } else {
        el.textContent = targetScore;
      }
    }
    requestAnimationFrame(update);
  }

  // =========================================================================
  // Lightweight Fireworks & Confetti Particle Engine
  // =========================================================================
  let fireworksAnimId = null;
  let fireworksEndTime = 0;

  function startFireworks(durationMs = 7500) {
    const canvas = document.getElementById("fireworks-canvas");
    if (!canvas) return;

    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);

    const particles = [];
    const colors = [
      "#10b981", "#34d399", "#3b82f6", "#60a5fa",
      "#f59e0b", "#fbbf24", "#ec4899", "#f43f5e",
      "#8b5cf6", "#a78bfa", "#14b8a6", "#e11d48"
    ];

    function createFirework(x, y) {
      const count = 48;
      const baseColor = colors[Math.floor(Math.random() * colors.length)];
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5.5 + 2.5;
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: Math.random() * 3 + 1.5,
          color: Math.random() > 0.3 ? baseColor : colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          decay: Math.random() * 0.016 + 0.012
        });
      }
    }

    // Launch initial bursts
    createFirework(width * 0.25, height * 0.3);
    createFirework(width * 0.75, height * 0.28);
    createFirework(width * 0.5, height * 0.2);

    let lastLaunch = Date.now();
    fireworksEndTime = Date.now() + durationMs;

    function renderLoop() {
      ctx.clearRect(0, 0, width, height);

      const now = Date.now();
      if (now < fireworksEndTime) {
        if (now - lastLaunch > 400) {
          createFirework(
            width * (0.15 + Math.random() * 0.7),
            height * (0.15 + Math.random() * 0.4)
          );
          lastLaunch = now;
        }
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.07; // subtle gravity
        p.vx *= 0.985;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (now < fireworksEndTime || particles.length > 0) {
        fireworksAnimId = requestAnimationFrame(renderLoop);
      } else {
        ctx.clearRect(0, 0, width, height);
        window.removeEventListener("resize", onResize);
      }
    }

    renderLoop();
  }

  function stopFireworks() {
    if (fireworksAnimId) {
      cancelAnimationFrame(fireworksAnimId);
      fireworksAnimId = null;
    }
    const canvas = document.getElementById("fireworks-canvas");
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  // =========================================================================
  // Question-Wise Detailed Review
  // =========================================================================
  let activeReviewFilter = "all";

  function renderQuestionWiseReview() {
    const container = document.getElementById("review-cards-list");
    if (!container) return;
    container.innerHTML = "";

    const letters = ["A", "B", "C", "D", "E"];
    let correctCount = 0;
    let wrongCount = 0;

    QUESTIONS.forEach((q) => {
      const userSel = userAnswers[q.id];
      const isCorrect = userSel === q.correct;
      if (isCorrect) correctCount++;
      else wrongCount++;

      // Filter check
      if (activeReviewFilter === "correct" && !isCorrect) return;
      if (activeReviewFilter === "wrong" && isCorrect) return;

      const card = document.createElement("div");
      card.className = "review-card " + (isCorrect ? "is-correct-card" : "is-wrong-card");
      card.id = `rev-card-${q.id}`;

      const userText = userSel !== undefined ? q.options[userSel] : "விடையளிக்கவில்லை";
      const userLetter = userSel !== undefined ? letters[userSel] : "-";
      const correctText = q.options[q.correct];
      const correctLetter = letters[q.correct];

      card.innerHTML = `
        <div class="q-top-row">
          <div class="q-tags-left">
            <span class="rev-q-num-chip">வினா ${q.id} / ${TOTAL_QUESTIONS}</span>
            ${q.badge ? `<span class="q-category-tag">${escapeHtml(q.badge)}</span>` : ""}
          </div>
          <span class="q-status-chip ${isCorrect ? "correct" : "wrong"}" style="display:inline-flex;">
            ${isCorrect ? "✓ சரியானது" : "✕ தவறானது"}
          </span>
        </div>
        <div class="q-body-container">
          ${q.body_html || escapeHtml(q.body)}
        </div>
        <div class="feedback-comparison">
          <div class="feedback-user-row">
            <span class="pill-badge-wrong">உங்கள் தேர்வு:</span>
            <span class="user-choice-text">(${userLetter}) ${escapeHtml(userText)}</span>
          </div>
          <div class="feedback-correct-row">
            <span class="pill-badge-correct">சரியான விடை:</span>
            <span class="correct-choice-text">(${correctLetter}) ${escapeHtml(correctText)}</span>
          </div>
        </div>
        ${q.explanation ? `
          <div class="feedback-expl-section">
            <div class="expl-title">💡 <b>முழுமையான விளக்கம்:</b></div>
            <div class="expl-body">${escapeHtml(q.explanation)}</div>
          </div>
        ` : ""}
      `;

      container.appendChild(card);
    });

    const revCorrectEl = document.getElementById("rev-correct-count");
    if (revCorrectEl) revCorrectEl.textContent = correctCount;
    const revWrongEl = document.getElementById("rev-wrong-count");
    if (revWrongEl) revWrongEl.textContent = wrongCount;
  }

  // Review Filter Tabs Event Listeners
  document.querySelectorAll(".rev-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".rev-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      activeReviewFilter = tab.dataset.revFilter;
      renderQuestionWiseReview();
    });
  });

  // Post-Exam Action Handlers
  const btnReviewAnswers = document.getElementById("btn-review-answers");
  if (btnReviewAnswers) {
    btnReviewAnswers.addEventListener("click", () => {
      const revSec = document.getElementById("question-wise-review");
      if (revSec) revSec.scrollIntoView({ behavior: "smooth" });
    });
  }

  const btnRetryTest = document.getElementById("btn-retry-test");
  if (btnRetryTest) {
    btnRetryTest.addEventListener("click", () => {
      openResetModal();
    });
  }

  const btnHomeTest = document.getElementById("btn-home-test");
  if (btnHomeTest) {
    btnHomeTest.addEventListener("click", () => {
      const resultsScreen = document.getElementById("results-screen");
      const questionsList = document.getElementById("questions-list");
      const dashboard = document.querySelector(".quiz-dashboard");
      const evalCard = document.querySelector(".eval-card");

      if (resultsScreen) resultsScreen.style.display = "none";
      if (questionsList) questionsList.style.display = "block";
      if (dashboard) dashboard.style.display = "block";
      if (evalCard) evalCard.style.display = "block";

      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // =========================================================================
  // Exam Timer
  // =========================================================================
  function formatTime(totalSec) {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (timerRunning) {
        timerSeconds++;
        const timeStr = formatTime(timerSeconds);
        if (timerTextEl) timerTextEl.textContent = timeStr;
        const topTimerEl = document.getElementById("top-timer");
        if (topTimerEl) topTimerEl.textContent = timeStr;
        const mobTimerEl = document.getElementById("mob-timer");
        if (mobTimerEl) mobTimerEl.textContent = timeStr;
      }
    }, 1000);
  }

  const timerPill = document.getElementById("timer-pill");
  if (timerPill) {
    timerPill.addEventListener("click", () => {
      timerRunning = !timerRunning;
      showToast(timerRunning ? "நேரம் மீண்டும் தொடங்கப்பட்டது" : "நேரம் இடைநிறுத்தப்பட்டது", timerRunning ? "⏱️" : "⏸️");
    });
  }

  const mobTimerBtn = document.getElementById("mob-timer-btn");
  if (mobTimerBtn) {
    mobTimerBtn.addEventListener("click", () => {
      timerRunning = !timerRunning;
      showToast(timerRunning ? "நேரம் மீண்டும் தொடங்கப்பட்டது" : "நேரம் இடைநிறுத்தப்பட்டது", timerRunning ? "⏱️" : "⏸️");
    });
  }

  // =========================================================================
  // Theme Toggle (Dark / Light)
  // =========================================================================
  const themeBtn = document.getElementById("theme-btn");
  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      if (themeBtn) themeBtn.innerHTML = '<span id="theme-icon">☀️</span> <span class="btn-text">பகல் முறை</span>';
      const mobThemeIcon = document.querySelector(".mob-theme-icon");
      if (mobThemeIcon) mobThemeIcon.textContent = "☀️";
    } else {
      document.documentElement.removeAttribute("data-theme");
      if (themeBtn) themeBtn.innerHTML = '<span id="theme-icon">🌙</span> <span class="btn-text">இரவு முறை</span>';
      const mobThemeIcon = document.querySelector(".mob-theme-icon");
      if (mobThemeIcon) mobThemeIcon.textContent = "☾";
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
  }

  let savedTheme = "light";
  try {
    savedTheme = localStorage.getItem(THEME_KEY) ||
      (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (e) {
    savedTheme = "light";
  }
  applyTheme(savedTheme);

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      applyTheme(currentTheme === "dark" ? "light" : "dark");
    });
  }

  const mobThemeBtn = document.getElementById("mob-theme-btn");
  if (mobThemeBtn) {
    mobThemeBtn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      applyTheme(currentTheme === "dark" ? "light" : "dark");
    });
  }

  const mobPaletteBtn = document.getElementById("mob-palette-btn");
  if (mobPaletteBtn) {
    mobPaletteBtn.addEventListener("click", openPalette);
  }

  // Floating Action Button (Scroll to top)
  const fabTop = document.getElementById("fab-top");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 400) {
      if (fabTop) fabTop.style.display = "flex";
    } else {
      if (fabTop) fabTop.style.display = "none";
    }
  });
  if (fabTop) {
    fabTop.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Keyboard Navigation: Escape to close modals
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePalette();
      closeResetModal();
      closeUnansweredModal();
      closeConfirmSubmitModal();
      closeDrawer();
    }
  });

  // Initialization
  if (TOTAL_QUESTIONS !== 100) {
    console.error(`Expected 100 questions, but loaded ${TOTAL_QUESTIONS}`);
    showToast(`எச்சரிக்கை: 100 வினாக்களில் ${TOTAL_QUESTIONS} மட்டுமே ஏற்றப்பட்டுள்ளது.`, "⚠️");
  }

  loadSavedState();
  renderQuestions();
  startTimer();
})();
