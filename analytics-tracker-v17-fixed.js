/**
 * 🎬 Insight Stream Analytics Tracker - V18 DOM CAPTURE
 * Enhanced version with full DOM snapshot capture for true session replay
 * 
 * Version: 2.4.0
 * Last Updated: 2025-10-15
 * 
 * Usage:
 * <script>
 *   window.__TRACKING_ID__ = 'your_tracking_id';
 *   window.__PROJECT_ID__ = 'your_project_id';
 * </script>
 * <script src="https://your-cdn.com/analytics-tracker-v18-dom-capture.js"></script>
 */
(function() {
  'use strict';
  
  // Configuration
  var config = {
    apiBaseUrl: 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1',
    sessionRecordingEnabled: true,
    domCaptureEnabled: true,
    captureInterval: 2000, // Capture DOM every 2 seconds
    maxDomSize: 500000, // Max DOM size in characters
    compressionEnabled: true
  };

  // Get tracking configuration
  var trackingId = window.__TRACKING_ID__ || 'your_tracking_id_here';
  var projectId = window.__PROJECT_ID__ || 'your_project_id_here';
  
  // API endpoints
  var apiUrls = {
    track: config.apiBaseUrl + '/track',
    behavior: config.apiBaseUrl + '/track-behavior',
    sessionReplay: config.apiBaseUrl + '/track-session-replay',
    checkRecording: config.apiBaseUrl + '/check-session-recording'
  };

  // Session management
  var sessionId = null;
  var sessionReplayBuffer = [];
  var domCaptureInterval = null;
  var lastDomSnapshot = null;

  // Utility functions
  function log(message, data) {
    console.log('📊', message, data || '');
  }

  function warn(message, data) {
    console.warn('⚠️', message, data || '');
  }

  // DOM capture functions
  function captureDOMSnapshot() {
    try {
      // Get the full HTML content
      var html = document.documentElement.outerHTML;
      
      // Check size limit
      if (html.length > config.maxDomSize) {
        warn('DOM too large, truncating...', html.length + ' chars');
        html = html.substring(0, config.maxDomSize) + '... [TRUNCATED]';
      }
      
      // Compress if enabled
      if (config.compressionEnabled) {
        // Simple compression - remove extra whitespace
        html = html.replace(/\s+/g, ' ').trim();
      }
      
      return {
        html: html,
        timestamp: Date.now(),
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scroll: {
          x: window.scrollX,
          y: window.scrollY
        }
      };
    } catch (error) {
      warn('Failed to capture DOM snapshot:', error);
      return null;
    }
  }

  function startDOMCapture() {
    if (!config.domCaptureEnabled) return;
    
    log('Starting DOM capture...');
    
    // Capture initial snapshot
    var initialSnapshot = captureDOMSnapshot();
    if (initialSnapshot) {
      addToReplayBuffer({
        type: 'dom_snapshot',
        data: initialSnapshot,
        timestamp: Date.now()
      });
      lastDomSnapshot = initialSnapshot;
    }
    
    // Set up periodic capture
    domCaptureInterval = setInterval(function() {
      var snapshot = captureDOMSnapshot();
      if (snapshot && snapshot.html !== lastDomSnapshot?.html) {
        addToReplayBuffer({
          type: 'dom_snapshot',
          data: snapshot,
          timestamp: Date.now()
        });
        lastDomSnapshot = snapshot;
        log('DOM snapshot captured');
      }
    }, config.captureInterval);
  }

  function stopDOMCapture() {
    if (domCaptureInterval) {
      clearInterval(domCaptureInterval);
      domCaptureInterval = null;
      log('DOM capture stopped');
    }
  }

  // Enhanced event capture
  function addToReplayBuffer(event) {
    if (!config.sessionRecordingEnabled) return;
    
    sessionReplayBuffer.push({
      type: event.type,
      data: event.data,
      timestamp: event.timestamp || Date.now(),
      url: window.location.href
    });
    
    // Send buffer when it gets large
    if (sessionReplayBuffer.length >= 10) {
      sendSessionReplayEvents();
    }
  }

  // Enhanced session replay sending
  function sendSessionReplayEvents() {
    if (sessionReplayBuffer.length === 0) return;
    
    var eventsToSend = sessionReplayBuffer.splice(0, 10);
    
    fetch(apiUrls.sessionReplay, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        session_id: sessionId,
        events: eventsToSend,
        metadata: {
          url: window.location.href,
          title: document.title,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          userAgent: navigator.userAgent,
          timestamp: Date.now()
        }
      })
    })
    .then(response => response.json())
    .then(data => {
      log('Session replay events sent:', eventsToSend.length);
    })
    .catch(error => {
      warn('Session replay send failed:', error);
    });
  }

  // Event listeners
  function setupEventListeners() {
    // Mouse events
    document.addEventListener('click', function(e) {
      addToReplayBuffer({
        type: 'click',
        data: {
          x: e.clientX,
          y: e.clientY,
          target: e.target.tagName,
          text: e.target.textContent?.substring(0, 50) || ''
        }
      });
    });

    // Scroll events
    var scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function() {
        addToReplayBuffer({
          type: 'scroll',
          data: {
            x: window.scrollX,
            y: window.scrollY
          }
        });
      }, 100);
    });

    // Input events
    document.addEventListener('input', function(e) {
      if (e.target.type === 'password') return; // Don't capture passwords
      
      addToReplayBuffer({
        type: 'input',
        data: {
          value: e.target.value,
          type: e.target.type,
          name: e.target.name || '',
          placeholder: e.target.placeholder || ''
        }
      });
    });

    // Page visibility changes
    document.addEventListener('visibilitychange', function() {
      addToReplayBuffer({
        type: 'visibility_change',
        data: {
          hidden: document.hidden
        }
      });
    });
  }

  // SPA navigation tracking
  function setupSPANavigation() {
    // Track pushState
    var originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      log('SPA Navigation detected (pushState):', window.location.pathname);
      
      // Capture DOM after navigation
      setTimeout(function() {
        var snapshot = captureDOMSnapshot();
        if (snapshot) {
          addToReplayBuffer({
            type: 'dom_snapshot',
            data: snapshot,
            timestamp: Date.now()
          });
        }
      }, 500);
    };

    // Track replaceState
    var originalReplaceState = history.replaceState;
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      log('SPA Navigation detected (replaceState):', window.location.pathname);
      
      setTimeout(function() {
        var snapshot = captureDOMSnapshot();
        if (snapshot) {
          addToReplayBuffer({
            type: 'dom_snapshot',
            data: snapshot,
            timestamp: Date.now()
          });
        }
      }, 500);
    };

    // Track popstate
    window.addEventListener('popstate', function() {
      log('SPA Navigation detected (popstate):', window.location.pathname);
      
      setTimeout(function() {
        var snapshot = captureDOMSnapshot();
        if (snapshot) {
          addToReplayBuffer({
            type: 'dom_snapshot',
            data: snapshot,
            timestamp: Date.now()
          });
        }
      }, 500);
    });
  }

  // Initialize session
  function initializeSession() {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    log('New session created:', sessionId);
    
    // Start DOM capture
    startDOMCapture();
    
    // Setup event listeners
    setupEventListeners();
    setupSPANavigation();
    
    log('Session recording started with DOM capture');
  }

  // Send final events on page unload
  window.addEventListener('beforeunload', function() {
    stopDOMCapture();
    sendSessionReplayEvents();
  });

  // Initialize
  function initialize() {
    log('Insight Stream Analytics Tracker v2.4.0 loaded');
    log('Tracking ID:', trackingId);
    log('Project ID:', projectId);
    
    if (config.sessionRecordingEnabled) {
      initializeSession();
    }
    
    log('Analytics tracking initialized');
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
