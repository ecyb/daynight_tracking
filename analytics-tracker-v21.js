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
  
  // Add comprehensive polyfills BEFORE any rrweb code
  if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.matchesSelector || 
      Element.prototype.mozMatchesSelector || 
      Element.prototype.msMatchesSelector || 
      Element.prototype.oMatchesSelector || 
      Element.prototype.webkitMatchesSelector || 
      function(s) {
        var matches = (this.document || this.ownerDocument).querySelectorAll(s),
            i = matches.length;
        while (--i >= 0 && matches.item(i) !== this) {}
        return i > -1;            
      };
  }
  
  // Force polyfill on all existing elements
  var allElements = document.querySelectorAll('*');
  for (var i = 0; i < allElements.length; i++) {
    if (!allElements[i].matches) {
      allElements[i].matches = Element.prototype.matches;
    }
  }
  
  // Add matches to NodeList prototype for better compatibility
  if (NodeList.prototype && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }
  
  // Ensure all elements have matches method
  var originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    var element = originalCreateElement.call(this, tagName);
    if (!element.matches) {
      element.matches = Element.prototype.matches;
    }
    return element;
  };
  
  // Configuration
  var config = {
    apiBaseUrl: 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1',
    sessionRecordingEnabled: true,
    // DOM capture removed - using rrweb only
    compressionEnabled: true,
    performanceTracking: true,
    errorTracking: true,
    debugMode: true
  };

  // Get tracking configuration - will be set in initialize()
  var trackingId = 'your_tracking_id_here';
  var projectId = 'your_project_id_here';
  
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
  // DOM capture variables removed - using rrweb only
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

  // rrweb recording setup
  let rrwebRecorder = null;
  let rrwebEvents = [];
  
  function startRRWebRecording() {
    try {
      // Load rrweb if not already loaded
      if (typeof window.rrweb === 'undefined') {
        log('Loading rrweb...');
        
        // Try CDN first (more reliable for external websites)
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/rrweb@2.0.0-beta.12/dist/rrweb.min.js';
        script.onload = function() {
          log('rrweb loaded from unpkg CDN');
          initializeRRWeb();
        };
        script.onerror = function() {
          warn('Failed to load rrweb from unpkg, trying jsdelivr...');
          // Try second CDN
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://cdn.jsdelivr.net/npm/rrweb@2.0.0-beta.12/dist/rrweb.min.js';
          fallbackScript.onload = function() {
            log('rrweb loaded from jsdelivr CDN');
            initializeRRWeb();
          };
          fallbackScript.onerror = function() {
            warn('Failed to load rrweb from jsdelivr, trying local file...');
            // Try local file as last resort
            const localScript = document.createElement('script');
            localScript.src = '/rrweb.min.js';
            localScript.onload = function() {
              log('rrweb loaded from local file');
              initializeRRWeb();
            };
            localScript.onerror = function() {
              warn('Failed to load rrweb from all sources - session recording disabled');
            };
            document.head.appendChild(localScript);
          };
          document.head.appendChild(fallbackScript);
        };
        
        // Timeout fallback after 8 seconds
        setTimeout(function() {
          if (typeof window.rrweb === 'undefined') {
            warn('rrweb loading timeout - session recording disabled');
          }
        }, 8000);
        
        document.head.appendChild(script);
      } else {
        initializeRRWeb();
      }
    } catch (error) {
      warn('Failed to start rrweb recording:', error);
    }
  }
  
  function initializeRRWeb() {
    try {
      log('Initializing rrweb recorder...');
      
      // Check if rrweb is properly loaded
      if (typeof window.rrweb === 'undefined' || !window.rrweb.record) {
        warn('rrweb not properly loaded, cannot initialize recorder');
        return;
      }
      
      // Element.matches polyfill already added at script start
      
      let typeCounts = { meta:0, full:0, inc:0, cust:0, other:0 };
      
      rrwebRecorder = window.rrweb.record({
        emit(event) {
          try {
            // sanity: count types
            switch (event.type) {
              case 4: typeCounts.meta++; break;             // Meta
              case 2: typeCounts.full++; break;             // FullSnapshot
              case 3: typeCounts.inc++; break;              // Incremental
              case 5: typeCounts.cust++; break;             // Custom
              default: typeCounts.other++; break;
            }

            // Add to buffer for session replay
            rrwebEvents.push(event);
            addToReplayBuffer({
              type: 'rrweb_event',
              data: event,
              timestamp: Date.now()
            });
            
            // useful breadcrumbs
            if (event.type === 4) log('rrweb: Meta event captured');
            if (event.type === 2) log('rrweb: Full snapshot captured');
            if (event.type === 3) log('rrweb: Incremental snapshot captured');
          } catch (error) {
            // Silently handle rrweb emit errors to prevent breaking the recording
            console.warn('rrweb emit error (handled):', error.message);
          }
        },
        // Record canvas replays, inline stylesheets/fonts to reduce external deps in replay
        recordCanvas: true,
        inlineStylesheet: true,
        // Sampling to keep payload sane without killing fidelity
        sampling: {
          mousemove: 50,          // throttle mousemove to every 50ms
          scroll: 100,            // throttle scroll
          media: true,            // track <audio>/<video>
          input: 'last',          // record the last input in a burst
        },
        // Privacy: mask sensitive stuff; tune to your app
        maskAllInputs: false,
        maskTextSelector: '[data-mask], [type="password"]',
        // blockSelector: '[data-replay-block]', // TEMPORARILY DISABLED - elements you NEVER want to record
        // Periodic full snapshots help recovery
        checkoutEveryNms: 2 * 60 * 1000, // 2 min
        checkoutEveryNth: 0,
        // Additional options for better fidelity
        collectFonts: true,
      });
      
      // FORCE a full snapshot right after starting (some CSPs/timing shenanigans block the initial one)
      if (window.rrweb?.record?.takeFullSnapshot) {
        window.rrweb.record.takeFullSnapshot(true);
        log('rrweb: takeFullSnapshot() called explicitly');
      }
      
      // After a tick, verify we have a baseline
      setTimeout(() => {
        log('rrweb type counts:', JSON.stringify(typeCounts));
        if (typeCounts.full === 0) {
          warn('❌ No FullSnapshot recorded. Replays will be blank.');
          warn('Check: server not dropping large events? blockSelector not nuking root? CSP errors in console?');
        }
      }, 1000);
      
      log('✅ rrweb recording started');
    } catch (error) {
      warn('Failed to initialize rrweb:', error);
    }
  }
  
  function stopRRWebRecording() {
    if (rrwebRecorder) {
      try {
        rrwebRecorder();
        rrwebRecorder = null;
        log('rrweb recording stopped');
      } catch (error) {
        warn('Failed to stop rrweb recording:', error);
      }
    }
  }

  // DOM capture removed - using rrweb only

  // DOM capture functions removed - using rrweb only

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
      
      // DOM capture removed - rrweb handles navigation automatically
    };

    // Track replaceState
    var originalReplaceState = history.replaceState;
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      log('SPA Navigation detected (replaceState):', window.location.pathname);
      
      trackPageView();
      
      // DOM capture removed - rrweb handles navigation automatically
    };

    // Track popstate
    window.addEventListener('popstate', function() {
      log('SPA Navigation detected (popstate):', window.location.pathname);
      trackPageView();
      
      // DOM capture removed - rrweb handles navigation automatically
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
    
    // Start rrweb recording instead of DOM capture
    startRRWebRecording();
    
    // Setup event listeners
    setupEventListeners();
    setupSPANavigation();
    
    // Track initial pageview
    trackPageView();
    
    log('Session recording started with rrweb');
  }

  // Send final events on page unload
  window.addEventListener('beforeunload', function() {
    stopRRWebRecording();
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
    // Get tracking configuration now that the page is loaded
    trackingId = window.analyticsConfig?.trackingId || window.__TRACKING_ID__ || 'your_tracking_id_here';
    projectId = window.analyticsConfig?.projectId || window.__PROJECT_ID__ || 'your_project_id_here';
    
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
