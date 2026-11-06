(() => {
  'use strict';
  const videos = Array.from(document.querySelectorAll('video'));
  const playback = new Map(videos.map(video => [video, {
    userPaused: false, internalPause: false, pending: false,
    blocked: false, hasPlayed: false, automatic: false,
  }]));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeVideo = null;
  let playbackFrame = 0;
  let centerCandidate = null;
  let centerSince = 0;
  let centerTimer = 0;
  let centerAttempted = false;
  const pauseVideo = video => {
    if (video.paused) return;
    playback.get(video).internalPause = true;
    video.pause();
  };
  const pauseAllVideos = () => videos.forEach(pauseVideo);
  const queuePlaybackCheck = () => {
    if (!playbackFrame) playbackFrame = requestAnimationFrame(checkPlayback);
  };
  function checkPlayback() {
    playbackFrame = 0;
    if (document.hidden || document.querySelector('dialog[open]')) {
      centerCandidate = null;
      clearTimeout(centerTimer);
      pauseAllVideos();
      return;
    }
    const height = window.innerHeight;
    const expanded = document.fullscreenElement || document.querySelector('.application-player.is-expanded');
    const visible = videos.map(video => {
      const rect = video.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(rect.bottom, height) - Math.max(rect.top, 0));
      const fraction = rect.width > 0 && rect.height > 0 ? visibleHeight / Math.min(rect.height, height) : 0;
      return { video, fraction, distance: Math.abs(rect.top + rect.height / 2 - height / 2) };
    });
    // The main film starts only on user input; case videos retain scroll autoplay.
    const centered = visible.filter(item => item.video.id !== 'project-video' &&
      item.fraction >= .5 && item.distance <= height * .2 &&
      (!expanded || expanded === item.video || expanded.contains(item.video)))
      .sort((a, b) => a.distance - b.distance)[0]?.video;
    if (centered !== centerCandidate) {
      centerCandidate = centered;
      centerSince = performance.now();
      centerAttempted = false;
      clearTimeout(centerTimer);
      // Avoid briefly starting every video during a quick scroll past them.
      if (centered) centerTimer = setTimeout(queuePlaybackCheck, 200);
    }
    // Keep a running video stable near the center; stop it as it leaves view,
    // or when the next video reaches the center. A deliberate pause persists.
    if (activeVideo) {
      const current = visible.find(item => item.video === activeVideo);
      if (current.fraction < .25 || (centered && centered !== activeVideo) ||
          (reducedMotion.matches && playback.get(activeVideo).automatic)) pauseVideo(activeVideo);
    }
    if (!centered || reducedMotion.matches || centerAttempted || performance.now() - centerSince < 180) return;
    const state = playback.get(centered);
    if (!centered.paused || state.userPaused || state.pending || state.blocked) return;
    centerAttempted = true;
    state.pending = true;
    // Muting the first automatic start satisfies browser autoplay policies.
    // A visitor's later audio choice is retained when returning to the video.
    if (!state.hasPlayed) centered.muted = true;
    centered.play().catch(error => {
      if (error.name !== 'AbortError') state.blocked = true;
      // Keep the normal play button available if autoplay is denied.
    }).finally(() => {
      state.pending = false;
      queuePlaybackCheck();
    });
  }
  // Keyboard focus reveals controls, without leaving them pinned after a mouse click.
  document.addEventListener('keydown', event => {
    if (['Tab', 'Enter', ' ', 'ArrowLeft', 'ArrowRight'].includes(event.key)) document.body.classList.add('using-keyboard');
  });
  document.addEventListener('pointerdown', () => document.body.classList.remove('using-keyboard'));
  // Progressive enhancement: retain native controls if JavaScript is unavailable.
  document.querySelectorAll('.application-player').forEach(player => {
    const video = player.querySelector('video');
    const controls = player.querySelector('.application-controls');
    const play = player.querySelector('[data-play]');
    const mute = player.querySelector('[data-mute]');
    const fullscreen = player.querySelector('[data-fullscreen]');
    const seek = player.querySelector('[data-seek]');
    const time = player.querySelector('[data-time]');
    const status = player.querySelector('.application-playback-status');
    const label = player.dataset.label;
    const preview = player.querySelector('.application-preview');
    const dismissPreview = () => {
      if (!preview || preview.hidden) return;
      const hadFocus = document.activeElement === preview;
      preview.hidden = true;
      player.classList.remove('has-preview');
      controls.inert = false;
      video.tabIndex = 0;
      if (hadFocus) video.focus({ preventScroll: true });
    };
    let hideControlsTimer;
    let touchingControls = false;
    const revealTouchControls = () => {
      clearTimeout(hideControlsTimer);
      player.classList.add('controls-visible');
      if (!video.paused && !touchingControls) {
        hideControlsTimer = setTimeout(() => player.classList.remove('controls-visible'), 2500);
      }
    };
    player.addEventListener('pointerenter', event => {
      if (event.pointerType === 'mouse') player.classList.add('pointer-active');
    });
    player.addEventListener('pointerleave', event => {
      if (event.pointerType === 'mouse') player.classList.remove('pointer-active');
    });
    player.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'mouse') {
        touchingControls = true;
        revealTouchControls();
      }
    });
    const releaseTouch = event => {
      if (event.pointerType !== 'mouse' && touchingControls) {
        touchingControls = false;
        revealTouchControls();
      }
    };
    document.addEventListener('pointerup', releaseTouch);
    document.addEventListener('pointercancel', releaseTouch);
    document.addEventListener('pointerdown', event => {
      if (!player.contains(event.target)) {
        clearTimeout(hideControlsTimer);
        player.classList.remove('controls-visible');
      }
    });
    ['play', 'pause'].forEach(name => video.addEventListener(name, () => {
      if (player.classList.contains('controls-visible')) revealTouchControls();
    }));
    const formatTime = value => {
      const seconds = Math.max(0, Math.floor(value || 0));
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    };
    const updateTime = () => {
      const loadedDuration = Number.isFinite(video.duration) ? video.duration : 0;
      const duration = loadedDuration || Number(video.dataset.duration) || 0;
      seek.disabled = !loadedDuration;
      seek.max = duration;
      seek.value = video.currentTime;
      seek.setAttribute('aria-valuetext', `${formatTime(video.currentTime)} of ${formatTime(duration)}`);
      time.textContent = `${formatTime(video.currentTime)} / ${formatTime(duration)}`;
    };
    const updatePlay = () => {
      const paused = video.paused || video.ended;
      play.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} ${label} video`);
      play.title = paused ? 'Play' : 'Pause';
      player.querySelector('[data-play-icon]').hidden = !paused;
      player.querySelector('[data-pause-icon]').hidden = paused;
    };
    const updateMute = () => {
      const muted = video.muted || video.volume === 0;
      mute.setAttribute('aria-label', `${muted ? 'Unmute' : 'Mute'} ${label} video`);
      mute.title = muted ? 'Unmute' : 'Mute';
      player.querySelector('[data-muted-icon]').hidden = !muted;
      player.querySelector('[data-sound-icon]').hidden = muted;
    };
    const togglePlay = async () => {
      status.hidden = true;
      playback.get(video).userPaused = !video.paused;
      if (!video.paused) return video.pause();
      try { await video.play(); } catch { status.hidden = false; }
    };
    play.addEventListener('click', togglePlay);
    preview?.addEventListener('click', togglePlay);
    video.addEventListener('playing', dismissPreview);
    video.addEventListener('click', togglePlay);
    video.tabIndex = 0;
    video.addEventListener('keydown', event => {
      if (event.key === ' ' || event.key.toLowerCase() === 'k') {
        event.preventDefault();
        togglePlay();
      }
    });
    mute.addEventListener('click', () => {
      if (video.volume === 0) { video.volume = 1; video.muted = false; }
      else video.muted = !video.muted;
    });
    seek.addEventListener('input', () => { video.currentTime = Number(seek.value); });
    const updateFullscreen = () => {
      const expanded = document.fullscreenElement === player || player.classList.contains('is-expanded');
      fullscreen.setAttribute('aria-label', `${expanded ? 'Exit full screen' : 'Full screen'} ${label} video`);
      fullscreen.title = expanded ? 'Exit full screen' : 'Full screen';
    };
    // Embedded browsers can deny the Fullscreen API. Keep the same clean
    // player in a viewport-filling mode instead of opening native video chrome.
    const expandInPage = expanded => {
      player.classList.toggle('is-expanded', expanded);
      document.body.classList.toggle('player-expanded', expanded);
      updateFullscreen();
      fullscreen.focus();
      queuePlaybackCheck();
    };
    fullscreen.addEventListener('click', async () => {
      if (player.classList.contains('is-expanded')) return expandInPage(false);
      try {
        if (document.fullscreenElement === player) await document.exitFullscreen();
        else if (document.fullscreenEnabled && player.requestFullscreen) await player.requestFullscreen();
        else expandInPage(true);
      } catch { expandInPage(true); }
    });
    document.addEventListener('fullscreenchange', updateFullscreen);
    player.addEventListener('keydown', event => {
      if (event.key === 'Escape' && player.classList.contains('is-expanded')) expandInPage(false);
      if (event.key === 'Tab' && player.classList.contains('is-expanded')) {
        if (event.shiftKey && document.activeElement === video) { event.preventDefault(); fullscreen.focus(); }
        else if (!event.shiftKey && document.activeElement === fullscreen) { event.preventDefault(); video.focus(); }
      }
    });
    ['loadedmetadata', 'durationchange', 'timeupdate', 'seeked'].forEach(name => video.addEventListener(name, updateTime));
    ['play', 'pause', 'ended'].forEach(name => video.addEventListener(name, updatePlay));
    video.addEventListener('volumechange', updateMute);
    video.addEventListener('error', () => { status.hidden = false; });
    updateTime(); updatePlay(); updateMute();
    controls.hidden = false;
    video.controls = false;
    if (preview) {
      preview.hidden = false;
      player.classList.add('has-preview');
      controls.inert = true;
      video.tabIndex = -1;
    }
  });
  const dialog = document.querySelector('#figure-dialog');
  const picture = document.querySelector('#dialog-img');
  let previousFocus;
  document.querySelectorAll('[data-figure]').forEach(button => {
    button.addEventListener('click', () => {
      previousFocus = button;
      pauseAllVideos();
      picture.src = button.dataset.figure;
      picture.alt = button.dataset.title || button.querySelector('img').alt;
      const crop = document.querySelector('#dialog-crop');
      crop.classList.toggle('figure-crop', Boolean(button.dataset.crop));
      crop.style.cssText = button.dataset.crop || '';
      document.querySelector('#dialog-caption').textContent = button.dataset.title;
      document.querySelector('#original-figure').href = button.dataset.figure;
      document.querySelector('#original-figure').textContent = button.dataset.crop ? 'Original figure ↗' : 'Open image ↗';
      document.querySelector('.dialog-image').scrollTop = 0;
      dialog.showModal();
      document.body.classList.add('dialog-open');
    });
  });
  document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    previousFocus?.focus();
  });
  const notesDialog = document.querySelector('#case-notes-dialog');
  const notesContent = notesDialog.querySelector('.case-notes-content');
  const notesScroll = notesDialog.querySelector('.case-notes-scroll');
  const smallerText = notesDialog.querySelector('[data-notes-smaller]');
  const largerText = notesDialog.querySelector('[data-notes-larger]');
  const expandNotes = notesDialog.querySelector('[data-notes-expand]');
  let notesTrigger;
  let textScale = 1;
  const updateTextScale = () => {
    notesDialog.style.setProperty('--notes-font-size', `${16 * textScale}px`);
    notesDialog.querySelector('[data-notes-zoom]').textContent = `${Math.round(textScale * 100)}%`;
    smallerText.disabled = textScale <= 1;
    largerText.disabled = textScale >= 1.5;
  };
  document.querySelectorAll('[data-case-notes]').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.closest('.application-case');
      const template = document.querySelector(`#case-notes-${button.dataset.caseNotes}`);
      notesTrigger = button;
      notesContent.replaceChildren(template.content.cloneNode(true));
      notesDialog.querySelector('#case-notes-title').textContent = section.querySelector('.application-case-title').textContent;
      notesDialog.querySelector('.case-notes-topic').textContent = section.querySelector('.application-case-subtitle')?.textContent || '';
      notesDialog.querySelector('.case-notes-label').textContent = section.querySelector('.application-player').dataset.label.replaceAll('_', ' · ');
      pauseAllVideos();
      updateTextScale();
      notesDialog.showModal();
      notesScroll.scrollTop = 0;
      button.setAttribute('aria-expanded', 'true');
      document.body.classList.add('dialog-open');
    });
  });
  smallerText.addEventListener('click', () => { textScale = Math.max(1, textScale - .25); updateTextScale(); });
  largerText.addEventListener('click', () => { textScale = Math.min(1.5, textScale + .25); updateTextScale(); });
  expandNotes.addEventListener('click', () => {
    const expanded = notesDialog.classList.toggle('is-wide');
    expandNotes.setAttribute('aria-pressed', String(expanded));
    expandNotes.setAttribute('aria-label', expanded ? 'Restore reading window' : 'Expand reading window');
    expandNotes.title = expanded ? 'Restore reading window' : 'Expand reading window';
  });
  notesContent.addEventListener('click', event => {
    const link = event.target.closest('.case-ref-link');
    if (!link) return;
    const reference = notesContent.querySelector(link.getAttribute('href'));
    if (reference) {
      event.preventDefault();
      reference.scrollIntoView({ block: 'center' });
      reference.focus({ preventScroll: true });
    }
  });
  notesDialog.querySelector('[data-notes-close]').addEventListener('click', () => notesDialog.close());
  notesDialog.addEventListener('click', event => {
    const box = notesDialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) notesDialog.close();
  });
  notesDialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    notesTrigger?.setAttribute('aria-expanded', 'false');
    notesTrigger?.focus({ preventScroll: true });
  });
  document.querySelector('#copy-citation').addEventListener('click', async () => {
    const citation = document.querySelector('#citation-text');
    const status = document.querySelector('#copy-status');
    try {
      await navigator.clipboard.writeText(citation.textContent);
      status.textContent = 'BibTeX copied.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(citation);
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      status.textContent = 'Citation selected. Copy with Ctrl+C or ⌘C.';
    }
  });
  videos.forEach(video => {
    const state = playback.get(video);
    video.addEventListener('play', () => {
      state.internalPause = false;
      state.automatic = state.pending;
      state.userPaused = false;
      state.blocked = false;
      state.hasPlayed = true;
      activeVideo = video;
      videos.forEach(other => { if (other !== video) pauseVideo(other); });
      queuePlaybackCheck();
    });
    video.addEventListener('pause', () => {
      if (state.internalPause) state.internalPause = false;
      else state.userPaused = true;
    });
    video.addEventListener('loadedmetadata', queuePlaybackCheck);
    video.addEventListener('webkitbeginfullscreen', () => { activeVideo = video; });
    video.addEventListener('webkitendfullscreen', queuePlaybackCheck);
  });
  document.querySelectorAll('dialog').forEach(modal => {
    new MutationObserver(queuePlaybackCheck).observe(modal, { attributes: true, attributeFilter: ['open'] });
  });
  window.addEventListener('scroll', queuePlaybackCheck, { passive: true });
  window.addEventListener('resize', queuePlaybackCheck);
  window.addEventListener('pageshow', queuePlaybackCheck);
  document.addEventListener('visibilitychange', queuePlaybackCheck);
  document.addEventListener('fullscreenchange', queuePlaybackCheck);
  reducedMotion.addEventListener('change', queuePlaybackCheck);
  queuePlaybackCheck();
})();
