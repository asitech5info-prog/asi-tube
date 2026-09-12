// ASI TUBE - Main Application Controller (Multi-Platform Downloader & Copy Suite)

const App = {
  activeFormatTab: 'video',

  init() {
    this.bindDomElements();
    this.bindEvents();
    this.initTheme();
  },

  bindDomElements() {
    this.mediaUrl = document.getElementById('media-url');
    this.downloadBtn = document.getElementById('download-btn');
    this.clearBtn = document.getElementById('clear-btn');
    this.errorMessage = document.getElementById('error-message');
    this.resultContainer = document.getElementById('result-container');
    this.loadingContainer = document.getElementById('loading-container');
    this.resultSection = document.getElementById('resultSection');
    this.themeToggle = document.getElementById('theme-toggle');

    // Title & Description Elements
    this.copyTitleBtn = document.getElementById('copyTitleBtn');
    this.copyDescBtn = document.getElementById('copyDescBtn');
    this.copyBothBtn = document.getElementById('copyBothBtn');
    this.toggleDescBtn = document.getElementById('toggleDescBtn');
    this.videoDescContainer = document.getElementById('videoDescContainer');
    this.resultDescription = document.getElementById('resultDescription');
    this.platformChips = document.querySelectorAll('.chip-item');
  },

  initTheme() {
    try {
      const savedTheme = localStorage.getItem('theme');
      if (savedTheme === 'light') {
        document.documentElement.classList.add('light-mode');
      }
    } catch (e) { }
  },

  getCurrentTheme() {
    return document.documentElement.classList.contains('light-mode') ? 'light' : 'dark';
  },

  // Robust clipboard copy utility with fallback for non-secure / older browser contexts
  async copyToClipboard(text, btnElement, successMessage) {
    if (!text || typeof text !== 'string') {
      UI.showToast('Nothing to copy', 'warning');
      return;
    }

    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand('copy');
        textarea.remove();
      }
    } catch (e) {
      console.warn('Clipboard write error:', e);
    }

    if (copied) {
      if (btnElement) {
        const originalHtml = btnElement.innerHTML;
        btnElement.classList.add('copied');
        const textSpan = btnElement.querySelector('.copy-btn-text');
        if (textSpan) {
          textSpan.textContent = 'Copied!';
        } else {
          btnElement.textContent = '✓ Copied!';
        }

        setTimeout(() => {
          btnElement.classList.remove('copied');
          btnElement.innerHTML = originalHtml;
        }, 2000);
      }

      UI.showToast(successMessage || 'Copied to clipboard!', 'success');
    } else {
      UI.showToast('Could not access clipboard. Please copy manually.', 'error');
    }
  },

  // Parse and validate multi-platform video URL (YouTube, Facebook, Instagram, TikTok)
  parseMediaUrl(urlStr) {
    if (!urlStr || typeof urlStr !== 'string') {
      return { valid: false, message: 'Please enter a video URL.' };
    }

    const trimmed = urlStr.trim();
    if (!trimmed) {
      return { valid: false, message: 'Please enter a video URL.' };
    }

    // Handle raw 11-char YouTube video ID directly
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return {
        valid: true,
        platform: 'youtube',
        id: trimmed,
        cleanUrl: `https://www.youtube.com/watch?v=${trimmed}`
      };
    }

    try {
      const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const host = parsed.hostname.toLowerCase();
      const pathSegments = parsed.pathname.split('/').filter(p => p !== '');

      // YouTube
      if (host.includes('youtube.com') || host.includes('youtu.be')) {
        let videoId = null;
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

        return {
          valid: true,
          platform: 'youtube',
          id: videoId,
          cleanUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : parsed.href
        };
      }

      // TikTok
      if (host.includes('tiktok.com') || host.includes('douyin.com')) {
        return {
          valid: true,
          platform: 'tiktok',
          cleanUrl: parsed.href
        };
      }

      // Facebook
      if (host.includes('facebook.com') || host.includes('fb.watch') || host.includes('fb.com') || host.includes('fb.gg')) {
        return {
          valid: true,
          platform: 'facebook',
          cleanUrl: parsed.href
        };
      }

      // Instagram
      if (host.includes('instagram.com') || host.includes('instagr.am')) {
        return {
          valid: true,
          platform: 'instagram',
          cleanUrl: parsed.href
        };
      }

      // Any valid HTTP / HTTPS media URL
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return {
          valid: true,
          platform: 'generic',
          cleanUrl: parsed.href
        };
      }

      return { valid: false, message: 'Please enter a supported YouTube, Facebook, Instagram, or TikTok URL.' };
    } catch (err) {
      return { valid: false, message: 'Please enter a valid URL (e.g. https://www.tiktok.com/..., https://www.instagram.com/reel/...).' };
    }
  },

  // Process Video URL Submission
  async processUrl(inputUrl) {
    const check = this.parseMediaUrl(inputUrl);
    if (!check.valid) {
      if (this.errorMessage) {
        this.errorMessage.textContent = check.message || 'Please enter a valid video link.';
        this.errorMessage.classList.remove('hidden');
      }
      return;
    }

    if (this.errorMessage) this.errorMessage.classList.add('hidden');
    if (this.downloadBtn) this.downloadBtn.disabled = true;

    // Show loading spinner
    if (this.resultContainer) this.resultContainer.classList.remove('hidden');
    if (this.loadingContainer) this.loadingContainer.classList.remove('hidden');
    if (this.resultSection) this.resultSection.classList.add('hidden');

    if (this.resultContainer) {
      this.resultContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    try {
      const data = await API.getInfo(check.cleanUrl);
      if (!data || data.error) {
        throw new Error(data?.error || 'Could not fetch video information');
      }

      if (this.loadingContainer) this.loadingContainer.classList.add('hidden');
      if (this.resultSection) this.resultSection.classList.remove('hidden');

      // Render native video result details and format options
      UI.renderResult(data);

      // Set active format tab back to video
      this.switchFormatTab('video');

    } catch (err) {
      console.error('Error loading video details:', err);
      if (this.loadingContainer) this.loadingContainer.classList.add('hidden');
      if (this.errorMessage) {
        this.errorMessage.textContent = err.message || 'Failed to extract video formats. Please verify the link is public and try again.';
        this.errorMessage.classList.remove('hidden');
      }
    } finally {
      if (this.downloadBtn) this.downloadBtn.disabled = false;
    }
  },

  // Trigger Direct In-App Download
  async triggerDownload(encodedUrl, quality, format, audioOnly, encodedTitle, encodedDirectUrl) {
    const rawUrl = decodeURIComponent(encodedUrl || '');
    const rawTitle = decodeURIComponent(encodedTitle || 'video');
    const directUrl = encodedDirectUrl ? decodeURIComponent(encodedDirectUrl) : '';
    const isAudio = audioOnly === true || audioOnly === 'true';
    const modalHandler = UI.showDownloadModal(rawTitle, quality, format);

    try {
      const result = await API.getDownload(rawUrl, quality, format, isAudio, rawTitle, directUrl);
      if (result && result.downloadUrl) {
        modalHandler.finish(result.downloadUrl, result.filename);
      } else {
        throw new Error('Download stream link could not be generated.');
      }
    } catch (err) {
      console.error('Download error:', err);
      modalHandler.error(err.message || 'Download generation failed. Please try again.');
    }
  },

  // Switch Format Tabs (Video / Audio / Thumbnails)
  switchFormatTab(tabName) {
    this.activeFormatTab = tabName;
    document.querySelectorAll('.fmt-tab').forEach(t => {
      if (t.dataset.fmt === tabName) {
        t.classList.add('active');
      } else {
        t.classList.remove('active');
      }
    });

    if (window.currentVideoData) {
      if (tabName === 'video') {
        UI.renderVideoFormats(window.currentVideoData.formats?.video || [], window.currentVideoData);
      } else if (tabName === 'audio') {
        UI.renderAudioFormats(window.currentVideoData.formats?.audio || [], window.currentVideoData);
      } else if (tabName === 'thumbnails') {
        UI.renderThumbnailFormats(window.currentVideoData.formats?.thumbnails || [], window.currentVideoData);
      }
    }
  },

  bindEvents() {
    // Start Button
    if (this.downloadBtn) {
      this.downloadBtn.addEventListener('click', () => {
        const val = this.mediaUrl?.value.trim();
        if (!val) {
          if (this.errorMessage) {
            this.errorMessage.textContent = 'Please paste a video link first.';
            this.errorMessage.classList.remove('hidden');
          }
          this.mediaUrl?.focus();
          return;
        }
        this.processUrl(val);
      });
    }

    // Input Enter Key
    if (this.mediaUrl) {
      this.mediaUrl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = this.mediaUrl.value.trim();
          if (val) this.processUrl(val);
        }
      });

      this.mediaUrl.addEventListener('input', () => {
        if (this.errorMessage) this.errorMessage.classList.add('hidden');
        if (this.clearBtn) {
          if (this.mediaUrl.value.length > 0) {
            this.clearBtn.classList.remove('hidden');
          } else {
            this.clearBtn.classList.add('hidden');
          }
        }
      });
    }

    // Clear Button
    if (this.clearBtn && this.mediaUrl) {
      this.clearBtn.addEventListener('click', () => {
        this.mediaUrl.value = '';
        this.clearBtn.classList.add('hidden');
        if (this.errorMessage) this.errorMessage.classList.add('hidden');
        if (this.resultContainer) this.resultContainer.classList.add('hidden');
        if (this.resultSection) this.resultSection.classList.add('hidden');
        this.mediaUrl.focus();
      });
    }

    // Copy Title Button
    if (this.copyTitleBtn) {
      this.copyTitleBtn.addEventListener('click', () => {
        if (window.currentVideoData && window.currentVideoData.title) {
          this.copyToClipboard(window.currentVideoData.title, this.copyTitleBtn, 'Video title copied to clipboard!');
        }
      });
    }

    // Copy Description Button
    if (this.copyDescBtn) {
      this.copyDescBtn.addEventListener('click', () => {
        if (window.currentVideoData && window.currentVideoData.description) {
          this.copyToClipboard(window.currentVideoData.description, this.copyDescBtn, 'Description copied to clipboard!');
        }
      });
    }

    // Copy Both (Title & Description) Button
    if (this.copyBothBtn) {
      this.copyBothBtn.addEventListener('click', () => {
        if (window.currentVideoData) {
          const title = window.currentVideoData.title || '';
          const desc = window.currentVideoData.description || '';
          const combined = desc ? `${title}\n\n${desc}` : title;
          this.copyToClipboard(combined, this.copyBothBtn, 'Title and description copied to clipboard!');
        }
      });
    }

    // Description Expand / Collapse Toggle Button
    if (this.toggleDescBtn && this.resultDescription) {
      this.toggleDescBtn.addEventListener('click', () => {
        const isCollapsed = this.resultDescription.classList.contains('collapsed');
        if (isCollapsed) {
          this.resultDescription.classList.remove('collapsed');
          this.toggleDescBtn.textContent = 'Show less';
        } else {
          this.resultDescription.classList.add('collapsed');
          this.toggleDescBtn.textContent = 'Show more';
        }
      });
    }

    // Platform Chips Click Handlers
    this.platformChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.platformChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (this.mediaUrl) {
          this.mediaUrl.focus();
        }
      });
    });

    // Format Tab Buttons
    document.querySelectorAll('.fmt-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const fmt = tab.dataset.fmt;
        if (fmt) this.switchFormatTab(fmt);
      });
    });

    // Theme Toggle
    if (this.themeToggle) {
      this.themeToggle.addEventListener('click', () => {
        document.documentElement.classList.toggle('light-mode');
        const currentTheme = this.getCurrentTheme();
        try {
          localStorage.setItem('theme', currentTheme);
        } catch (e) { }
      });
    }

    // FAQ Accordions
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
  }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
