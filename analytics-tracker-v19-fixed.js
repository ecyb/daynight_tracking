/**
 * 🎬 Insight Stream Analytics Tracker - FINAL VERSION
 * Complete analytics tracking with DOM capture, SPA navigation, and session replay
 * 
 * Version: 3.0.0
 * Last Updated: 2025-10-15
 * 
 * Features:
 * - Real-time pageview tracking
 * - Custom event tracking
 * - Session replay with DOM capture
 * - SPA navigation tracking
 * - User behavior analytics
 * - Performance monitoring
 * 
 * Usage:
 * <script>
 *   window.__TRACKING_ID__ = 'your_tracking_id';
 *   window.__PROJECT_ID__ = 'your_project_id';
 * </script>
 * <script src="https://your-cdn.com/analytics-tracker-final.js"></script>
 */
(function() {
  'use strict';
  
  // Configuration
  var config = {
    apiBaseUrl: 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1',
    sessionRecordingEnabled: true,
    domCaptureEnabled: true,
    captureInterval: 3000, // Capture DOM every 3 seconds
    maxDomSize: 200000, // Max DOM size in characters (200KB)
    compressionEnabled: true,
    performanceTracking: true,
    errorTracking: true,
    debugMode: true
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
  var performanceData = {};
  var errorCount = 0;

  // Utility functions
  function log(message, data) {
    if (config.debugMode) {
      console.log('📊 [Analytics]', message, data || '');
    }
  }

  function warn(message, data) {
    console.warn('⚠️ [Analytics]', message, data || '');
  }

  function error(message, data) {
    console.error('❌ [Analytics]', message, data || '');
  }

  // Performance tracking
  function capturePerformanceData() {
    if (!config.performanceTracking) return;
    
    try {
      var navigation = performance.getEntriesByType('navigation')[0];
      var paint = performance.getEntriesByType('paint');
      
      performanceData = {
        loadTime: navigation ? navigation.loadEventEnd - navigation.loadEventStart : 0,
        domContentLoaded: navigation ? navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart : 0,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0,
        connectionType: navigator.connection?.effectiveType || 'unknown',
        memoryUsage: performance.memory ? {
          used: performance.memory.usedJSHeapSize,
          total: performance.memory.totalJSHeapSize,
          limit: performance.memory.jsHeapSizeLimit
        } : null
      };
      
      log('Performance data captured', performanceData);
    } catch (e) {
      warn('Failed to capture performance data:', e.message);
    }
  }

  // Error tracking
  function setupErrorTracking() {
    if (!config.errorTracking) return;
    
    window.addEventListener('error', function(event) {
      errorCount++;
      addToReplayBuffer({
        type: 'error',
        data: {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });
    });
    
    window.addEventListener('unhandledrejection', function(event) {
      errorCount++;
      addToReplayBuffer({
        type: 'unhandledrejection',
        data: {
          reason: event.reason?.toString(),
          stack: event.reason?.stack,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      });
    });
  }

  // DOM capture functions
  function captureDOMSnapshot() {
    try {
      // Get the full HTML content
      var html = document.documentElement.outerHTML;
      
      log('Capturing DOM snapshot - size:', html.length + ' chars');
      
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
      
      var snapshot = {
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
        },
        performance: performanceData,
        errorCount: errorCount
      };
      
      log('DOM snapshot captured successfully');
      return snapshot;
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
        sessionId: sessionId,
        events: eventsToSend,
        metadata: {
          url: window.location.href,
          title: document.title,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
          performance: performanceData,
          errorCount: errorCount
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

  // Pageview tracking
  function trackPageView() {
    var currentPath = window.location.pathname + window.location.search;
    var currentTime = Date.now();
    
    fetch(apiUrls.track, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        event_type: 'pageview',
        path: currentPath,
        referrer: document.referrer,
        user_agent: navigator.userAgent,
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        session_id: sessionId,
        timestamp: currentTime
      })
    })
    .then(response => response.json())
    .then(data => {
      log('Page view tracked');
    })
    .catch(error => {
      warn('Page view tracking failed:', error);
    });
  }

  // Custom event tracking
  function trackCustomEvent(eventName, eventData) {
    fetch(apiUrls.track, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_id: trackingId,
        event_type: 'event',
        event_name: eventName,
        event_data: eventData || {},
        session_id: sessionId,
        timestamp: Date.now()
      })
    })
    .then(response => response.json())
    .then(data => {
      log('Custom event tracked:', eventName);
    })
    .catch(error => {
      warn('Custom event tracking failed:', error);
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
          text: e.target.textContent?.substring(0, 50) || '',
          href: e.target.href || '',
          className: e.target.className || ''
        }
      });
    });

    // Mouse movement tracking (throttled)
    var mouseMoveTimeout;
    document.addEventListener('mousemove', function(e) {
      clearTimeout(mouseMoveTimeout);
      mouseMoveTimeout = setTimeout(function() {
        addToReplayBuffer({
          type: 'mousemove',
          data: {
            x: e.clientX,
            y: e.clientY
          }
        });
      }, 100); // Throttle to every 100ms
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
            y: window.scrollY,
            maxScrollY: document.documentElement.scrollHeight - window.innerHeight
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
          placeholder: e.target.placeholder || '',
          id: e.target.id || ''
        }
      });
    });

    // Focus events
    document.addEventListener('focus', function(e) {
      addToReplayBuffer({
        type: 'focus',
        data: {
          target: e.target.tagName,
          id: e.target.id || '',
          className: e.target.className || ''
        }
      });
    }, true);

    // Blur events
    document.addEventListener('blur', function(e) {
      addToReplayBuffer({
        type: 'blur',
        data: {
          target: e.target.tagName,
          id: e.target.id || '',
          className: e.target.className || ''
        }
      });
    }, true);

    // Page visibility changes
    document.addEventListener('visibilitychange', function() {
      addToReplayBuffer({
        type: 'visibility_change',
        data: {
          hidden: document.hidden,
          visibilityState: document.visibilityState
        }
      });
    });

    // Resize events
    var resizeTimeout;
    window.addEventListener('resize', function() {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(function() {
        addToReplayBuffer({
          type: 'resize',
          data: {
            width: window.innerWidth,
            height: window.innerHeight
          }
        });
      }, 250);
    });
  }

  // SPA navigation tracking
  function setupSPANavigation() {
    var currentPagePath = window.location.pathname + window.location.search;
    var currentPageStartTime = Date.now();
    
    // Track pushState
    var originalPushState = history.pushState;
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      log('SPA Navigation detected (pushState):', window.location.pathname);
      
      // Track new page view after navigation
      trackPageView();
      
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
      
      trackPageView();
      
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
      trackPageView();
      
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

  // Session recording check
  function checkSessionRecordingEnabled() {
    fetch(apiUrls.checkRecording, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_id: trackingId
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.enabled) {
        log('Session recording enabled');
        return true;
      } else {
        log('Session recording disabled');
        return false;
      }
    })
    .catch(error => {
      warn('Session recording check failed:', error);
      return true; // Default to enabled
    });
  }

  // Initialize session
  function initializeSession() {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    log('New session created:', sessionId);
    
    // Capture performance data
    capturePerformanceData();
    
    // Setup error tracking
    setupErrorTracking();
    
    // Start DOM capture
    startDOMCapture();
    
    // Setup event listeners
    setupEventListeners();
    setupSPANavigation();
    
    // Track initial pageview
    trackPageView();
    
    log('Session recording started with DOM capture');
  }

  // Send final events on page unload
  window.addEventListener('beforeunload', function() {
    stopDOMCapture();
    sendSessionReplayEvents();
  });

  // Public API
  window.InsightStreamAnalytics = {
    track: trackCustomEvent,
    trackPageView: trackPageView,
    getSessionId: function() { return sessionId; },
    getConfig: function() { return config; },
    setConfig: function(newConfig) { 
      Object.assign(config, newConfig); 
    }
  };

  // Initialize
  function initialize() {
    log('Insight Stream Analytics Tracker v3.0.0 loaded');
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
