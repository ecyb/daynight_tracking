/**
 * 🎬 Insight Stream Analytics Tracker - FINAL VERSION
 * Complete analytics tracking with DOM capture, SPA navigation, and session replay
 * 
 * Version: 4.0.0
 * Last Updated: 2025-10-18
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
    sessionRecordingEnabled: false, // Will be set dynamically from database
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

  // Emotion tracking system
  var emotionState = {
    currentState: 'neutral', // neutral, hesitation, frustration, recovery, conversion, bounce
    intensity: 0, // 0-100 scale
    frustrationScore: 0,
    lastInteractionTime: Date.now(),
    interactionCount: 0,
    rapidClicks: 0,
    deadClicks: 0,
    scrollStalls: 0,
    formChurns: 0,
    idleSpikes: 0,
    backtrackEvents: 0,
    rageClickThreshold: 3, // clicks within 1 second
    deadClickThreshold: 2000, // 2 seconds without response
    scrollStallThreshold: 3000, // 3 seconds without scroll
    idleThreshold: 10000, // 10 seconds of inactivity
    stateHistory: []
  };

  var behavioralEvents = [];
  var lastClickTime = 0;
  var lastScrollTime = 0;
  var lastInputTime = 0;
  var currentScrollDepth = 0;
  var maxScrollDepth = 0;
  var formFieldChanges = 0;
  var currentForm = null;

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

  function debug(message, data) {
    if (config.debugMode) {
      console.log('🔍 [Debug]', message, data || '');
    }
  }

  // Emotion detection functions
  function calculateScrollDepth() {
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    var documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    return documentHeight > 0 ? Math.round((scrollTop / documentHeight) * 100) : 0;
  }

  function detectRageClick(currentTime) {
    var timeSinceLastClick = currentTime - lastClickTime;
    if (timeSinceLastClick < 1000) { // Less than 1 second
      emotionState.rapidClicks++;
      return true;
    }
    return false;
  }

  function detectDeadClick(element) {
    // Skip if element is null (e.g., mousemove events)
    if (!element) return false;
    
    // Check if click was on non-interactive element or empty space
    var isInteractive = element.tagName === 'A' || 
                       element.tagName === 'BUTTON' || 
                       element.tagName === 'INPUT' || 
                       element.tagName === 'SELECT' ||
                       element.onclick ||
                       element.getAttribute('role') === 'button' ||
                       element.classList.contains('clickable') ||
                       element.classList.contains('btn');
    
    if (!isInteractive) {
      emotionState.deadClicks++;
      return true;
    }
    return false;
  }

  function detectScrollStall(currentTime) {
    var timeSinceLastScroll = currentTime - lastScrollTime;
    if (timeSinceLastScroll > emotionState.scrollStallThreshold) {
      emotionState.scrollStalls++;
      return true;
    }
    return false;
  }

  function detectFormChurn() {
    if (formFieldChanges > 5) { // More than 5 field changes
      emotionState.formChurns++;
      return true;
    }
    return false;
  }

  function detectIdleSpike(currentTime) {
    var timeSinceLastInteraction = currentTime - emotionState.lastInteractionTime;
    if (timeSinceLastInteraction > emotionState.idleThreshold) {
      emotionState.idleSpikes++;
      return true;
    }
    return false;
  }

  function detectBacktrack() {
    var currentDepth = calculateScrollDepth();
    if (currentDepth < currentScrollDepth - 20) { // Scrolled back up significantly
      emotionState.backtrackEvents++;
      return true;
    }
    return false;
  }

  function updateEmotionState(eventType, element, eventData) {
    var currentTime = Date.now();
    emotionState.lastInteractionTime = currentTime;
    emotionState.interactionCount++;

    debug('Emotion state update started', {
      eventType: eventType,
      element: element ? element.tagName : 'null',
      interactionCount: emotionState.interactionCount,
      currentState: emotionState.currentState,
      frustrationScore: emotionState.frustrationScore
    });

    var frustrationSignals = 0;
    var totalSignals = 0;

    // Detect frustration signals based on event type
    switch (eventType) {
      case 'click':
        var rageClick = detectRageClick(currentTime);
        var deadClick = element && detectDeadClick(element);
        if (rageClick) frustrationSignals++;
        if (deadClick) frustrationSignals++;
        totalSignals += 2;
        lastClickTime = currentTime;
        debug('Click analysis', { rageClick, deadClick, frustrationSignals, totalSignals });
        break;

      case 'scroll':
        currentScrollDepth = calculateScrollDepth();
        maxScrollDepth = Math.max(maxScrollDepth, currentScrollDepth);
        var scrollStall = detectScrollStall(currentTime);
        var backtrack = detectBacktrack();
        if (scrollStall) frustrationSignals++;
        if (backtrack) frustrationSignals++;
        totalSignals += 2;
        lastScrollTime = currentTime;
        debug('Scroll analysis', { 
          scrollDepth: currentScrollDepth, 
          maxScrollDepth, 
          scrollStall, 
          backtrack, 
          frustrationSignals, 
          totalSignals 
        });
        break;

        
      case 'input':
        // Skip input events for emotion detection (they're now sent as click)
        debug('Input event skipped for emotion detection');
        break;

      case 'mousemove':
        // Skip mousemove events for emotion detection (they're now sent as click)
        debug('Mousemove event skipped for emotion detection');
        break;
    }

    // Calculate frustration score (0-100)
    var frustrationRatio = totalSignals > 0 ? frustrationSignals / totalSignals : 0;
    var oldFrustrationScore = emotionState.frustrationScore;
    emotionState.frustrationScore = Math.min(100, emotionState.frustrationScore + (frustrationRatio * 10));

    debug('Frustration calculation', {
      frustrationRatio: frustrationRatio,
      oldScore: oldFrustrationScore,
      newScore: emotionState.frustrationScore,
      frustrationSignals: frustrationSignals,
      totalSignals: totalSignals
    });

    // Determine emotional state
    var previousState = emotionState.currentState;
    if (emotionState.frustrationScore > 70) {
      emotionState.currentState = 'frustration';
      emotionState.intensity = Math.min(100, emotionState.frustrationScore);
    } else if (emotionState.frustrationScore > 40) {
      emotionState.currentState = 'hesitation';
      emotionState.intensity = emotionState.frustrationScore;
    } else if (emotionState.frustrationScore < 20 && emotionState.interactionCount > 5) {
      emotionState.currentState = 'conversion';
      emotionState.intensity = 100 - emotionState.frustrationScore;
    } else {
      emotionState.currentState = 'neutral';
      emotionState.intensity = 50;
    }

    debug('Emotion state determination', {
      previousState: previousState,
      newState: emotionState.currentState,
      intensity: emotionState.intensity,
      frustrationScore: emotionState.frustrationScore,
      interactionCount: emotionState.interactionCount
    });

    // Record state change
    if (previousState !== emotionState.currentState) {
      emotionState.stateHistory.push({
        timestamp: currentTime,
        fromState: previousState,
        toState: emotionState.currentState,
        intensity: emotionState.intensity,
        frustrationScore: emotionState.frustrationScore
      });
      debug('Emotion state changed', {
        from: previousState,
        to: emotionState.currentState,
        stateHistoryLength: emotionState.stateHistory.length
      });
    }

    // Create behavioral event
    var behavioralEvent = {
      event_type: eventType,
      timestamp: currentTime,
      state: emotionState.currentState,
      intensity: emotionState.intensity,
      frustration_score: emotionState.frustrationScore,
      scroll_depth: currentScrollDepth,
      max_scroll_depth: maxScrollDepth,
      element: element ? {
        tagName: element.tagName,
        className: element.className,
        id: element.id,
        text: element.textContent ? element.textContent.substring(0, 100) : ''
      } : null,
      page_path: window.location.pathname,
      session_id: sessionId,
      project_id: projectId,
      metadata: {
        rapidClicks: emotionState.rapidClicks,
        deadClicks: emotionState.deadClicks,
        scrollStalls: emotionState.scrollStalls,
        formChurns: emotionState.formChurns,
        idleSpikes: emotionState.idleSpikes,
        backtrackEvents: emotionState.backtrackEvents,
        interactionCount: emotionState.interactionCount
      }
    };

    behavioralEvents.push(behavioralEvent);
    
    debug('Behavioral event created', {
      eventType: behavioralEvent.event_type,
      state: behavioralEvent.state,
      intensity: behavioralEvent.intensity,
      frustrationScore: behavioralEvent.frustration_score,
      bufferLength: behavioralEvents.length
    });
    
    // Send behavioral event if buffer is full or significant state change
    if (behavioralEvents.length >= 10 || previousState !== emotionState.currentState) {
      debug('Triggering behavioral events send', {
        reason: behavioralEvents.length >= 10 ? 'buffer_full' : 'state_change',
        bufferLength: behavioralEvents.length,
        stateChanged: previousState !== emotionState.currentState
      });
      sendBehavioralEvents();
    }

    log('Emotion state updated', {
      state: emotionState.currentState,
      intensity: emotionState.intensity,
      frustrationScore: emotionState.frustrationScore
    });
  }

  function sendBehavioralEvents(retryCount = 0) {
    if (behavioralEvents.length === 0) return;

    var eventsToSend = behavioralEvents.splice(0, behavioralEvents.length);
    var maxRetries = 3;
    
    debug('Sending behavioral events', {
      count: eventsToSend.length,
      retryCount: retryCount,
      maxRetries: maxRetries,
      sessionId: sessionId,
      projectId: projectId,
      trackingId: trackingId,
      currentState: emotionState.currentState,
      frustrationScore: emotionState.frustrationScore
    });
    
    var requestBody = {
      tracking_id: trackingId,
      project_id: projectId,
      session_id: sessionId,
      events: eventsToSend,
      emotion_state: {
        currentState: emotionState.currentState,
        intensity: emotionState.intensity,
        frustrationScore: emotionState.frustrationScore,
        stateHistory: emotionState.stateHistory.slice(-10) // Last 10 state changes
      }
    };
    
    debug('Request body prepared', {
      bodySize: JSON.stringify(requestBody).length,
      eventTypes: eventsToSend.map(e => e.event_type),
      emotionStateHistoryLength: emotionState.stateHistory.length
    });
    
    fetch(apiUrls.behavior, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to send behavioral events - ' + response.status);
      }
      log('Behavioral events sent', { count: eventsToSend.length });
    })
    .catch(err => {
      if (retryCount < maxRetries) {
        // Retry with exponential backoff
        setTimeout(() => {
          behavioralEvents.unshift(...eventsToSend);
          sendBehavioralEvents(retryCount + 1);
        }, Math.pow(2, retryCount) * 1000); // 1s, 2s, 4s
      } else {
        error('Failed to send behavioral events after ' + maxRetries + ' retries', err);
        // Don't re-add events to buffer after max retries to prevent infinite loops
      }
    });
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
      // CRITICAL: Check if session recording is actually enabled
      if (!config.sessionRecordingEnabled) {
        console.log('🚫 [Session Recording] BLOCKED - Session recording is disabled in database');
        console.log('📊 [Session Recording] Flag value:', config.sessionRecordingEnabled);
        console.log('💡 [Session Recording] Enable recording in the Users tab of the admin panel');
        return;
      }
      
      debug('Starting rrweb recording', {
        rrwebAlreadyLoaded: typeof window.rrweb !== 'undefined',
        sessionRecordingEnabled: config.sessionRecordingEnabled
      });
      
      // Load rrweb if not already loaded
      if (typeof window.rrweb === 'undefined') {
        log('Loading rrweb...');
        
        // Try your CDN first (most reliable)
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/ecyb/daynight_tracking@main/rrweb.min.js';
        script.onload = function() {
          log('rrweb loaded from GitHub CDN');
          debug('rrweb script loaded successfully from GitHub CDN');
          initializeRRWeb();
        };
        script.onerror = function() {
          warn('Failed to load rrweb from GitHub CDN, trying unpkg...');
          debug('GitHub CDN failed, trying unpkg fallback');
          // Try unpkg as fallback
          const fallbackScript = document.createElement('script');
          fallbackScript.src = 'https://unpkg.com/rrweb@latest/dist/rrweb.min.js';
          fallbackScript.onload = function() {
            log('rrweb loaded from unpkg CDN');
            debug('rrweb script loaded successfully from unpkg CDN');
            initializeRRWeb();
          };
          fallbackScript.onerror = function() {
            warn('Failed to load rrweb from unpkg, trying jsdelivr...');
            debug('unpkg CDN failed, trying jsdelivr fallback');
            // Try jsdelivr as second fallback
            const jsdelivrFallback = document.createElement('script');
            jsdelivrFallback.src = 'https://cdn.jsdelivr.net/npm/rrweb@latest/dist/rrweb.min.js';
            jsdelivrFallback.onload = function() {
              log('rrweb loaded from jsdelivr CDN');
              debug('rrweb script loaded successfully from jsdelivr CDN');
              initializeRRWeb();
            };
            jsdelivrFallback.onerror = function() {
              warn('Failed to load rrweb from all CDNs - session recording disabled');
              debug('All CDN attempts failed - session recording disabled');
            };
            document.head.appendChild(jsdelivrFallback);
          };
          document.head.appendChild(fallbackScript);
        };
        
        // Timeout fallback after 8 seconds
        setTimeout(function() {
          if (typeof window.rrweb === 'undefined') {
            warn('rrweb loading timeout - session recording disabled');
            debug('rrweb loading timeout after 8 seconds');
          }
        }, 8000);
        
        document.head.appendChild(script);
      } else {
        debug('rrweb already loaded, initializing directly');
        initializeRRWeb();
      }
    } catch (error) {
      warn('Failed to start rrweb recording:', error);
      debug('Exception in startRRWebRecording:', error);
    }
  }
  
  function initializeRRWeb() {
    try {
      // DOUBLE CHECK: Ensure session recording is still enabled
      if (!config.sessionRecordingEnabled) {
        console.log('🚫 [Session Recording] BLOCKED in initializeRRWeb - Session recording is disabled');
        console.log('📊 [Session Recording] Flag value:', config.sessionRecordingEnabled);
        return;
      }
      
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
            // Don't process events if recording is disabled
            if (!config.sessionRecordingEnabled) {
              return;
            }
            // sanity: count types
            switch (event.type) {
              case 4: typeCounts.meta++; break;             // Meta
              case 2: typeCounts.full++; break;             // FullSnapshot
              case 3: typeCounts.inc++; break;              // Incremental
              case 5: typeCounts.cust++; break;             // Custom
              default: typeCounts.other++; break;
            }

            // Add to buffer for session replay (only if recording is enabled)
            if (config.sessionRecordingEnabled) {
              rrwebEvents.push(event);
              addToReplayBuffer({
                type: 'rrweb_event',
                data: event,
                timestamp: Date.now()
              });
            }
            
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
      timestamp: event.timestamp || Date.now()
      // Removed url field - backend doesn't expect it
    });
    
    // Send buffer when it gets large
    if (sessionReplayBuffer.length >= 10) {
      sendSessionReplayEvents();
    }
  }

  // Enhanced session replay sending
  function sendSessionReplayEvents(retryCount = 0) {
    if (sessionReplayBuffer.length === 0) return;
    
    // CRITICAL: Don't send session replay events if recording is disabled
    if (!config.sessionRecordingEnabled) {
      console.log('🚫 [Session Recording] BLOCKED sendSessionReplayEvents - Session recording is disabled');
      console.log('📊 [Session Recording] Flag value:', config.sessionRecordingEnabled);
      sessionReplayBuffer.length = 0; // Clear the buffer
      return;
    }
    
    var eventsToSend = sessionReplayBuffer.splice(0, 10);
    var maxRetries = 2; // Fewer retries for session replay to avoid blocking
    
    // Log what we're sending for debugging
    log('Sending session replay events:', {
      count: eventsToSend.length,
      types: eventsToSend.map(e => e.type),
      sessionId: sessionId,
      trackingId: trackingId
    });
    
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
    .then(response => {
      if (!response.ok) {
        throw new Error('Session replay failed - ' + response.status + ' ' + response.statusText);
      }
      return response.json();
    })
    .then(data => {
      log('Session replay events sent successfully:', {
        count: eventsToSend.length,
        response: data
      });
    })
    .catch(error => {
      if (retryCount < maxRetries) {
        warn('Session replay failed, retrying...', {
          attempt: retryCount + 1,
          maxRetries: maxRetries,
          error: error.message
        });
        // Retry with shorter delay for session replay
        setTimeout(() => {
          sessionReplayBuffer.unshift(...eventsToSend);
          sendSessionReplayEvents(retryCount + 1);
        }, 500 * (retryCount + 1)); // 500ms, 1s
      } else {
        error('Session replay send failed after ' + maxRetries + ' retries:', error);
        // Don't re-add events to buffer after max retries
      }
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
      // Update emotion state
      updateEmotionState('click', e.target, {
        x: e.clientX,
        y: e.clientY,
        target: e.target.tagName,
        text: e.target.textContent?.substring(0, 50) || '',
        href: e.target.href || '',
        className: e.target.className || ''
      });

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
        // Update emotion state (throttled)
        updateEmotionState('click', null, {
          x: e.clientX,
          y: e.clientY
        });

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
        // Update emotion state (throttled)
        updateEmotionState('scroll', null, {
          x: window.scrollX,
          y: window.scrollY,
          maxScrollY: document.documentElement.scrollHeight - window.innerHeight
        });

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
      
      // Update emotion state - send as click since input is not allowed by database
      updateEmotionState('click', e.target, {
        value: e.target.value,
        type: e.target.type,
        name: e.target.name || '',
        placeholder: e.target.placeholder || '',
        id: e.target.id || ''
      });
      
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

  // Send final emotion state on page unload
  function sendFinalEmotionState() {
    if (behavioralEvents.length > 0) {
      sendBehavioralEvents();
    }
    
    // Send final emotion state
    if (emotionState.interactionCount > 0) {
      fetch(apiUrls.behavior, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracking_id: trackingId,
          project_id: projectId,
          session_id: sessionId,
          final_emotion_state: {
            currentState: emotionState.currentState,
            intensity: emotionState.intensity,
            frustrationScore: emotionState.frustrationScore,
            totalInteractions: emotionState.interactionCount,
            rapidClicks: emotionState.rapidClicks,
            deadClicks: emotionState.deadClicks,
            scrollStalls: emotionState.scrollStalls,
            formChurns: emotionState.formChurns,
            idleSpikes: emotionState.idleSpikes,
            backtrackEvents: emotionState.backtrackEvents,
            maxScrollDepth: maxScrollDepth,
            sessionDuration: Date.now() - emotionState.lastInteractionTime,
            stateHistory: emotionState.stateHistory
          }
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Final emotion state failed - ' + response.status);
        }
        log('Final emotion state sent successfully');
      })
      .catch(err => {
        error('Failed to send final emotion state', err);
      });
    }
  }

  // Session recording check - returns a promise
  function checkSessionRecordingEnabled() {
    return fetch(apiUrls.checkRecording, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: projectId,
        tracking_id: trackingId
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Check recording failed - ' + response.status);
      }
      return response.json();
    })
    .then(data => {
      if (data.enabled) {
        console.log('✅ [Session Recording] ENABLED - User interactions will be recorded');
        console.log('📊 [Session Recording] Project ID:', projectId);
        console.log('📊 [Session Recording] Tracking ID:', trackingId);
        return true;
      } else {
        console.log('⛔ [Session Recording] DISABLED - No recording will take place');
        console.log('📊 [Session Recording] Project ID:', projectId);
        console.log('📊 [Session Recording] Tracking ID:', trackingId);
        console.log('💡 [Session Recording] Enable recording in the Users tab of the admin panel');
        return false;
      }
    })
    .catch(error => {
      warn('Session recording check failed:', error);
      console.log('⚠️ [Session Recording] Check failed, defaulting to DISABLED for safety');
      return false; // Default to disabled for safety
    });
  }

  // Initialize session
  function initializeSession() {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    log('New session created:', sessionId);
    
    debug('Session initialization started', {
      sessionId: sessionId,
      trackingId: trackingId,
      projectId: projectId,
      timestamp: Date.now()
    });
    
    // Capture performance data
    debug('Capturing performance data');
    capturePerformanceData();
    
    // Setup error tracking
    debug('Setting up error tracking');
    setupErrorTracking();
    
    // Start rrweb recording instead of DOM capture (only if enabled)
    if (config.sessionRecordingEnabled) {
      debug('Starting rrweb recording');
      startRRWebRecording();
    } else {
      console.log('🚫 [Session Recording] SKIPPED in initializeSession - Session recording is disabled');
      console.log('📊 [Session Recording] Flag value:', config.sessionRecordingEnabled);
    }
    
    // Setup event listeners
    debug('Setting up event listeners');
    setupEventListeners();
    
    debug('Setting up SPA navigation tracking');
    setupSPANavigation();
    
    // Track initial pageview
    debug('Tracking initial pageview');
    trackPageView();
    
    log('Session recording started with rrweb');
    debug('Session initialization completed', {
      sessionId: sessionId,
      performanceDataCaptured: !!performanceData,
      errorTrackingSetup: true,
      rrwebStarted: true,
      eventListenersSetup: true
    });
  }

  // Send final events on page unload
  window.addEventListener('beforeunload', function() {
    stopRRWebRecording();
    sendSessionReplayEvents();
    sendFinalEmotionState();
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
    debug('Analytics tracker initialization started', {
      documentReadyState: document.readyState,
      windowAnalyticsConfig: !!window.analyticsConfig,
      windowTrackingId: !!window.__TRACKING_ID__,
      windowProjectId: !!window.__PROJECT_ID__
    });
    
    // Get tracking configuration now that the page is loaded
    trackingId = window.analyticsConfig?.trackingId || window.__TRACKING_ID__ || 'your_tracking_id_here';
    projectId = window.analyticsConfig?.projectId || window.__PROJECT_ID__ || 'your_project_id_here';
    
    debug('Configuration loaded', {
      trackingId: trackingId,
      projectId: projectId,
      debugMode: config.debugMode
    });
    
    log('Insight Stream Analytics Tracker v3.0.0 loaded');
    log('Tracking ID:', trackingId);
    log('Project ID:', projectId);
    
    // Check database to see if session recording is enabled
    console.log('🔍 [Session Recording] Checking database status...');
    console.log('📊 [Session Recording] Project ID:', projectId);
    console.log('📊 [Session Recording] Tracking ID:', trackingId);
    
    checkSessionRecordingEnabled().then(function(enabled) {
      config.sessionRecordingEnabled = enabled;
      
      // ALWAYS show the flag value prominently
      console.log('🎯 [Session Recording] DATABASE FLAG VALUE:', enabled);
      console.log('🎯 [Session Recording] config.sessionRecordingEnabled:', config.sessionRecordingEnabled);
      
      if (config.sessionRecordingEnabled) {
        console.log('✅ [Session Recording] ENABLED - Will start rrweb recording');
        debug('Session recording enabled, initializing session');
        initializeSession();
      } else {
        console.log('⛔ [Session Recording] DISABLED - Will NOT start rrweb recording');
        console.log('💡 [Session Recording] Enable recording in the Users tab of the admin panel');
        debug('Session recording disabled, skipping session initialization');
        // Still track pageviews even if recording is disabled
        sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        trackPageView();
      }
      
      log('Analytics tracking initialized');
      debug('Analytics tracker initialization completed');
    });
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
