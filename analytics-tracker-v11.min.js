(function (trackingId, projectId) {
  // Hardcoded API URLs
  var apiUrl = 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1/track';
  var behaviorUrl = 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1/track-behavior';
  var sessionReplayUrl = 'https://ovaagxrbaxxhlrhbyomt.supabase.co/functions/v1/track-session-replay';
  var pageLoadTime = Date.now();
  var behaviorBuffer = [];
  var lastScrollDepth = 0;
  var lastActivityTime = Date.now();
  var clickTimes = [];
  var isIdle = false;
  var idleTimeout = null;
  
  // Custom Session Replay Configuration (no rrweb dependency)
  var sessionReplayEnabled = sessionReplayUrl && sessionReplayUrl !== 'undefined';
  var sessionReplayBuffer = [];
  var sessionReplayRecorder = null;
  var isRecording = false;

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

  function track(eventType, data) {
    var utmParams = getUTMParams();
    var payload = {
      tracking_id: trackingId,
      session_id: getSessionId(),
      event_type: eventType,
      path: window.location.pathname + window.location.search,
      referrer: document.referrer || null,
      user_agent: navigator.userAgent,
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      timestamp: Date.now(),
      page_load_time: pageLoadTime,
      utm_source: utmParams.utm_source,
      utm_medium: utmParams.utm_medium,
      utm_campaign: utmParams.utm_campaign,
      data: data || {}
    };

    console.log("🔍 Tracking event:", eventType, "Path:", payload.path, "Session:", payload.session_id);

    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      console.log("✅ Track response:", response.status, "for path:", payload.path);
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      console.log("✅ Track success:", data);
    })
    .catch(error => {
      console.error("❌ Analytics error:", error.message, "for path:", payload.path);
      // Backup to localStorage
      var backupKey = "analytics_backup_" + Date.now();
      localStorage.setItem(backupKey, JSON.stringify(payload));
      console.error("❌ Data backed up to localStorage with key:", backupKey);
      console.error("❌ Full error:", error);
    });
  }

  // Custom Session Replay Functions (no rrweb dependency)
  function recordSessionEvent(type, data) {
    if (!isRecording) return;
    
    var event = {
      type: type,
      timestamp: Date.now(),
      data: data
    };
    
    sessionReplayBuffer.push(event);
    console.log("📹 Session event:", type, "Buffer size:", sessionReplayBuffer.length);
  }

  function startSessionReplay() {
    if (isRecording) return;
    
    isRecording = true;
    sessionReplayBuffer = [];
    
    console.log("🎬 Starting custom session replay recording");
    
    // Record initial snapshot
    recordSessionEvent('snapshot', {
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      timestamp: Date.now()
    });
    
    // Set up event listeners
    document.addEventListener('click', function(e) {
      recordSessionEvent('click', {
        x: e.clientX,
        y: e.clientY,
        target: e.target.tagName,
        text: e.target.textContent?.substring(0, 100),
        id: e.target.id,
        className: e.target.className
      });
    });
    
    document.addEventListener('keydown', function(e) {
      recordSessionEvent('keydown', {
        key: e.key,
        code: e.code,
        target: e.target.tagName,
        id: e.target.id
      });
    });
    
    document.addEventListener('scroll', function(e) {
      recordSessionEvent('scroll', {
        scrollX: window.scrollX,
        scrollY: window.scrollY
      });
    });
    
    document.addEventListener('mousemove', function(e) {
      // Only record every 20th mousemove to avoid spam
      if (Math.random() < 0.05) {
        recordSessionEvent('mousemove', {
          x: e.clientX,
          y: e.clientY
        });
      }
    });
    
    document.addEventListener('focus', function(e) {
      recordSessionEvent('focus', {
        target: e.target.tagName,
        id: e.target.id
      });
    });
    
    document.addEventListener('blur', function(e) {
      recordSessionEvent('blur', {
        target: e.target.tagName,
        id: e.target.id
      });
    });
  }

  function sendSessionReplay() {
    if (!sessionReplayEnabled || sessionReplayBuffer.length === 0) return;
    
    var payload = {
      tracking_id: trackingId,
      project_id: projectId,
      session_id: getSessionId(),
      events: sessionReplayBuffer,
      metadata: {
        url: window.location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        user_agent: navigator.userAgent,
        timestamp: Date.now()
      }
    };
    
    console.log("📤 Sending session replay events:", sessionReplayBuffer.length);
    
    fetch(sessionReplayUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      console.log("✅ Session replay sent successfully:", data);
      sessionReplayBuffer = []; // Clear buffer after successful send
    })
    .catch(error => {
      console.error("❌ Session replay error:", error);
    });
  }

  function initializeSessionReplay() {
    if (!sessionReplayEnabled) {
      console.log("📹 Session replay disabled");
      return;
    }
    
    console.log("🎥 Initializing custom session replay");
    startSessionReplay();
    
    // Send events every 30 seconds
    setInterval(function() {
      if (sessionReplayBuffer.length > 0) {
        sendSessionReplay();
      }
    }, 30000);
    
    // Send events on page unload
    window.addEventListener('beforeunload', function() {
      if (sessionReplayBuffer.length > 0) {
        // Use sendBeacon for reliable delivery on page unload
        var payload = JSON.stringify({
          tracking_id: trackingId,
          project_id: projectId,
          session_id: getSessionId(),
          events: sessionReplayBuffer,
          metadata: {
            url: window.location.href,
            title: document.title,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight
            },
            user_agent: navigator.userAgent,
            timestamp: Date.now()
          }
        });
        
        navigator.sendBeacon(sessionReplayUrl, payload);
        console.log("📤 Sent final session replay events via sendBeacon");
      }
    });
  }

  // Behavior tracking functions
  function addBehaviorEvent(type, data) {
    behaviorBuffer.push({
      type: type,
      timestamp: Date.now(),
      data: data || {}
    });
    console.log("Behavior event added:", type, "Buffer size:", behaviorBuffer.length);
  }

  function sendBehavior() {
    if (behaviorBuffer.length === 0) return;
    
    var payload = {
      tracking_id: trackingId,
      project_id: projectId,
      session_id: getSessionId(),
      events: behaviorBuffer
    };
    
    console.log("Sending behavior events:", behaviorBuffer.length);
    
    fetch(behaviorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      console.log("✅ Behavior tracking success:", data);
      behaviorBuffer = [];
    })
    .catch(error => {
      console.error("❌ Behavior tracking error:", error);
    });
  }

  // Initialize everything
  function initialize() {
    console.log("Analytics tracker initialized with:", {
      trackingId: trackingId,
      projectId: projectId,
      apiUrl: apiUrl,
      behaviorUrl: behaviorUrl,
      sessionReplayUrl: sessionReplayUrl
    });
    
    // Expose analytics functions globally
    window.analytics = {
      track: track,
      addBehaviorEvent: addBehaviorEvent,
      sendBehavior: sendBehavior,
      recordSessionEvent: recordSessionEvent,
      sendSessionReplay: sendSessionReplay
    };
    
    // Track pageview
    track('pageview');
    
    // Initialize session replay
    initializeSessionReplay();
    
    // Behavior tracking
    var scrollDepth = 0;
    var maxScrollDepth = 0;
    
    window.addEventListener('scroll', function() {
      scrollDepth = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      if (scrollDepth > maxScrollDepth) {
        maxScrollDepth = scrollDepth;
        addBehaviorEvent('scroll', { depth: scrollDepth, max_depth: maxScrollDepth });
      }
    });
    
    window.addEventListener('click', function(e) {
      clickTimes.push(Date.now());
      addBehaviorEvent('click', {
        x: e.clientX,
        y: e.clientY,
        target: e.target.tagName,
        text: e.target.textContent?.substring(0, 100)
      });
    });
    
    // Send behavior data every 30 seconds
    setInterval(sendBehavior, 30000);
    
    // Send behavior data on page unload
    window.addEventListener('beforeunload', function() {
      if (behaviorBuffer.length > 0) {
        var payload = JSON.stringify({
          tracking_id: trackingId,
          project_id: projectId,
          session_id: getSessionId(),
          events: behaviorBuffer
        });
        navigator.sendBeacon(behaviorUrl, payload);
      }
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})(window.__TRACKING_ID__, window.__PROJECT_ID__);
