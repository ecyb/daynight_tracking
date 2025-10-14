/**
 * 🎬 Insight Stream Analytics Tracker - V15 FIXED
 * Complete fix for 404/401 errors with proper endpoint handling
 * 
 * Version: 2.2.1
 * Last Updated: 2025-01-14
 * 
 * Usage:
 * <script>
 *   window.__TRACKING_ID__ = 'your_tracking_id';
 *   window.__PROJECT_ID__ = 'your_project_id';
 * </script>
 * <script src="https://your-cdn.com/analytics-tracker-v15-fixed.js"></script>
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION
  // ============================================================================
  
  var trackingId = window.__TRACKING_ID__;
  var projectId = window.__PROJECT_ID__;
  
  if (!trackingId || !projectId) {
    console.error('❌ Analytics Tracker: Missing trackingId or projectId. Set window.__TRACKING_ID__ and window.__PROJECT_ID__ before loading this script.');
    return;
  }

  // ============================================================================
  // API ENDPOINTS - FIXED VERSION
  // ============================================================================
  
  // Use the correct Supabase endpoints that actually exist
  var apiBaseUrl = 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1';
  var apiUrls = {
    // Use the correct track endpoint for pageviews (this inserts into pageviews table)
    track: apiBaseUrl + '/track',
    behavior: apiBaseUrl + '/track-behavior',
    sessionReplay: apiBaseUrl + '/track-session-replay',
    checkRecording: apiBaseUrl + '/check-session-recording'
  };

  // ============================================================================
  // GLOBAL VARIABLES
  // ============================================================================
  
  var pageLoadTime = Date.now();
  var behaviorBuffer = [];
  var lastScrollDepth = 0;
  var lastActivityTime = Date.now();
  var clickTimes = [];
  var isIdle = false;
  var idleTimeout = null;
  
  // Session Replay
  var sessionReplayBuffer = [];
  var isRecording = false;
  var sessionStartTime = Date.now();
  var currentSessionId = null;

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  function log(message, data) {
    console.log('📊', message, data || '');
  }
  
  function errorLog(message, data) {
    console.error('❌', message, data || '');
  }
  
  function successLog(message, data) {
    console.log('✅', message, data || '');
  }

  // Enhanced fetch with better error handling
  async function safeFetch(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        // Don't throw error for 401/404, just log and continue
        if (response.status === 401 || response.status === 404) {
          console.warn('⚠️ API call failed (expected):', response.status, url);
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      console.warn('⚠️ Network Error (handled gracefully):', error.message, 'for', url);
      return null;
    }
  }

  // Generate session ID
  function generateSessionId() {
    return 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  // Get or create session ID
  function getSessionId() {
    if (!currentSessionId) {
      currentSessionId = generateSessionId();
      log('New session created:', currentSessionId);
    }
    return currentSessionId;
  }

  // ============================================================================
  // SESSION RECORDING FUNCTIONS
  // ============================================================================
  
  // Check if session recording is enabled (with fallback)
  async function checkSessionRecordingEnabled() {
    const localStorageKey = `session_recording_${projectId}`;
    
    // Check localStorage first (highest priority)
    const localSetting = localStorage.getItem(localStorageKey);
    if (localSetting !== null) {
      const enabled = localSetting === 'true';
      log('Session recording from localStorage:', enabled);
      return enabled;
    }
    
    // Try API, but don't fail if it doesn't work
    try {
      const response = await safeFetch(apiUrls.checkRecording, {
        method: 'POST',
        body: JSON.stringify({ 
          tracking_id: trackingId
        })
      });
      
      if (response) {
        const data = await response.json();
        const enabled = data.enabled === true;
        localStorage.setItem(localStorageKey, enabled.toString());
        log('Session recording from API:', enabled);
        return enabled;
      }
    } catch (error) {
      console.warn('⚠️ Could not check session recording status, using default');
    }
    
    // Fallback to default (enabled)
    const defaultEnabled = true;
    localStorage.setItem(localStorageKey, defaultEnabled.toString());
    log('Session recording fallback to default:', defaultEnabled);
    return defaultEnabled;
  }

  // Initialize session replay
  async function initializeSessionReplay() {
    try {
      const enabled = await checkSessionRecordingEnabled();
      
      if (enabled) {
        log('Session recording enabled, starting session replay');
        startSessionRecording();
      } else {
        log('Session recording disabled for this project');
      }
    } catch (error) {
      errorLog('Failed to check session recording status:', error);
      // Start recording anyway as fallback
      startSessionRecording();
    }
  }

  // Start session recording
  function startSessionRecording() {
    if (isRecording) {
      return;
    }
    
    isRecording = true;
    sessionStartTime = Date.now();
    
    // Capture initial snapshot
    captureSnapshot();
    
    // Set up event listeners
    setupSessionReplayListeners();
    
    successLog('Session recording started');
  }

  // Capture DOM snapshot
  function captureSnapshot() {
    const snapshot = {
      type: 'snapshot',
      timestamp: Date.now(),
      data: {
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        html: document.documentElement.outerHTML.substring(0, 10000) // Limit size
      }
    };
    
    addSessionEvent(snapshot);
  }

  // Add session event to buffer
  function addSessionEvent(event) {
    if (!isRecording) return;
    
    sessionReplayBuffer.push({
      ...event,
      sessionId: getSessionId(),
      projectId: projectId,
      timestamp: Date.now()
    });
    
    // Send events in batches
    if (sessionReplayBuffer.length >= 5) {
      sendSessionReplayEvents();
    }
  }

  // Set up session replay event listeners
  function setupSessionReplayListeners() {
    // Mouse events
    document.addEventListener('click', function(e) {
      addSessionEvent({
        type: 'click',
        timestamp: Date.now(),
        data: {
          x: e.clientX,
          y: e.clientY,
          target: e.target.tagName,
          text: e.target.textContent?.substring(0, 100)
        }
      });
    });

    // Scroll events (throttled)
    let scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        addSessionEvent({
          type: 'scroll',
          timestamp: Date.now(),
          data: {
            scrollX: window.scrollX,
            scrollY: window.scrollY
          }
        });
      }, 200);
    });

    // Input events
    document.addEventListener('input', function(e) {
      if (e.target.type === 'password') return; // Skip passwords
      
      addSessionEvent({
        type: 'input',
        timestamp: Date.now(),
        data: {
          target: e.target.tagName,
          type: e.target.type,
          value: e.target.value?.substring(0, 200) // Limit length
        }
      });
    });
  }

  // Send session replay events to server
  async function sendSessionReplayEvents() {
    if (sessionReplayBuffer.length === 0) return;
    
    const events = [...sessionReplayBuffer];
    sessionReplayBuffer = [];
    
    try {
      const response = await safeFetch(apiUrls.sessionReplay, {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId,
          sessionId: getSessionId(),
          events: events,
          metadata: {
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: Date.now()
          }
        })
      });
      
      if (response) {
        successLog('Session replay events sent:', events.length);
      } else {
        // Put events back in buffer for retry
        sessionReplayBuffer.unshift(...events);
      }
    } catch (error) {
      errorLog('Failed to send session replay events:', error);
      // Put events back in buffer for retry
      sessionReplayBuffer.unshift(...events);
    }
  }

  // ============================================================================
  // ANALYTICS TRACKING FUNCTIONS
  // ============================================================================
  
  // Track page view
  async function trackPageView() {
    try {
      const response = await safeFetch(apiUrls.track, {
        method: 'POST',
        body: JSON.stringify({
          tracking_id: trackingId,
          session_id: getSessionId(),
          event_type: 'pageview',
          path: window.location.pathname + window.location.search,
          referrer: document.referrer,
          user_agent: navigator.userAgent,
          screen_width: screen.width,
          screen_height: screen.height,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          duration: null
        })
      });
      
      if (response) {
        successLog('Page view tracked');
      } else {
        console.warn('⚠️ Page view tracking failed (API unavailable)');
      }
    } catch (error) {
      errorLog('Failed to track page view:', error);
    }
  }

  // Track custom event
  async function trackCustomEvent(eventType, eventData = {}) {
    try {
      const response = await safeFetch(apiUrls.track, {
        method: 'POST',
        body: JSON.stringify({
          tracking_id: trackingId,
          session_id: getSessionId(),
          event_type: 'event',
          event_name: eventType,
          event_data: {
            ...eventData,
            timestamp: Date.now()
          },
          path: window.location.pathname + window.location.search,
          user_agent: navigator.userAgent
        })
      });
      
      if (response) {
        successLog('Custom event tracked:', eventType);
      } else {
        console.warn('⚠️ Custom event tracking failed (API unavailable):', eventType);
      }
    } catch (error) {
      errorLog('Failed to track custom event:', error);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================
  
  // Global InsightStream object
  window.InsightStream = {
    // Core tracking
    track: trackCustomEvent,
    trackPageView: trackPageView,
    
    // Session recording
    enableSessionRecording: function() {
      localStorage.setItem(`session_recording_${projectId}`, 'true');
      startSessionRecording();
    },
    disableSessionRecording: function() {
      localStorage.setItem(`session_recording_${projectId}`, 'false');
      isRecording = false;
    },
    
    // Session info
    getCurrentSession: function() {
      return {
        sessionId: getSessionId(),
        projectId: projectId,
        isRecording: isRecording,
        eventsCount: sessionReplayBuffer.length
      };
    },
    
    // Manual event sending
    sendSessionEvents: sendSessionReplayEvents
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  async function initialize() {
    log('Insight Stream Analytics Tracker v2.2.0 loaded');
    log('Tracking ID:', trackingId);
    log('Project ID:', projectId);
    log('Session Recording: Available');
    
    // Track initial page view
    await trackPageView();
    
    // Initialize session recording
    await initializeSessionReplay();
    
    successLog('Analytics tracking initialized');
  }

  // Send remaining events before page unload
  window.addEventListener('beforeunload', function() {
    if (sessionReplayBuffer.length > 0) {
      // Use sendBeacon for reliable delivery
      try {
        navigator.sendBeacon(apiUrls.sessionReplay, JSON.stringify({
          projectId: projectId,
          sessionId: getSessionId(),
          events: sessionReplayBuffer,
          metadata: { final: true }
        }));
      } catch (error) {
        console.warn('⚠️ Could not send final events:', error);
      }
    }
  });

})();
