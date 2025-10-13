/**
 * 🎬 Insight Stream Analytics Tracker - UPDATED VERSION
 * Enhanced with better error handling, easier configuration, and improved session recording
 * 
 * Version: 2.1.0
 * Last Updated: 2025-01-13
 * 
 * Usage:
 * <script>
 *   window.__TRACKING_ID__ = 'your_tracking_id';
 *   window.__PROJECT_ID__ = 'your_project_id';
 *   // Optional: Override API URLs
 *   window.__API_BASE_URL__ = 'https://your-supabase-url.supabase.co/functions/v1';
 * </script>
 * <script src="https://your-cdn.com/analytics-tracker-updated.js"></script>
 */

(function() {
  'use strict';

  // ============================================================================
  // CONFIGURATION - Easy to update
  // ============================================================================
  
  // Required configuration
  var trackingId = window.__TRACKING_ID__;
  var projectId = window.__PROJECT_ID__;
  
  // Optional configuration with defaults
  var apiBaseUrl = window.__API_BASE_URL__ || 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1';
  var enableDebugLogs = window.__DEBUG_LOGS__ || false;
  var sessionRecordingEnabled = window.__SESSION_RECORDING_ENABLED__ !== false; // Default: true
  
  // API endpoints
  var apiUrls = {
    track: apiBaseUrl + '/track',
    behavior: apiBaseUrl + '/track-behavior',
    sessionReplay: apiBaseUrl + '/track-session-replay',
    checkRecording: apiBaseUrl + '/check-session-recording'
  };
  
  // ============================================================================
  // VALIDATION
  // ============================================================================
  
  if (!trackingId || !projectId) {
    console.error('❌ Analytics Tracker: Missing required configuration.');
    console.error('Please set window.__TRACKING_ID__ and window.__PROJECT_ID__ before loading this script.');
    return;
  }

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
  var sessionReplayRecorder = null;
  var isRecording = false;
  var sessionStartTime = Date.now();
  var currentSessionId = null;

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  function debugLog(message, data) {
    if (enableDebugLogs) {
      console.log('🔍 [DEBUG]', message, data || '');
    }
  }
  
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
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
    } catch (error) {
      errorLog('Network Error:', error.message, 'for', url);
      throw error;
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
      debugLog('New session created:', currentSessionId);
    }
    return currentSessionId;
  }

  // ============================================================================
  // SESSION RECORDING FUNCTIONS
  // ============================================================================
  
  // Check if session recording is enabled
  async function checkSessionRecordingEnabled() {
    const localStorageKey = `session_recording_${projectId}`;
    
    // Check localStorage first (highest priority)
    const localSetting = localStorage.getItem(localStorageKey);
    if (localSetting !== null) {
      const enabled = localSetting === 'true';
      debugLog('Session recording from localStorage:', enabled);
      return enabled;
    }
    
    // Check API if localStorage not set
    try {
      const response = await safeFetch(apiUrls.checkRecording, {
        method: 'POST',
        body: JSON.stringify({ projectId })
      });
      
      const data = await response.json();
      const enabled = data.enabled === true;
      
      // Cache the result in localStorage
      localStorage.setItem(localStorageKey, enabled.toString());
      debugLog('Session recording from API:', enabled);
      return enabled;
      
    } catch (error) {
      // Fallback to default (enabled)
      const defaultEnabled = sessionRecordingEnabled;
      localStorage.setItem(localStorageKey, defaultEnabled.toString());
      debugLog('Session recording fallback to default:', defaultEnabled);
      return defaultEnabled;
    }
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
      debugLog('Session recording already active');
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
        html: document.documentElement.outerHTML
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
    
    debugLog('Session event:', event.type, 'Buffer size:', sessionReplayBuffer.length);
    
    // Send events in batches
    if (sessionReplayBuffer.length >= 10) {
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
      }, 100);
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

    // Page visibility
    document.addEventListener('visibilitychange', function() {
      addSessionEvent({
        type: 'visibility',
        timestamp: Date.now(),
        data: {
          hidden: document.hidden
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
      await safeFetch(apiUrls.sessionReplay, {
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
      
      successLog('Session replay events sent:', events.length);
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
      await safeFetch(apiUrls.track, {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId,
          sessionId: getSessionId(),
          eventType: 'page_view',
          data: {
            url: window.location.href,
            title: document.title,
            referrer: document.referrer,
            timestamp: Date.now()
          }
        })
      });
      
      successLog('Page view tracked');
    } catch (error) {
      errorLog('Failed to track page view:', error);
    }
  }

  // Track custom event
  async function trackCustomEvent(eventType, eventData = {}) {
    try {
      await safeFetch(apiUrls.track, {
        method: 'POST',
        body: JSON.stringify({
          projectId: projectId,
          sessionId: getSessionId(),
          eventType: eventType,
          data: {
            ...eventData,
            timestamp: Date.now()
          }
        })
      });
      
      successLog('Custom event tracked:', eventType);
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
    
    // Configuration
    setDebugMode: function(enabled) {
      enableDebugLogs = enabled;
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
    log('Insight Stream Analytics Tracker v2.1.0 loaded');
    log('Tracking ID:', trackingId);
    log('Project ID:', projectId);
    log('Session Recording:', sessionRecordingEnabled ? 'Available' : 'Disabled');
    
    // Track initial page view
    await trackPageView();
    
    // Initialize session recording
    if (sessionRecordingEnabled) {
      await initializeSessionReplay();
    }
    
    successLog('Analytics tracking initialized');
  }

  // Send remaining events before page unload
  window.addEventListener('beforeunload', function() {
    if (sessionReplayBuffer.length > 0) {
      // Use sendBeacon for reliable delivery
      navigator.sendBeacon(apiUrls.sessionReplay, JSON.stringify({
        projectId: projectId,
        sessionId: getSessionId(),
        events: sessionReplayBuffer,
        metadata: { final: true }
      }));
    }
  });

})();
