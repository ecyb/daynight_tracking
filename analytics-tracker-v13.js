/**
 * 🎬 Insight Stream Analytics Tracker with Session Recording
 * CDN-Ready Version - Complete Analytics + Session Replay
 * 
 * Usage:
 * <script>
 *   window.__TRACKING_ID__ = 'your_tracking_id';
 *   window.__PROJECT_ID__ = 'your_project_id';
 * </script>
 * <script src="https://your-cdn.com/analytics-tracker-cdn.js"></script>
 */

(function() {
  'use strict';

  // Configuration - Set these before loading the script
  var trackingId = window.__TRACKING_ID__;
  var projectId = window.__PROJECT_ID__;
  
  if (!trackingId || !projectId) {
    console.error('❌ Analytics Tracker: Missing trackingId or projectId. Set window.__TRACKING_ID__ and window.__PROJECT_ID__ before loading this script.');
    return;
  }

  // Hardcoded API URLs - Update these for your deployment
  var apiUrl = 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1/track';
  var behaviorUrl = 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1/track-behavior';
  var sessionReplayUrl = 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1/track-session-replay';
  var checkRecordingUrl = 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1/check-session-recording';
  
  // Global variables
  var pageLoadTime = Date.now();
  var behaviorBuffer = [];
  var lastScrollDepth = 0;
  var lastActivityTime = Date.now();
  var clickTimes = [];
  var isIdle = false;
  var idleTimeout = null;
  
  // Session Replay Configuration
  var sessionReplayEnabled = true;
  var sessionReplayBuffer = [];
  var sessionReplayRecorder = null;
  var isRecording = false;
  var sessionStartTime = Date.now();

  console.log('🎬 Insight Stream Analytics Tracker loaded');
  console.log('📊 Tracking ID:', trackingId);
  console.log('🎯 Project ID:', projectId);
  console.log('📹 Session Recording: Available');

  // Utility Functions
  function getSessionId() {
    var sessionId = sessionStorage.getItem("analytics_session");
    if (!sessionId) {
      sessionId = "sess_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
      sessionStorage.setItem("analytics_session", sessionId);
      console.log("🆕 New session created:", sessionId);
    } else {
      console.log("🔄 Using existing session:", sessionId);
    }
    return sessionId;
  }

  function getUTMParams() {
    var params = new URLSearchParams(window.location.search);
    return {
      utm_source: params.get("utm_source"),
      utm_medium: params.get("utm_medium"),
      utm_campaign: params.get("utm_campaign"),
    };
  }

  function getDeviceInfo() {
    return {
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      device_pixel_ratio: window.devicePixelRatio || 1,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      platform: navigator.platform,
      cookie_enabled: navigator.cookieEnabled,
      online: navigator.onLine
    };
  }

  // Core Tracking Function
  function track(eventType, data) {
    var utmParams = getUTMParams();
    var deviceInfo = getDeviceInfo();
    
    var payload = {
      tracking_id: trackingId,
      session_id: getSessionId(),
      event_type: eventType,
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      data: data || {},
      utm: utmParams,
      device: deviceInfo
    };

    // Send to analytics API
    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    }).catch(function(error) {
      console.log('📊 Analytics tracking error:', error);
    });
  }

  // Session Replay Functions
  function createSessionReplayRecorder() {
    var events = [];
    var isRecording = false;
    var startTime = Date.now();

    function recordEvent(type, data) {
      if (!isRecording) return;
      
      var event = {
        type: type,
        timestamp: Date.now() - startTime,
        data: data
      };
      
      events.push(event);
      sessionReplayBuffer.push(event);
      
      console.log('📹 Session event:', type, 'Buffer size:', sessionReplayBuffer.length);
    }

    function startRecording() {
      isRecording = true;
      console.log('🎥 Session recording started');
      
      // Record initial page state
      recordEvent('snapshot', {
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        timestamp: Date.now()
      });
    }

    function stopRecording() {
      isRecording = false;
      console.log('📹 Session recording stopped');
    }

    function getEvents() {
      return events.slice();
    }

    return {
      start: startRecording,
      stop: stopRecording,
      record: recordEvent,
      getEvents: getEvents
    };
  }

  function sendSessionReplay() {
    if (sessionReplayBuffer.length === 0) return;

    var payload = {
      tracking_id: trackingId,
      session_id: getSessionId(),
      events: sessionReplayBuffer.slice(),
      url: window.location.href,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };

    fetch(sessionReplayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    }).then(function() {
      console.log('📹 Session replay data sent:', sessionReplayBuffer.length, 'events');
      sessionReplayBuffer = [];
    }).catch(function(error) {
      console.log('📹 Session replay error:', error);
    });
  }

  function checkSessionRecordingEnabled() {
    // Check localStorage first (fallback)
    var localSetting = localStorage.getItem('session_recording_' + projectId);
    if (localSetting === 'true') {
      console.log("🎥 Session recording enabled (local storage), starting session replay");
      startSessionReplay();
      return;
    } else if (localSetting === 'false') {
      console.log("📹 Session recording disabled (local storage)");
      return;
    }

    // Check database setting
    fetch(checkRecordingUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: projectId,
        tracking_id: trackingId
      })
    })
    .then(function(response) { return response.json(); })
    .then(function(data) {
      if (data.enabled) {
        console.log("🎥 Session recording enabled for project, starting session replay");
        startSessionReplay();
      } else {
        console.log("📹 Session recording disabled for this project");
      }
    })
    .catch(function(error) {
      console.log("📹 Could not check session recording status, defaulting to disabled:", error);
    });
  }

  function startSessionReplay() {
    if (sessionReplayRecorder) return;
    
    sessionReplayRecorder = createSessionReplayRecorder();
    sessionReplayRecorder.start();
    
    // Set up event listeners for session recording
    setupSessionReplayListeners();
    
    // Send events every 30 seconds
    setInterval(function() {
      if (sessionReplayBuffer.length > 0) {
        sendSessionReplay();
      }
    }, 30000);
    
    // Send events on page unload
    window.addEventListener('beforeunload', function() {
      if (sessionReplayBuffer.length > 0) {
        sendSessionReplay();
      }
    });
  }

  function setupSessionReplayListeners() {
    // Click events
    document.addEventListener('click', function(e) {
      sessionReplayRecorder.record('click', {
        x: e.clientX,
        y: e.clientY,
        target: {
          tagName: e.target.tagName,
          id: e.target.id,
          className: e.target.className,
          textContent: e.target.textContent ? e.target.textContent.substring(0, 100) : ''
        }
      });
    });

    // Input events
    document.addEventListener('input', function(e) {
      sessionReplayRecorder.record('input', {
        target: {
          tagName: e.target.tagName,
          id: e.target.id,
          className: e.target.className,
          type: e.target.type
        },
        value: e.target.type === 'password' ? '[MASKED]' : e.target.value.substring(0, 100)
      });
    });

    // Scroll events
    var scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function() {
        sessionReplayRecorder.record('scroll', {
          x: window.scrollX,
          y: window.scrollY,
          maxScrollY: document.documentElement.scrollHeight - window.innerHeight
        });
      }, 100);
    });

    // Resize events
    window.addEventListener('resize', function() {
      sessionReplayRecorder.record('resize', {
        width: window.innerWidth,
        height: window.innerHeight
      });
    });
  }

  // Behavior Tracking Functions
  function trackBehavior(eventType, data) {
    behaviorBuffer.push({
      event_type: eventType,
      timestamp: Date.now(),
      data: data || {}
    });

    if (behaviorBuffer.length >= 10) {
      sendBehaviorData();
    }
  }

  function sendBehaviorData() {
    if (behaviorBuffer.length === 0) return;

    var payload = {
      tracking_id: trackingId,
      session_id: getSessionId(),
      events: behaviorBuffer.slice(),
      url: window.location.href,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString()
    };

    fetch(behaviorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    }).then(function() {
      console.log('📊 Behavior data sent:', behaviorBuffer.length, 'events');
      behaviorBuffer = [];
    }).catch(function(error) {
      console.log('📊 Behavior tracking error:', error);
    });
  }

  // Scroll Depth Tracking
  function trackScrollDepth() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    var scrollPercent = Math.round((scrollTop / documentHeight) * 100);
    
    if (scrollPercent > lastScrollDepth && scrollPercent % 25 === 0) {
      trackBehavior('scroll_depth', {
        depth: scrollPercent,
        scroll_top: scrollTop,
        document_height: documentHeight
      });
      lastScrollDepth = scrollPercent;
    }
  }

  // Click Heatmap Tracking
  function trackClick(event) {
    var rect = event.target.getBoundingClientRect();
    var clickData = {
      x: event.clientX,
      y: event.clientY,
      element_x: rect.left,
      element_y: rect.top,
      element_width: rect.width,
      element_height: rect.height,
      tag_name: event.target.tagName,
      element_id: event.target.id,
      element_class: event.target.className,
      text_content: event.target.textContent ? event.target.textContent.substring(0, 50) : '',
      href: event.target.href || null
    };

    trackBehavior('click', clickData);
    
    // Track click timing for engagement
    clickTimes.push(Date.now());
    if (clickTimes.length > 10) {
      clickTimes.shift();
    }
  }

  // Idle Detection
  function resetIdleTimer() {
    lastActivityTime = Date.now();
    if (isIdle) {
      isIdle = false;
      trackBehavior('user_active', {});
    }
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(function() {
      if (!isIdle) {
        isIdle = true;
        trackBehavior('user_idle', {
          idle_duration: Date.now() - lastActivityTime
        });
      }
    }, 30000); // 30 seconds idle
  }

  // Initialize Event Listeners
  function initializeTracking() {
    // Page load tracking
    track('page_view', {
      load_time: Date.now() - pageLoadTime,
      referrer: document.referrer
    });

    // Scroll tracking
    window.addEventListener('scroll', trackScrollDepth);
    
    // Click tracking
    document.addEventListener('click', trackClick);
    
    // Activity tracking
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(function(event) {
      document.addEventListener(event, resetIdleTimer, true);
    });

    // Page visibility tracking
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        trackBehavior('page_hidden', {});
      } else {
        trackBehavior('page_visible', {});
      }
    });

    // Send behavior data every 30 seconds
    setInterval(sendBehaviorData, 30000);
    
    // Send behavior data on page unload
    window.addEventListener('beforeunload', sendBehaviorData);

    console.log('✅ Analytics tracking initialized');
  }

  // Initialize Session Recording
  function initializeSessionReplay() {
    if (sessionReplayEnabled) {
      checkSessionRecordingEnabled();
    }
  }

  // Public API
  window.InsightStream = {
    track: track,
    trackBehavior: trackBehavior,
    enableSessionRecording: function() {
      localStorage.setItem('session_recording_' + projectId, 'true');
      console.log('🎥 Session recording enabled via API');
      if (!sessionReplayRecorder) {
        startSessionReplay();
      }
    },
    disableSessionRecording: function() {
      localStorage.setItem('session_recording_' + projectId, 'false');
      console.log('📹 Session recording disabled via API');
      if (sessionReplayRecorder) {
        sessionReplayRecorder.stop();
        sessionReplayRecorder = null;
      }
    },
    getSessionId: getSessionId,
    version: '2.0.0-cdn'
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      initializeTracking();
      initializeSessionReplay();
    });
  } else {
    initializeTracking();
    initializeSessionReplay();
  }

  console.log('🎬 Insight Stream Analytics Tracker v2.0.0 CDN Ready');
  console.log('📊 Use window.InsightStream.track() for custom events');
  console.log('🎥 Use window.InsightStream.enableSessionRecording() to enable recording');

})(window);
