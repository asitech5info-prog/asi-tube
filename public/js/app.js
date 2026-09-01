// ASI TUBE - Main Application Controller
// Inspired by ytdown.tools & app.ytdown.to

document.addEventListener('DOMContentLoaded', () => {
  const mediaUrl = document.getElementById('media-url');
  const downloadBtn = document.getElementById('download-btn');
  const clearBtn = document.getElementById('clear-btn');
  const errorMessage = document.getElementById('error-message');
  const resultContainer = document.getElementById('result-container');
  const loadingContainer = document.getElementById('loading-container');
  const videoInfo = document.getElementById('video-info');
  const iframeWrapper = document.getElementById('iframe-wrapper');
  const themeToggle = document.getElementById('theme-toggle');

  // Helper to get active theme ('light' or 'dark')
  function getCurrentTheme() {
    return document.documentElement.classList.contains('light-mode') ? 'light' : 'dark';
  }

  // Parse and validate YouTube URL (Watch, Short, Playlist, youtu.be, embed)
  function parseYouTubeUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') {
      return { valid: false, message: 'Please enter a video URL.' };
    }

    try {
      const trimmed = urlStr.trim();
      // Handle raw 11-char video ID directly
      if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
        return { valid: true, id: trimmed };
      }

      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const host = parsed.hostname.toLowerCase();
      const pathSegments = parsed.pathname.split('/').filter(p => p !== '');

      if (!host.includes('youtube.com') && !host.includes('youtu.be')) {
        return { valid: false, message: 'Please enter a supported YouTube URL.' };
      }

      if (pathSegments.some(s => s.toLowerCase() === 'live')) {
        return { valid: false, message: 'Live stream recordings are not supported.' };
      }

      let videoId = null;
      const listId = parsed.searchParams.get('list');
      const shortsIdx = pathSegments.findIndex(s => s.toLowerCase() === 'shorts');

      if (shortsIdx !== -1 && pathSegments[shortsIdx + 1]) {
        videoId = pathSegments[shortsIdx + 1].slice(0, 11);
      } else if (host.includes('youtu.be')) {
        videoId = pathSegments[0] ? pathSegments[0].slice(0, 11) : null;
      } else if (parsed.searchParams.get('v')) {
        videoId = parsed.searchParams.get('v').slice(0, 11);
      } else {
        const embedIdx = pathSegments.findIndex(s => ['v', 'embed', 'e'].includes(s.toLowerCase()));
        if (embedIdx !== -1 && pathSegments[embedIdx + 1]) {
          videoId = pathSegments[embedIdx + 1].slice(0, 11);
        }
      }

      if (videoId && listId) {
        return { valid: true, id: `${videoId}&list=${listId}` };
      } else if (videoId) {
        return { valid: true, id: videoId };
      } else if (listId) {
        return { valid: true, id: listId };
      }

      return { valid: false, message: 'Please enter a valid YouTube video URL.' };
    } catch (err) {
      return { valid: false, message: 'Please enter a valid URL (e.g. https://www.youtube.com/watch?v=...).' };
    }
  }

  // Handle URL submission
  async function handleConvert() {
    if (!mediaUrl || !downloadBtn) return;

    const rawInput = mediaUrl.value.trim();
    if (errorMessage) errorMessage.classList.add('hidden');

    if (!rawInput) {
      if (errorMessage) {
        errorMessage.textContent = 'Please paste a YouTube URL first.';
        errorMessage.classList.remove('hidden');
      }
      mediaUrl.focus();
      return;
    }

    const check = parseYouTubeUrl(rawInput);
    if (!check.valid || !check.id) {
      if (errorMessage) {
        errorMessage.textContent = check.message || 'Please enter a valid YouTube URL.';
        errorMessage.classList.remove('hidden');
      }
      return;
    }

    // Show loading state and scroll smoothly
    downloadBtn.disabled = true;
    if (resultContainer) resultContainer.classList.remove('hidden');
    if (loadingContainer) loadingContainer.classList.remove('hidden');
    if (videoInfo) videoInfo.classList.add('hidden');
    if (iframeWrapper) iframeWrapper.innerHTML = '';

    if (resultContainer) {
      resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Brief delay to let the animation show smoothly
    await new Promise(r => setTimeout(r, 450));

    // Create the widget iframe matching ytdown.tools
    const iframe = document.createElement('iframe');
    iframe.className = 'resizingFrame';
    iframe.referrerPolicy = 'origin-when-cross-origin';
    iframe.src = `https://bestapi.cc/widget/panel-plus/${check.id}/${getCurrentTheme()}`;
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.setAttribute('allowtransparency', 'true');
    iframe.setAttribute('scrolling', 'no');
    iframe.style.border = 'none';
    iframe.style.display = 'block';

    iframe.onload = () => {
      try {
        if (window.iFrameResize) {
          window.iFrameResize({ log: false, heightCalculationMethod: 'lowestElement' }, '.resizingFrame');
        }
      } catch (e) {}

      if (loadingContainer) loadingContainer.classList.add('hidden');
      if (videoInfo) videoInfo.classList.remove('hidden');
      downloadBtn.disabled = false;

      if (resultContainer) {
        resultContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };

    iframe.onerror = () => {
      if (loadingContainer) loadingContainer.classList.add('hidden');
      if (errorMessage) {
        errorMessage.textContent = 'Could not load video widget. Please check your network and try again.';
        errorMessage.classList.remove('hidden');
      }
      downloadBtn.disabled = false;
    };

    if (iframeWrapper) {
      iframeWrapper.appendChild(iframe);
    }
  }

  // Theme Toggle Event
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.documentElement.classList.toggle('light-mode');
      const currentTheme = getCurrentTheme();
      try {
        localStorage.setItem('theme', currentTheme);
      } catch (e) {}

      // Dynamically update embedded widget theme if currently loaded
      if (iframeWrapper) {
        const iframe = iframeWrapper.querySelector('iframe');
        if (iframe && mediaUrl) {
          const check = parseYouTubeUrl(mediaUrl.value.trim());
          if (check.valid && check.id) {
            iframe.src = `https://bestapi.cc/widget/panel-plus/${check.id}/${currentTheme}`;
          }
        }
      }
    });
  }

  // Bind Start Button and Enter Key
  if (downloadBtn) {
    downloadBtn.addEventListener('click', handleConvert);
  }

  if (mediaUrl) {
    mediaUrl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConvert();
      }
    });

    mediaUrl.addEventListener('input', () => {
      if (errorMessage) errorMessage.classList.add('hidden');
      if (clearBtn) {
        if (mediaUrl.value.length > 0) {
          clearBtn.classList.remove('hidden');
        } else {
          clearBtn.classList.add('hidden');
        }
      }
    });
  }

  // Clear Button
  if (clearBtn && mediaUrl) {
    clearBtn.addEventListener('click', () => {
      mediaUrl.value = '';
      clearBtn.classList.add('hidden');
      if (errorMessage) errorMessage.classList.add('hidden');
      if (resultContainer) resultContainer.classList.add('hidden');
      if (iframeWrapper) iframeWrapper.innerHTML = '';
      mediaUrl.focus();
    });
  }

  // FAQ Accordion Handlers
  document.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      if (item) {
        const wasActive = item.classList.contains('active');
        document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
        if (!wasActive) {
          item.classList.add('active');
        }
      }
    });
  });
});
