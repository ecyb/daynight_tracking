/**
 * 🎬 Insight Stream Analytics Tracker - V17 SPA FIXED
 * Complete fix for 404/401 errors with proper endpoint handling + SPA navigation tracking
 * 
 * Version: 2.3.0
 * Last Updated: 2025-01-15
 * 
 * Usage:
 * <script>
 *   window.__TRACKING_ID__ = 'your_tracking_id';
 *   window.__PROJECT_ID__ = 'your_project_id';
 * </script>
 * <script src="https://your-cdn.com/analytics-tracker-v17-spa-fixed.js"></script>
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
  var sessionReplayBuffer = [];
  var isRecording = false;
  var currentPath = window.location.pathname + window.location.search;
  var lastPageViewTime = Date.now();

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  function log(message, data) {
    console.log('📊', message, data || '');
  }
  
  function successLog(message, data) {
    console.log('✅', message, data || '');
  }
  
  function errorLog(message, data) {
    console.error('❌', message, data || '');
  }
  
  function warningLog(message, data) {
    console.warn('⚠️', message, data || '');
  }

  // Generate unique session ID
  function getSessionId() {
    var sessionKey = 'insight_session_' + projectId;
    var sessionId = localStorage.getItem(sessionKey);
    
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
      localStorage.setItem(sessionKey, sessionId);
      log('New session created:', sessionId);
    }
    
    return sessionId;
  }

  // Safe fetch with error handling
  async function safeFetch(url, options) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response;
    } catch (error) {
      warningLog('API call failed (expected):', error.message, 'for', url);
      throw error;
    }
  }

  // ============================================================================
  // ANALYTICS TRACKING FUNCTIONS
  // ============================================================================
  
  // Track page view
  async function trackPageView(path) {
    try {
      const pagePath = path || (window.location.pathname + window.location.search);
      const now = Date.now();
      const duration = now - lastPageViewTime;
      
      const response = await safeFetch(apiUrls.track, {
        method: 'POST',
        body: JSON.stringify({
          tracking_id: trackingId,
          session_id: getSessionId(),
          event_type: 'pageview',
          path: pagePath,
          referrer: document.referrer,
          user_agent: navigator.userAgent,
          screen_width: screen.width,
          screen_height: screen.height,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          language: navigator.language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          duration: duration
        })
      });
      
      lastPageViewTime = now;
      currentPath = pagePath;
      successLog('Page view tracked');
      
      // Add to session replay buffer if recording
      if (isRecording) {
        sessionReplayBuffer.push({
          type: 'pageview',
          timestamp: now,
          data: {
            path: pagePath,
            referrer: document.referrer,
            duration: duration
          }
        });
      }
      
    } catch (error) {
      errorLog('Page view tracking failed (API unavailable)');
    }
  }

  // Track custom event
  async function trackCustomEvent(eventName, eventData) {
    try {
      const response = await safeFetch(apiUrls.track, {
        method: 'POST',
        body: JSON.stringify({
          tracking_id: trackingId,
          session_id: getSessionId(),
          event_type: 'event',
          event_name: eventName,
          event_data: eventData || {},
          path: window.location.pathname + window.location.search,
          user_agent: navigator.userAgent
        })
      });
      
      successLog('Custom event tracked:', eventName);
      
      // Add to session replay buffer if recording
      if (isRecording) {
        sessionReplayBuffer.push({
          type: 'custom_event',
          timestamp: Date.now(),
          data: {
            eventName: eventName,
            eventData: eventData || {}
          }
        });
      }
      
    } catch (error) {
      errorLog('Custom event tracking failed (API unavailable):', eventName);
    }
  }

  // ============================================================================
  // SPA NAVIGATION TRACKING
  // ============================================================================
  
  // Track SPA navigation (pushState/replaceState)
  function trackSPANavigation() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(() => {
        const newPath = window.location.pathname + window.location.search;
        if (newPath !== currentPath) {
          log('SPA Navigation detected (pushState):', newPath);
          trackPageView(newPath);
        }
      }, 100);
    };
    
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(() => {
        const newPath = window.location.pathname + window.location.search;
        if (newPath !== currentPath) {
          log('SPA Navigation detected (replaceState):', newPath);
          trackPageView(newPath);
        }
      }, 100);
    };
    
    // Track back/forward navigation
    window.addEventListener('popstate', function() {
      setTimeout(() => {
        const newPath = window.location.pathname + window.location.search;
        if (newPath !== currentPath) {
          log('SPA Navigation detected (popstate):', newPath);
          trackPageView(newPath);
        }
      }, 100);
    });
    
    log('SPA navigation tracking enabled');
  }

  // ============================================================================
  // SESSION REPLAY FUNCTIONS
  // ============================================================================
  
  // Check if session recording is enabled
  async function checkSessionRecordingEnabled() {
    try {
      const response = await safeFetch(apiUrls.checkRecording, {
        method: 'POST',
        body: JSON.stringify({
          tracking_id: trackingId,
          project_id: projectId
        })
      });
      
      const data = await response.json();
      return data.enabled;
    } catch (error) {
      log('Session recording fallback to default:', true);
      return true; // Default to enabled
    }
  }

  // Initialize session replay
  async function initializeSessionReplay() {
    const recordingEnabled = await checkSessionRecordingEnabled();
    
    if (recordingEnabled) {
      log('Session recording enabled, starting session replay');
      startSessionRecording();
      successLog('Session recording started');
    } else {
      log('Session recording disabled');
    }
  }

  // Start session recording
  function startSessionRecording() {
    isRecording = true;
    
    // Record initial page snapshot
    recordPageSnapshot();
    
    // Record user interactions
    recordUserInteractions();
    
    // Send events periodically
    setInterval(sendSessionReplayEvents, 5000); // Every 5 seconds
  }

  // Record page snapshot
  function recordPageSnapshot() {
    if (!isRecording) return;
    
    sessionReplayBuffer.push({
      type: 'snapshot',
      timestamp: Date.now(),
      data: {
        html: document.documentElement.outerHTML,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        userAgent: navigator.userAgent,
        url: window.location.href
      }
    });
  }

  // Record user interactions
  function recordUserInteractions() {
    if (!isRecording) return;
    
    // Click events
    document.addEventListener('click', function(e) {
      sessionReplayBuffer.push({
        type: 'click',
        timestamp: Date.now(),
        data: {
          x: e.clientX,
          y: e.clientY,
          target: e.target.tagName,
          id: e.target.id,
          className: e.target.className
        }
      });
    });
    
    // Scroll events (throttled)
    let scrollTimeout;
    window.addEventListener('scroll', function() {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        sessionReplayBuffer.push({
          type: 'scroll',
          timestamp: Date.now(),
          data: {
            x: window.scrollX,
            y: window.scrollY
          }
        });
        scrollTimeout = null;
      }, 100);
    });
    
    // Input events
    document.addEventListener('input', function(e) {
      if (e.target.type === 'password') return; // Don't record passwords
      
      sessionReplayBuffer.push({
        type: 'input',
        timestamp: Date.now(),
        data: {
          id: e.target.id,
          value: e.target.value,
          target: e.target.tagName
        }
      });
    });
    
    // Mouse move events (throttled)
    let mouseTimeout;
    document.addEventListener('mousemove', function(e) {
      if (mouseTimeout) return;
      mouseTimeout = setTimeout(() => {
        sessionReplayBuffer.push({
          type: 'mousemove',
          timestamp: Date.now(),
          data: {
            x: e.clientX,
            y: e.clientY
          }
        });
        mouseTimeout = null;
      }, 200);
    });
    
    // Focus events
    document.addEventListener('focus', function(e) {
      sessionReplayBuffer.push({
        type: 'focus',
        timestamp: Date.now(),
        data: {
          target: e.target.tagName,
          id: e.target.id
        }
      });
    });
  }

  // Send session replay events
  async function sendSessionReplayEvents() {
    if (!isRecording || sessionReplayBuffer.length === 0) return;
    
    try {
      const eventsToSend = [...sessionReplayBuffer];
      sessionReplayBuffer = []; // Clear buffer
      
      const response = await safeFetch(apiUrls.sessionReplay, {
        method: 'POST',
        body: JSON.stringify({
          tracking_id: trackingId,
          sessionId: getSessionId(),
          events: eventsToSend,
          metadata: {
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: Date.now()
          }
        })
      });
      
      successLog('Session replay events sent:', eventsToSend.length);
    } catch (error) {
      // Put events back in buffer for retry
      sessionReplayBuffer.unshift(...eventsToSend);
      warningLog('Network Error (handled gracefully):', error.message, 'for', apiUrls.sessionReplay);
    }
  }

  // ============================================================================
  // GLOBAL INSIGHTSTREAM OBJECT
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
    log('Insight Stream Analytics Tracker v2.3.0 loaded');
    log('Tracking ID:', trackingId);
    log('Project ID:', projectId);
    log('Session Recording: Available');
    
    // Track initial page view
    await trackPageView();
    
    // Initialize SPA navigation tracking
    trackSPANavigation();
    
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
          tracking_id: trackingId,
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
